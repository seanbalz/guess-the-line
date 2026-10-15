import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL, HOSTED, MIGRATIONS_DIR, NOT_HOSTED, REQUIRES, ROLLBACK_DIR, migrationSql, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, id as fixtureId, pgliteAvailable } from './cloud-browser/community-world.mjs';
import { assertNoLeak, leakScan, lineSecrets, pickSecrets } from './helpers/leak-scan.mjs';
import { sendBallot, serviceSql, storeLines } from './helpers/guess-week.mjs';
import { catalog, parseFunctions, readMigrations, topLevel } from '../scripts/migration-functions.mjs';
import { accuracy } from '../server/domain.mjs';

// Redesign build plan stage 19, M-03 (20261015040000_gtl_guess_week_forfeit.sql): "Skip this week's Guess the Line" and "See
// picks now" (D-36, D-39). One forfeit per player and week, until the week's last kickoff: it sits out (a D-23 opt-out) every
// market the player has neither submitted nor sat out, and a submitted market keeps counting; the opt-out rows open the rest of
// that market through M-01's gate and close its ballot. D-41: a sit-out or forfeit after some games are locked in covers only
// the rest, and History lists the locked-in guesses (M-03 replaces M-01's gtl_read_community_history for that, and answers
// exactly as M-01's without per-game lock-ins). Runs on ALL (the hosted project has neither M-01 nor M-03 yet), on local
// PGlite only, through the real handler and on the raw functions. Fixture accounts and values only.
//
// The week: three games; the first kicks off at the deadline, the others an hour apart. Troy submits Spread and keeps a Total
// draft; Luke keeps drafts in both markets; Sean submits both. Dana sat out Spread with the old "Sit out"; Finn and Gina have no
// ballot; Eve is removed. Every pick and line is an unusual half point and no two share a size within a market, so the leak scan
// can name each one; every point total is then a whole number.
const MIGRATION = '20261015040000_gtl_guess_week_forfeit.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const HOUR = 3_600_000;
const LINES = { spread: [-11.5, 13.5, 6.5], total: [58.5, 31.5, 52.5] };
const TROY = { spread: [-5.5, 2.5, 7.5], total: [56.5, 34.5, 44.5] }; // Total stays a draft
const LUKE = { spread: [-1.5, 4.5, 8.5], total: [62.5, 28.5, 49.5] }; // both drafts
const SEAN = { spread: [-12.5, 3.5, 9.5], total: [54.5, 37.5, 47.5] }; // both submitted
const EXTRA = { dana: { id: fixtureId(4), name: 'Dana Fixture' }, finn: { id: fixtureId(5), name: 'Finn Fixture' },
  gina: { id: fixtureId(6), name: 'Gina Fixture' }, eve: { id: fixtureId(7), name: 'Eve Fixture' } };
const FUNCTIONS = ['gtl_forfeit_markets(uuid,integer,integer)', 'gtl_forfeit_guess_week(uuid,integer,integer,text,timestamptz)', 'gtl_read_forfeit(uuid,integer,integer,timestamptz)'];
const MODES = ['guess_spread', 'guess_total'];

test('M-03 is a repo file the hosted project does not have yet; it adds one table and three functions, replaces only M-01\'s History reader, and drops or deletes nothing', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(NOT_HOSTED.includes(version(MIGRATION)), 'listed in NOT_HOSTED until the apply record removes it (Gate M step 8)');
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8');
  const defined = parseFunctions(sql, MIGRATION);
  assert.deepEqual(defined.map(fn => `${fn.schema}.${fn.name}`), ['public.gtl_forfeit_markets', 'public.gtl_forfeit_guess_week', 'public.gtl_read_forfeit', 'public.gtl_read_community_history']);
  const before = catalog(readMigrations(ALL.filter(file => file < MIGRATION))).latest;
  for (const fn of defined.slice(0, 3)) assert.equal(before.has(`${fn.schema}.${fn.name}`), false, `${fn.name} is new`);
  // The one replaced body is M-01's (build plan section 5 rule 9), named by its md5 header, with the same argument list.
  const history = before.get('public.gtl_read_community_history');
  assert.deepEqual([history.file, history.md5], ['20261014223000_gtl_guess_gate_per_game.sql', '2ebcb46927105a7566670d279d12dcb6']);
  assert.match(sql, /^-- replaces public\.gtl_read_community_history md5 2ebcb46927105a7566670d279d12dcb6$/m);
  assert.equal(defined[3].args, history.args);
  assert.ok(fs.existsSync(path.join(ROLLBACK_DIR, MIGRATION)), 'supabase/rollback/ restores M-01\'s body (tests/rollback.test.mjs checks it); the writer\'s off switch is GTL_FEATURE_OFF=forfeit');
  // M-01 is hosted since October 14, 2026, so the rollback check needs no REQUIRES entry for it (tests/rollback.test.mjs).
  assert.equal(REQUIRES[version(MIGRATION)], undefined);
  assert.ok(HOSTED.includes('20261014223000_gtl_guess_gate_per_game.sql'));
  const statements = topLevel(sql).split(';').map(s => s.trim()).filter(Boolean).map(s => s.split(/\s+/).slice(0, 3).join(' ').toLowerCase());
  assert.deepEqual(statements, ['create table if', 'create index if', 'alter table public.gtl_week_forfeits', 'revoke all on', 'grant select,insert on',
    'create or replace', 'create or replace', 'create or replace', 'create or replace', 'revoke all on', 'grant execute on']);
  assert.doesNotMatch(topLevel(sql).replace(/\bon delete cascade\b/gi, ''), /\b(drop|delete|truncate|update)\b/i, 'additive only (D-23)');
  // M-01's gate comes first in filename order (Gate M step 1; build plan section 6).
  assert.ok(ALL.indexOf('20261014223000_gtl_guess_gate_per_game.sql') < ALL.indexOf(MIGRATION));
});

test('skip and "See picks now" (M-03): every market not submitted is sat out at once, a submitted one keeps counting; until the last kickoff; final and idempotent; no leak', { skip }, async t => {
  let clock = null;
  // The stage's own migration is left out first, as the hosted project is today, and applied once the week is under way.
  const world = await createCommunityWorld({ migrations: ALL.filter(file => file !== MIGRATION), games: 3, troyBallots: false, optionalRpc: true, clock: () => clock ?? Date.now() });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id);
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const kickoff = ids.map(g => Date.parse(state.games.find(x => x.id === g).kickoff));
  const deadline = Date.parse(state.league.deadline), { season, week } = state.league;
  assert.equal(kickoff[0], deadline, 'the first game kicks off at the deadline');
  const FIRST = kickoff[0], LAST = kickoff[2], AFTER = FIRST + HOUR / 2;
  const iso = ms => new Date(ms).toISOString();
  const uid = who => (ACCOUNTS[who] ?? EXTRA[who]).id;
  const sql = serviceSql(db);
  const at = async (now, fn) => { clock = now; try { return await fn(); } finally { clock = null; } };
  const api = (who, route, body, now) => at(now, () => world.api(who, route, body));
  const forfeit = (who, reason, now, { s = season, w = week } = {}) => sql('gtl_forfeit_guess_week', { p_user: uid(who), p_season: s, p_week: w, p_reason: reason, p_now: iso(now) });
  const read = (who, now, { s = season, w = week } = {}) => sql('gtl_read_forfeit', { p_user: uid(who), p_season: s, p_week: w, p_now: iso(now) });
  const rows = async (table, who) => (await db.query(`select * from public.${table} where user_id=$1 and season=$2 and week=$3 order by 1,2,3`, [uid(who), season, week])).rows;
  const count = async table => (await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
  const audits = async who => (await db.query("select event from public.gtl_access_audit where actor_id=$1 and event like 'forfeit:%' order by created_at,event", [uid(who)])).rows.map(r => r.event);
  const ballots = async who => (await db.query('select mode,ballot,audit from public.gtl_weekly_ballots where user_id=$1 and season=$2 and week=$3 order by mode', [uid(who), season, week])).rows;
  const visible = async (who, now) => sql('gtl_markets_visible', { p_user: uid(who), p_season: season, p_week: week, p_now: iso(now) });
  const market = (mode, status, lockedIn = 0) => ({ mode, status, lockedIn, games: 3 });

  for (const { id, name } of Object.values(EXTRA)) {
    await db.query('insert into auth.users values($1)', [id]);
    await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id, name]);
  }
  const removed = await world.api('sean', 'community/member', { userId: EXTRA.eve.id, member: false });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  await sendBallot(world, 'troy', 'guess_spread', map(TROY.spread));
  await sendBallot(world, 'troy', 'guess_total', map(TROY.total), false);
  await sendBallot(world, 'luke', 'guess_spread', map(LUKE.spread), false);
  await sendBallot(world, 'luke', 'guess_total', map(LUKE.total), false);
  await sendBallot(world, 'sean', 'guess_spread', map(SEAN.spread));
  await sendBallot(world, 'sean', 'guess_total', map(SEAN.total));
  // "Now": a whole second after every save (so no timestamp string can carry a half-point token), before the deadline.
  const NOW = Math.ceil(Date.now() / 1000) * 1000 + 1000;
  assert.ok(NOW + 10 * 60_000 < deadline);
  assert.deepEqual(await sql('gtl_sit_out_week', { p_user: EXTRA.dana.id, p_season: season, p_week: week, p_mode: 'guess_spread', p_now: iso(NOW) }),
    { season, week, mode: 'guess_spread', satOut: true, replayed: false }, 'Dana sits out Spread with the old button');

  // An independent model of the gate for this fixture: who submitted what (every guess locked in), who sat out what.
  const submitted = { guess_spread: ['troy', 'sean'], guess_total: ['sean'] };
  const satOut = { guess_spread: ['dana'], guess_total: [] };
  const owners = { troy: TROY, luke: LUKE, sean: SEAN };
  const open = (viewer, mode, i, now) => now >= kickoff[i] || submitted[mode].includes(viewer) || satOut[mode].includes(viewer);
  const hiddenPicks = (viewer, now) => MODES.flatMap(mode => {
    const key = mode === 'guess_spread' ? 'spread' : 'total';
    return Object.entries(owners).filter(([owner]) => owner !== viewer).flatMap(([owner, picks]) =>
      pickSecrets(Object.fromEntries(ids.map((g, i) => [g, picks[key][i]]).filter(([, v], i) => !(submitted[mode].includes(owner) && open(viewer, mode, i, now)))), { market: key, owner }));
  });
  const allLines = [...lineSecrets(map(LINES.spread), { market: 'spread' }), ...lineSecrets(map(LINES.total), { market: 'total' })];
  const closedLines = (viewer, now) => MODES.flatMap(mode => {
    const key = mode === 'guess_spread' ? 'spread' : 'total';
    return lineSecrets(Object.fromEntries(ids.map((g, i) => [g, LINES[key][i]]).filter((e, i) => !open(viewer, mode, i, now))), { market: key });
  });
  // Every reader a forfeit touches, for one viewer at one moment: /community/read (with `forfeit`), /community/history,
  // /community/picks in both markets, and the raw reader. Only History may carry a line, and only for an open game and market.
  const scan = async (viewer, now, label) => {
    const picks = hiddenPicks(viewer, now), history = [...picks, ...closedLines(viewer, now)], everything = [...picks, ...allLines];
    const replies = [['/community/read', await api(viewer, 'community/read', {}, now), everything], ['/community/history', await api(viewer, 'community/history', {}, now), history],
      ...await Promise.all(MODES.map(async mode => [`/community/picks ${mode}`, await api(viewer, 'community/picks', { mode }, now), everything]))];
    for (const [route, reply, secrets] of replies) {
      assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
      assertNoLeak(reply.body, { viewer: uid(viewer), secrets }, `${viewer} ${route} ${label}`);
    }
    if (replies[0][1].body.forfeit) assertNoLeak(await read(viewer, now), { viewer: uid(viewer), secrets: everything }, `${viewer} gtl_read_forfeit ${label}`);
    return replies.length;
  };

  await t.test('before the apply: /community/forfeit answers 503 and nothing else changes; the apply adds the field to /community/read and leaves every other reply as it was', async () => {
    const reads = () => Promise.all(['luke', 'troy', 'sean'].flatMap(who => [api(who, 'community/read', {}, NOW), api(who, 'community/history', {}, NOW),
      ...MODES.map(mode => api(who, 'community/picks', { mode }, NOW))]));
    const missing = await api('luke', 'community/forfeit', { season, week, reason: 'skip' }, NOW);
    assert.deepEqual([missing.status, missing.body], [503, { error: 'The saved data service is temporarily unavailable. Please try again.' }],
      'the in-process mapper; the hosted adapter answers PGRST202 as GTL_FEATURE_OFF (tests/guess-forfeit-cloud.test.mjs)');
    const before = await reads();
    assert.ok(before.every(reply => reply.status === 200));
    assert.ok(before.every(reply => !Object.hasOwn(reply.body, 'forfeit')), 'gtl_read_forfeit missing (PGRST202): no field');
    assert.deepEqual((await db.query("select count(*)::int n from pg_class where relname='gtl_week_forfeits'")).rows, [{ n: 0 }]);
    const md5s = async () => (await db.query("select p.proname,md5(p.prosrc) md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname not like 'gtl\\_%forfeit%' order by 1,2")).rows;
    const bodies = await md5s();
    await db.exec(migrationSql(MIGRATION));
    await db.exec(migrationSql(MIGRATION)); // rerunnable
    const history = rows => rows.filter(r => r.proname === 'gtl_read_community_history').map(r => r.md5);
    assert.deepEqual(history(bodies), ['2ebcb46927105a7566670d279d12dcb6'], 'M-01\'s History body before the apply');
    assert.deepEqual(history(await md5s()), [parseFunctions(migrationSql(MIGRATION), MIGRATION).find(fn => fn.name === 'gtl_read_community_history').md5], 'M-03\'s after it');
    assert.deepEqual((await md5s()).filter(r => r.proname !== 'gtl_read_community_history'), bodies.filter(r => r.proname !== 'gtl_read_community_history'), 'no other function body changes');
    const after = await reads();
    for (const [i, reply] of after.entries()) {
      const { forfeit: field, ...rest } = reply.body;
      assert.deepEqual({ status: reply.status, body: rest }, before[i], 'every other key is exactly as before');
      if (i % 4 === 0) assert.equal(field?.forfeit, null, '/community/read now carries `forfeit`');
      else assert.equal(field, undefined);
    }
  });

  await t.test('one append-only table and three service-only, security-invoker functions; browser roles are refused', async () => {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.gtl_week_forfeits'::regclass")).rows[0].relrowsecurity, true);
    const grants = async role => (await db.query("select privilege_type from information_schema.role_table_grants where table_name='gtl_week_forfeits' and grantee=$1 order by 1", [role])).rows.map(r => r.privilege_type);
    assert.deepEqual(await grants('service_role'), ['INSERT', 'SELECT'], 'no update or delete: a forfeit is final');
    for (const role of ['anon', 'authenticated']) {
      assert.deepEqual(await grants(role), [], role);
      for (const statement of ['select * from public.gtl_week_forfeits', "insert into public.gtl_week_forfeits(user_id,season,week,reason,modes) values(gen_random_uuid(),2026,1,'skip','{guess_spread}')", 'delete from public.gtl_week_forfeits']) {
        await assert.rejects(() => db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query(statement); }), /permission denied/, `${role}: ${statement}`);
      }
    }
    for (const statement of ["update public.gtl_week_forfeits set reason='reveal'", 'delete from public.gtl_week_forfeits']) {
      await assert.rejects(() => db.transaction(async tx => { await tx.exec('set local role service_role'); await tx.query(statement); }), /permission denied/, statement);
    }
    assert.deepEqual((await db.query("select proname,prosecdef,provolatile from pg_proc where proname in ('gtl_forfeit_markets','gtl_forfeit_guess_week','gtl_read_forfeit') order by proname")).rows,
      [{ proname: 'gtl_forfeit_guess_week', prosecdef: false, provolatile: 'v' }, { proname: 'gtl_forfeit_markets', prosecdef: false, provolatile: 's' }, { proname: 'gtl_read_forfeit', prosecdef: false, provolatile: 's' }]);
    for (const signature of FUNCTIONS) {
      for (const role of ['anon', 'authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true, signature);
    }
    await assert.rejects(() => db.transaction(async tx => { await tx.exec('set local role authenticated'); await tx.query("select public.gtl_forfeit_guess_week($1,$2,$3,'skip',null)", [uid('luke'), season, week]); }), /permission denied/);
    // The table keeps a forfeit's shape: a known reason and one or two distinct markets.
    for (const [reason, modes] of [['peek', '{guess_spread}'], ['skip', '{}'], ['skip', '{guess_spread,guess_spread}'], ['skip', '{guess_total,guess_spread}'], ['skip', '{betting_challenge}']]) {
      await assert.rejects(() => db.query('insert into public.gtl_week_forfeits(user_id,season,week,reason,modes) values($1,$2,$3,$4,$5)', [uid('gina'), season, week, reason, modes]), /check constraint/, `${reason} ${modes}`);
    }
  });

  await t.test('before any forfeit: the reader says what a forfeit would do to each market, and nothing leaks', async () => {
    const closesAt = r => Date.parse(r.closesAt);
    const luke = await read('luke', NOW);
    assert.deepEqual({ ...luke, closesAt: closesAt(luke) }, { season, week, closesAt: LAST, open: true, forfeit: null, markets: [market('guess_spread', 'open'), market('guess_total', 'open')] });
    assert.deepEqual((await read('troy', NOW)).markets, [market('guess_spread', 'submitted', 3), market('guess_total', 'open')]);
    assert.deepEqual(await read('sean', NOW).then(r => [r.open, r.markets]), [false, [market('guess_spread', 'submitted', 3), market('guess_total', 'submitted', 3)]], 'nothing left: closed');
    assert.deepEqual(await read('dana', NOW).then(r => [r.open, r.markets]), [true, [market('guess_spread', 'sat_out'), market('guess_total', 'open')]]);
    // The newest published week by default, and the same answer as through /community/read.
    assert.deepEqual(await sql('gtl_read_forfeit', { p_user: uid('luke'), p_season: null, p_week: null, p_now: iso(NOW) }), luke);
    const viaRead = (await api('luke', 'community/read', {}, NOW)).body.forfeit;
    assert.deepEqual({ ...viaRead, closesAt: Date.parse(viaRead.closesAt) }, { ...luke, closesAt: LAST });
    for (const viewer of ['luke', 'troy', 'sean']) await scan(viewer, NOW, 'before any forfeit');
  });

  await t.test('Luke skips: both markets sat out at once, one forfeit row, one audit row; his drafts stay as they were and close', async () => {
    const drafts = await ballots('luke');
    const reply = await api('luke', 'community/forfeit', { season, week, reason: 'skip' }, NOW);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual({ ...reply.body, createdAt: Date.parse(reply.body.createdAt) }, { season, week, reason: 'skip', modes: MODES, createdAt: NOW, replayed: false });
    assert.deepEqual((await rows('gtl_weekly_optouts', 'luke')).map(r => [r.mode, r.created_at.getTime()]), [['guess_spread', NOW], ['guess_total', NOW]]);
    assert.deepEqual((await rows('gtl_week_forfeits', 'luke')).map(r => [r.reason, r.modes, r.created_at.getTime()]), [['skip', MODES, NOW]]);
    assert.deepEqual(await audits('luke'), [`forfeit:${season}:${week}:skip:guess_spread,guess_total`]);
    assert.deepEqual(await ballots('luke'), drafts, 'D-23: the drafts are stored exactly as they were');
    // M-01's gate opens both markets for him, game by game, before any kickoff.
    assert.deepEqual(await visible('luke', NOW), Object.fromEntries(ids.map(g => [g, { spread: true, total: true }])));
    // The old app's views: sat out in both markets, nothing due, the forfeit reported.
    const feed = (await api('luke', 'community/read', {}, NOW)).body;
    assert.deepEqual([feed.optOuts, feed.due.map(d => [d.mode, d.satOut]), feed.picksDue.state], [MODES, [['guess_spread', true], ['guess_total', true]], 'done']);
    assert.deepEqual([feed.forfeit.open, feed.forfeit.forfeit.reason, feed.forfeit.forfeit.modes, feed.forfeit.markets.map(m => m.status)], [false, 'skip', MODES, ['sat_out', 'sat_out']]);
    // gtl_guard_optout_ballot refuses every later write to either market.
    const workspace = await world.api('luke', 'personal');
    for (const [mode, picks] of [['guess_spread', LUKE.spread], ['guess_total', LUKE.total]]) {
      for (const submit of [false, true]) {
        const saved = await world.api('luke', 'personal/ballot', { season, week, mode, picks: map(picks.map(v => v + 1)), submit,
          revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() });
        assert.deepEqual([saved.status, saved.body.error], [409, 'You sat out this week for that market. Its picks are closed.'], `${mode} submit ${submit}`);
      }
    }
    assert.deepEqual(await ballots('luke'), drafts);
    satOut.guess_spread.push('luke'); satOut.guess_total.push('luke');
  });

  await t.test('a repeat answers the stored forfeit and writes nothing, whatever its reason and whenever it comes', async () => {
    const counts = async () => Promise.all(['gtl_week_forfeits', 'gtl_weekly_optouts', 'gtl_access_audit'].map(count));
    const before = await counts();
    for (const [reason, now] of [['skip', NOW + 5000], ['reveal', NOW + 6000], ['skip', LAST + HOUR]]) {
      const again = await api('luke', 'community/forfeit', { season, week, reason }, now);
      assert.equal(again.status, 200, JSON.stringify(again.body));
      assert.deepEqual({ ...again.body, createdAt: Date.parse(again.body.createdAt) }, { season, week, reason: 'skip', modes: MODES, createdAt: NOW, replayed: true }, `${reason} at ${iso(now)}`);
    }
    assert.deepEqual(await counts(), before);
    // The old "Sit out" on a market the forfeit already sat out replays too.
    assert.deepEqual((await api('luke', 'community/sit-out', { season, week, mode: 'guess_total' }, NOW)).body, { season, week, mode: 'guess_total', satOut: true, replayed: true });
  });

  await t.test('Troy reveals: only his Total draft is sat out; his submitted Spread keeps counting', async () => {
    const reply = await api('troy', 'community/forfeit', { season, week, reason: 'reveal' }, NOW + 60_000);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual([reply.body.reason, reply.body.modes, reply.body.replayed], ['reveal', ['guess_total'], false]);
    assert.deepEqual((await rows('gtl_weekly_optouts', 'troy')).map(r => r.mode), ['guess_total']);
    assert.deepEqual(await audits('troy'), [`forfeit:${season}:${week}:reveal:guess_total`]);
    const [spread] = await ballots('troy');
    assert.ok(spread.ballot.submittedAt, 'the submitted Spread ballot is untouched');
    assert.deepEqual(spread.ballot.picks, map(TROY.spread));
    assert.deepEqual((await read('troy', NOW + 60_000)).markets, [market('guess_spread', 'submitted', 3), market('guess_total', 'sat_out')]);
    satOut.guess_total.push('troy');
  });

  await t.test('nothing left: Sean (both submitted) is refused and nothing is written; the old "Sit out" keeps its own rule', async () => {
    const counts = async () => Promise.all(['gtl_week_forfeits', 'gtl_weekly_optouts', 'gtl_access_audit', 'gtl_weekly_versions'].map(count));
    const before = await counts();
    for (const reason of ['skip', 'reveal']) {
      const refused = await api('sean', 'community/forfeit', { season, week, reason }, NOW);
      assert.deepEqual([refused.status, refused.body], [409, { error: 'Your Spread and Total for that week are already submitted or sat out. Nothing was changed.' }]);
    }
    assert.deepEqual(await counts(), before);
    // The old button still refuses a submitted market, as before M-03.
    const sitOut = await api('sean', 'community/sit-out', { season, week, mode: 'guess_spread' }, NOW);
    assert.deepEqual([sitOut.status, sitOut.body], [400, { error: 'Check the post and try again.' }]);
    // Dana sat out Spread with the old button: a forfeit takes Total only and keeps her first opt-out as it was.
    const optout = (await rows('gtl_weekly_optouts', 'dana'))[0];
    assert.deepEqual(await forfeit('dana', 'skip', NOW + 30_000).then(r => [r.modes, r.replayed]), [['guess_total'], false]);
    assert.deepEqual(await rows('gtl_weekly_optouts', 'dana').then(r => r.map(x => [x.mode, x.created_at.getTime()])), [['guess_spread', optout.created_at.getTime()], ['guess_total', NOW + 30_000]]);
    satOut.guess_total.push('dana');
  });

  await t.test('the window (D-39): after Thursday\'s deadline until the week\'s last kickoff, where the old "Sit out" closes at the deadline', async () => {
    // Finn, no ballot, half an hour after the deadline (the first game has kicked off).
    assert.deepEqual(await forfeit('finn', 'reveal', AFTER).then(r => [r.modes, r.replayed]), [MODES, false]);
    assert.deepEqual(await visible('finn', AFTER), Object.fromEntries(ids.map(g => [g, { spread: true, total: true }])));
    await assert.rejects(() => sql('gtl_sit_out_week', { p_user: uid('gina'), p_season: season, p_week: week, p_mode: 'guess_spread', p_now: iso(AFTER) }), /GTL_COMMUNITY_CLOSED/, 'the old button closes at the deadline');
    // Gina at and after the last kickoff: refused, nothing written; the reader says closed.
    for (const now of [LAST, LAST + HOUR]) {
      await assert.rejects(() => forfeit('gina', 'skip', now), /GTL_FORFEIT_CLOSED/);
      assert.equal((await read('gina', now)).open, false);
    }
    assert.equal((await read('gina', LAST - 1000)).open, true, 'one second before the last kickoff it is still open');
    assert.deepEqual([await rows('gtl_week_forfeits', 'gina'), await rows('gtl_weekly_optouts', 'gina'), await audits('gina')], [[], [], []]);
    const closed = await at(LAST, () => world.api('troy', 'community/forfeit', { season, week, reason: 'skip' }));
    assert.deepEqual([closed.status, closed.body.replayed], [200, true], 'Troy already forfeited: his replay answers even after the last kickoff');
  });

  await t.test('refusals: a removed or unknown player, a bad reason, an unknown week', async () => {
    for (const fn of [() => forfeit('eve', 'skip', NOW), () => read('eve', NOW)]) await assert.rejects(fn, /GTL_COMMUNITY_MEMBER/);
    await assert.rejects(() => sql('gtl_forfeit_guess_week', { p_user: fixtureId(99), p_season: season, p_week: week, p_reason: 'skip', p_now: iso(NOW) }), /GTL_COMMUNITY_MEMBER/);
    for (const reason of [null, 'Skip', 'sit_out', '']) await assert.rejects(() => forfeit('gina', reason, NOW), /GTL_COMMUNITY_INVALID/, String(reason));
    await assert.rejects(() => forfeit('gina', 'skip', NOW, { s: 1999, w: 1 }), /GTL_COMMUNITY_INVALID/);
    await assert.rejects(() => forfeit('gina', 'skip', NOW, { s: season, w: null }), /GTL_COMMUNITY_INVALID/);
    await assert.rejects(() => read('gina', NOW, { s: 1999, w: 1 }), /GTL_COMMUNITY_INVALID/);
    await assert.rejects(() => read('gina', NOW, { s: season, w: null }), /GTL_COMMUNITY_INVALID/);
    const bad = await api('luke', 'community/forfeit', { season, week, reason: 'peek' }, NOW);
    assert.deepEqual([bad.status, bad.body], [400, { error: 'Check the post and try again.' }]);
    assert.deepEqual([await rows('gtl_week_forfeits', 'gina'), await rows('gtl_week_forfeits', 'eve')], [[], []]);
  });

  await t.test('a submitted market keeps counting; a forfeited one is sat out (null, never 0) on the board and in History', async () => {
    const board = await sql('gtl_read_community', { p_user: uid('troy'), p_before: null, p_limit: 100, p_now: iso(LAST) });
    const standing = (who, mode) => board.standings.find(s => s.userId === uid(who) && s.mode === mode);
    const points = picks => Math.round(picks.reduce((sum, v, i) => sum + accuracy(v, LINES.spread[i]), 0) * 100) / 100;
    assert.deepEqual([Number(standing('troy', 'guess_spread').weekPoints), standing('troy', 'guess_spread').satOut], [points(TROY.spread), false]);
    assert.deepEqual([standing('troy', 'guess_total').weekPoints, standing('troy', 'guess_total').satOut], [null, true]);
    for (const mode of MODES) assert.deepEqual([standing('luke', mode).weekPoints, standing('luke', mode).satOut], [null, true], `luke ${mode}`);
    const history = await sql('gtl_read_community_history', { p_user: uid('sean'), p_season: season, p_now: iso(LAST) });
    const entry = (who, mode) => history.weeks.find(w => w.week === week).entries.find(e => e.userId === uid(who) && e.mode === mode);
    assert.deepEqual([entry('troy', 'guess_spread').status, Number(entry('troy', 'guess_spread').weekPoints)], ['submitted', points(TROY.spread)]);
    for (const [who, mode] of [['troy', 'guess_total'], ['luke', 'guess_spread'], ['luke', 'guess_total'], ['finn', 'guess_total']]) {
      assert.deepEqual([entry(who, mode).status, entry(who, mode).picks, entry(who, mode).weekPoints], ['sat_out', null, null], `${who} ${mode}`);
    }
  });

  await t.test('leak scan: after the forfeits, each reader opens exactly what the gate opens, for every viewer, before and after kickoffs', async () => {
    let scanned = 0;
    for (const viewer of ['luke', 'troy', 'sean']) for (const now of [NOW + 120_000, FIRST, AFTER + HOUR]) scanned += await scan(viewer, now, `at ${iso(now)}`);
    assert.equal(scanned, 3 * 3 * 4);
    // Not vacuous: what the skip opened is really there. Before it, none of Troy's or Sean's Spread guesses reached Luke; now all six do.
    const spread = [...pickSecrets(map(TROY.spread), { market: 'spread', owner: 'troy' }), ...pickSecrets(map(SEAN.spread), { market: 'spread', owner: 'sean' })];
    const picks = (await api('luke', 'community/picks', { mode: 'guess_spread' }, NOW + 120_000)).body;
    assert.equal(leakScan(picks, { viewer: uid('luke'), secrets: spread }).length, 6);
    // Troy's Total draft and Luke's drafts never reach anyone else, before or after any kickoff.
    const drafts = [...pickSecrets(map(TROY.total), { market: 'total', owner: 'troy' }), ...pickSecrets(map(LUKE.spread), { market: 'spread', owner: 'luke' }), ...pickSecrets(map(LUKE.total), { market: 'total', owner: 'luke' })];
    for (const viewer of ['sean', 'troy', 'luke']) for (const now of [NOW + 120_000, LAST]) {
      for (const mode of MODES) {
        const reply = (await api(viewer, 'community/picks', { mode }, now)).body;
        assert.deepEqual(leakScan(reply, { viewer: uid(viewer), secrets: drafts.filter(s => !s.label.startsWith(viewer)) }), [], `${viewer} ${mode} ${iso(now)}`);
      }
    }
  });
});

// D-41 (Sean, October 14, 2026): each locked-in guess counts on its own, and the old "Sit out this week" stays allowed after
// some games are locked in: it covers only the games not yet locked in, the same as Skip and "See picks now". M-02 (stage 18,
// on main since PR #94) records per-game lock-ins, so these cases lock in through the real /personal/ballot lockIn. Without
// M-02's file (an older checkout) the suite stands in for it with a test-only gtl_guess_locked_in that reads a ballot as M-02
// does (a number pick, and a submitted ballot or a lockedAt time for that game), and writes lockedAt as M-02's writers would.
// M-03 reads lock-in only through gtl_guess_locked_in, so the same cases run either way.
const M02 = ALL.some(file => file.endsWith('_gtl_sent_picks_final.sql'));
const LOCKED_IN_STAND_IN = `create or replace function public.gtl_guess_locked_in(p_user uuid,p_season integer,p_week integer,p_mode text,p_game text) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.gtl_weekly_ballots b where b.user_id=p_user and b.season=p_season and b.week=p_week and b.mode=p_mode
    and jsonb_typeof(b.ballot#>array['picks',p_game])='number'
    and (coalesce(b.ballot->>'submittedAt','')<>'' or jsonb_typeof(b.ballot#>array['lockedAt',p_game])='string'))
$$;`;
/** Saves `picks` as a draft and locks in `games` (game ids): through M-02's lockIn, or the stand-in above. */
async function lockIn(world, who, mode, picks, games) {
  const { season, week } = world.state.league;
  if (M02) {
    const workspace = await world.api(who, 'personal');
    const saved = await world.api(who, 'personal/ballot', { season, week, mode, picks, submit: false, lockIn: games,
      revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    return;
  }
  await sendBallot(world, who, mode, picks, false);
  await world.db.exec(LOCKED_IN_STAND_IN);
  const at = new Date().toISOString();
  await world.db.query("update public.gtl_weekly_ballots set ballot=ballot||jsonb_build_object('lockedAt',coalesce(ballot->'lockedAt','{}'::jsonb)||$5::jsonb) where user_id=$1 and season=$2 and week=$3 and mode=$4",
    [ACCOUNTS[who].id, season, week, mode, Object.fromEntries(games.map(g => [g, at]))]);
}

test('D-41: after some games are locked in, the old sit-out and a forfeit cover only the rest; History lists the locked-in guesses behind the sent-ballot gate; nothing else leaks', { skip }, async t => {
  let clock = null;
  const world = await createCommunityWorld({ migrations: ALL, games: 4, troyBallots: false, optionalRpc: true, clock: () => clock ?? Date.now() });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), { season, week } = state.league;
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const kickoff = ids.map(g => Date.parse(state.games.find(x => x.id === g).kickoff));
  const LAST = kickoff[3];
  const iso = ms => new Date(ms).toISOString();
  const sql = serviceSql(db);
  const at = async (now, fn) => { clock = now; try { return await fn(); } finally { clock = null; } };
  const api = (who, route, body, now) => at(now, () => world.api(who, route, body));
  const uid = who => ACCOUNTS[who].id;
  // Every value an unusual half point, no two of one market the same size.
  const LINES = { spread: [-11.5, 13.5, 6.5, 17.5], total: [58.5, 31.5, 52.5, 61.5] };
  const PICKS = {
    troy: { spread: [-5.5, 2.5, 7.5, 14.5], total: [56.5, 34.5, 44.5, 40.5] }, // Spread: g1 and g2 locked in, then the old sit-out. Total: g1, then "See picks now".
    luke: { spread: [-1.5, 4.5, 8.5, 15.5], total: [62.5, 28.5, 49.5, 38.5] }, // drafts; later he locks in Spread g1
    sean: { spread: [-12.5, 3.5, 9.5, 18.5], total: [54.5, 37.5, 47.5, 42.5] }, // both markets sent
  };
  const MARKET = { guess_spread: 'spread', guess_total: 'total' };
  // The model: whose guess is locked in, who sat out what. Updated as the cases go.
  const locked = { troy: { guess_spread: [0, 1], guess_total: [0] }, luke: { guess_spread: [], guess_total: [] }, sean: { guess_spread: [0, 1, 2, 3], guess_total: [0, 1, 2, 3] } };
  const satOut = { troy: [], luke: [], sean: [] };
  const open = (viewer, mode, i, now) => now >= kickoff[i] || satOut[viewer].includes(mode) || locked[viewer][mode].includes(i);
  const shownTo = (viewer, owner, mode, i, now) => locked[owner][mode].includes(i) && open(viewer, mode, i, now);
  const hiddenPicks = (viewer, now) => Object.keys(PICKS).filter(owner => owner !== viewer).flatMap(owner => Object.entries(MARKET).flatMap(([mode, key]) =>
    pickSecrets(Object.fromEntries(ids.map((g, i) => [g, PICKS[owner][key][i]]).filter((e, i) => !shownTo(viewer, owner, mode, i, now))), { market: key, owner })));
  const allLines = Object.entries(LINES).flatMap(([market, values]) => lineSecrets(map(values), { market }));
  const closedLines = (viewer, now) => Object.entries(MARKET).flatMap(([mode, key]) =>
    lineSecrets(Object.fromEntries(ids.map((g, i) => [g, LINES[key][i]]).filter((e, i) => !open(viewer, mode, i, now))), { market: key }));
  // Every reader this stage changes or a forfeit opens, for one viewer at one moment. Only History may carry a line.
  const scan = async (viewer, now, label) => {
    const picks = hiddenPicks(viewer, now);
    const replies = [['/community/read', await api(viewer, 'community/read', {}, now), [...picks, ...allLines]],
      ['/community/history', await api(viewer, 'community/history', {}, now), [...picks, ...closedLines(viewer, now)]],
      ...await Promise.all(Object.keys(MARKET).map(async mode => [`/community/picks ${mode}`, await api(viewer, 'community/picks', { mode }, now), [...picks, ...allLines]]))];
    for (const [route, reply, secrets] of replies) {
      assert.equal(reply.status, 200, `${route}: ${JSON.stringify(reply.body)}`);
      assertNoLeak(reply.body, { viewer: uid(viewer), secrets }, `${viewer} ${route} ${label}`);
    }
    assertNoLeak(await sql('gtl_read_forfeit', { p_user: uid(viewer), p_season: season, p_week: week, p_now: iso(now) }), { viewer: uid(viewer), secrets: [...picks, ...allLines] }, `${viewer} gtl_read_forfeit ${label}`);
  };
  const history = async (viewer, now) => {
    const reply = await api(viewer, 'community/history', {}, now);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body.weeks.find(w => w.season === season && w.week === week);
  };
  const entries = (w, owner, mode) => w.entries.filter(e => e.userId === uid(owner) && e.mode === mode);
  const rawEntry = async (viewer, owner, mode, now) => (await sql('gtl_read_community_history', { p_user: uid(viewer), p_season: season, p_now: iso(now) }))
    .weeks.find(w => w.week === week).entries.filter(e => e.userId === uid(owner) && e.mode === mode);
  const ballot = async (who, mode) => (await db.query('select ballot from public.gtl_weekly_ballots where user_id=$1 and season=$2 and week=$3 and mode=$4', [uid(who), season, week, mode])).rows[0]?.ballot;
  const lockedIn = async (who, mode) => {
    const out = [];
    for (const [i, g] of ids.entries()) if (await sql('gtl_guess_locked_in', { p_user: uid(who), p_season: season, p_week: week, p_mode: mode, p_game: g })) out.push(i);
    return out;
  };

  await storeLines(db, state, { spread: map(LINES.spread), total: map(LINES.total) });
  await sendBallot(world, 'sean', 'guess_spread', map(PICKS.sean.spread));
  await sendBallot(world, 'sean', 'guess_total', map(PICKS.sean.total));
  await sendBallot(world, 'luke', 'guess_spread', map(PICKS.luke.spread), false);
  await sendBallot(world, 'luke', 'guess_total', map(PICKS.luke.total), false);
  await lockIn(world, 'troy', 'guess_spread', map(PICKS.troy.spread), [ids[0], ids[1]]);
  await lockIn(world, 'troy', 'guess_total', map(PICKS.troy.total), [ids[0]]);
  const NOW = Math.ceil(Date.now() / 1000) * 1000 + 1000;
  assert.ok(NOW + 10 * 60_000 < kickoff[0], 'the cases before the deadline run before it');
  for (const [who, mode] of [['troy', 'guess_spread'], ['troy', 'guess_total'], ['sean', 'guess_spread'], ['luke', 'guess_spread']]) {
    assert.deepEqual(await lockedIn(who, mode), locked[who][mode], `${who} ${mode} locked in before any sit-out`);
  }
  assert.equal(Boolean((await ballot('troy', 'guess_spread')).submittedAt), false, 'a partly locked-in market is not sent (D-41: no market-level send)');

  await t.test('the old "Sit out this week" stays allowed after a partial lock-in: the locked-in guesses stay locked in, the rest closes, the ballot is untouched', async () => {
    const before = await ballot('troy', 'guess_spread');
    const sitOut = await api('troy', 'community/sit-out', { season, week, mode: 'guess_spread' }, NOW);
    assert.deepEqual([sitOut.status, sitOut.body], [200, { season, week, mode: 'guess_spread', satOut: true, replayed: false }]);
    satOut.troy.push('guess_spread');
    assert.deepEqual(await lockedIn('troy', 'guess_spread'), [0, 1], 'g1 and g2 are still locked in');
    assert.deepEqual(await ballot('troy', 'guess_spread'), before, 'D-23: the ballot is stored exactly as it was');
    // gtl_guard_optout_ballot (and, from M-02, the lock itself) refuses every later write: a draft game, a locked-in game, a send.
    const workspace = await world.api('troy', 'personal');
    for (const [label, picks, submit] of [['a draft game', { ...map(PICKS.troy.spread), [ids[2]]: 0.5 }, false], ['a locked-in game', { ...map(PICKS.troy.spread), [ids[0]]: -6.5 }, false], ['a send', map(PICKS.troy.spread), true]]) {
      const saved = await world.api('troy', 'personal/ballot', { season, week, mode: 'guess_spread', picks, submit, revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() });
      assert.equal(saved.status, 409, `${label}: ${JSON.stringify(saved.body)}`);
      assert.ok(['You sat out this week for that market. Its picks are closed.', 'Sent picks are final.'].includes(saved.body.error), label);
    }
    assert.deepEqual(await ballot('troy', 'guess_spread'), before);
  });

  await t.test('"See picks now" after a partial lock-in sits out the rest of that market; the reader counts the locked-in games', async () => {
    const markets = r => r.markets.map(m => [m.mode, m.status, m.lockedIn, m.games]);
    assert.deepEqual(markets(await sql('gtl_read_forfeit', { p_user: uid('troy'), p_season: season, p_week: week, p_now: iso(NOW) })),
      [['guess_spread', 'sat_out', 2, 4], ['guess_total', 'open', 1, 4]]);
    const reply = await api('troy', 'community/forfeit', { season, week, reason: 'reveal' }, NOW + 60_000);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.deepEqual([reply.body.reason, reply.body.modes, reply.body.replayed], ['reveal', ['guess_total'], false], 'Spread was already sat out');
    satOut.troy.push('guess_total');
    assert.deepEqual(await lockedIn('troy', 'guess_total'), [0]);
    const read = (await api('troy', 'community/read', {}, NOW + 60_000)).body.forfeit;
    assert.deepEqual([read.open, read.forfeit.reason, markets(read)], [false, 'reveal', [['guess_spread', 'sat_out', 2, 4], ['guess_total', 'sat_out', 1, 4]]]);
  });

  const T1 = NOW + 120_000;
  await t.test('History: the owner sees his locked-in guesses, with their lines, in one sat-out entry per market; never a guess he had not locked in', async () => {
    const w = await history('troy', T1);
    for (const [mode, games, satOutAt] of [['guess_spread', [0, 1], NOW], ['guess_total', [0], NOW + 60_000]]) {
      const list = entries(w, 'troy', mode);
      assert.equal(list.length, 1, `${mode}: one entry, not a second bare sit-out`);
      const [e] = list;
      assert.deepEqual([e.status, Date.parse(e.satOutAt), e.picksHidden, e.submittedAt], ['sat_out', satOutAt, false, null], mode);
      assert.deepEqual(e.picks.map(p => [p.gameId, p.guess]), games.map(i => [ids[i], PICKS.troy[MARKET[mode]][i]]), `${mode}: the locked-in guesses alone`);
      assert.ok(e.picks.every(p => p.points === null), `${mode}: no points yet`);
      // M-02 saves each guess's line as it is locked in (the stand-in saves none, as a draft has none); open to him, it shows.
      if (M02) assert.deepEqual(e.picks.map(p => p.reference?.value), games.map(i => LINES[MARKET[mode]][i]), `${mode}: each with its line`);
      const [raw] = await rawEntry('troy', 'troy', mode, T1);
      assert.deepEqual([raw.weekPoints, raw.weekScored, raw.hiddenGames], [null, 0, []], 'it scores nothing until per-game scoring (M-07)');
    }
    // The opt-out loop's bare entry keeps Luke's place before any sit-out: nothing for him yet.
    assert.deepEqual(entries(w, 'luke', 'guess_spread').map(e => e.status), []);
    await scan('troy', T1, 'after his sit-out and forfeit');
  });

  await t.test('History, another member: hidden like a sent ballot until that game is open to him; Sean (both sent) sees the locked-in guesses only', async () => {
    const luke = await history('luke', T1);
    const [spread] = entries(luke, 'troy', 'guess_spread'), [total] = entries(luke, 'troy', 'guess_total');
    assert.deepEqual([spread.status, spread.picksHidden, spread.picks], ['sat_out', true, null]);
    assert.deepEqual((await rawEntry('luke', 'troy', 'guess_spread', T1))[0].hiddenGames, [ids[0], ids[1]].sort());
    assert.deepEqual([total.status, total.picksHidden, total.picks], ['sat_out', true, null]);
    assert.deepEqual((await rawEntry('luke', 'troy', 'guess_total', T1))[0].hiddenGames, [ids[0]]);
    const sean = await history('sean', T1);
    assert.deepEqual(entries(sean, 'troy', 'guess_spread')[0].picks.map(p => [p.gameId, p.guess]), [[ids[0], -5.5], [ids[1], 2.5]]);
    assert.deepEqual(entries(sean, 'troy', 'guess_total')[0].picks.map(p => [p.gameId, p.guess]), [[ids[0], 56.5]]);
    for (const viewer of ['luke', 'sean']) await scan(viewer, T1, 'before any kickoff');
  });

  await t.test('Luke locks in Spread g1: Troy\'s g1 opens to him, g2 waits for its kickoff; Troy\'s other guesses never show', async () => {
    await lockIn(world, 'luke', 'guess_spread', map(PICKS.luke.spread), [ids[0]]);
    locked.luke.guess_spread.push(0);
    const T2 = Math.ceil(Date.now() / 1000) * 1000 + 1000;
    assert.ok(T2 < kickoff[0]);
    // Per game in the database, as a sent ballot, and through the route (stage 17 reads hiddenGames): g1 shows, g2 is a hidden row with no number.
    const [raw] = await rawEntry('luke', 'troy', 'guess_spread', T2);
    assert.deepEqual([raw.status, raw.picksHidden, raw.hiddenGames, raw.picks.map(p => [p.gameId, p.hidden, p.guess])], ['sat_out', true, [ids[1]], [[ids[0], false, -5.5], [ids[1], true, null]]]);
    const [spread] = entries(await history('luke', T2), 'troy', 'guess_spread');
    assert.deepEqual([spread.status, spread.picksHidden, spread.hiddenGames, spread.picks.map(p => [p.gameId, p.hidden, p.guess, p.reference, p.points])],
      ['sat_out', true, [ids[1]], [[ids[0], false, -5.5, spread.picks[0].reference, null], [ids[1], true, null, null, null]]]);
    assert.ok(Number.isFinite(spread.picks[0].reference?.value), 'an open game carries its saved line');
    for (const viewer of ['luke', 'troy', 'sean']) await scan(viewer, T2, 'after Luke locks in g1');
  });

  await t.test('kickoffs open each locked-in guess to everyone in turn; the guesses Troy never locked in stay unlisted, even after the last kickoff', async () => {
    for (const now of [kickoff[0], kickoff[1], kickoff[2], LAST, LAST + 3_600_000]) {
      const [spread] = await rawEntry('luke', 'troy', 'guess_spread', now), [total] = await rawEntry('luke', 'troy', 'guess_total', now);
      assert.deepEqual(spread.picks.map(p => [p.gameId, p.guess]), now >= kickoff[1] ? [[ids[0], -5.5], [ids[1], 2.5]] : [[ids[0], -5.5], [ids[1], null]], iso(now));
      assert.deepEqual(spread.hiddenGames, now >= kickoff[1] ? [] : [ids[1]], iso(now));
      assert.deepEqual([total.picks.map(p => [p.gameId, p.guess]), total.hiddenGames], [[[ids[0], 56.5]], []], iso(now));
      assert.deepEqual([spread.status, total.status, spread.weekPoints, total.weekPoints], ['sat_out', 'sat_out', null, null]);
      if (now >= kickoff[1]) assert.deepEqual(entries(await history('luke', now), 'troy', 'guess_spread')[0].picks.map(p => p.guess), [-5.5, 2.5], 'through the route once none is hidden');
      for (const viewer of ['luke', 'troy', 'sean']) await scan(viewer, now, `at ${iso(now)}`);
    }
    // Not vacuous: after the last kickoff Troy's two Spread guesses reach Luke; his drafts for g3 and g4 never do.
    const reply = (await api('luke', 'community/history', {}, LAST)).body;
    assert.equal(leakScan(reply, { viewer: uid('luke'), secrets: pickSecrets(map(PICKS.troy.spread), { market: 'spread', owner: 'troy' }) }).length, 2);
  });

  await t.test('M-08 agrees with History: the locked-in games are "in", the rest "sat_out"; the board says sat out (null) until per-game scoring', async () => {
    const picks = (await api('sean', 'community/picks', { mode: 'guess_spread' }, LAST)).body;
    const rows = picks.games.map(g => g.rows.find(r => r.userId === uid('troy')));
    assert.deepEqual(rows.map(r => [r.status, r.pick]), [['in', -5.5], ['in', 2.5], ['sat_out', null], ['sat_out', null]]);
    const totals = (await api('sean', 'community/picks', { mode: 'guess_total' }, LAST)).body;
    assert.deepEqual(totals.games.map(g => g.rows.find(r => r.userId === uid('troy')).status), ['in', 'sat_out', 'sat_out', 'sat_out']);
    const board = await sql('gtl_read_community', { p_user: uid('sean'), p_before: null, p_limit: 100, p_now: iso(LAST) });
    for (const mode of Object.keys(MARKET)) {
      const standing = board.standings.find(s => s.userId === uid('troy') && s.mode === mode);
      assert.deepEqual([standing.weekPoints, standing.satOut], [null, true], `${mode}: D-41's per-game scoring lands with M-07`);
    }
  });
});

test('without per-game lock-ins, M-03\'s History reader answers exactly as M-01\'s: sent markets, drafts, the old sit-out, forfeits, and a market both sent and sat out', { skip }, async t => {
  const world = await createCommunityWorld({ migrations: ALL, games: 3, troyBallots: false, optionalRpc: true });
  t.after(() => world.db.close());
  const { db, state } = world, ids = state.games.map(g => g.id), { season, week } = state.league;
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const kickoff = ids.map(g => Date.parse(state.games.find(x => x.id === g).kickoff));
  const sql = serviceSql(db), iso = ms => new Date(ms).toISOString();
  const dana = EXTRA.dana;
  await db.query('insert into auth.users values($1)', [dana.id]);
  await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [dana.id, dana.name]);
  await storeLines(db, state, { spread: map([-11.5, 13.5, 6.5]), total: map([58.5, 31.5, 52.5]) });
  await sendBallot(world, 'sean', 'guess_spread', map([-12.5, 3.5, 9.5]));
  await sendBallot(world, 'sean', 'guess_total', map([54.5, 37.5, 47.5]));
  await sendBallot(world, 'troy', 'guess_spread', map([-5.5, 2.5, 7.5]));
  await sendBallot(world, 'troy', 'guess_total', map([56.5, 34.5, 44.5]), false);
  await sendBallot(world, 'luke', 'guess_spread', map([-1.5, 4.5, 8.5]), false);
  await sendBallot(world, 'luke', 'guess_total', map([62.5, 28.5, 49.5]), false);
  const NOW = Math.ceil(Date.now() / 1000) * 1000 + 1000;
  // Luke: the old sit-out on his Spread draft, then a skip takes his Total draft. Dana: "See picks now" with no ballot.
  await sql('gtl_sit_out_week', { p_user: ACCOUNTS.luke.id, p_season: season, p_week: week, p_mode: 'guess_spread', p_now: iso(NOW) });
  assert.deepEqual((await sql('gtl_forfeit_guess_week', { p_user: ACCOUNTS.luke.id, p_season: season, p_week: week, p_reason: 'skip', p_now: iso(NOW) })).modes, ['guess_total']);
  assert.deepEqual((await sql('gtl_forfeit_guess_week', { p_user: dana.id, p_season: season, p_week: week, p_reason: 'reveal', p_now: iso(NOW) })).modes, MODES);
  // A market both sent and sat out (no writer makes one now; an older race could have): M-01 lists it as a bare sit-out.
  await db.query("insert into public.gtl_weekly_optouts(user_id,season,week,mode,created_at) values($1,$2,$3,'guess_spread',$4)", [ACCOUNTS.troy.id, season, week, iso(NOW)]);

  const m03 = parseFunctions(migrationSql(MIGRATION), MIGRATION).find(fn => fn.name === 'gtl_read_community_history');
  const m01 = catalog(readMigrations(ALL.filter(file => file < MIGRATION))).latest.get('public.gtl_read_community_history');
  const installed = async () => (await db.query("select md5(prosrc) md5 from pg_proc where proname='gtl_read_community_history'")).rows.map(r => r.md5);
  const replies = async () => {
    const out = [];
    for (const who of [...Object.keys(ACCOUNTS), 'dana']) for (const now of [NOW, kickoff[0], kickoff[2] + 3_600_000]) {
      out.push(await sql('gtl_read_community_history', { p_user: who === 'dana' ? dana.id : ACCOUNTS[who].id, p_season: season, p_now: iso(now) }));
    }
    return out;
  };
  assert.deepEqual(await installed(), [m03.md5]);
  const withM03 = await replies();
  await db.exec(m01.statement);
  assert.deepEqual(await installed(), ['2ebcb46927105a7566670d279d12dcb6']);
  const withM01 = await replies();
  await db.exec(m03.statement);
  assert.deepEqual(await installed(), [m03.md5]);
  assert.deepEqual(withM03, withM01, 'every viewer, every moment: the same reply');
  // Not vacuous: Luke's view holds a sent market, the old sit-out, a forfeit, and Troy's market both sent and sat out (bare, as M-01).
  const name = userId => (userId === dana.id ? 'dana' : Object.keys(ACCOUNTS).find(k => ACCOUNTS[k].id === userId));
  const statuses = withM03[0].weeks.find(w => w.week === week).entries.map(e => `${name(e.userId)} ${e.mode} ${e.status}${e.picks ? ' picks' : ''}`).sort();
  assert.deepEqual(statuses, ['dana guess_spread sat_out', 'dana guess_total sat_out', 'luke guess_spread sat_out', 'luke guess_total sat_out',
    'sean guess_spread submitted picks', 'sean guess_total submitted picks', 'troy guess_spread sat_out']);
  // And Troy's own view lists his Total draft.
  assert.ok(withM03[3].weeks.find(w => w.week === week).entries.some(e => e.userId === ACCOUNTS.troy.id && e.mode === 'guess_total' && e.status === 'draft'));
});

test('the forfeit writer takes the ballot writers\' gtl_weekly_versions row lock before it reads any market', () => {
  const sql = migrationSql(MIGRATION);
  const writer = parseFunctions(sql, MIGRATION).find(fn => fn.name === 'gtl_forfeit_guess_week').body;
  const lock = writer.search(/perform 1 from public\.gtl_weekly_versions v where v\.user_id=p_user and v\.season=p_season and v\.week=p_week for update;/);
  assert.ok(lock > 0, 'locks the player\'s week row for update');
  const row = writer.search(/insert into public\.gtl_weekly_versions\(user_id,season,week\) values\(p_user,p_season,p_week\) on conflict do nothing;/);
  assert.ok(row > 0 && row < lock, 'creates the row first when the player has none, as the writers do');
  for (const read of [/from public\.gtl_week_forfeits/, /public\.gtl_forfeit_markets\(/, /public\.gtl_weekly_optouts/]) assert.ok(writer.search(read) > lock, `${read} only after the lock`);
  assert.equal(writer.search(/public\.gtl_weekly_ballots/), -1, 'the ballots are read through gtl_forfeit_markets, after the lock');
  // The slate check comes first: gtl_weekly_versions has a foreign key to the slate.
  assert.ok(writer.search(/from public\.gtl_weekly_slates/) < row);
  // The two ballot writers take the same row lock before they touch a ballot (the bodies on main).
  const latest = catalog(readMigrations(ALL.filter(file => file < MIGRATION))).latest;
  for (const name of ['gtl_save_weekly_ballot', 'gtl_mutate_personal']) {
    assert.match(latest.get(`public.${name}`).body, /from public\.gtl_weekly_versions where user_id=p_user and season=s and week=w for update/, name);
  }
});
