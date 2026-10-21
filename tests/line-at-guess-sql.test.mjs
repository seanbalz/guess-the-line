import test from 'node:test';
import assert from 'node:assert/strict';
import { HOSTED, migrationSql } from './migrations.mjs';
import { seed } from '../server/store.mjs';
import { accuracy, round } from '../server/domain.mjs';
import { handleCommunity, providerCommunityError } from '../cloud/community.mjs';
import { buildRuledImport, RPC as RULED_RPC } from '../scripts/import-ruled-ballot.mjs';
import { buildReferenceLineImport, preflightSql, verifySql, RPC, VOID_RPC, MIGRATION } from '../scripts/import-reference-lines.mjs';

// The line at the guess for ballots saved without a line (Sean's October 12, 2026 rulings 2 and 3), the D-08 eligibility in
// the community readers, and the commissioner-ruled reference-line import, on every real migration and local PGlite. The
// world replays the hosted 2026 Week 5 timing: the two hosted 3-book collections of October 8 (public market data), the
// eight ballots' submission instants with fixture picks (Sean's Spread is the committed seed ballot), Ben's D-25 import and
// the committed eDraft pages. Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const skip = PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = value => Date.parse(value);
// The hosted migrations in filename order (tests/migrations.mjs). This old-app suite also reruns on HOSTED plus a new
// migration and its rollback (tests/rollback.test.mjs).
const MIGRATIONS = HOSTED;
const SEAN = 30, STEVEN = 31, TJ = 32, CUH = 33, LUKE = 4, BEN = 2, OUTSIDER = 5;
const NAMES = { [SEAN]: 'Fistathon', [STEVEN]: 'Sthomas', [TJ]: 'TJ', [CUH]: 'Cuh', [LUKE]: 'Luke', [BEN]: 'Ben', [OUTSIDER]: 'Outsider' };
// A fixture decision number, so the replay does not depend on docs/DECISIONS.md (Sean's approval is recorded as D-33).
const DECISION = 'D-99';
const HOUR = 3_600_000;
// The hosted collections of October 8 (createdAt is the storage instant, fetchedAt the capture, observedAt the books' update).
const SPREAD = { 'BAL-ATL': -3, 'BUF-LAR': -3, 'CHI-GB': 1.5, 'CIN-MIA': 6.5, 'CLE-NYJ': -2, 'DEN-LAC': 3.5, 'DET-ARI': 5.5, 'HOU-TEN': 7.5, 'IND-PIT': -2.5, 'LV-NE': -3.5, 'MIN-NO': 2.5, 'NYG-WAS': -4, 'PHI-JAX': -7.5, 'SF-SEA': -3, 'TB-DAL': -9 };
const TOTAL = { 'BAL-ATL': 43.5, 'BUF-LAR': 54.5, 'CHI-GB': 45.5, 'CIN-MIA': 43, 'CLE-NYJ': 39.5, 'DEN-LAC': 42, 'DET-ARI': 54.5, 'HOU-TEN': 38, 'IND-PIT': 44.5, 'LV-NE': 45, 'MIN-NO': 41.5, 'NYG-WAS': 41.5, 'PHI-JAX': 41.5, 'SF-SEA': 46.5, 'TB-DAL': 48.5 };
const FIRST = { id: '168c62b9-2834-41f3-82b1-8e28ff29db58', createdAt: '2026-10-08T19:15:22.407135Z', fetchedAt: '2026-10-08T19:15:22.116Z', observedAt: '2026-10-08T19:14:06Z', spread: SPREAD, total: TOTAL };
const SECOND = { id: '751dfb85-1171-439e-b2a3-b4edb520e36e', createdAt: '2026-10-08T20:21:45.561272Z', fetchedAt: '2026-10-08T20:21:45.478Z', observedAt: '2026-10-08T20:21:09Z', spread: SPREAD, total: TOTAL };
// A later collection with other values that no Week 5 guess may use.
const LATER = { id: '0aaaaaaa-0000-4000-8000-000000000001', createdAt: '2026-10-09T08:15:01.5Z', fetchedAt: '2026-10-09T08:15:01Z', observedAt: '2026-10-09T08:14:30Z',
  spread: Object.fromEntries(Object.keys(SPREAD).map(g => [g, -10])), total: Object.fromEntries(Object.keys(TOTAL).map(g => [g, 60])) };
// [user, mode, submittedAt, fixture pick, origin_practice]: the hosted instants, plus two of Luke's ballots the hosted project does not have.
const BALLOTS = [
  [SEAN, 'guess_total', '2026-10-08T21:37:16.509437Z', 44, false],
  [STEVEN, 'guess_spread', '2026-10-08T18:43:07.147792Z', -3, true],
  [STEVEN, 'guess_total', '2026-10-08T21:48:40.61355Z', 45, false],
  [TJ, 'guess_spread', '2026-10-08T22:14:52.60944Z', -2.5, false],
  [TJ, 'guess_total', '2026-10-08T22:18:34.785952Z', 43.5, false],
  [CUH, 'guess_spread', '2026-10-08T23:09:06.733982Z', -4, false],
  [CUH, 'guess_total', '2026-10-08T23:13:30.938697Z', 46, false],
  [LUKE, 'guess_spread', '2026-10-08T22:00:00Z', -1, true],
  [LUKE, 'guess_total', '2026-10-08T22:05:00Z', 41, false],
];
const FILE_0433 = 'data/snapshots/2026-week-05-20261008T090121436Z.json', FILE_1003 = 'data/snapshots/2026-week-05-20261008T150212589Z.json';
// Sean's seed Spread: the stored submittedAt (the 03:33 ET eDraft page time; the seed records the original submission time as
// unavailable) and the repository's first and last pick commits (23647e8 at 08:03:33Z, 78a2928 at 08:17:14Z). Every instant
// the record allows for his guesses.
const SEAN_STORED = '2026-10-08T07:33:00Z', SEAN_WINDOW = [SEAN_STORED, '2026-10-08T08:03:33Z', '2026-10-08T08:17:14Z'];

/** A hosted-shape 3-book collection for `games` (template games), captured at fetchedAt with every book updated at observedAt. */
function payload(games, { fetchedAt, observedAt, spread = {}, total = {}, books = ['draftkings', 'fanduel', 'betmgm'] }) {
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt, games: games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `ev${i}`, matchStatus: 'matched',
    markets: Object.fromEntries([['spread', spread[g.id]], ['total', total[g.id]]].filter(([, v]) => v !== undefined).map(([market, line]) => [market, { quotes: books.map(book => ({
      provider: 'the-odds-api', providerEventId: `ev${i}`, book, market, value: line, timeBasis: 'provider_market_last_update', collectedAt: fetchedAt, providerObservedAt: observedAt,
      outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
    })) }])),
  })) };
}

test('the line at the guess for ballots saved without a line, D-08 eligibility in the community and the ruled reference-line import, on a replay of 2026 Week 5', { skip }, async t => {
  assert.ok(MIGRATIONS.includes(MIGRATION), 'the migration is a repo file');
  for (const earlier of ['20261012223000_gtl_community_history.sql', '20261012230000_gtl_submit_with_line_at_guess.sql']) assert.ok(MIGRATIONS.indexOf(earlier) < MIGRATIONS.indexOf(MIGRATION), `${earlier} applies first`);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  const state = seed();
  const gameIds = state.games.map(g => g.id);
  const full = value => Object.fromEntries(gameIds.map(g => [g, value]));
  const dumpBallots = async () => (await db.query('select user_id::text u,mode,ballot::text b,audit::text a,origin_practice o,provenance::text p from public.gtl_weekly_ballots order by 1,2')).rows;
  let beforeMigration, afterMigration;
  for (const file of MIGRATIONS) {
    if (file === MIGRATION) beforeMigration = await dumpBallots();
    await db.exec(migrationSql(file));
    if (file === MIGRATION) afterMigration = await dumpBallots();
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
      for (const n of Object.keys(NAMES)) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','luke','player')", [id(SEAN), id(LUKE)]);
    }
    if (file === MIGRATIONS[1]) for (const n of [SEAN, STEVEN, TJ, CUH, LUKE, BEN]) await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id(n), NAMES[n]]);
    if (file === '20261008182836_gtl_canonical_weekly_entries.sql') {
      // The migrated group-league shape the hosted rows have: picks and submittedAt, no scoringReferences, one legacy ballot_submitted event.
      for (const [n, mode, submittedAt, pick, practice] of BALLOTS) {
        await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5) on conflict do nothing', [id(n)]);
        await db.query('insert into public.gtl_weekly_ballots(user_id,season,week,mode,ballot,audit,origin_practice,provenance) values($1,2026,5,$2,$3::jsonb,$4::jsonb,$5,$6::jsonb)', [id(n), mode,
          JSON.stringify({ picks: full(pick), submittedAt }), JSON.stringify([{ id: `legacy-${n}-${mode}`, player: String(n), mode, type: 'ballot_submitted', timestamp: submittedAt, before: {}, after: full(pick) }]),
          practice, JSON.stringify([{ leagueId: 'group-fixture', playerId: String(n), migration: true }])]);
      }
    }
    if (file === '20261008185715_gtl_weekly_eligibility_rulings.sql') {
      const rule = "insert into public.gtl_weekly_eligibility_rulings(user_id,season,week,mode,eligible,reason,approved_by,context_league_id,recorded_at,evidence) values($1,2026,5,$2,$3,$4,$5,'sean-troy-luke',$6,'{\"decision\":\"D-08\"}')";
      await db.query(rule, [id(SEAN), 'guess_spread', true, 'D-08: the Week 5 spread ballot counts', id(SEAN), '2026-10-08T19:00:00Z']);
      await db.query(rule, [id(STEVEN), 'guess_spread', true, 'D-08: the Week 5 spread ballot counts', id(SEAN), '2026-10-08T19:01:00Z']);
      await db.query(rule, [id(LUKE), 'guess_total', false, 'Fixture: ruled not eligible', id(SEAN), '2026-10-08T23:00:00Z']);
    }
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const call = async (tx, name, args) => (await tx.query(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value;
  const rpc = (name, args) => db.transaction(async tx => { await tx.exec('set local role service_role'); return call(tx, name, args); });
  const service = { rpc: async (name, args) => { try { return await rpc(name, args); } catch (error) { throw providerCommunityError(error.message); } } };
  const user = n => ({ id: id(n), emailConfirmed: true, email: 'fixture@example.invalid' });
  const now = Date.now();
  const history = n => handleCommunity({ route: '/community/history', body: { season: 2026 }, user: user(n), service, clock: () => now });
  const read = n => handleCommunity({ route: '/community/read', body: {}, user: user(n), service, clock: () => now });
  const entry = (h, n, mode) => h.weeks.find(w => w.week === 5).entries.find(e => e.userId === id(n) && e.mode === mode);
  // Per Spread game, the stored line D-27 selects at each instant of SEAN_WINDOW; one [source, rule] per game when they all agree.
  const seanWindowLines = async () => {
    const out = [];
    for (const game of state.games) {
      const slateGame = await rpc('gtl_slate_game', { p_season: 2026, p_week: 5, p_signature: sig, p_game_id: game.id });
      const seen = new Set();
      for (const instant of SEAN_WINDOW) {
        const r = await rpc('gtl_line_at_guess', { p_season: 2026, p_week: 5, p_signature: sig, p_game: slateGame, p_market: 'spread', p_guessed: instant });
        seen.add(JSON.stringify([r.snapshotId ?? r.sourceFile, r.rule, r.value]));
      }
      out.push(seen.size === 1 ? JSON.parse([...seen][0]).slice(0, 2) : [...seen]);
    }
    return out;
  };
  // A rolled-back transaction for lab data (snapshots, lines, voids) that must not reach the Week 5 replay.
  const ROLLBACK = new Error('lab rollback');
  const lab = async fn => { try { await db.transaction(async tx => { await fn(tx); throw ROLLBACK; }); } catch (error) { if (error !== ROLLBACK) throw error; } };
  const sig = (await db.query('select signature from public.gtl_weekly_slates where season=2026 and week=5')).rows[0].signature;
  const template = (await db.query("select games from public.gtl_schedule_templates where id='nfl-2026-week-05'")).rows[0].games;
  const insertSnapshot = async (q, snap, games = template, books) => {
    await q.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$1,$3,$3::timestamptz+interval '90 seconds',2,2026,5,$4)", [snap.id, id(SEAN), snap.createdAt, sig]);
    await q.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)', [snap.id, sig, payload(games, { ...snap, books }), snap.createdAt]);
  };
  // Ben's D-25 commissioner-ruled ballot, imported once as on the hosted project.
  const ruled = buildRuledImport({ user: id(BEN), actor: id(SEAN) });
  assert.equal((await rpc(RULED_RPC, ruled.payload)).imported, true);
  for (const snap of [FIRST, SECOND, LATER]) await insertSnapshot(db, snap);
  const dumpRows = async () => ({ ballots: await dumpBallots(),
    rulings: (await db.query('select * from public.gtl_weekly_eligibility_rulings order by user_id,mode')).rows,
    posts: (await db.query('select * from public.gtl_feed_posts order by id')).rows });
  const baseline = await dumpRows();
  assert.equal(baseline.ballots.length, 11, 'Sean\'s seed Spread, the seven other hosted-timing ballots, Luke\'s two fixtures and Ben\'s ruled Spread');

  await t.test('the migration writes no row; the new tables are append-only and service-only; every function is invoker and service-only', async () => {
    assert.deepEqual(afterMigration, beforeMigration, 'applying the migration changes no ballot row');
    const tables = ['gtl_reference_line_imports', 'gtl_reference_lines', 'gtl_reference_line_voids'];
    const functions = ['gtl_slate_game(integer,integer,jsonb,text)', 'gtl_ballot_eligible(uuid,integer,integer,text,boolean)', 'gtl_submission_time_unknown(jsonb)', 'gtl_guess_instant(jsonb,jsonb,text)',
      'gtl_line_at_guess(integer,integer,jsonb,jsonb,text,timestamptz)', 'gtl_ballot_pick_scores(integer,integer,text,jsonb,jsonb)', 'gtl_import_reference_lines(uuid,integer,integer,text,text,text,jsonb)',
      'gtl_void_reference_line_import(uuid,uuid,text,text)', 'gtl_read_community(uuid,timestamptz,integer,timestamptz)', 'gtl_read_community_history(uuid,integer,timestamptz)'];
    for (const role of ['anon', 'authenticated']) {
      for (const table of tables) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', [role, `public.${table}`, privilege])).rows[0].ok, false, `${role} ${privilege} ${table}`);
        await assert.rejects(() => as(role, `select * from public.${table}`), /permission denied/);
      }
      for (const signature of functions) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
      await assert.rejects(() => as(role, "select public.gtl_import_reference_lines(null,2026,5,'x','x','x','{}')"), /permission denied/);
      await assert.rejects(() => as(role, 'select public.gtl_read_community_history($1,null,null)', [id(TJ)]), /permission denied/);
    }
    for (const signature of functions) assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true, signature);
    for (const table of tables) {
      for (const [privilege, ok] of [['SELECT', true], ['INSERT', true], ['UPDATE', false], ['DELETE', false], ['TRUNCATE', false]]) assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', ['service_role', `public.${table}`, privilege])).rows[0].ok, ok, `service_role ${privilege} ${table}`);
      await assert.rejects(() => as('service_role', `delete from public.${table}`), /permission denied/);
      assert.equal((await db.query('select relrowsecurity rls from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].rls, true);
    }
    assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'gtl_%' and p.proname not in ('gtl_nba_read_bets','gtl_nba_save_bet') and prosecdef")).rows[0].n, 0, 'no security definer');
  });

  await t.test('resolver: newest stored line at or before the guess of any age, else the first stored after it and before kickoff; imports count from their capture (lab data, rolled back)', async () => {
    const G = (await rpc('gtl_slate_game', { p_season: 2026, p_week: 5, p_signature: sig, p_game_id: 'BUF-LAR' }));
    assert.deepEqual([G.id, G.homeCode, G.awayCode, at(G.kickoff)], ['BUF-LAR', 'LAR', 'BUF', at('2026-10-13T00:15:00Z')]);
    assert.equal(await rpc('gtl_slate_game', { p_season: 2026, p_week: 5, p_signature: sig, p_game_id: 'XX-YY' }), null);
    const guess = '2026-10-10T12:00:00Z';
    let serial = 0;
    const labSnapshot = async (tx, { created, fetched = created, observed = fetched, value, books }) => {
      const snap = { id: `0bbbbbbb-0000-4000-8000-${String(++serial).padStart(12, '0')}`, createdAt: created, fetchedAt: fetched, observedAt: observed, spread: { 'BUF-LAR': value } };
      await insertSnapshot(tx, snap, [G], books);
      return snap.id;
    };
    const labLine = async (tx, { observed, captured, value }) => {
      const header = (await tx.query("insert into public.gtl_reference_line_imports(season,week,source_file,file_sha256,decision,ruling,approved_by,context_league_id,evidence,payload_sha256,line_count) values(2026,5,$1,$2,'D-99','lab fixture line',$3,'sean-troy-luke','{}',$2,1) returning id",
        [`data/snapshots/lab-${++serial}.json`, String(serial).padStart(64, '0'), id(SEAN)])).rows[0].id;
      await tx.query("insert into public.gtl_reference_lines(import_id,season,week,game_id,market,value,source,source_url,source_file,file_sha256,observed_at,captured_at) values($1,2026,5,'BUF-LAR','spread',$2,'eDraft consensus','https://example.invalid/lab','data/snapshots/lab.json',$3,$4,$5)",
        [header, value, '0'.repeat(64), observed, captured]);
      return header;
    };
    const resolve = (tx, guessed = guess, game = G) => call(tx, 'gtl_line_at_guess', { p_season: 2026, p_week: 5, p_signature: sig, p_game: game, p_market: 'spread', p_guessed: guessed });
    const clear = tx => tx.exec('delete from public.gtl_market_snapshots; delete from public.gtl_reference_lines; delete from public.gtl_reference_line_imports;');
    const pick = r => [r.basis, r.rule, r.origin, r.status, r.value, r.gapSeconds];
    await lab(async tx => {
      await clear(tx);
      // Any age: a three-day-old line is still the line at the guess; a newer one after the guess is not.
      const old = await labSnapshot(tx, { created: '2026-10-07T12:00:00Z', observed: '2026-10-07T11:59:00Z', value: -2 });
      await labSnapshot(tx, { created: '2026-10-10T13:00:00Z', value: -6 });
      let r = await resolve(tx);
      assert.deepEqual([...pick(r), r.snapshotId, r.bookCount, at(r.observedAt), at(r.guessedAt)], ['line-at-guess', 'newest-at-or-before', 'hosted-snapshot', 'available', -2, 3 * 86400 + 60, old, 3, at('2026-10-07T11:59:00Z'), at(guess)]);
      // A 2-book collection never qualifies; the older 3-book one stays the line.
      await labSnapshot(tx, { created: '2026-10-09T12:00:00Z', value: -4, books: ['draftkings', 'fanduel'] });
      assert.equal((await resolve(tx)).snapshotId, old);
      // An imported line captured before the guess and observed after the hosted line wins; one observed earlier loses.
      await labLine(tx, { observed: '2026-10-06T00:00:00Z', captured: '2026-10-06T01:00:00Z', value: -1 });
      assert.equal((await resolve(tx)).snapshotId, old, 'hosted observed later wins');
      const newer = await labLine(tx, { observed: '2026-10-08T00:00:00Z', captured: '2026-10-09T00:00:00Z', value: -2.6 });
      r = await resolve(tx);
      assert.deepEqual([...pick(r), r.bookCount, r.snapshotId, r.decision, at(r.capturedAt), r.source], ['line-at-guess', 'newest-at-or-before', 'imported-reference', 'available', -2.6, 2.5 * 86400, null, null, 'D-99', at('2026-10-09T00:00:00Z'), 'eDraft consensus']);
      // Look-ahead guard: a page observed before the guess but captured after it is not a line stored at the guess.
      await labLine(tx, { observed: '2026-10-10T11:00:00Z', captured: '2026-10-10T12:30:00Z', value: -9 });
      assert.equal((await resolve(tx)).value, -2.6);
      // A void takes an import out of every read.
      await tx.query("insert into public.gtl_reference_line_voids(import_id,decision,reason,approved_by,context_league_id) values($1,'D-99','lab fixture void',$2,'sean-troy-luke')", [newer, id(SEAN)]);
      assert.equal((await resolve(tx)).snapshotId, old);
      // A tie on the observation instant goes to the hosted 3-book line.
      await labLine(tx, { observed: '2026-10-07T11:59:00Z', captured: '2026-10-07T13:00:00Z', value: -3.3 });
      assert.equal((await resolve(tx)).snapshotId, old);
      // Parity with D-27's save path when only hosted lines exist.
      await tx.exec('delete from public.gtl_reference_lines');
      for (const instant of ['2026-10-07T12:00:00Z', '2026-10-09T18:00:00Z', guess]) {
        const saved = await call(tx, 'gtl_reference_at_save', { p_season: 2026, p_week: 5, p_signature: sig, p_game: G, p_market: 'spread', p_saved: instant });
        const read = await resolve(tx, instant);
        assert.deepEqual([read.snapshotId, read.value, read.gapSeconds, read.rule], [saved.snapshotId, saved.value, Number(saved.ageSeconds), 'newest-at-or-before'], instant);
      }
    });
    await lab(async tx => {
      await clear(tx);
      // Nothing stored before the guess: the first line stored after it, with a negative gap, else the next import captured first.
      const lateCommit = await labSnapshot(tx, { created: '2026-10-10T12:00:30Z', fetched: '2026-10-10T11:59:00Z', value: -1 });
      const straddle = await labSnapshot(tx, { created: '2026-10-10T12:03:00Z', fetched: '2026-10-10T12:02:00Z', observed: '2026-10-10T11:58:00Z', value: -5 });
      await labSnapshot(tx, { created: '2026-10-10T14:00:00Z', value: -7 });
      let r = await resolve(tx);
      assert.deepEqual([...pick(r), r.snapshotId], ['line-at-guess', 'first-after-submission', 'hosted-snapshot', 'available', -5, 120, straddle],
        'a collection that straddles the guess (books updated before, captured after) is the first line after it; one captured before the guess but stored after it is never used');
      assert.notEqual(r.snapshotId, lateCommit);
      // Parity with D-27's pending resolver.
      const pending = await call(tx, 'gtl_pending_reference', { p_saved: guess });
      const resolved = await call(tx, 'gtl_resolve_pending_reference', { p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game_id: 'BUF-LAR', p_pending: pending });
      assert.deepEqual([resolved.snapshotId, resolved.value, Number(resolved.ageSeconds)], [r.snapshotId, r.value, r.gapSeconds]);
      // An import captured after the guess and before the hosted capture is first; a capture tie goes to hosted.
      await labLine(tx, { observed: '2026-10-10T12:00:30Z', captured: '2026-10-10T12:01:00Z', value: -4.2 });
      r = await resolve(tx);
      assert.deepEqual([...pick(r)], ['line-at-guess', 'first-after-submission', 'imported-reference', 'available', -4.2, -30]);
      await tx.exec('delete from public.gtl_reference_lines');
      await labLine(tx, { observed: '2026-10-10T12:01:00Z', captured: '2026-10-10T12:02:00Z', value: -4.4 });
      assert.equal((await resolve(tx)).snapshotId, straddle, 'capture tie: hosted');
    });
    await lab(async tx => {
      await clear(tx);
      // Kickoff bound: a line captured at or after kickoff never counts; a guess at or after kickoff has none.
      await labSnapshot(tx, { created: '2026-10-13T00:20:00Z', fetched: '2026-10-13T00:15:00Z', value: -3 });
      await labLine(tx, { observed: '2026-10-12T23:00:00Z', captured: '2026-10-13T00:15:00Z', value: -3 });
      const none = await resolve(tx);
      assert.deepEqual([none.basis, none.label, none.status, none.value, none.reason, at(none.nextSnapshotAt), at(none.guessedAt)], ['none', 'no line stored', 'unavailable', null, 'no-prior-snapshot', at('2026-10-13T00:20:00Z'), at(guess)]);
      const late = await resolve(tx, '2026-10-13T00:15:00Z');
      assert.deepEqual([late.basis, late.reason, late.value], ['none', 'guess-at-or-after-kickoff', null]);
      const noTemplate = await resolve(tx, guess, null);
      assert.deepEqual([noTemplate.basis, noTemplate.reason, noTemplate.value], ['none', 'no-schedule-template', null]);
      // An hours-old collection qualifies when judged at its own capture; its books were fresh then.
      await labSnapshot(tx, { created: '2026-10-10T04:00:01Z', fetched: '2026-10-10T04:00:00Z', observed: '2026-10-10T03:56:00Z', value: -2.5 });
      const hoursOld = await resolve(tx);
      assert.deepEqual([hoursOld.value, hoursOld.gapSeconds], [-2.5, 8 * 3600 + 4 * 60]);
    });
  });

  await t.test('saved and ruled references always win and are never re-resolved; stale, unavailable and pending stay unscored', async () => {
    const savedAt = '2026-10-08T21:00:00Z';
    const saved = (status, value, extra = {}) => ({ status, value, basis: 'line_at_guess', source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/', snapshotId: FIRST.id,
      capturedAt: FIRST.fetchedAt, observedAt: FIRST.observedAt, savedAt, ageSeconds: 6354, ...extra });
    const refs = { 'TB-DAL': saved('available', -7), 'PHI-JAX': saved('stale', null, { basis: undefined }), 'CIN-MIA': saved('unavailable', null), 'LV-NE': { status: 'pending', basis: 'first_line_after_submission', value: null, savedAt },
      'MIN-NO': { ...saved('available', 1.8), basis: 'commissioner-ruled', decision: 'D-25' } };
    const ballot = { picks: full(-3), submittedAt: savedAt, scoringReferences: refs };
    const rows = (await db.query("select * from public.gtl_ballot_pick_scores(2026,5,'guess_spread',$1,'[]')", [ballot])).rows;
    assert.deepEqual(rows.map(r => r.game_id), [...gameIds].sort((a, b) => at(state.games.find(g => g.id === a).kickoff) - at(state.games.find(g => g.id === b).kickoff) || a.localeCompare(b)), 'one row per slate game in kickoff order');
    const by = Object.fromEntries(rows.map(r => [r.game_id, r]));
    assert.deepEqual([by['TB-DAL'].reference.basis, by['TB-DAL'].reference.rule, by['TB-DAL'].reference.value, Number(by['TB-DAL'].points), by['TB-DAL'].reference.gapSeconds], ['saved', 'line_at_guess', -7, accuracy(-3, -7), 6354], 'a newer stored line never replaces the saved one');
    for (const g of ['PHI-JAX', 'CIN-MIA', 'LV-NE']) assert.deepEqual([by[g].reference.basis, by[g].reference.value, by[g].points], ['saved', null, null], `${g} stays as saved and unscored`);
    assert.deepEqual([by['LV-NE'].reference.status, by['LV-NE'].reference.rule], ['pending', 'first_line_after_submission'], 'a pending reference is resolved only by D-27\'s write path');
    assert.deepEqual([by['MIN-NO'].reference.basis, by['MIN-NO'].reference.label, by['MIN-NO'].reference.decision, Number(by['MIN-NO'].points)], ['commissioner-ruled', 'commissioner-ruled line', 'D-25', accuracy(-3, 1.8)]);
    assert.deepEqual([by['BAL-ATL'].reference.basis, by['BAL-ATL'].reference.snapshotId, Number(by['BAL-ATL'].points)], ['line-at-guess', SECOND.id, accuracy(-3, SPREAD['BAL-ATL'])], 'a game with no saved reference reads the line at the guess');
    const draft = (await db.query("select * from public.gtl_ballot_pick_scores(2026,5,'guess_spread',$1,'[]')", [{ picks: full(-3) }])).rows;
    assert.ok(draft.every(r => r.reference === null && r.points === null), 'a draft has no line and no points');
    assert.deepEqual((await db.query("select * from public.gtl_ballot_pick_scores(2026,5,'betting_challenge',$1,'[]')", [ballot])).rows, [], 'other modes have no rows');
    const ben = entry(await history(TJ), BEN, 'guess_spread');
    assert.deepEqual([ben.weekPoints, ben.weekScored, ben.eligibility, ben.picks.every(p => p.reference.basis === 'commissioner-ruled')], [37.6, 15, 'standard', true], 'the D-25 ballot keeps its ruled lines');
  });

  await t.test('guess instant: the newest submission or post-submission edit that set the pick; draft saves never count; a ballot without its original submission time is compared at its stored submittedAt, labelled', async () => {
    const instant = (ballot, audit, game) => rpc('gtl_guess_instant', { p_ballot: ballot, p_audit: audit, p_game_id: game });
    const submitted = '2026-10-08T22:00:00Z', edited = '2026-10-08T23:59:00Z';
    const before = full(44), after = { ...full(44), 'TB-DAL': 50 };
    const audit = [{ type: 'ballot_saved', timestamp: '2026-10-08T21:00:00Z', before: {}, after: full(44) },
      { type: 'ballot_submitted', timestamp: submitted, before: full(44), after: full(44), changedGameIds: [] },
      { type: 'ballot_edited', timestamp: edited, before, after, changedGameIds: ['TB-DAL'] }];
    const ballot = { picks: after, submittedAt: submitted };
    assert.equal(at(await instant(ballot, audit, 'TB-DAL')), at(edited), 'an edit re-anchors that pick');
    assert.equal(at(await instant(ballot, audit, 'PHI-JAX')), at(submitted), 'the other picks keep the submission (a draft save of the same value is not a guess)');
    assert.equal(at(await instant({ picks: full(44), submittedAt: submitted }, [{ type: 'ballot_saved', timestamp: '2026-10-08T23:00:00Z', before: full(43), after: full(44) }], 'TB-DAL')), at(submitted), 'a draft save never anchors');
    const reverted = [...audit, { type: 'ballot_edited', timestamp: '2026-10-09T00:05:00Z', before: after, after: full(44), changedGameIds: ['TB-DAL'] }];
    assert.equal(at(await instant({ picks: full(44), submittedAt: submitted }, reverted, 'TB-DAL')), at('2026-10-09T00:05:00Z'), 'editing back to an earlier value is a new guess');
    const origin = 'Imported complete ballot; original submission time unavailable';
    const unknown = { picks: after, submittedAt: SEAN_STORED, origin };
    assert.equal(at(await instant(unknown, [], 'PHI-JAX')), at(SEAN_STORED), 'the stored submittedAt, kept as stored (D-16)');
    assert.equal(at(await instant(unknown, [{ type: 'ballot_submitted', timestamp: '2026-10-08T09:30:00Z', before: {}, after }], 'PHI-JAX')), at(SEAN_STORED), 'a submission event never stands in for it');
    assert.equal(at(await instant(unknown, audit, 'TB-DAL')), at(edited), 'a later edit is a real guess instant');
    assert.equal(await instant({ ...unknown, submittedAt: 'not a time' }, [], 'PHI-JAX'), null, 'an unreadable stored time gives none');
    assert.equal(await instant({ picks: after, submittedAt: 'not a time' }, [{ type: 'ballot_edited', timestamp: 'bad', before, after, changedGameIds: ['TB-DAL'] }], 'TB-DAL'), null, 'malformed instants give none');
    // Through the scoring function: one edited pick resolves at its edit instant, the rest at the submission (the row is not touched).
    const row = (await db.query("select ballot,audit from public.gtl_weekly_ballots where user_id=$1 and mode='guess_total'", [id(TJ)])).rows[0];
    const next = { ...row.ballot, picks: { ...row.ballot.picks, 'BUF-LAR': 50 } };
    const nextAudit = [...row.audit, { type: 'ballot_edited', timestamp: '2026-10-09T09:00:00Z', before: row.ballot.picks, after: next.picks, changedGameIds: ['BUF-LAR'] }];
    const picks = (await db.query("select * from public.gtl_ballot_pick_scores(2026,5,'guess_total',$1,$2)", [next, JSON.stringify(nextAudit)])).rows;
    const editedPick = picks.find(p => p.game_id === 'BUF-LAR'), other = picks.find(p => p.game_id === 'PHI-JAX');
    assert.deepEqual([editedPick.reference.snapshotId, at(editedPick.reference.guessedAt), Number(editedPick.points)], [LATER.id, at('2026-10-09T09:00:00Z'), accuracy(50, 60)], 'the edited pick reads the line stored before its edit');
    assert.deepEqual([other.reference.snapshotId, at(other.reference.guessedAt)], [SECOND.id, at('2026-10-08T22:18:34.785952Z')]);
    assert.ok(picks.every(p => p.reference.guessedAtKnown === true), 'a recorded submission or edit is a known guess instant');
    // A ballot without its original submission time: its picks read the line at the stored submittedAt, labelled guessedAtKnown false;
    // an edited pick reads the line at its edit, a known instant. An unreadable stored time gives no line and no points.
    const unknownRows = (await db.query("select * from public.gtl_ballot_pick_scores(2026,5,'guess_total',$1,$2)", [unknown, JSON.stringify(audit)])).rows;
    const stored = unknownRows.find(p => p.game_id === 'PHI-JAX'), reanchored = unknownRows.find(p => p.game_id === 'TB-DAL');
    assert.deepEqual([stored.reference.basis, stored.reference.rule, stored.reference.snapshotId, at(stored.reference.guessedAt), stored.reference.guessedAtKnown, Number(stored.points)],
      ['line-at-guess', 'first-after-submission', FIRST.id, at(SEAN_STORED), false, accuracy(44, TOTAL['PHI-JAX'])]);
    assert.deepEqual([reanchored.reference.rule, reanchored.reference.snapshotId, at(reanchored.reference.guessedAt), reanchored.reference.guessedAtKnown, Number(reanchored.points)],
      ['newest-at-or-before', SECOND.id, at(edited), true, accuracy(50, TOTAL['TB-DAL'])]);
    const unreadable = (await db.query("select * from public.gtl_ballot_pick_scores(2026,5,'guess_total',$1,'[]')", [{ ...unknown, submittedAt: 'not a time' }])).rows;
    assert.ok(unreadable.every(p => p.reference.basis === 'none' && p.reference.reason === 'submission-time-unavailable' && p.reference.guessedAt === null && p.points === null), 'no instant is invented');
  });

  let hostedOnly;
  await t.test('before any import: hosted lines only, exactly D-27; the ballot without its original submission time reads the line at its stored time', async () => {
    const h = await history(TJ);
    hostedOnly = h;
    const steven = entry(h, STEVEN, 'guess_spread');
    assert.deepEqual([steven.eligible, steven.eligibility, steven.weekScored], [true, 'ruled-eligible', 15]);
    for (const p of steven.picks) {
      assert.deepEqual([p.reference.basis, p.reference.rule, p.reference.origin, p.reference.snapshotId, p.reference.gapSeconds, at(p.reference.observedAt), at(p.reference.capturedAt), p.reference.value, p.reference.guessedAtKnown, p.points],
        ['line-at-guess', 'first-after-submission', 'hosted-snapshot', FIRST.id, -1859, at(FIRST.observedAt), at(FIRST.fetchedAt), SPREAD[p.gameId], true, accuracy(-3, SPREAD[p.gameId])], 'no hosted line was stored before 18:43Z: the first collected after it');
    }
    // Sean's seed Spread (D-08 eligible): compared at its stored submittedAt (07:33Z), labelled; no hosted line was stored before it, so
    // the first collected after it (19:15Z). Ranked with those points, never as an unscored 0.
    const sean = entry(h, SEAN, 'guess_spread'), seanPicks = state.ballots.sean.guess_spread.picks;
    assert.deepEqual([sean.submittedAtKnown, sean.eligible, sean.eligibility, sean.weekScored, sean.weekPoints], [false, true, 'ruled-eligible', 15, 95]);
    for (const p of sean.picks) {
      assert.deepEqual([p.guess, p.reference.basis, p.reference.rule, p.reference.origin, p.reference.snapshotId, at(p.reference.guessedAt), p.reference.guessedAtKnown, p.reference.gapSeconds, p.reference.value, p.points],
        [seanPicks[p.gameId], 'line-at-guess', 'first-after-submission', 'hosted-snapshot', FIRST.id, at(SEAN_STORED), false, -42066, SPREAD[p.gameId], accuracy(seanPicks[p.gameId], SPREAD[p.gameId])], p.gameId);
    }
    const standing = (await read(TJ)).standings.find(x => x.userId === id(SEAN) && x.mode === 'guess_spread');
    assert.deepEqual([standing.weekPoints, standing.weekScored, standing.seasonPoints, standing.seasonScored], [95, 15, 95, 15]);
    assert.deepEqual(await seanWindowLines(), Array(15).fill([FIRST.id, 'first-after-submission']), 'every instant the record allows for Sean\'s guesses selects the same stored line');
  });

  let imports;
  await t.test('imports: commissioner-only, 2026 Week 5 only, closed week, captured before kickoff, idempotent, conflicts fail closed, one audit row per file; voids correct an import', async () => {
    const { payloads, summary } = buildReferenceLineImport({ actor: id(SEAN), decision: DECISION });
    assert.deepEqual([payloads.length, summary.lines, payloads.map(p => p.p_file)], [2, 30, [FILE_0433, FILE_1003]]);
    const [p0433, p1003] = payloads;
    const refused = async (patch, pattern = /GTL_REFERENCE_IMPORT_INVALID/) => assert.rejects(() => rpc(RPC, { ...p1003, ...patch }), pattern, JSON.stringify(patch).slice(0, 120));
    const ref = p1003.p_reference;
    await refused({ p_actor: id(TJ) }, /GTL_COMMUNITY_FORBIDDEN/);
    await refused({ p_actor: id(OUTSIDER) }, /GTL_COMMUNITY_FORBIDDEN/);
    for (const patch of [{ p_season: 2025 }, { p_week: 6 }, { p_file: '../secrets.json' }, { p_file: 'data/picks/2026-week-05.json' }, { p_file_sha256: 'abc' }, { p_ruling: 'short' },
      { p_reference: { ...ref, decision: 'X-1' } }, { p_reference: { ...ref, sourceUrl: 'http://edraft.com/' } }, { p_reference: { ...ref, source: '' } },
      { p_reference: { ...ref, capturedAt: null } }, { p_reference: (({ capturedAt, ...rest }) => rest)(ref) }, { p_reference: { ...ref, capturedAt: '2026-10-08T13:00:00Z' } },
      { p_reference: { ...ref, observedAt: new Date(now + HOUR).toISOString(), capturedAt: new Date(now + 2 * HOUR).toISOString() } },
      { p_reference: { ...ref, capturedAt: '2026-10-09T00:15:00Z' } },
      { p_reference: { ...ref, lines: { ...ref.lines, 'XX-YY': { spread: -3 } } } }, { p_reference: { ...ref, lines: { ...ref.lines, 'TB-DAL': { moneyline: 120 } } } },
      { p_reference: { ...ref, lines: { ...ref.lines, 'TB-DAL': { spread: 101 } } } }, { p_reference: { ...ref, lines: { ...ref.lines, 'TB-DAL': { total: -1 } } } },
      { p_reference: { ...ref, lines: { ...ref.lines, 'TB-DAL': { spread: '-8.5' } } } }, { p_reference: { ...ref, lines: {} } }]) await refused(patch);
    // An open week takes its lines from D-27's save path only.
    await lab(async tx => {
      await tx.query("update public.gtl_weekly_slates set signature=jsonb_set(signature,'{deadline}',to_jsonb($1::double precision)) where season=2026 and week=5", [(now + 24 * HOUR) / 1000]);
      await tx.exec('set local role service_role');
      await assert.rejects(() => call(tx, RPC, p1003), /GTL_REFERENCE_IMPORT_INVALID/);
    });
    assert.equal((await db.query('select count(*)::int n from public.gtl_reference_line_imports')).rows[0].n, 0, 'nothing was written by a refused call');
    const first = await rpc(RPC, p0433), second = await rpc(RPC, p1003);
    assert.deepEqual([first.imported, first.replayed, first.lines, first.decision, second.imported, second.lines], [true, false, 15, DECISION, true, 15]);
    imports = { [FILE_0433]: first.importId, [FILE_1003]: second.importId };
    const counts = async () => (await db.query("select (select count(*)::int from public.gtl_reference_line_imports) i,(select count(*)::int from public.gtl_reference_lines) l,(select count(*)::int from public.gtl_access_audit where event like 'reference_line_%') a")).rows[0];
    assert.deepEqual(await counts(), { i: 2, l: 30, a: 2 });
    const replay = await rpc(RPC, p1003);
    assert.deepEqual([replay.imported, replay.replayed, replay.importId, replay.payloadSha256], [false, true, second.importId, second.payloadSha256]);
    assert.deepEqual(await counts(), { i: 2, l: 30, a: 2 }, 'a replay writes nothing');
    await assert.rejects(() => rpc(RPC, { ...p1003, p_reference: { ...ref, lines: { ...ref.lines, 'TB-DAL': { spread: -9 } } } }), /GTL_REFERENCE_IMPORT_CONFLICT/, 'same file and sha, other lines');
    await assert.rejects(() => rpc(RPC, { ...p1003, p_file_sha256: 'f'.repeat(64) }), /GTL_REFERENCE_IMPORT_CONFLICT/, 'same path, other sha');
    await assert.rejects(() => rpc(RPC, { ...p1003, p_file: 'data/snapshots/renamed.json' }), /GTL_REFERENCE_IMPORT_CONFLICT/, 'same sha, other path');
    await assert.rejects(() => rpc(RPC, { ...p1003, p_reference: { ...ref, decision: 'D-98' } }), /GTL_REFERENCE_IMPORT_CONFLICT/, 'same file under another decision');
    assert.deepEqual(await counts(), { i: 2, l: 30, a: 2 });
    const audits = (await db.query("select actor_id,event from public.gtl_access_audit where event like 'reference_line_import:%' order by event")).rows;
    assert.deepEqual(audits.map(a => [a.actor_id, a.event]), [[id(SEAN), `reference_line_import:${DECISION}:2026:5:${FILE_0433}:${p0433.p_file_sha256}`], [id(SEAN), `reference_line_import:${DECISION}:2026:5:${FILE_1003}:${p1003.p_file_sha256}`]]);
    const stored = (await db.query('select decision,ruling,approved_by,context_league_id,evidence,line_count from public.gtl_reference_line_imports where id=$1', [second.importId])).rows[0];
    assert.deepEqual([stored.decision, stored.ruling, stored.approved_by, stored.context_league_id, stored.line_count, stored.evidence.lines, stored.evidence.capturedAt], [DECISION, p1003.p_ruling, id(SEAN), 'sean-troy-luke', 15, undefined, ref.capturedAt]);
    const lines = (await db.query('select game_id,market,value,observed_at,captured_at from public.gtl_reference_lines where import_id=$1 order by game_id', [second.importId])).rows;
    assert.deepEqual(lines.map(l => [l.game_id, l.market, Number(l.value), new Date(l.observed_at).getTime(), new Date(l.captured_at).getTime()]), Object.keys(ref.lines).sort().map(g => [g, 'spread', ref.lines[g].spread, at('2026-10-08T14:03:00Z'), at('2026-10-08T15:02:12.589Z')]));
    // Voids (rolled back): commissioner-only, idempotent, and the reader falls back to the remaining import; a corrected payload can then be imported, the voided one never again.
    await lab(async tx => {
      await tx.exec('set local role service_role');
      const voidIt = (actor, reason = 'Fixture: wrong capture time recorded') => call(tx, VOID_RPC, { p_actor: id(actor), p_import: second.importId, p_decision: DECISION, p_reason: reason });
      const expectError = async (fn, pattern, message) => { await tx.query('savepoint lab_expect'); await assert.rejects(fn, pattern, message); await tx.query('rollback to savepoint lab_expect'); };
      await expectError(() => voidIt(TJ), /GTL_COMMUNITY_FORBIDDEN/);
      const voided = await voidIt(SEAN);
      assert.deepEqual([voided.voided, voided.replayed], [true, false]);
      assert.deepEqual([(await voidIt(SEAN)).replayed], [true]);
      await expectError(() => voidIt(SEAN, 'Fixture: another reason entirely'), /GTL_REFERENCE_IMPORT_CONFLICT/);
      const scores = await tx.query("select p.* from public.gtl_weekly_ballots b,public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) p where b.user_id=$1 and b.mode='guess_spread'", [id(STEVEN)]);
      assert.ok(scores.rows.every(r => r.reference.sourceFile === FILE_0433 && r.reference.gapSeconds === 36607), 'after the void the 09:01Z capture is the newest stored line');
      await expectError(() => call(tx, RPC, p1003), /GTL_REFERENCE_IMPORT_CONFLICT/, 'a voided payload is never re-imported');
      const corrected = await call(tx, RPC, { ...p1003, p_reference: { ...ref, method: `${ref.method} (corrected)` } });
      assert.deepEqual([corrected.imported, corrected.lines], [true, 15]);
    });
    assert.equal((await db.query('select count(*)::int n from public.gtl_reference_line_voids')).rows[0].n, 0);
    // The runbook's verification select reads counts only.
    const verify = (await db.query(verifySql())).rows;
    assert.deepEqual(verify.map(v => [v.source_file, v.decision, v.line_count, Number(v.spread_lines), Number(v.total_lines), v.voided, Number(v.audit_rows)]), [[FILE_0433, DECISION, 15, 15, 0, false, 1], [FILE_1003, DECISION, 15, 15, 0, false, 1]]);
    assert.ok(!JSON.stringify(verify).includes('"value"'));
  });

  await t.test('eligibility: a ruled-eligible practice ballot counts everywhere; a practice ballot without a ruling and a ruled-ineligible one are listed, labelled and never scored or ranked', async () => {
    const h = await history(CUH), feed = await read(CUH);
    const steven = entry(h, STEVEN, 'guess_spread'), practice = entry(h, LUKE, 'guess_spread'), ineligible = entry(h, LUKE, 'guess_total');
    assert.deepEqual([steven.eligible, steven.eligibility, steven.weekScored, steven.picksHidden], [true, 'ruled-eligible', 15, false]);
    assert.deepEqual([practice.eligible, practice.eligibility, practice.weekPoints, practice.weekScored, practice.picksHidden], [false, 'practice', 0, 0, false]);
    assert.ok(practice.picks.every(p => p.guess === -1 && p.points === null && !p.scorable && p.reference.basis === 'line-at-guess' && p.reference.value !== null), 'guesses and lines shown, never points (D-23)');
    assert.deepEqual([ineligible.eligible, ineligible.eligibility, ineligible.weekPoints], [false, 'ruled-ineligible', 0]);
    const ranked = feed.standings.map(s => `${s.userId}:${s.mode}`), listed = feed.submissions.map(s => `${s.userId}:${s.mode}`);
    for (const key of [`${id(STEVEN)}:guess_spread`, `${id(SEAN)}:guess_spread`, `${id(TJ)}:guess_total`]) { assert.ok(ranked.includes(key), key); assert.ok(listed.includes(key), key); }
    for (const key of [`${id(LUKE)}:guess_spread`, `${id(LUKE)}:guess_total`]) { assert.ok(!ranked.includes(key), key); assert.ok(!listed.includes(key), key); }
    // The rows keep their stored provenance: origin_practice stays true on Steven's row.
    assert.equal((await db.query("select origin_practice from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'", [id(STEVEN)])).rows[0].origin_practice, true);
  });

  await t.test('the leaderboard and the history read the same rows: totals, counts and per-pick points', async () => {
    const h = await history(SEAN), feed = await read(SEAN);
    const w5 = h.weeks.find(w => w.week === 5);
    for (const e of w5.entries.filter(e => e.eligible)) {
      const s = feed.standings.find(x => x.userId === e.userId && x.mode === e.mode);
      assert.ok(s, `${NAMES[Number(e.userId.slice(-12))]} ${e.mode} is ranked`);
      assert.deepEqual([s.weekPoints, s.weekScored, s.seasonPoints, s.seasonScored, s.weeksSubmitted], [e.weekPoints, e.weekScored, e.weekPoints, e.weekScored, 1], `${e.userId} ${e.mode}`);
      assert.equal(round(e.picks.reduce((sum, p) => sum + (p.points ?? 0), 0)), e.weekPoints);
      for (const p of e.picks) assert.equal(p.points, p.reference.value === null ? null : accuracy(p.guess, p.reference.value));
    }
    assert.equal(feed.standings.length, w5.entries.filter(e => e.eligible).length, 'every eligible ballot and nothing else');
    assert.deepEqual(feed.standings.filter(s => s.weekScored !== 15).map(s => `${NAMES[Number(s.userId.slice(-12))]} ${s.mode}`), [], 'no eligible Week 5 ballot is ranked without its 15 lines');
  });

  await t.test('Week 5 replay: the line each ballot is compared with, its observation and gap', async () => {
    const h = await history(TJ);
    const w5 = h.weeks.find(w => w.week === 5);
    const expected = [
      // Sean's seed Spread at its stored 07:33Z: nothing stored before it; the 04:33 ET page captured at 09:01:21Z is the first line after it.
      [SEAN, 'guess_spread', FILE_0433, 'imported-reference', '2026-10-08T08:33:00Z', -3600, 'first-after-submission'],
      [STEVEN, 'guess_spread', FILE_1003, 'imported-reference', '2026-10-08T14:03:00Z', 16807, 'newest-at-or-before'],
      [SEAN, 'guess_total', SECOND.id, 'hosted-snapshot', SECOND.observedAt, 4567, 'newest-at-or-before'],
      [STEVEN, 'guess_total', SECOND.id, 'hosted-snapshot', SECOND.observedAt, 5251, 'newest-at-or-before'],
      [TJ, 'guess_spread', SECOND.id, 'hosted-snapshot', SECOND.observedAt, 6823, 'newest-at-or-before'],
      [TJ, 'guess_total', SECOND.id, 'hosted-snapshot', SECOND.observedAt, 7045, 'newest-at-or-before'],
      [CUH, 'guess_spread', SECOND.id, 'hosted-snapshot', SECOND.observedAt, 10077, 'newest-at-or-before'],
      [CUH, 'guess_total', SECOND.id, 'hosted-snapshot', SECOND.observedAt, 10341, 'newest-at-or-before'],
    ];
    const rows = [];
    for (const [n, mode, source, origin, observed, gap, rule] of expected) {
      const e = entry(h, n, mode);
      const values = origin === 'imported-reference' ? buildReferenceLineImport().payloads.find(x => x.p_file === source).p_reference.lines : null;
      for (const p of e.picks) {
        assert.deepEqual([p.reference.basis, p.reference.origin, p.reference.sourceFile ?? p.reference.snapshotId, at(p.reference.observedAt), p.reference.gapSeconds, p.reference.rule],
          ['line-at-guess', origin, source, at(observed), gap, rule], `${NAMES[n]} ${mode} ${p.gameId}`);
        const value = values ? values[p.gameId].spread : (mode === 'guess_spread' ? SPREAD : TOTAL)[p.gameId];
        assert.deepEqual([p.reference.value, p.points], [value, accuracy(p.guess, value)]);
      }
      assert.equal(e.weekScored, 15);
      rows.push(`${NAMES[n]} ${mode}: ${source.replace('data/snapshots/', '')} observed ${observed} gap ${gap}s → ${e.weekPoints}`);
    }
    // Nothing chosen from the first hosted collection or the Oct 9 collection once the eDraft pages are imported; the 03:33 ET page is never imported.
    const chosen = new Set(w5.entries.flatMap(e => e.picks ?? []).map(p => p.reference.snapshotId ?? p.reference.sourceFile).filter(Boolean));
    assert.deepEqual([...chosen].sort(), [FILE_0433, FILE_1003, SECOND.id].sort());
    const sean = entry(h, SEAN, 'guess_spread');
    assert.deepEqual([sean.submittedAtKnown, sean.eligibility, sean.weekPoints, sean.weekScored, sean.picks.every(p => p.reference.guessedAtKnown === false)], [false, 'ruled-eligible', 95.8, 15, true],
      'Sean\'s Spread scores 95.8, the 04:33 ET page\'s provisional total, labelled as compared at its stored submission time');
    assert.deepEqual(await seanWindowLines(), Array(15).fill([FILE_0433, 'first-after-submission']), 'with the import too, every instant the record allows selects the same line');
    assert.ok(w5.entries.filter(e => e.userId !== id(SEAN) || e.mode !== 'guess_spread').every(e => e.picks.every(p => p.reference.guessedAtKnown !== false)), 'only Sean\'s seed Spread is labelled');
    const ben = entry(h, BEN, 'guess_spread');
    assert.deepEqual([ben.weekPoints, ben.picks[0].reference.basis], [37.6, 'commissioner-ruled']);
    assert.equal(entry(h, BEN, 'guess_total'), undefined, 'Ben has no Total ballot');
    // Steven's and Sean's Spreads read the first hosted collection after their guesses before the import; the import only changes those two ballots.
    for (const e of w5.entries) {
      const prior = hostedOnly.weeks.find(w => w.week === 5).entries.find(x => x.userId === e.userId && x.mode === e.mode);
      if (!([id(STEVEN), id(SEAN)].includes(e.userId) && e.mode === 'guess_spread')) assert.deepEqual(e.picks, prior.picks, `${e.userId} ${e.mode} unchanged by the import`);
    }
    for (const row of rows) t.diagnostic(row);
  });

  await t.test('read cost with forty more full-slate collections stored before the first guess (diagnostic, rolled back)', async () => {
    await lab(async tx => {
      for (let i = 0; i < 40; i++) {
        const created = new Date(at('2026-10-06T00:00:00Z') + i * HOUR).toISOString();
        // Two books only, so none qualifies and every scan before 19:15Z walks all of them.
        await insertSnapshot(tx, { id: `0ccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`, createdAt: created, fetchedAt: created, observedAt: created, spread: SPREAD, total: TOTAL }, template, ['draftkings', 'fanduel']);
      }
      await tx.exec('set local role service_role');
      const started = performance.now();
      await call(tx, 'gtl_read_community', { p_user: id(TJ), p_before: null, p_limit: 30, p_now: new Date(now).toISOString() });
      const readMs = performance.now() - started;
      const second = performance.now();
      const h = await call(tx, 'gtl_read_community_history', { p_user: id(TJ), p_season: 2026, p_now: new Date(now).toISOString() });
      const historyMs = performance.now() - second;
      assert.equal(h.weeks[0].entries.find(e => e.userId === id(STEVEN) && e.mode === 'guess_spread').picks[0].reference.sourceFile, FILE_1003, 'the extra collections change nothing');
      t.diagnostic(`gtl_read_community ${readMs.toFixed(0)} ms, gtl_read_community_history ${historyMs.toFixed(0)} ms with 43 collections and 30 imported lines (PGlite)`);
    });
  });

  await t.test('the read-only hosted pre-flight counts what changes, never a pick or a line value', async () => {
    const rows = (await db.query(preflightSql())).rows.map(r => [r.check_name, r.season, r.week, r.mode, Number(r.ballots)]);
    assert.deepEqual(rows, [
      ['ballots without a saved reference', 2026, 5, 'guess_spread', 5],
      ['ballots without a saved reference', 2026, 5, 'guess_total', 5],
      ['eligible ruling on a practice ballot', 2026, 5, 'guess_spread', 1],
      ['ineligible ruling on a non-practice ballot', 2026, 5, 'guess_total', 1],
      ['submission time unavailable', 2026, 5, 'guess_spread', 1],
    ]);
  });

  await t.test('nothing was written: every ballot, eligibility ruling and feed post is byte-identical', async () => {
    assert.deepEqual(await dumpRows(), baseline);
    assert.ok(imports[FILE_0433] && imports[FILE_1003]);
  });
});
