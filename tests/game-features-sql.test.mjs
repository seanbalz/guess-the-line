import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED, NOT_HOSTED, version, without } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { serviceSql, storeLines } from './helpers/guess-week.mjs';
import { M13, seedFinishedWeek } from './helpers/features-week.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets } from './helpers/leak-scan.mjs';
import { computeFeatures } from '../cloud/features.mjs';

// M-25 league_features (redesign build plan stage 69): the features job's inputs, its idempotent writer and the gated reader,
// through the real gtl-api handler on local PGlite (ALL migrations). Fixture accounts, games, lines, guesses and bets only.
// The finished fixture Week 4 (SEA @ DEN 26 hours ago, KC @ LV 2 hours ago) is tests/helpers/features-week.mjs. Week 5 is the
// world's own open week, kicking off tonight.
const MIGRATION = '20261026234000_gtl_league_features.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const LUKE = ACCOUNTS.luke.id, TROY = ACCOUNTS.troy.id, SEAN = ACCOUNTS.sean.id;
const HOUR = 3_600_000, GROUP = `g_${'a'.repeat(32)}`;
const iso = ms => new Date(ms).toISOString();

async function fixture(t, { m13 = true } = {}) {
  // M-25 applies after M-13 (feed kinds). `m13: false` builds the order mistake: every migration except M-13 and the feed
  // files that need it (M-22 and M-23 read its league_id column), which `without` leaves out with it.
  const world = await createCommunityWorld({ migrations: m13 ? ALL : without(ALL, M13), games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const { db } = world, call = serviceSql(db);
  const { now, k1, k2, settle } = await seedFinishedWeek(world);
  const run = (who = 'sean') => world.api(who, 'league/features/run', {});
  const read = (who, body = {}) => world.api(who, 'league/features', body);
  const events = async () => (await db.query('select award_key,event from public.gtl_badge_events order by id')).rows;
  const posts = async kind => (await db.query('select actor_id,kind,week,payload,dedupe_key from public.gtl_feed_posts where kind=$1 order by created_at,id', [kind])).rows;
  return { world, db, call, now, k1, k2, settle, run, read, events, posts };
}

test('M-25 is written and not applied: NOT_HOSTED until Sean\'s "apply M-25"', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)));
  assert.ok(!HOSTED.includes(MIGRATION));
});

test('every M-25 function and table is service-role only, and the events and awards are append-only', { skip }, async t => {
  const { db } = await fixture(t);
  for (const signature of ['gtl_feature_results(integer,integer)', 'gtl_read_feature_inputs(integer,timestamptz)', 'gtl_feature_post(uuid,text,integer,integer,jsonb,text,timestamptz)',
    'gtl_record_feature_results(uuid,text,uuid,jsonb)', 'gtl_read_features(uuid,text,integer,timestamptz)']) {
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true, signature);
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
  }
  for (const table of ['gtl_feature_runs', 'gtl_badge_events', 'gtl_weekly_awards', 'gtl_player_streaks']) {
    assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true, table);
    for (const role of ['anon', 'authenticated']) for (const priv of ['SELECT', 'INSERT'])
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', [role, `public.${table}`, priv])).rows[0].ok, false, `${role} ${priv} ${table}`);
    for (const priv of ['DELETE', 'TRUNCATE']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', ['service_role', `public.${table}`, priv])).rows[0].ok, false, `no ${priv} on ${table} (D-23)`);
    if (table !== 'gtl_feature_runs') assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', ['service_role', `public.${table}`, 'UPDATE'])).rows[0].ok, false, `${table} is never updated`);
  }
});

test('the inputs: finals, kickoff lines, locked-in guesses and bets of games that kicked off, never a game still to play', { skip }, async t => {
  const f = await fixture(t);
  // Troy locks in an exact Week 5 guess for tonight's game; nothing of it may reach the inputs before kickoff.
  const week5 = f.world.state.games;
  await storeLines(f.db, f.world.state, { spread: { [week5[0].id]: -6.5, [week5[1].id]: 2.5 }, total: { [week5[0].id]: 48.5, [week5[1].id]: 37.5 } });
  const { sendBallot } = await import('./helpers/guess-week.mjs');
  await sendBallot(f.world, 'troy', 'guess_spread', { [week5[0].id]: -6.5, [week5[1].id]: 2.5 });
  const inputs = await f.call('gtl_read_feature_inputs', { p_season: 2026, p_now: iso(f.now) });
  assert.deepEqual(inputs.weeks.map(w => w.week), [4, 5]);
  const [w4, w5] = inputs.weeks;
  assert.deepEqual(w4.games.map(g => [g.id, g.result]), [['SEA-DEN', { status: 'final', home: 20, away: 24 }], ['KC-LV', { status: 'final', home: 24, away: 20 }]]);
  assert.deepEqual(w4.kickoff, { 'SEA-DEN': { spread: -9.5, total: 41.5 }, 'KC-LV': { spread: -3, total: 45.5 } });
  assert.equal(w4.guesses.length, 6);
  assert.deepEqual(w4.guesses.find(g => g.userId === TROY && g.gameId === 'KC-LV'), { userId: TROY, market: 'spread', gameId: 'KC-LV', guess: -3.5, reference: -1.5, points: 6, late: false });
  assert.equal(w4.bets.length, 3);
  assert.deepEqual(w4.bets.find(b => b.userId === LUKE), { userId: LUKE, gameId: 'SEA-DEN', market: 'spread', side: 'away', line: 8.5, odds: -110, units: 3, status: 'win', netUnits: 2.7273, kind: 'book' });
  assert.deepEqual(w4.ballots.find(b => b.userId === SEAN), { userId: SEAN, market: 'spread', submitted: false, locked: [], closed: [], satOut: true, eligible: true });
  assert.equal(w4.publisher, SEAN);
  assert.deepEqual(w5.guesses, [], 'no guess of a game that has not kicked off');
  assert.deepEqual(w5.kickoff, {}, 'no kickoff line before kickoff');
  assert.deepEqual(w5.ballots.find(b => b.userId === TROY).locked.sort(), week5.map(g => g.id).sort(), 'the lock-in facts the Pick streak needs, no values');
  assert.doesNotMatch(JSON.stringify(w5), /-6\.5|48\.5|37\.5/);
  assert.deepEqual(inputs.rosters, { community: [LUKE, TROY, SEAN].sort(), 'sean-troy-luke': [LUKE, TROY, SEAN].sort() });
  // The same inputs give the shared rules' answer (cloud/features.mjs computeFeatures).
  const results = computeFeatures(inputs, f.now);
  assert.deepEqual(results.badges.map(b => b.key).sort(), [
    `bullseye:${LUKE}:2026:4:KC-LV:spread`, `bullseye:${LUKE}:2026:4:SEA-DEN:spread`, `bullseye:${LUKE}:2026:4:SEA-DEN:total`,
    `called_the_move:${TROY}:2026:4:KC-LV:spread`, `dialed_in:${LUKE}:2026:4:spread`, `dialed_in:${LUKE}:2026:4:total`,
    `dog_day:${LUKE}:2026:4:SEA-DEN`, `double_bullseye:${LUKE}:2026:4:SEA-DEN`, `sharp:${TROY}:2026:4:KC-LV:total`, `sharp:${TROY}:2026:4:SEA-DEN:spread`,
  ].sort());
});

test('the commissioner\'s run records badges, awards and streaks once; a rerun adds nothing; a replayed run id returns its summary', { skip }, async t => {
  const f = await fixture(t);
  assert.equal((await f.run('luke')).status, 403, 'only the commissioner runs the job');
  const first = await f.run();
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body, { runId: first.body.runId, season: 2026, earned: 10, removed: 0, awards: 2, streaks: 3, posts: 6, postsSkipped: 0, replay: false },
    'Community and Triple Threat Week 4 awards; one streak row per member; five fresh badge posts and the recap');
  const again = await f.run();
  assert.deepEqual({ ...again.body, runId: null }, { runId: null, season: 2026, earned: 0, removed: 0, awards: 0, streaks: 0, posts: 0, postsSkipped: 0, replay: false }, 'idempotent');
  const replay = await f.call('gtl_record_feature_results', { p_run: first.body.runId, p_trigger: 'manual', p_actor: SEAN, p_results: { season: 2026 } });
  assert.equal(replay.replay, true); assert.equal(replay.earned, 10, 'a replayed run id returns its stored summary and writes nothing');
  assert.equal((await f.events()).length, 10);
  // Feed posts: fresh earns only (KC @ LV kicked off 2 hours ago; SEA @ DEN's are a day old), and one recap for the newest week.
  const badgePosts = await f.posts('badge_earned');
  assert.deepEqual(badgePosts.map(p => p.payload.badge).sort(), ['bullseye', 'called_the_move', 'dialed_in', 'dialed_in', 'sharp']);
  assert.ok(badgePosts.every(p => !p.payload.key.includes('SEA-DEN')), 'no backfill post for a day-old earn');
  const recap = await f.posts('weekly_recap');
  assert.equal(recap.length, 1);
  assert.equal(recap[0].actor_id, SEAN, 'posted as the week\'s publisher, as week_published is');
  assert.deepEqual(recap[0].payload.awards.map(a => [a.id, a.winners]), [
    ['spread_winner', [LUKE]], ['total_winner', [LUKE]], ['bets_winner', [LUKE]], ['best_guess', [LUKE]], ['sharpest_bet', [TROY]], ['saw_it_coming', [TROY]], ['worst_beat', [TROY]],
  ]);
});

test('a corrected final adds a removed event and deletes nothing; the awards get a new version', { skip }, async t => {
  const f = await fixture(t);
  await f.run();
  const before = await f.events();
  await f.settle(27, 24); // DEN now won 27–24: Luke's SEA +8.5 still covers, but SEA did not win outright
  const corrected = await f.run();
  assert.equal(corrected.body.removed, 1); assert.equal(corrected.body.earned, 0);
  const after = await f.events();
  assert.deepEqual(after.slice(0, before.length), before, 'every earlier event is kept as it was');
  assert.deepEqual(after.at(-1), { award_key: `dog_day:${LUKE}:2026:4:SEA-DEN`, event: 'removed' });
  const read = await f.read('troy');
  assert.ok(!read.body.badges.some(b => b.badge === 'dog_day'), 'the reader shows the newest event only');
  assert.equal(corrected.body.awards, 2, 'Worst beat is now Troy losing by 5.5: a new version for the Community and Triple Threat');
  const versions = (await f.db.query("select version,awards from public.gtl_weekly_awards where league_id='community' and week=4 order by version")).rows;
  assert.deepEqual(versions.map(v => v.awards.find(a => a.id === 'worst_beat').value), [{ lostBy: 12.5 }, { lostBy: 5.5 }], 'version 1 is kept beside version 2');
  assert.equal((await f.posts('weekly_recap')).length, 1, 'a correction never posts the recap again');
  assert.equal((await f.run()).body.removed, 0, 'a removal is recorded once');
});

test('the reader: members see the Community; a group only its members; visible badges only; streaks per account', { skip }, async t => {
  const f = await fixture(t);
  const state = structuredClone(f.world.state); state.league.id = GROUP;
  await f.db.query('insert into public.gtl_leagues(id,state,created_by) values($1,$2,$3)', [GROUP, state, SEAN]);
  for (const user of [SEAN, TROY]) await f.db.query('insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,$4)',
    [user, GROUP, `u_${user.replaceAll('-', '')}`, user === SEAN ? 'commissioner' : 'player']);
  const empty = await f.read('luke');
  assert.equal(empty.status, 200);
  assert.deepEqual({ ran: empty.body.ran, badges: empty.body.badges, awards: empty.body.awards, streaks: empty.body.streaks }, { ran: false, badges: [], awards: [], streaks: [] },
    'nothing before the job has run, and no sample');
  await f.run();
  const community = (await f.read('luke')).body;
  assert.equal(community.ran, true);
  assert.equal(community.badges.length, 10);
  assert.deepEqual(community.awards.map(a => a.week), [4]);
  assert.deepEqual(community.streaks.find(s => s.userId === LUKE), { userId: LUKE, pick: { current: 1, best: 1 }, bets: { current: 1, best: 1 } });
  assert.deepEqual(community.streaks.find(s => s.userId === SEAN).pick, { current: 0, best: 0 }, 'a sit-out breaks the Pick streak');
  const group = await f.read('troy', { leagueId: GROUP });
  assert.equal(group.status, 200);
  const groupAwards = Object.fromEntries(group.body.awards[0].awards.map(a => [a.id, a.winners]));
  assert.deepEqual(groupAwards.spread_winner, [TROY], 'the group board counts its own members only');
  assert.ok(group.body.badges.every(b => b.userId !== LUKE), 'group members\' badges only');
  const outsider = await f.read('luke', { leagueId: GROUP });
  assert.deepEqual([outsider.status, outsider.body.error], [403, 'You are not in that league.']);
  assert.equal((await f.read('luke', { leagueId: 'bad' })).status, 400);
  assert.equal((await f.read('luke', { viewer: TROY })).status, 400, 'identity comes from sign-in');
});

test('nothing is recorded before it is visible: the writer refuses a badge whose game has not kicked off', { skip }, async t => {
  const f = await fixture(t);
  const ahead = iso(f.now + HOUR);
  await assert.rejects(f.call('gtl_record_feature_results', { p_run: randomUUID(), p_trigger: 'manual', p_actor: SEAN, p_results: { season: 2026, computed: ['bullseye'],
    badges: [{ badge: 'bullseye', userId: LUKE, key: `bullseye:${LUKE}:2026:5:TB-DAL:spread`, week: 5, visibleAt: ahead, facts: {} }] } }), /GTL_FEATURES_INVALID/);
  await assert.rejects(f.call('gtl_record_feature_results', { p_run: randomUUID(), p_trigger: 'manual', p_actor: LUKE, p_results: { season: 2026 } }), /GTL_FEATURES_FORBIDDEN/);
  await assert.rejects(f.call('gtl_record_feature_results', { p_run: randomUUID(), p_trigger: 'manual', p_actor: SEAN, p_results: { season: 2026, computed: ['levels'] } }), /GTL_FEATURES_INVALID/);
  await assert.rejects(f.call('gtl_record_feature_results', { p_run: randomUUID(), p_trigger: 'schedule', p_actor: null, p_results: { season: 2026, computed: ['bullseye'],
    badges: [{ badge: 'bullseye', userId: LUKE, key: `sharp:${LUKE}:2026:4:KC-LV:total`, week: 4, visibleAt: iso(f.now - HOUR), facts: {} }] } }), /GTL_FEATURES_INVALID/, 'a key must name its badge and player');
  assert.equal((await f.events()).length, 0, 'a refused run writes nothing');
});

test('the leak scan: /league/features carries no hidden pick or line of a game still to play', { skip }, async t => {
  const f = await fixture(t);
  const week5 = f.world.state.games, lines = { spread: { [week5[0].id]: -11.5, [week5[1].id]: 15.5 }, total: { [week5[0].id]: 58.5, [week5[1].id]: 39.5 } };
  await storeLines(f.db, f.world.state, lines);
  const { sendBallot } = await import('./helpers/guess-week.mjs');
  await sendBallot(f.world, 'troy', 'guess_spread', { [week5[0].id]: -11.5, [week5[1].id]: 15.5 }); // two exact guesses tonight (values unlike any Week 4 number)
  await f.run();
  const secrets = [...lineSecrets(lines.spread, { market: 'spread' }), ...lineSecrets(lines.total, { market: 'total' }),
    ...pickSecrets({ [week5[0].id]: -11.5, [week5[1].id]: 15.5 }, { market: 'spread', owner: TROY })];
  for (const who of ['luke', 'sean']) {
    const reply = await f.read(who);
    assert.equal(reply.status, 200);
    assertNoLeak(reply.body, { viewer: ACCOUNTS[who].id, secrets }, `/league/features as ${who}`);
    // Not vacuous: the same scan finds Troy's Week 4 guess, which every member may see since that game kicked off.
    assert.ok(leakScan(reply.body, { viewer: ACCOUNTS[who].id, secrets: pickSecrets({ 'KC-LV': -3.5 }, { market: 'spread', owner: TROY }) }).length > 0, 'the scan sees inside the reply');
  }
  assert.ok(!(await f.events()).some(e => e.award_key.includes(':2026:5:')), 'tonight\'s exact guesses earn nothing until kickoff');
});

test('before M-13 the new post kinds are refused by the old check: the run records everything and counts the posts as skipped', { skip }, async t => {
  const f = await fixture(t, { m13: false });
  const result = await f.run();
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.earned, 10);
  assert.equal(result.body.posts, 0);
  assert.equal(result.body.postsSkipped, 6);
  assert.equal((await f.posts('badge_earned')).length + (await f.posts('weekly_recap')).length, 0);
});

test('existing routes are unchanged without M-25: /league/features answers "coming soon" and /community/read works', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: HOSTED, games: 2, troyBallots: false });
  t.after(() => world.db.close());
  const read = await world.api('luke', 'league/features', {});
  assert.deepEqual([read.status, read.body.error], [404, 'Badges and awards are coming soon.']);
  const run = await world.api('sean', 'league/features/run', {});
  assert.equal(run.status, 404, 'the admin check itself needs nothing from M-25, but the inputs reader does');
  assert.equal((await world.api('luke', 'community/read', {})).status, 200);
});
