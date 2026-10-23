import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL } from './migrations.mjs';
import { createCommunityWorld, id, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';

// P-02 (20261026120100_gtl_points_feed_push.sql, D-56): the Points feed posts and the one weekly Points reminder.
// Local PGlite only; fixture accounts only. Slate kickoffs are relative to Date.now() because the guess guard uses the real
// clock; the reminder functions take p_now, so a test moves time by passing it.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const [LUKE, TROY, SEAN, ZED] = [id(1), id(2), id(3), id(4)];
const HOUR = 3_600_000, DAY = 24 * HOUR;
const KEYS = { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) };
const endpoint = n => `https://fcm.googleapis.com/fcm/send/points-${n}`;

// Same shape as tests/points-sql.test.mjs: QB and RB kick off in 2 hours, WR, TE and FLEX in 50.
const slate = now => ({ selectionVersion: 'slate-1', provenance: { file: '2026-week-08.3f9c1a2b.json', sha256: 'f'.repeat(64), generatedAt: new Date(now).toISOString() },
  slots: ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-000000${i + 1}`, pfrId: `Pf${i}`, name: `P${i}`, team: ['SEA', 'KC', 'BUF', 'DAL', 'MIA'][i],
    position: slot === 'FLEX' ? 'WR' : slot, gameId: ['SEA-DEN', 'KC-LV', 'BUF-NYJ', 'DAL-PHI', 'MIA-NE'][i],
    kickoff: new Date(now + (i < 2 ? 2 : 50) * HOUR).toISOString(), window: i < 2 ? 'Sun early' : 'Mon night', house: 10 + i })) });

async function fixture(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world, call = serviceSql(db), now = Date.now(), at = ms => new Date(ms).toISOString();
  const publish = (week = 8) => call('gtl_points_publish_slate', { p_actor: SEAN, p_season: 2026, p_week: week, p_slate: slate(now), p_finalize_at: at(now + 6 * DAY), p_now: at(now) });
  const save = (user, slot, guess, lock = false, week = 8) => call('gtl_points_save', { p_user: user, p_season: 2026, p_week: week, p_slot: slot, p_guess: guess,
    p_lock: lock, p_request: randomUUID(), p_now: at(Date.now()) });
  const posts = async kind => (await db.query('select actor_id,kind,season,week,mode,payload,dedupe_key from public.gtl_feed_posts where kind=$1 order by created_at,id', [kind])).rows;
  const final = (week, results) => db.query('insert into public.gtl_points_week_final(season,week,finalized_at,results) values(2026,$1,$2,$3)', [week, at(now), results]);
  const subscribe = (user, n) => call('gtl_push_subscribe', { p_user: user, p_endpoint: endpoint(n), p_p256dh: KEYS.p256dh, p_auth: KEYS.auth });
  // A running run with a claim, as gtl_claim_push_reminders leaves it.
  const run = async (status = 'running') => {
    await db.query("insert into public.gtl_push_reminder_schedule(id,enabled,endpoint) values('deadline-2h',true,'https://example.supabase.co/functions/v1/gtl-push-reminders') on conflict do nothing");
    const claim = randomUUID(), runId = randomUUID();
    await db.query("insert into public.gtl_push_reminder_runs(id,schedule_id,slot_start,capability_hash,status,claim_token,claimed_at) values($1,'deadline-2h',$2,$3,$4,$5,clock_timestamp())",
      [runId, at(now - Math.floor(Math.random() * 1e9)), 'a'.repeat(64), status, claim]);
    return { runId, claim };
  };
  const candidates = (r, pNow) => call('gtl_points_reminder_candidates', { p_run: r.runId, p_claim: r.claim, p_now: at(pNow) });
  const mark = (r, user, week = 8) => call('gtl_mark_points_reminder', { p_run: r.runId, p_claim: r.claim, p_user: user, p_season: 2026, p_week: week });
  const addMember = async (n, name) => { await db.query('insert into auth.users values($1)', [id(n)]); await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id(n), name]); };
  return { db, call, now, at, publish, save, posts, final, subscribe, run, candidates, mark, addMember };
}

test('feed: the first lock-in of a week writes one points_played post, later lock-ins and drafts write none', { skip }, async t => {
  const f = await fixture(t);
  await f.publish();
  await f.save(SEAN, 'QB', 12, false);
  assert.equal((await f.posts('points_played')).length, 0, 'a draft is not playing');
  await f.save(LUKE, 'QB', 20, true);
  await f.save(LUKE, 'RB', 15, true);
  await f.save(LUKE, 'WR', 9, true);
  let played = await f.posts('points_played');
  assert.equal(played.length, 1, 'one post for the week however many slots are locked');
  assert.deepEqual({ actor: played[0].actor_id, season: played[0].season, week: played[0].week, mode: played[0].mode, payload: played[0].payload, key: played[0].dedupe_key },
    { actor: LUKE, season: 2026, week: 8, mode: null, payload: {}, key: `points_played:${LUKE}:2026:8` });
  await f.save(SEAN, 'QB', 13, true); // a draft that is later locked: the update that sets locked_at is the first lock-in
  played = await f.posts('points_played');
  assert.deepEqual(played.map(p => p.actor_id).sort(), [LUKE, SEAN].sort());
  const text = JSON.stringify(played);
  assert.doesNotMatch(text, /guess/, 'no guess reaches the post');
});

test('feed: gtl_read_community returns both Points kinds unchanged', { skip }, async t => {
  const f = await fixture(t);
  await f.publish();
  await f.save(LUKE, 'QB', 20, true);
  await f.final(8, { members: [{ userId: LUKE, points: 30.5, slots: { QB: 20 } }], house: 31.2, max: 5 });
  const read = (await f.call('gtl_read_community', { p_user: TROY, p_before: null, p_limit: 30, p_now: null }));
  const byKind = Object.fromEntries(read.posts.filter(p => p.kind.startsWith('points_')).map(p => [p.kind, p]));
  assert.deepEqual(Object.keys(byKind).sort(), ['points_final', 'points_played']);
  assert.equal(byKind.points_played.actorId, LUKE); assert.equal(byKind.points_played.mode, null); assert.deepEqual(byKind.points_played.payload, {});
  assert.deepEqual(byKind.points_final.payload, { winners: [{ userId: LUKE, points: 30.5 }], house: 31.2, max: 5 });
  assert.equal(byKind.points_final.week, 8);
});

test('feed: a finalize writes one points_final post for the top scorer, a tie lists every winner, an empty week writes none', { skip }, async t => {
  const f = await fixture(t);
  await f.publish(8); await f.publish(9); await f.publish(10);
  // Troy and Luke tie at the top; "Luke Fixture" sorts before "Troy Fixture", so Luke is the actor.
  await f.final(8, { members: [{ userId: TROY, points: 38.4, slots: {} }, { userId: SEAN, points: 12, slots: {} }, { userId: LUKE, points: 38.4, slots: {} }], house: 31.2, max: 5 });
  const finals = await f.posts('points_final');
  assert.equal(finals.length, 1);
  assert.equal(finals[0].actor_id, LUKE); assert.equal(finals[0].mode, null); assert.equal(finals[0].dedupe_key, 'points_final:2026:8');
  assert.deepEqual(finals[0].payload.winners.map(w => [w.userId, w.points]).sort(), [[LUKE, 38.4], [TROY, 38.4]].sort());
  assert.equal(finals[0].payload.house, 31.2); assert.equal(finals[0].payload.max, 5);
  // A sole winner, and a House-less week (house null).
  await f.final(9, { members: [{ userId: SEAN, points: 40, slots: {} }, { userId: LUKE, points: 3, slots: {} }], house: null, max: 4 });
  const second = (await f.posts('points_final')).find(p => p.week === 9);
  assert.equal(second.actor_id, SEAN); assert.deepEqual(second.payload, { winners: [{ userId: SEAN, points: 40 }], house: null, max: 4 });
  // Nobody played week 10: the freeze still succeeds and posts nothing.
  await f.final(10, { members: [], house: 20, max: 0 });
  assert.equal((await f.posts('points_final')).filter(p => p.week === 10).length, 0);
  assert.equal((await f.posts('points_final')).length, 2);
});

test('push SQL: candidates are opted-in, subscribed members with an unlocked slot kicking off within two hours and no reminder yet', { skip }, async t => {
  const f = await fixture(t);
  await f.addMember(4, 'Zed Fixture');
  await f.publish();
  const r = await f.run();
  // Luke: opted in (QB locked), RB open and inside the window. Troy: never locked anything, so not opted in. Sean: QB and RB
  // locked, only far-off slots open. Zed: opted in but no active device.
  for (const [user, n] of [[LUKE, 1], [TROY, 2], [SEAN, 3]]) await f.subscribe(user, n);
  await f.save(LUKE, 'QB', 20, true); await f.save(SEAN, 'QB', 20, true); await f.save(SEAN, 'RB', 11, true); await f.save(ZED, 'QB', 20, true);
  const pNow = f.now + 30 * 60_000;
  let { players } = await f.candidates(r, pNow);
  assert.equal(players.length, 1);
  const luke = players[0];
  assert.deepEqual({ userId: luke.userId, season: luke.season, week: luke.week, open: luke.open }, { userId: LUKE, season: 2026, week: 8, open: 4 });
  assert.equal(Date.parse(luke.nextKickoff), f.now + 2 * HOUR, 'the earliest open kickoff');
  assert.deepEqual(luke.subscriptions, [{ endpoint: endpoint(1), p256dh: KEYS.p256dh, auth: KEYS.auth }]);
  assert.doesNotMatch(JSON.stringify(players), /"guess"|\b20\b/, 'no guess or name leaves the function');
  // An unsubscribed Zed joins once a device exists; a disabled device does not count.
  await f.subscribe(ZED, 4);
  assert.deepEqual((await f.candidates(r, pNow)).players.map(p => p.userId).sort(), [LUKE, ZED].sort());
  await f.db.query('update public.gtl_push_subscriptions set disabled_at=clock_timestamp() where user_id=$1', [ZED]);
  assert.deepEqual((await f.candidates(r, pNow)).players.map(p => p.userId), [LUKE]);
  // Past every kickoff in the window (the RB slot is behind p_now), Luke's open slots are the far ones: nothing within two hours.
  assert.deepEqual((await f.candidates(r, f.now + 3 * HOUR)).players, []);
  // Locking the last slot inside the window removes the reason to remind.
  await f.save(LUKE, 'RB', 15, true);
  assert.deepEqual((await f.candidates(r, pNow)).players, []);
});

test('push SQL: marking is idempotent, removes the member from the candidates, and a wrong claim or finished run raises GTL_SCHEDULE_RUN', { skip }, async t => {
  const f = await fixture(t);
  await f.publish();
  await f.subscribe(LUKE, 1);
  await f.save(LUKE, 'QB', 20, true);
  const r = await f.run(), pNow = f.now + 30 * 60_000;
  assert.equal((await f.candidates(r, pNow)).players.length, 1);
  assert.deepEqual(await f.mark(r, LUKE), { recorded: true });
  assert.deepEqual(await f.mark(r, LUKE), { recorded: false }, 'a second mark is a no-op');
  const sent = (await f.db.query('select mode,kind,season,week,run_id from public.gtl_push_reminders_sent where user_id=$1', [LUKE])).rows;
  assert.deepEqual(sent, [{ mode: 'guess_points', kind: 'points_next_2h', season: 2026, week: 8, run_id: r.runId }]);
  assert.deepEqual((await f.candidates(r, pNow)).players, [], 'at most one reminder per member and week');
  // Wrong claim, finished run, unknown run.
  await assert.rejects(() => f.call('gtl_mark_points_reminder', { p_run: r.runId, p_claim: randomUUID(), p_user: LUKE, p_season: 2026, p_week: 8 }), /GTL_SCHEDULE_RUN/);
  await assert.rejects(() => f.call('gtl_points_reminder_candidates', { p_run: r.runId, p_claim: randomUUID(), p_now: f.at(pNow) }), /GTL_SCHEDULE_RUN/);
  const done = await f.run('succeeded');
  await assert.rejects(() => f.mark(done, LUKE, 9), /GTL_SCHEDULE_RUN/);
  await assert.rejects(() => f.candidates(done, pNow), /GTL_SCHEDULE_RUN/);
  await assert.rejects(() => f.call('gtl_mark_points_reminder', { p_run: randomUUID(), p_claim: r.claim, p_user: LUKE, p_season: 2026, p_week: 8 }), /GTL_SCHEDULE_RUN/);
});

test('push SQL: gtl_mark_push_reminder still refuses guess_points, and the new functions are service-only and security invoker', { skip }, async t => {
  const f = await fixture(t);
  const r = await f.run();
  await assert.rejects(() => f.call('gtl_mark_push_reminder', { p_run: r.runId, p_claim: r.claim, p_user: LUKE, p_season: 2026, p_week: 8, p_modes: ['guess_points'] }), /GTL_SCHEDULE_RUN/);
  for (const signature of ['gtl_points_reminder_candidates(uuid,uuid,timestamptz)', 'gtl_mark_points_reminder(uuid,uuid,uuid,integer,integer)']) {
    for (const role of ['anon', 'authenticated']) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
    assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true, signature);
  }
  const flags = (await f.db.query("select prosecdef from pg_proc where proname in ('gtl_points_reminder_candidates','gtl_mark_points_reminder','gtl_feed_points_played_post','gtl_feed_points_final_post')")).rows;
  assert.equal(flags.length, 4); assert(flags.every(row => row.prosecdef === false));
});
