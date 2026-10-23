import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL } from './migrations.mjs';
import { createCommunityWorld, id, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql } from './helpers/guess-week.mjs';
import { createPushReminderHandler } from '../cloud/push-reminders.mjs';
import { b64uEncode } from '../cloud/web-push.mjs';

// P-02 (20261023190000_gtl_points_feed_push.sql, D-56): the Points feed posts and the one weekly Points reminder, on main's
// P-01 (20261023180000_gtl_points_core.sql). Local PGlite only; fixture accounts only. Published slates are written straight
// into the table (as tests/points-sql.test.mjs does) with kickoffs relative to Date.now(), because P-01's lock-in guard uses
// the real clock; the reminder functions take p_now, so a test moves time by passing it. session_replication_role = replica
// is used only to write a past week's locked guesses (fixture setup the guard would refuse after kickoff).
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const [LUKE, TROY, SEAN, ZED] = [id(1), id(2), id(3), id(4)];
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const KEYS = { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) };
const endpoint = n => `https://fcm.googleapis.com/fcm/send/points-${n}`;
const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
const RULES = { format: 'ppr', passingTds: 4, version: 'ppr4-v1' };
const PROVENANCE = { snapshotSeason: 2026, snapshotWeek: 7, checksum: 'f'.repeat(64), selectionVersion: 'points-slate-v1', seed: 'fixture' };
const HOUSE = { QB: 10, RB: 11, WR: 12, TE: 13, FLEX: 14 };
// Every function P-02 creates or replaces.
const P02_FUNCTIONS = ['gtl_feed_points_played_post', 'gtl_feed_points_final_post', 'gtl_points_reminder_candidates', 'gtl_mark_points_reminder', 'gtl_dispatch_push_reminders'];

/**
 * Five slots in main's P-01 shape ({ slot, playerId, name, team, position, gameKey, kickoff }; no void field: main decides void
 * after kickoff from the actuals). QB and RB kick off `early` after `base`, WR, TE and FLEX 50 hours after it.
 */
const slotsFrom = (base, early = 2 * HOUR) => SLOTS.map((slot, i) => ({ slot, playerId: `00-000000${i + 1}`, name: `P${i}`,
  team: ['SEA', 'KC', 'BUF', 'DAL', 'MIA'][i], position: slot === 'FLEX' ? 'WR' : slot, gameKey: ['SEA-DEN', 'KC-LV', 'BUF-NYJ', 'DAL-PHI', 'MIA-NE'][i],
  kickoff: new Date(base + (i < 2 ? early : 50 * HOUR)).toISOString() }));
// Every leaf value of a reply (strings and numbers), to look for a guess by value rather than by a pattern that also matches clock times.
const leaves = value => (value !== null && typeof value === 'object' ? Object.values(value).flatMap(leaves) : [value]);
/** The candidates reply carries the reminder's facts and the devices only: no guess value, player name or slot name. */
function assertSpoilerFree(players, guesses) {
  for (const player of players) {
    assert.deepEqual(Object.keys(player).sort(), ['nextKickoff', 'open', 'season', 'subscriptions', 'userId', 'week']);
    for (const subscription of player.subscriptions) assert.deepEqual(Object.keys(subscription).sort(), ['auth', 'endpoint', 'p256dh']);
    for (const leaf of leaves(player)) assert.equal(guesses.includes(leaf), false, `a guess value (${leaf}) leaves the function`);
  }
  assert.doesNotMatch(JSON.stringify(players), /Fixture|\bP[0-4]\b|\b(?:QB|RB|WR|TE|FLEX)\b/, 'no player, member or slot name');
}
async function deviceKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) };
}

async function fixture(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world, call = serviceSql(db), now = Date.now(), at = ms => new Date(ms).toISOString();
  /** A slate written straight into the table: published (open since an hour ago) unless status is 'draft'. Returns its slots. */
  const publish = async (week = 8, early = 2 * HOUR, { status = 'published', opens = now - HOUR, base = now } = {}) => {
    const slots = slotsFrom(base, early);
    await db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at,audit)
      values(2026,$1,$2,$3,public.gtl_points_finalize_at($3),$4,$5,$6,$7,$8,'[]')`,
    [week, status, at(opens), RULES, JSON.stringify(slots), HOUSE, PROVENANCE, status === 'published' ? at(opens) : null]);
    return slots;
  };
  // P-01's writers, called as service_role like gtl-api.
  const write = (fn, user, slot, guess, week) => call(fn, { p_user: user, p_request: randomUUID(), p_season: 2026, p_week: week, p_slot: slot, p_guess: guess });
  const lock = (user, slot, guess, week = 8) => write('gtl_points_lock_in', user, slot, guess, week);
  const draft = (user, slot, guess, week = 8) => write('gtl_points_save_draft', user, slot, guess, week);
  const posts = async kind => (await db.query('select actor_id,kind,season,week,mode,payload,dedupe_key from public.gtl_feed_posts where kind=$1 order by created_at,id', [kind])).rows;
  /**
   * A FINAL row in main's P-01 shape, inserted directly (the points_final trigger fires on it as on a finalize). members:
   * [[userId, points]] (points null when nothing scored); house: the House total or null (incomplete).
   */
  const final = (week, members, { house = null, maximum = 50 } = {}) => db.query('insert into public.gtl_points_week_final(season,week,finalized_at,maximum,slots,members,house) values(2026,$1,$2,$3,$4,$5,$6)',
    [week, at(now), maximum, '[]', JSON.stringify(members.map(([userId, points]) => ({ userId, played: true, slots: {}, points, exact: points === null ? null : 0, off: points === null ? null : 1 }))),
      { complete: house !== null, slots: {}, points: house }]);
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
  return { db, call, now, at, publish, lock, draft, posts, final, subscribe, run, candidates, mark, addMember };
}

test('feed: the first lock-in of a week writes one points_played post, later lock-ins and drafts write none', { skip }, async t => {
  const f = await fixture(t);
  await f.publish(8); await f.publish(9);
  await f.draft(SEAN, 'QB', 12);
  assert.equal((await f.posts('points_played')).length, 0, 'a draft is not playing');
  await f.lock(LUKE, 'QB', 20);
  await f.lock(LUKE, 'RB', 15);
  await f.lock(LUKE, 'WR', 9);
  let played = await f.posts('points_played');
  assert.equal(played.length, 1, 'one post for the week however many slots are locked');
  assert.deepEqual({ actor: played[0].actor_id, season: played[0].season, week: played[0].week, mode: played[0].mode, payload: played[0].payload, key: played[0].dedupe_key },
    { actor: LUKE, season: 2026, week: 8, mode: null, payload: {}, key: `points_played:${LUKE}:2026:8` });
  await f.lock(SEAN, 'QB', 13); // a draft that is later locked: the update that sets locked_at is the first lock-in
  await f.draft(TROY, 'TE', 4); await f.draft(TROY, 'TE', 5);
  played = await f.posts('points_played');
  assert.deepEqual(played.map(p => p.actor_id).sort(), [LUKE, SEAN].sort(), 'Troy only drafted');
  // A new week is a new first lock-in.
  await f.lock(LUKE, 'QB', 21, 9);
  played = await f.posts('points_played');
  assert.deepEqual(played.map(p => p.dedupe_key).sort(), [`points_played:${LUKE}:2026:8`, `points_played:${LUKE}:2026:9`, `points_played:${SEAN}:2026:8`].sort());
  assert(played.every(p => p.mode === null && Object.keys(p.payload).length === 0), 'no guess reaches the post: the payload is {}');
  assert.doesNotMatch(JSON.stringify(played), /guess/);
});

test('feed: gtl_read_community returns both Points kinds unchanged', { skip }, async t => {
  const f = await fixture(t);
  await f.publish();
  await f.lock(LUKE, 'QB', 20);
  await f.final(8, [[LUKE, 30.5]], { house: 31.2 });
  const read = (await f.call('gtl_read_community', { p_user: TROY, p_before: null, p_limit: 30, p_now: null }));
  const byKind = Object.fromEntries(read.posts.filter(p => p.kind.startsWith('points_')).map(p => [p.kind, p]));
  assert.deepEqual(Object.keys(byKind).sort(), ['points_final', 'points_played']);
  assert.equal(byKind.points_played.actorId, LUKE); assert.equal(byKind.points_played.mode, null); assert.deepEqual(byKind.points_played.payload, {});
  assert.deepEqual(byKind.points_final.payload, { winners: [{ userId: LUKE, points: 30.5 }], house: 31.2, max: 50 });
  assert.equal(byKind.points_final.week, 8);
});

test('feed: a FINAL row writes one points_final post for the top scorer, a tie lists every winner, a week nobody scored writes none', { skip }, async t => {
  const f = await fixture(t);
  for (const week of [8, 9, 10, 11]) await f.publish(week);
  // Troy and Luke tie at the top; "Luke Fixture" sorts before "Troy Fixture", so Luke is the actor.
  await f.final(8, [[TROY, 38.4], [SEAN, 12], [LUKE, 38.4]], { house: 31.2 });
  const finals = await f.posts('points_final');
  assert.equal(finals.length, 1);
  assert.equal(finals[0].actor_id, LUKE); assert.equal(finals[0].mode, null); assert.equal(finals[0].dedupe_key, 'points_final:2026:8');
  assert.deepEqual(finals[0].payload.winners.map(w => [w.userId, w.points]).sort(), [[LUKE, 38.4], [TROY, 38.4]].sort());
  assert.equal(finals[0].payload.house, 31.2); assert.equal(finals[0].payload.max, 50, 'max is the week maximum');
  // A sole winner; a member whose points are null (main: nothing scored for them) never outranks a number; an incomplete House
  // (house.points null) posts house null; one void slot leaves a maximum of 40.
  await f.final(9, [[TROY, null], [SEAN, 40], [LUKE, 3]], { house: null, maximum: 40 });
  const second = (await f.posts('points_final')).find(p => p.week === 9);
  assert.equal(second.actor_id, SEAN); assert.deepEqual(second.payload, { winners: [{ userId: SEAN, points: 40 }], house: null, max: 40 });
  // Nobody played week 10, and nobody scored in week 11: each freeze still succeeds and posts nothing.
  await f.final(10, [], { house: 20 });
  await f.final(11, [[LUKE, null], [TROY, null]], { maximum: 0 });
  assert.deepEqual((await f.posts('points_final')).map(p => p.week).sort(), [8, 9]);
});

test('feed: gtl_points_finalize, called as service_role like the P-03 worker, writes the points_final post once', { skip }, async t => {
  const f = await fixture(t);
  // Week 7 was played: every kickoff is past and its FINAL time (the Thursday after it opened) has passed.
  const slots = await f.publish(7, 0, { opens: f.now - 20 * DAY, base: f.now - 15 * DAY });
  // Luke locked QB 18 and RB 9, Troy WR 30 (past guesses: the lock-in guard refuses writes after kickoff, so the fixture
  // writes them with triggers off).
  await f.db.transaction(async tx => {
    await tx.exec('set local session_replication_role = replica');
    for (const [user, slot, guess] of [[LUKE, 'QB', 18], [LUKE, 'RB', 9], [TROY, 'WR', 30]]) {
      await tx.query('insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at) values($1,2026,7,$2,$3,$4)', [user, slot, guess, f.at(f.now - 16 * DAY)]);
    }
  });
  const points = { QB: 14.6, RB: 0, WR: 10.2, TE: 5.2, FLEX: 7 };
  await f.call('gtl_points_load_actuals', { p_payload: { season: 2026, week: 7,
    source: { url: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv', release: 'stats_player', publishedAt: f.at(f.now - 2 * DAY), retrievedAt: f.at(f.now - DAY), sha256: 'a'.repeat(64) },
    coverage: { expected: 5, received: 5, partial: false },
    players: slots.map(s => ({ playerId: s.playerId, name: s.name, team: s.team, position: s.position, gameKey: s.gameKey, stats: { receptions: 1 }, points: { [RULES.version]: points[s.slot] }, played: true, playedBasis: 'snaps' })) } });
  const first = await f.call('gtl_points_finalize', { p_season: 2026, p_week: 7 });
  assert.deepEqual([first.final, first.replayed], [true, false]);
  // Luke 6.6 + 1 = 7.6, Troy 0; the House (10..14 against those actuals) 5.4 + 0 + 8.2 + 2.2 + 3 = 18.8; no void, so 50.
  const posts = (await f.posts('points_final')).map(p => ({ actor: p.actor_id, season: p.season, week: p.week, mode: p.mode, payload: p.payload, key: p.dedupe_key }));
  assert.deepEqual(posts, [{ actor: LUKE, season: 2026, week: 7, mode: null, payload: { winners: [{ userId: LUKE, points: 7.6 }], house: 18.8, max: 50 }, key: 'points_final:2026:7' }]);
  const replay = await f.call('gtl_points_finalize', { p_season: 2026, p_week: 7 });
  assert.deepEqual([replay.final, replay.replayed], [true, true]);
  assert.equal((await f.posts('points_final')).length, 1, 'a replayed finalize writes no second post');
});

test('push SQL: candidates are opted-in, subscribed members with an unlocked slot kicking off within two hours and no reminder yet', { skip }, async t => {
  const f = await fixture(t);
  await f.addMember(4, 'Zed Fixture');
  await f.publish();
  const r = await f.run();
  // Luke: opted in (QB locked), RB open and inside the window. Troy: never locked anything, so not opted in. Sean: QB and RB
  // locked, only far-off slots open. Zed: opted in but no active device.
  for (const [user, n] of [[LUKE, 1], [TROY, 2], [SEAN, 3]]) await f.subscribe(user, n);
  await f.lock(LUKE, 'QB', 20); await f.lock(SEAN, 'QB', 20); await f.lock(SEAN, 'RB', 11); await f.lock(ZED, 'QB', 20);
  await f.draft(TROY, 'QB', 11); // a draft is not an opt-in
  const pNow = f.now + 30 * MINUTE;
  let { players } = await f.candidates(r, pNow);
  assert.equal(players.length, 1);
  const luke = players[0];
  assert.deepEqual({ userId: luke.userId, season: luke.season, week: luke.week, open: luke.open }, { userId: LUKE, season: 2026, week: 8, open: 4 });
  assert.equal(Date.parse(luke.nextKickoff), f.now + 2 * HOUR, 'the earliest open kickoff');
  assert.deepEqual(luke.subscriptions, [{ endpoint: endpoint(1), p256dh: KEYS.p256dh, auth: KEYS.auth }]);
  assertSpoilerFree(players, [20, 11]);
  // An unsubscribed Zed joins once a device exists; a disabled device does not count.
  await f.subscribe(ZED, 4);
  ({ players } = await f.candidates(r, pNow));
  assert.deepEqual(players.map(p => p.userId).sort(), [LUKE, ZED].sort());
  assertSpoilerFree(players, [20, 11]);
  await f.db.query('update public.gtl_push_subscriptions set disabled_at=clock_timestamp() where user_id=$1', [ZED]);
  assert.deepEqual((await f.candidates(r, pNow)).players.map(p => p.userId), [LUKE]);
  // Past every kickoff in the window (the RB slot is behind p_now), Luke's open slots are the far ones: nothing within two hours.
  assert.deepEqual((await f.candidates(r, f.now + 3 * HOUR)).players, []);
  // Locking the last slot inside the window removes the reason to remind.
  await f.lock(LUKE, 'RB', 15);
  assert.deepEqual((await f.candidates(r, pNow)).players, []);
});

test('push SQL: the candidate window is (p_now, p_now + 2 hours] exactly', { skip }, async t => {
  const f = await fixture(t);
  await f.publish(); await f.subscribe(LUKE, 1); await f.lock(LUKE, 'QB', 20);
  const r = await f.run(), kickoff = f.now + 2 * HOUR; // RB, still open, kicks off with QB
  const who = async pNow => (await f.candidates(r, pNow)).players.map(p => p.userId);
  assert.deepEqual(await who(kickoff - 2 * HOUR - 1), [], 'one millisecond more than two hours ahead is outside');
  assert.deepEqual(await who(kickoff - 2 * HOUR), [LUKE], 'a kickoff at exactly p_now + 2 hours is inside');
  assert.deepEqual(await who(kickoff - 1), [LUKE]);
  assert.deepEqual(await who(kickoff), [], 'a kickoff at p_now has locked: it is not open');
});

// Main's P-01 has no pre-kickoff void (a slot is void only after kickoff, from its actuals), so the source's postponed-slot case
// has no equivalent here; an unpublished (draft) slate takes its place as the slate that must remind no one.
test('push SQL: a draft slate, a FINAL week and a removed member are never candidates', { skip }, async t => {
  const f = await fixture(t);
  await f.publish(8); await f.publish(9); await f.publish(10, 2 * HOUR, { status: 'draft' });
  await f.subscribe(LUKE, 1); await f.subscribe(TROY, 2);
  // Luke locks QB in both open weeks; Troy locks QB in week 8 only, which opts him in for the season.
  await f.lock(LUKE, 'QB', 20, 8); await f.lock(LUKE, 'QB', 20, 9); await f.lock(TROY, 'QB', 20, 8);
  const r = await f.run(), pNow = f.now + 30 * MINUTE;
  const who = async () => (await f.candidates(r, pNow)).players.map(p => `${p.week}:${p.userId}`);
  assert.deepEqual(await who(), [`8:${LUKE}`, `8:${TROY}`, `9:${LUKE}`, `9:${TROY}`], 'control: both members, both published weeks; the draft week 10 reminds no one');
  await f.db.query("update public.gtl_points_slates set status='published',published_at=opens_at where season=2026 and week=10");
  assert.deepEqual(await who(), [`8:${LUKE}`, `8:${TROY}`, `9:${LUKE}`, `9:${TROY}`, `10:${LUKE}`, `10:${TROY}`], 'once published, week 10 reminds too');
  await f.db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [TROY, SEAN]);
  assert.deepEqual(await who(), [`8:${LUKE}`, `9:${LUKE}`, `10:${LUKE}`], 'a removed member (D-23) is not reminded');
  await f.final(9, []);
  assert.deepEqual(await who(), [`8:${LUKE}`, `10:${LUKE}`], 'a FINAL week reminds no one');
});

test('dispatch: with no Spread/Total deadline near, an open Points slot kicking off within two hours queues a run that reminds', { skip }, async t => {
  t.mock.method(console, 'info', () => {}); // the worker's two count lines
  const f = await fixture(t);
  // Local-only pg_net double, as in tests/web-push-sql.test.mjs.
  await f.db.exec("create schema net;create table net.outbox(id bigserial primary key,url text,body jsonb,headers jsonb);create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language sql as 'insert into net.outbox(url,body,headers) values(url,body,headers) returning id';");
  await f.db.query("insert into public.gtl_push_reminder_schedule(id,enabled,endpoint) values('deadline-2h',true,'https://example.supabase.co/functions/v1/gtl-push-reminders')");
  // The Spread/Total deadline three days out: its two-hour window is nowhere near.
  await f.db.query("update public.gtl_weekly_slates set signature=jsonb_set(signature,'{deadline}',to_jsonb(extract(epoch from now()+interval '3 days')))");
  const dispatch = async () => (await f.db.query('select public.gtl_dispatch_push_reminders() value')).rows[0].value;
  const count = async table => Number((await f.db.query(`select count(*) n from ${table}`)).rows[0].n);
  assert.deepEqual(await dispatch(), { status: 'not_due' }, 'no Points slate and no Spread/Total window');
  await f.publish(8, 3 * HOUR);
  assert.deepEqual(await dispatch(), { status: 'not_due' }, 'week 8: no slot kicks off within two hours');
  await f.publish(9, 90 * MINUTE); await f.final(9, []);
  assert.deepEqual(await dispatch(), { status: 'not_due' }, 'week 9: a FINAL week reminds no one');
  await f.publish(10, 90 * MINUTE, { status: 'draft' });
  assert.deepEqual(await dispatch(), { status: 'not_due' }, 'week 10: a draft slate is not a Points game day');
  assert.deepEqual([await count('public.gtl_push_reminder_runs'), await count('net.outbox')], [0, 0], 'not_due writes no run and calls nothing');
  // Week 11: QB and RB kick off in 90 minutes. Luke is opted in (QB locked) with RB open and one device.
  await f.publish(11, 90 * MINUTE);
  const device = await deviceKeys();
  await f.call('gtl_push_subscribe', { p_user: LUKE, p_endpoint: endpoint(1), p_p256dh: device.p256dh, p_auth: device.auth });
  await f.lock(LUKE, 'QB', 20, 11);
  const queued = await dispatch();
  assert.equal(queued.status, 'queued');
  assert.deepEqual(await dispatch(), { status: 'already_dispatched' }, 'one run per 15-minute slot, as for Spread/Total');
  const outbox = (await f.db.query('select url,body,headers from net.outbox')).rows;
  assert.deepEqual(outbox.map(o => [o.url, o.body]), [['https://example.supabase.co/functions/v1/gtl-push-reminders', { runId: queued.runId }]]);
  // The real worker on that run sends Luke the Points reminder (the Spread/Total pass has nothing due).
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const vapid = { publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d, subject: 'mailto:reminders@example.test' };
  const sends = [];
  const handler = createPushReminderHandler({ service: { rpc: f.call }, vapid, fetchImpl: async url => { sends.push(url); return new Response(null, { status: 201 }); } });
  const response = await handler(new Request('https://example.supabase.co/functions/v1/gtl-push-reminders',
    { method: 'POST', headers: { authorization: outbox[0].headers.Authorization, 'content-type': 'application/json' }, body: JSON.stringify({ runId: queued.runId }) }));
  assert.deepEqual(await response.json(), { runId: queued.runId, status: 'succeeded', reason: null, sent: 1, failed: 0 });
  assert.deepEqual(sends, [endpoint(1)]);
  assert.deepEqual((await f.db.query('select user_id,week,mode,kind from public.gtl_push_reminders_sent')).rows, [{ user_id: LUKE, week: 11, mode: 'guess_points', kind: 'points_next_2h' }]);
});

test('push SQL: marking is idempotent, removes the member from the candidates, and a wrong claim or finished run raises GTL_SCHEDULE_RUN', { skip }, async t => {
  const f = await fixture(t);
  await f.publish();
  await f.subscribe(LUKE, 1);
  await f.lock(LUKE, 'QB', 20);
  const r = await f.run(), pNow = f.now + 30 * MINUTE;
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
  // The replaced dispatcher keeps its grants: only cron (postgres) runs it.
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, 'public.gtl_dispatch_push_reminders()', 'EXECUTE'])).rows[0].ok, false, `${role} dispatch`);
  const flags = (await f.db.query('select proname,prosecdef,proconfig from pg_proc where proname = any($1)', [P02_FUNCTIONS])).rows;
  assert.deepEqual(flags.map(row => row.proname).sort(), [...P02_FUNCTIONS].sort(), 'one definition each');
  for (const row of flags) {
    assert.equal(row.prosecdef, false, `${row.proname} is security invoker`);
    assert(row.proconfig?.includes('search_path=""'), `${row.proname} pins an empty search_path`);
  }
});
