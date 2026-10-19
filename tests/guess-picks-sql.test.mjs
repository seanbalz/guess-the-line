import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ALL as FUTURE_MIGRATIONS, MIGRATIONS_DIR, NOT_HOSTED, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, id as fixtureId, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets, READERS } from './helpers/leak-scan.mjs';
import { sendBallot, serviceSql, storeLines } from './helpers/guess-week.mjs';
import { catalog, parseFunctions, readMigrations, topLevel } from '../scripts/migration-functions.mjs';
import { accuracy } from '../server/domain.mjs';

// Redesign build plan stage 26, M-08 (20261015020000_gtl_guess_picks_reader.sql): everyone's Guess picks for a week and market,
// game by game, through M-01's per-game gate (D-39 lock-in, D-31 kickoff, D-23 sit-out), with the status of every member and,
// from each game's kickoff, the error, points, shared rank and closest flag. Runs on ALL (the hosted project has neither M-01
// nor M-08 yet), on local PGlite only, through the real handler and on the raw reader. Fixture accounts and values only.
//
// The week: four games; the first kicks off at the deadline, the rest an hour apart. Troy locks in Spread and Total, Luke keeps
// a Spread draft and locks in Total, Sean sits out Spread and locks in Total. Dana (removed) sat out Spread; Eve (removed) has
// no entry; Finn has no ballot at all. Every pick and line is an unusual half point and no two share a size within a market,
// so the leak scan can name each one; every error and every point total is then a whole number, which no secret can equal.
// This suite proves the pre-M-07 stage contract; M-07 has its own full-stack SQL suite.
const ALL = FUTURE_MIGRATIONS.filter(file => file < '20261015190710_gtl_guess_write_window.sql');

const MIGRATION = '20261015020000_gtl_guess_picks_reader.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const SIGNATURE = 'gtl_read_guess_picks(uuid,integer,integer,text,text,uuid,timestamptz)';
const LINES = { spread: [-11.5, 13.5, 6.5, -9.5], total: [58.5, 31.5, 52.5, 36.5] };
const TROY = { spread: [-5.5, 2.5, 7.5, -12.5], total: [56.5, 34.5, 44.5, 39.5] };
const LUKE = { spread: [-1.5, 4.5, 8.5, -14.5], total: [62.5, 28.5, 49.5, 41.5] }; // Spread stays a draft
const SEAN = { total: [54.5, 37.5, 51.5, 47.5] }; // Spread sat out
const EXTRA = { dana: { id: fixtureId(4), name: 'Dana Fixture' }, eve: { id: fixtureId(5), name: 'Eve Fixture' }, finn: { id: fixtureId(6), name: 'Finn Fixture' } };
const ROW_KEYS = ['closest', 'eligible', 'error', 'hidden', 'late', 'lockedIn', 'pick', 'points', 'rank', 'removed', 'status', 'tied', 'userId'];

test('M-08 is a hosted repo migration; it adds one function and replaces, drops or writes nothing', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(!NOT_HOSTED.includes(version(MIGRATION)), 'confirmed hosted by the October 19 apply record');
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const defined = parseFunctions(sql, MIGRATION);
  assert.deepEqual(defined.map(fn => `${fn.schema}.${fn.name}`), ['public.gtl_read_guess_picks']);
  const before = catalog(readMigrations(ALL.filter(file => file < MIGRATION))).latest;
  assert.equal(before.has('public.gtl_read_guess_picks'), false, 'a new function: no -- replaces header and no rollback body');
  assert.equal(fs.existsSync(path.join(ROLLBACK_DIR, MIGRATION)), false, 'it replaces nothing, so supabase/rollback/ holds no file for it');
  // Only the function and its grants: no table, trigger, row or other object changes.
  const statements = topLevel(sql).split(';').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(statements.map(s => s.split(/\s+/).slice(0, 2).join(' ').toLowerCase()), ['create or', 'revoke all', 'grant execute']);
  // M-01's helpers come first in filename order (Gate M step 1; build plan section 5 rule 3).
  assert.ok(ALL.indexOf('20261014223000_gtl_guess_gate_per_game.sql') < ALL.indexOf(MIGRATION));
  // The apply record that takes M-08 out of NOT_HOSTED (Gate M step 8) puts /community/picks into the leak scan's READERS in
  // the same change, as M-09's did for /personal/notes; until then this suite scans the route on ALL itself.
  assert.equal(READERS.some(([route]) => route === '/community/picks'), !NOT_HOSTED.includes(version(MIGRATION)),
    'a hosted M-08 needs /community/picks in READERS (tests/helpers/leak-scan.mjs), and an unapplied one stays out of the HOSTED scans');
});

test('everyone\'s picks (M-08): per game and market through M-01\'s gate; statuses; error, points, shared rank and closest from kickoff; no leak', { skip }, async t => {
  let clock = null;
  // The stage's own migration is left out first, as the hosted project is today, and applied once the week is under way.
  const world = await createCommunityWorld({ migrations: ALL.filter(file => file !== MIGRATION), games: 4, troyBallots: false, clock: () => clock ?? Date.now() });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id);
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const kickoff = ids.map(g => Date.parse(state.games.find(x => x.id === g).kickoff));
  const deadline = Date.parse(state.league.deadline), { season, week } = state.league;
  assert.equal(kickoff[0], deadline, 'the first game kicks off at the deadline');
  const FIRST = kickoff[0], LAST = kickoff[3];
  const iso = ms => new Date(ms).toISOString();
  const uid = who => (ACCOUNTS[who] ?? EXTRA[who]).id;
  const sql = serviceSql(db);
  const raw = (who, mode, now, { game = null, target = null, s = season, w = week } = {}) =>
    sql('gtl_read_guess_picks', { p_user: uid(who), p_season: s, p_week: w, p_mode: mode, p_game: game, p_target: target, p_now: iso(now) });
  const api = async (who, body, now) => {
    clock = now;
    try { return await world.api(who, 'community/picks', body); } finally { clock = null; }
  };
  const game = (reply, i) => reply.games.find(g => g.gameId === ids[i]);
  const row = (reply, i, who) => game(reply, i).rows.find(r => r.userId === uid(who));
  const order = (reply, i) => game(reply, i).rows.map(r => Object.keys(EXTRA).find(k => EXTRA[k].id === r.userId) ?? Object.keys(ACCOUNTS).find(k => ACCOUNTS[k].id === r.userId));
  const blank = who => ({ userId: uid(who), removed: false, status: 'not_yet', lockedIn: false, late: null, eligible: null, hidden: false, pick: null,
    error: null, points: null, rank: null, tied: false, closest: false });

  // Three more profiles: Dana sat out Spread (written as gtl_sit_out_week writes it) and is then removed; Eve is removed with no
  // entry; Finn never saves anything.
  for (const { id, name } of Object.values(EXTRA)) {
    await db.query('insert into auth.users values($1)', [id]);
    await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id, name]);
  }
  await db.query("insert into public.gtl_weekly_optouts(user_id,season,week,mode) values($1,$2,$3,'guess_spread')", [EXTRA.dana.id, season, week]);
  for (const who of ['dana', 'eve']) {
    const removed = await world.api('sean', 'community/member', { userId: EXTRA[who].id, member: false });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
  }

  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  await sendBallot(world, 'troy', 'guess_spread', map(TROY.spread));
  await sendBallot(world, 'troy', 'guess_total', map(TROY.total));
  await sendBallot(world, 'luke', 'guess_spread', map(LUKE.spread), false);
  await sendBallot(world, 'luke', 'guess_total', map(LUKE.total));
  await sendBallot(world, 'sean', 'guess_total', map(SEAN.total));
  const satOut = await world.api('sean', 'community/sit-out', { season, week, mode: 'guess_spread' });
  assert.equal(satOut.status, 200, JSON.stringify(satOut.body));
  // "Now" for the reads: a whole second after every send (so no timestamp string can carry a half-point token), before the deadline.
  const NOW = Math.ceil(Date.now() / 1000) * 1000;
  assert.ok(NOW < deadline);

  await t.test('before the apply: /community/picks answers 503 and nothing else changes; the apply adds the reader and leaves every other reply as it was', async () => {
    const reads = async () => {
      clock = NOW;
      try { return await Promise.all(['luke', 'troy', 'sean'].flatMap(who => [world.api(who, 'community/read', {}), world.api(who, 'community/history', {})])); } finally { clock = null; }
    };
    const missing = await api('luke', { mode: 'guess_total' }, NOW);
    assert.deepEqual([missing.status, missing.body], [503, { error: 'The saved data service is temporarily unavailable. Please try again.' }],
      'the in-process mapper; the hosted adapter answers PGRST202 as GTL_FEATURE_OFF (tests/guess-picks-cloud.test.mjs)');
    const before = await reads();
    assert.ok(before.every(reply => reply.status === 200));
    assert.deepEqual((await db.query("select count(*)::int n from pg_proc where proname='gtl_read_guess_picks'")).rows, [{ n: 0 }]);
    const md5s = async () => (await db.query("select p.proname,md5(p.prosrc) md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>'gtl_read_guess_picks' order by 1,2")).rows;
    const bodies = await md5s();
    await db.exec(migrationSql(MIGRATION));
    await db.exec(migrationSql(MIGRATION)); // rerunnable
    assert.deepEqual(await md5s(), bodies, 'no other function body changes');
    assert.deepEqual(await reads(), before, '/community/read and /community/history answer exactly as before');
    assert.equal((await api('luke', { mode: 'guess_total' }, NOW)).status, 200);
  });

  await t.test('one service-only, security-invoker, stable function; browser roles are refused', async () => {
    assert.deepEqual((await db.query("select prosecdef,provolatile,pg_get_function_identity_arguments(oid) args from pg_proc where proname='gtl_read_guess_picks'")).rows,
      [{ prosecdef: false, provolatile: 's', args: 'p_user uuid, p_season integer, p_week integer, p_mode text, p_game text, p_target uuid, p_now timestamp with time zone' }]);
    for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${SIGNATURE}`, 'EXECUTE'])).rows[0].ok, false, role);
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${SIGNATURE}`, 'EXECUTE'])).rows[0].ok, true);
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select public.gtl_read_guess_picks($1,null,null,'guess_spread',null,null,null)", [uid('luke')]); }), /permission denied/, role);
    }
  });

  await t.test('before any kickoff: a locked-in guess shows only to a viewer who locked in that game or sat out; drafts never show to anyone else', async () => {
    // Luke has a Spread draft only: every game is closed to him. Troy's locked-in guesses are hidden, with no number.
    const luke = await raw('luke', 'guess_spread', NOW);
    assert.deepEqual([luke.viewer, luke.season, luke.week, luke.mode, luke.deadline, luke.games.map(g => g.gameId)], [uid('luke'), season, week, 'guess_spread', iso(deadline).replace('.000Z', '+00:00'), ids]);
    for (let i = 0; i < 4; i++) {
      assert.deepEqual([game(luke, i).open, game(luke, i).started], [false, false]);
      assert.deepEqual(order(luke, i), ['luke', 'dana', 'finn', 'sean', 'troy'], 'the viewer first, then by name; Eve (removed, no entry) is not listed');
      for (const r of game(luke, i).rows) assert.deepEqual(Object.keys(r).sort(), ROW_KEYS);
      assert.deepEqual(row(luke, i, 'luke'), { ...blank('luke'), pick: LUKE.spread[i] }, 'his own draft, never redacted, and not locked in');
      assert.deepEqual(row(luke, i, 'troy'), { ...blank('troy'), status: 'in', lockedIn: true, eligible: true, hidden: true });
      assert.deepEqual(row(luke, i, 'sean'), { ...blank('sean'), status: 'sat_out' });
      assert.deepEqual(row(luke, i, 'dana'), { ...blank('dana'), status: 'sat_out', removed: true }, 'a removed member\'s entry stays listed (D-23)');
      assert.deepEqual(row(luke, i, 'finn'), blank('finn'));
    }
    // Troy locked in every Spread game: all open to him. Luke's draft reads exactly as Finn's missing ballot.
    const troy = await raw('troy', 'guess_spread', NOW);
    for (let i = 0; i < 4; i++) {
      assert.equal(game(troy, i).open, true);
      assert.deepEqual(order(troy, i), ['troy', 'dana', 'finn', 'luke', 'sean']);
      assert.deepEqual(row(troy, i, 'troy'), { ...blank('troy'), status: 'in', lockedIn: true, eligible: true, pick: TROY.spread[i] });
      assert.deepEqual(row(troy, i, 'luke'), blank('luke'), 'a draft is never told apart from no ballot');
    }
    // Sean sat out Spread: the market opens; Troy's guesses show, Luke's draft does not; no points before kickoff.
    const sean = await raw('sean', 'guess_spread', NOW);
    for (let i = 0; i < 4; i++) {
      assert.equal(game(sean, i).open, true);
      assert.deepEqual(row(sean, i, 'troy'), { ...blank('troy'), status: 'in', lockedIn: true, eligible: true, pick: TROY.spread[i] });
      assert.deepEqual([row(sean, i, 'luke'), row(sean, i, 'sean')], [blank('luke'), { ...blank('sean'), status: 'sat_out' }]);
    }
    // Total: everyone but Finn locked in, so it is open to all three; still no error, points or rank before kickoff.
    const total = await raw('luke', 'guess_total', NOW);
    for (let i = 0; i < 4; i++) {
      assert.equal(game(total, i).open, true);
      assert.deepEqual(order(total, i), ['luke', 'finn', 'sean', 'troy'], 'Dana has no Total entry and is removed: not listed');
      assert.deepEqual(game(total, i).rows.map(r => [r.status, r.pick, r.error, r.points, r.rank, r.tied, r.closest]),
        [['in', LUKE.total[i], null, null, null, false, false], ['not_yet', null, null, null, null, false, false], ['in', SEAN.total[i], null, null, null, false, false], ['in', TROY.total[i], null, null, null, false, false]]);
    }
    // Finn, who has no ballot, sees only statuses in both markets.
    for (const mode of ['guess_spread', 'guess_total']) {
      const finn = await raw('finn', mode, NOW);
      assert.ok(finn.games.every(g => g.open === false && g.rows.every(r => r.pick === null && r.error === null)), mode);
    }
  });

  await t.test('one kickoff opens one game, for both markets, with the error, points, shared rank and closest flag', async () => {
    const spread = await raw('luke', 'guess_spread', FIRST);
    assert.deepEqual(spread.games.map(g => [g.open, g.started]), [[true, true], [false, false], [false, false], [false, false]]);
    assert.deepEqual(row(spread, 0, 'troy'), { ...blank('troy'), status: 'in', lockedIn: true, eligible: true, pick: TROY.spread[0], error: 6, points: 0, rank: 1, closest: true });
    assert.deepEqual(row(spread, 0, 'luke'), { ...blank('luke'), pick: LUKE.spread[0] }, 'a draft never scores, not even for its owner');
    assert.deepEqual(order(spread, 0), ['troy', 'luke', 'dana', 'finn', 'sean'], 'scored rows first, by rank');
    for (let i = 1; i < 4; i++) assert.deepEqual([row(spread, i, 'troy').pick, row(spread, i, 'troy').hidden, row(spread, i, 'troy').error], [null, true, null]);

    const total = await raw('luke', 'guess_total', FIRST);
    // Game 1: Troy 2 off; Luke and Sean 4 off share second place.
    assert.deepEqual(game(total, 0).rows.map(r => [r.userId, r.error, r.points, r.rank, r.tied, r.closest]), [
      [uid('troy'), 2, accuracy(TROY.total[0], LINES.total[0]), 1, false, true],
      [uid('luke'), 4, accuracy(LUKE.total[0], LINES.total[0]), 2, true, false],
      [uid('sean'), 4, accuracy(SEAN.total[0], LINES.total[0]), 2, true, false],
      [uid('finn'), null, null, null, false, false],
    ]);
    for (let i = 1; i < 4; i++) assert.ok(game(total, i).rows.every(r => r.error === null && r.rank === null && r.points === null), `game ${i + 1} has not kicked off`);
  });

  await t.test('after the last kickoff: every game ranked by error over every scored member; points are the board\'s points', async () => {
    const total = await raw('luke', 'guess_total', LAST);
    const places = i => game(total, i).rows.filter(r => r.rank !== null).map(r => [Object.keys(ACCOUNTS).find(k => ACCOUNTS[k].id === r.userId), r.error, r.rank, r.tied, r.closest]);
    assert.deepEqual(places(0), [['troy', 2, 1, false, true], ['luke', 4, 2, true, false], ['sean', 4, 2, true, false]]);
    assert.deepEqual(places(1), [['luke', 3, 1, true, true], ['troy', 3, 1, true, true], ['sean', 6, 3, false, false]], 'a tie for first: both closest');
    assert.deepEqual(places(2), [['sean', 1, 1, false, true], ['luke', 3, 2, false, false], ['troy', 8, 3, false, false]]);
    assert.deepEqual(places(3), [['troy', 3, 1, false, true], ['luke', 5, 2, false, false], ['sean', 11, 3, false, false]]);
    assert.equal(row(total, 3, 'sean').points, 0, 'more than five off scores 0 and still ranks');
    // The same points the leaderboard counts (gtl_ballot_pick_scores is the single scoring path).
    const board = await sql('gtl_read_community', { p_user: uid('luke'), p_before: null, p_limit: 100, p_now: iso(LAST) });
    for (const [who, picks] of [['troy', TROY.total], ['luke', LUKE.total], ['sean', SEAN.total]]) {
      const sum = Math.round(ids.reduce((acc, g, i) => acc + row(total, i, who).points, 0) * 100) / 100;
      assert.equal(sum, Math.round(picks.reduce((acc, v, i) => acc + accuracy(v, LINES.total[i]), 0) * 100) / 100, who);
      assert.equal(Number(board.standings.find(s => s.userId === uid(who) && s.mode === 'guess_total').weekPoints), sum, `${who}: the board's week points`);
    }
    // Spread: Troy is the only scored member; Luke's draft, two sit-outs and Finn never score.
    const spread = await raw('sean', 'guess_spread', LAST);
    assert.deepEqual(spread.games.map(g => g.rows.filter(r => r.rank !== null).map(r => [r.userId, r.error, r.points, r.rank, r.closest])),
      ids.map((g, i) => [[uid('troy'), Math.abs(TROY.spread[i] - LINES.spread[i]), accuracy(TROY.spread[i], LINES.spread[i]), 1, true]]));
    assert.ok(spread.games.every(g => g.rows.find(r => r.userId === uid('luke')).pick === null), 'Luke\'s draft stays his own after every kickoff');
  });

  await t.test('one game and one member: the rank is still taken over everyone; unknown games, members and weeks give nothing', async () => {
    const full = await raw('luke', 'guess_total', LAST);
    const one = await raw('luke', 'guess_total', LAST, { game: ids[2] });
    assert.deepEqual(one.games, [game(full, 2)]);
    const troy = await raw('luke', 'guess_total', LAST, { target: uid('troy') });
    assert.deepEqual(troy.games.map(g => g.rows), ids.map((g, i) => [row(full, i, 'troy')]), 'one row per game, with Troy\'s place among everyone');
    assert.deepEqual(troy.games.map(g => g.rows[0].rank), [1, 1, 3, 1]);
    const both = await raw('luke', 'guess_total', LAST, { game: ids[1], target: uid('sean') });
    assert.deepEqual(both.games.map(g => g.rows.map(r => [r.userId, r.rank])), [[[uid('sean'), 3]]]);
    assert.deepEqual((await raw('luke', 'guess_spread', NOW, { target: EXTRA.dana.id })).games.map(g => g.rows.map(r => [r.status, r.removed])), ids.map(() => [['sat_out', true]]));
    for (const target of [EXTRA.eve.id, fixtureId(99)]) assert.ok((await raw('luke', 'guess_total', LAST, { target })).games.every(g => g.rows.length === 0), target);
    assert.deepEqual((await raw('luke', 'guess_total', LAST, { game: 'XX-YY' })).games, []);
    const unknown = await raw('luke', 'guess_total', LAST, { s: 1999, w: 1 });
    assert.deepEqual([unknown.games, unknown.deadline], [[], null]);
    // No season and week: the newest published week.
    assert.deepEqual(await raw('luke', 'guess_total', LAST, { s: null, w: null }), full);
  });

  await t.test('refusals: a removed or unknown viewer, a bad mode, a season without a week', async () => {
    await assert.rejects(() => raw('eve', 'guess_total', NOW), /GTL_COMMUNITY_MEMBER/);
    await assert.rejects(() => sql('gtl_read_guess_picks', { p_user: fixtureId(99), p_season: null, p_week: null, p_mode: 'guess_total', p_game: null, p_target: null, p_now: null }), /GTL_COMMUNITY_MEMBER/);
    for (const mode of [null, 'betting_challenge', 'spread']) await assert.rejects(() => raw('luke', mode, NOW), /GTL_COMMUNITY_INVALID/, String(mode));
    await assert.rejects(() => raw('luke', 'guess_total', NOW, { s: season, w: null }), /GTL_COMMUNITY_INVALID/);
    await assert.rejects(() => raw('luke', 'guess_total', NOW, { s: null, w: week }), /GTL_COMMUNITY_INVALID/);
  });

  await t.test('the route answers exactly what the reader answers, with the handler clock as now; refusals keep their mapped sentences', async () => {
    for (const [who, mode, now, extra] of [['luke', 'guess_spread', NOW, {}], ['troy', 'guess_spread', FIRST, {}], ['luke', 'guess_total', LAST, {}],
      ['sean', 'guess_total', LAST, { gameId: ids[1] }], ['luke', 'guess_total', LAST, { userId: uid('troy') }], ['luke', 'guess_total', FIRST, { season, week }]]) {
      const reply = await api(who, { mode, ...extra }, now);
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      assert.deepEqual(reply.body, await raw(who, mode, now, { game: extra.gameId ?? null, target: extra.userId ?? null }), `${who} ${mode} ${JSON.stringify(extra)}`);
    }
    // The handler refuses a bad body before the database; a removed viewer is the SQL refusal above (Eve has no session here).
    const bad = await api('luke', { mode: 'guess_moneyline' }, NOW);
    assert.deepEqual([bad.status, bad.body], [400, { error: 'Check the post and try again.' }]);
  });

  await t.test('leak scan: no hidden pick, no other member\'s draft and no line in any reply, raw or through the route, for every viewer, market and filter', async () => {
    const owners = { troy: TROY, luke: LUKE, sean: SEAN };
    // An independent model of D-39 for this fixture: who locked in what, who sat out what.
    const locked = { guess_spread: ['troy'], guess_total: ['troy', 'luke', 'sean'] };
    const satOutOf = { guess_spread: ['sean', 'dana'], guess_total: [] };
    const open = (viewer, mode, i, now) => now >= kickoff[i] || locked[mode].includes(viewer) || satOutOf[mode].includes(viewer);
    const secretsFor = (viewer, mode, now) => {
      const market = mode === 'guess_spread' ? 'spread' : 'total';
      const hidden = [];
      for (const [owner, picks] of Object.entries(owners)) {
        if (owner === viewer || !picks[market]) continue;
        const values = Object.fromEntries(ids.map((g, i) => [g, picks[market][i]]).filter(([, v], i) => !(locked[mode].includes(owner) && open(viewer, mode, i, now))));
        hidden.push(...pickSecrets(values, { market, owner }));
      }
      // The reader never carries a line value, in either market, before or after kickoff (lines are stage 23's reader).
      return [...hidden, ...lineSecrets(map(LINES.spread), { market: 'spread' }), ...lineSecrets(map(LINES.total), { market: 'total' })];
    };
    let scanned = 0;
    for (const viewer of ['luke', 'troy', 'sean', 'finn']) {
      for (const mode of ['guess_spread', 'guess_total']) {
        for (const now of [NOW, FIRST, kickoff[1], LAST]) {
          const secrets = secretsFor(viewer, mode, now);
          const variants = [{}, { game: ids[1] }, { game: ids[3] }, { target: uid('troy') }, { target: uid('luke') }];
          for (const options of variants) {
            assertNoLeak(await raw(viewer, mode, now, options), { viewer: uid(viewer), secrets }, `${viewer} ${mode} raw ${JSON.stringify(options)} at ${iso(now)}`);
            scanned++;
          }
          if (viewer === 'finn') continue; // no session: the raw reader covers him
          for (const body of [{ mode }, { mode, gameId: ids[2] }, { mode, userId: uid('sean') }]) {
            const reply = await api(viewer, body, now);
            assert.equal(reply.status, 200, JSON.stringify(reply.body));
            assertNoLeak(reply.body, { viewer: uid(viewer), secrets }, `${viewer} /community/picks ${JSON.stringify(body)} at ${iso(now)}`);
            scanned++;
          }
        }
      }
    }
    assert.equal(scanned, 4 * 2 * 4 * 5 + 3 * 2 * 4 * 3);
    // Not vacuous: what opens is really in the reply. Troy's Spread guesses reach Sean (sat out) before any kickoff, and
    // Luke at the first kickoff for the first game only; Luke's own draft is in his reply, exempt only because it is his.
    const troySpread = pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' });
    assert.equal(leakScan(await raw('sean', 'guess_spread', NOW), { viewer: uid('sean'), secrets: troySpread }).length, 4);
    assert.deepEqual(leakScan(await raw('luke', 'guess_spread', FIRST), { viewer: uid('luke'), secrets: troySpread }).map(f => f.found), [TROY.spread[0]]);
    const lukeDraft = pickSecrets(map(LUKE.spread), { market: 'spread', owner: 'luke' });
    assert.equal(leakScan(await raw('luke', 'guess_spread', NOW), { viewer: uid('troy'), secrets: lukeDraft }).length, 4, 'his draft is in his own reply');
    assert.deepEqual(leakScan(await raw('luke', 'guess_spread', NOW), { viewer: uid('luke'), secrets: lukeDraft }), []);
  });

  await t.test('the Late marker: a locked-in guess of a late ballot reads late with { deadline, minutes } only', async () => {
    const late = { deadline: iso(deadline), minutes: 12 };
    await db.query("update public.gtl_weekly_ballots set ballot=ballot||jsonb_build_object('late',$1::jsonb) where user_id=$2 and season=$3 and week=$4 and mode='guess_total'",
      [{ ...late, note: 'never shown' }, uid('troy'), season, week]);
    for (const now of [NOW, LAST]) {
      const reply = await raw('luke', 'guess_total', now);
      for (let i = 0; i < 4; i++) assert.deepEqual([row(reply, i, 'troy').status, row(reply, i, 'troy').late, row(reply, i, 'troy').pick], ['late', late, TROY.total[i]]);
      assert.ok(reply.games.every(g => g.rows.filter(r => r.userId !== uid('troy')).every(r => r.late === null && r.status !== 'late')));
      assert.deepEqual((await api('luke', { mode: 'guess_total' }, now)).body, reply);
    }
    // Hidden from a viewer who has not opened the game, the late row still carries no number.
    const finn = await raw('finn', 'guess_total', NOW);
    assert.deepEqual(row(finn, 0, 'troy'), { ...blank('troy'), status: 'late', lockedIn: true, eligible: true, late, hidden: true });
    // A Late marker on a ballot with nothing locked in (Luke's Spread draft) shows nowhere, not even to its owner: `late` and
    // the 'late' status belong to a locked-in guess only.
    await db.query("update public.gtl_weekly_ballots set ballot=ballot||jsonb_build_object('late',$1::jsonb) where user_id=$2 and season=$3 and week=$4 and mode='guess_spread'",
      [late, uid('luke'), season, week]);
    for (const viewer of ['luke', 'troy', 'sean']) {
      const spread = await raw(viewer, 'guess_spread', NOW);
      for (let i = 0; i < 4; i++) assert.deepEqual([row(spread, i, 'luke').status, row(spread, i, 'luke').late, row(spread, i, 'luke').lockedIn], ['not_yet', null, false], `${viewer}, game ${i + 1}`);
    }
    assert.deepEqual(row(await raw('luke', 'guess_spread', NOW), 0, 'luke'), { ...blank('luke'), pick: LUKE.spread[0] }, 'his own draft, unchanged');
  });

  await t.test('an ineligible ballot (practice, no ruling) shows its locked-in guesses and never scores or ranks (D-08)', async () => {
    await db.transaction(async tx => {
      await tx.exec('set local session_replication_role = replica');
      await tx.query("update public.gtl_weekly_ballots set origin_practice=true where user_id=$1 and season=$2 and week=$3 and mode='guess_total'", [uid('sean'), season, week]);
    });
    const total = await raw('luke', 'guess_total', LAST);
    for (let i = 0; i < 4; i++) {
      assert.deepEqual(row(total, i, 'sean'), { ...blank('sean'), status: 'in', lockedIn: true, eligible: false, pick: SEAN.total[i] });
    }
    // The places close up around the unscored ballot.
    assert.deepEqual(ids.map((g, i) => game(total, i).rows.filter(r => r.rank !== null).map(r => [r.userId, r.rank])), [
      [[uid('troy'), 1], [uid('luke'), 2]], [[uid('luke'), 1], [uid('troy'), 1]], [[uid('luke'), 1], [uid('troy'), 2]], [[uid('troy'), 1], [uid('luke'), 2]],
    ]);
  });
});
