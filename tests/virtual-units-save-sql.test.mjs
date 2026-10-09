import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Every repo migration in order up to and including the settlement file, except the two that only install hosted
// extensions (pg_cron, pg_net) and cannot load in PGlite: 20261008201000 and 20261008201526.
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql',
  '20261008200926_gtl_twelve_hour_odds_refresh.sql', '20261008224444_gtl_personal_workspace.sql', '20261008224735_gtl_reviewed_quote_selections.sql',
  '20261008225401_gtl_submission_time_scoring.sql', '20261008225607_gtl_reviewed_final_results.sql', '20261008232055_gtl_fresh_submission_odds.sql',
  '20261008240000_gtl_virtual_units.sql', '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql',
  '20261009160000_gtl_ruled_ballot_import.sql', '20261009170000_gtl_virtual_units_settlement.sql',
];
const ORIGINAL = '20261008240000_gtl_virtual_units.sql', FIX = '20261009190000_gtl_virtual_units_save_isfinite.sql';
const SEAN = 30, TROY = 1;
const SAVE = 'public.gtl_save_virtual_units_pick(uuid,text,bigint,jsonb)', HELPER = 'public.gtl_numeric_is_finite(numeric)', READ = 'public.gtl_read_virtual_units(uuid,text)';

test('D-18 virtual units save: the hosted function fails with 42883, the follow-up migration saves, refuses non-finite terms and re-saves through the conflict branch', { skip: PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  const now = Date.now(), iso = value => new Date(value).toISOString();
  // The first game kicked off an hour ago; every other game is still two or more hours away, so picks can be saved.
  const state = seed(); state.league.deadline = iso(now - 3600000);
  state.games.forEach((game, index) => { game.kickoff = iso(now + (index === 0 ? -1 : index + 1) * 3600000); });
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
      for (const n of [SEAN, TROY]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player')", [id(SEAN), id(TROY)]);
    }
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const G = state.games.map(game => game.id);
  const quotedAt = iso(now - 6 * 3600000);
  const body = (gameId, market, side, line, odds, units, extra = {}) => ({ gameId, market, side, line, odds, units, source: 'DraftKings', quotedAt, ...extra });
  const save = (user, revision, value, role = 'service_role') => as(role, "select public.gtl_save_virtual_units_pick($1,'sean-troy-luke',$2,$3) value", [id(user), revision, value]).then(result => result.rows[0].value);
  const settle = payload => as('service_role', 'select public.gtl_settle_virtual_units(2026,5,$1) value', [payload]).then(result => result.rows[0].value);
  const read = user => as('service_role', "select public.gtl_read_virtual_units($1,'sean-troy-luke') value", [id(user)]).then(result => result.rows[0].value);
  const rows = user => db.query('select game_id,market,selection,status,result,audit,created_at,updated_at from public.gtl_virtual_units_picks where user_id=$1 order by game_id,market', [id(user)]).then(result => result.rows);
  const revision = user => db.query('select revision from public.gtl_weekly_versions where user_id=$1 and season=2026 and week=5', [id(user)]).then(result => result.rows[0]?.revision ?? null);
  const pick = (list, gameId, market) => list.find(row => row.game_id === gameId && row.market === market);
  const definition = name => db.query(`select pg_get_functiondef('${name}'::regprocedure) value`).then(result => result.rows[0].value);
  const privilege = (role, name) => db.query(`select has_function_privilege('${role}','${name}','execute') value`).then(result => result.rows[0].value);
  const rejects = async (fn, code, message, label = 'the call') => { let error; try { await fn(); } catch (caught) { error = caught; } assert.ok(error, `expected ${label} to be refused`); assert.equal(error.code, code, `${label}: ${error.message}`); assert.match(error.message, message, label); return error; };
  const valid = body(G[1], 'spread', 'home', -3.5, -110, 1);
  const readBefore = await definition(READ);

  await t.test('(a) before the fix every save fails with SQLSTATE 42883 and writes nothing, so the function cannot even refuse bad input', async () => {
    const rev = await revision(SEAN);
    assert.equal(rev, 0, 'the seeded imported ballot already created the weekly version row');
    const error = await rejects(() => save(SEAN, 0, valid), '42883', /function isfinite\(numeric\) does not exist/);
    assert.equal(error.routine, 'ParseFuncOrColumn');
    await rejects(() => save(SEAN, 0, { ...valid, units: 'Infinity' }), '42883', /function isfinite\(numeric\) does not exist/);
    await rejects(() => save(SEAN, 0, { ...valid, line: -3.25 }), '42883', /function isfinite\(numeric\) does not exist/);
    assert.deepEqual(await rows(SEAN), []); assert.equal(await revision(SEAN), rev, 'the failed call wrote no pick and bumped no revision');
    assert.equal(await revision(TROY), null, 'a failed first call for a player without a weekly row rolls that row back too');
    await rejects(() => save(TROY, 0, valid), '42883', /function isfinite\(numeric\) does not exist/);
    assert.equal(await revision(TROY), null);
    // Refusals that come before the broken line still work, which is why the revision and kickoff guards were already honest.
    await rejects(() => save(SEAN, 7, valid), 'P0001', /GTL_WEEKLY_CONFLICT/);
    await rejects(() => save(SEAN, 0, body(G[0], 'spread', 'home', -3.5, -110, 1)), 'P0001', /GTL_VIRTUAL_CLOSED/);
  });

  await db.exec(fs.readFileSync(`supabase/migrations/${FIX}`, 'utf8'));

  await t.test('the follow-up re-creates the function verbatim except the one check line, keeps the grants and leaves the reader alone', async () => {
    const original = fs.readFileSync(`supabase/migrations/${ORIGINAL}`, 'utf8'), fix = fs.readFileSync(`supabase/migrations/${FIX}`, 'utf8');
    const fn = (source, head) => { const start = source.indexOf(head); assert.ok(start >= 0, head); return source.slice(start + head.length, source.indexOf('\nend $$;', start)); };
    const expected = fn(original, 'create function public.gtl_save_virtual_units_pick(')
      .replace('if not isfinite(line) or not isfinite(odds) or not isfinite(units) or not isfinite(quoted)', "if not public.gtl_numeric_is_finite(line) or not public.gtl_numeric_is_finite(odds) or not public.gtl_numeric_is_finite(units) or not isfinite(quoted) or quoted is null or p_body->>'source' is null");
    assert.equal(fn(fix, 'create or replace function public.gtl_save_virtual_units_pick('), expected, 'signature and body are byte-for-byte the original apart from the one check line: the three helper calls and the null checks on quotedAt and source');
    assert.equal(fix.includes('function public.gtl_read_virtual_units'), false, 'the follow-up neither creates nor replaces the reader');
    assert.equal(await definition(READ), readBefore, 'gtl_read_virtual_units is unchanged from the settlement migration');
    const [save_, helper] = await Promise.all([
      db.query("select prosecdef,proconfig,provolatile from pg_proc where oid='public.gtl_save_virtual_units_pick'::regproc"),
      db.query("select prosecdef,proconfig,provolatile,proisstrict,proretset from pg_proc where oid='public.gtl_numeric_is_finite'::regproc"),
    ]);
    assert.deepEqual([save_.rows[0].prosecdef, save_.rows[0].proconfig, save_.rows[0].provolatile], [false, ['search_path=""'], 'v']);
    assert.deepEqual([helper.rows[0].prosecdef, helper.rows[0].proconfig, helper.rows[0].provolatile, helper.rows[0].proisstrict, helper.rows[0].proretset], [false, ['search_path=""'], 'i', false, false]);
    for (const name of [SAVE, HELPER]) {
      assert.deepEqual(await Promise.all(['anon', 'authenticated', 'service_role'].map(role => privilege(role, name))), [false, false, true], name);
    }
    for (const role of ['anon', 'authenticated']) {
      await rejects(() => save(SEAN, 0, valid, role), '42501', /permission denied for function gtl_save_virtual_units_pick/);
      await rejects(() => as(role, 'select public.gtl_numeric_is_finite(1)'), '42501', /permission denied for function gtl_numeric_is_finite/);
    }
  });

  await t.test('(b) after the fix the same call saves the pick with the expected selection and a placed audit event', async () => {
    assert.equal(await save(SEAN, 0, valid), 1);
    const [row] = await rows(SEAN);
    assert.deepEqual([row.game_id, row.market, row.status, row.result], [G[1], 'spread', 'pending', null]);
    const { selectedAt, quotedAt: savedQuote, ...selection } = row.selection;
    assert.deepEqual(selection, { gameId: G[1], market: 'spread', side: 'home', line: -3.5, odds: -110, units: 1, source: 'DraftKings', riskDollars: 100 });
    assert.equal(Date.parse(savedQuote), Date.parse(quotedAt), 'the quote time is saved exactly (jsonb renders it with a +00:00 offset)');
    assert.ok(Date.parse(selectedAt) >= now - 1000 && Date.parse(selectedAt) <= Date.now() + 1000);
    assert.equal(row.audit.length, 1); assert.deepEqual([row.audit[0].type, row.audit[0].before, row.audit[0].after], ['placed', null, row.selection]);
    assert.equal(row.created_at.toISOString(), row.updated_at.toISOString());
    assert.equal(await revision(SEAN), 1);
    const view = await read(SEAN);
    assert.deepEqual([view.revision, view.picks.length, view.summary.pending, view.summary.qualificationPicks, view.summary.qualificationUnits, view.results, view.settlement.settledGames], [1, 1, 1, 1, 1, {}, 0]);
    // A total on the same matchup and a stale revision behave as the original intended.
    assert.equal(await save(SEAN, 1, body(G[1], 'total', 'over', 44.5, -105, 0.5)), 2);
    await rejects(() => save(SEAN, 1, body(G[2], 'total', 'under', 41, -110, 1)), 'P0001', /GTL_WEEKLY_CONFLICT/);
    assert.equal((await rows(SEAN)).length, 2);
  });

  await t.test('(c) non-finite, missing and null terms are refused with GTL_VIRTUAL_INVALID; the helper agrees; every other validation is intact', async () => {
    // JSON cannot carry NaN or Infinity as numbers (cloud/virtual-units.mjs validateBody() also refuses them before the
    // RPC, and JSON.stringify turns them into null), so the only way a non-finite numeric reaches the function is a
    // direct service-role RPC whose body carries the value as a string: numeric input accepts 'NaN', 'Infinity',
    // '-Infinity' and 'inf', and the function casts p_body->>'units' from text.
    const before = await rows(SEAN), rev = await revision(SEAN);
    for (const extra of [{ units: 'Infinity' }, { units: 'NaN' }, { units: 'inf' }, { line: 'NaN' }, { line: '-Infinity' }, { odds: 'Infinity' }, { odds: 'NaN' },
      { quotedAt: 'infinity' }, { quotedAt: '-infinity' }]) {
      await rejects(() => save(SEAN, rev, body(G[2], 'spread', 'away', 2.5, -110, 1, extra)), 'P0001', /GTL_VIRTUAL_INVALID/);
    }
    // A missing or null term is refused instead of saving a null term. For line, odds and units the helper returns false
    // for null; for quotedAt and source the check line tests null explicitly, because `not isfinite(null::timestamptz)`,
    // `null>=kickoff`, `null>stamp`, `length(btrim(null))<2` and `length(null)>120` are all NULL, a NULL or-chain is NULL,
    // and PL/pgSQL treats a NULL `if` condition as false (without them the re-created function saved {"quotedAt":null} / {"source":null}).
    for (const key of ['line', 'odds', 'units', 'quotedAt', 'source']) {
      const { [key]: _omitted, ...partial } = body(G[2], 'spread', 'away', 2.5, -110, 1);
      await rejects(() => save(SEAN, rev, partial), 'P0001', /GTL_VIRTUAL_INVALID/, `missing ${key}`);
      await rejects(() => save(SEAN, rev, { ...partial, [key]: null }), 'P0001', /GTL_VIRTUAL_INVALID/, `null ${key}`);
    }
    assert.deepEqual((await db.query("select (not isfinite(null::timestamptz)) is null a,(length(btrim(null::text))<2) is null b,(length(null::text)>120) is null c")).rows[0], { a: true, b: true, c: true }, 'why the explicit null checks are load-bearing');
    const helper = await db.query("select public.gtl_numeric_is_finite('NaN') a,public.gtl_numeric_is_finite('Infinity') b,public.gtl_numeric_is_finite('-Infinity') c,public.gtl_numeric_is_finite('inf') d,public.gtl_numeric_is_finite(null) e,public.gtl_numeric_is_finite(1.5) f,public.gtl_numeric_is_finite(-110) g,public.gtl_numeric_is_finite(0) h,public.gtl_numeric_is_finite(1e300::numeric) i");
    assert.deepEqual(helper.rows[0], { a: false, b: false, c: false, d: false, e: false, f: true, g: true, h: true, i: true });
    // Without the finiteness check an infinite or NaN stake passes the stake rules: Infinity*2 = trunc(Infinity*2) and neither value is <= 0.
    assert.deepEqual((await db.query("select 'Infinity'::numeric*2<>trunc('Infinity'::numeric*2) a,'Infinity'::numeric<=0 b,'NaN'::numeric*2<>trunc('NaN'::numeric*2) c,'NaN'::numeric<=0 d")).rows[0], { a: false, b: false, c: false, d: false });
    const invalid = [
      [body(G[2], 'spread', 'away', 2.25, -110, 1), 'a quarter-point line'], [body(G[2], 'spread', 'away', 101, -110, 1), 'a spread beyond 100'], [body(G[2], 'total', 'over', 200.5, -110, 1), 'a total beyond 200'],
      [body(G[2], 'spread', 'away', 2.5, -110.5, 1), 'fractional odds'], [body(G[2], 'spread', 'away', 2.5, -50, 1), 'odds under 100'], [body(G[2], 'spread', 'away', 2.5, 10001, 1), 'odds over 10000'],
      [body(G[2], 'spread', 'away', 2.5, -110, 0), 'a zero stake'], [body(G[2], 'spread', 'away', 2.5, -110, -1), 'a negative stake'], [body(G[2], 'spread', 'away', 2.5, -110, 0.75), 'a quarter-unit stake'],
      [body(G[2], 'spread', 'away', 2.5, -110, 1, { quotedAt: iso(now + 60000) }), 'a quote from the future'], [body(G[2], 'spread', 'away', 2.5, -110, 1, { quotedAt: iso(now + 4 * 3600000) }), 'a quote after kickoff'],
      [body(G[2], 'spread', 'away', 2.5, -110, 1, { quotedAt: 'not a time' }), 'an unparseable quote time'], [body(G[2], 'spread', 'away', 'x', -110, 1), 'an unparseable line'],
      [body(G[2], 'spread', 'away', 2.5, -110, 1, { source: ' x ' }), 'a one-character source'], [body(G[2], 'spread', 'away', 2.5, -110, 1, { source: 'x'.repeat(121) }), 'a 121-character source'],
      [body(G[2], 'spread', 'away', 2.5, -110, 1, { extra: true }), 'an unknown key'], [body(G[2], 'spread', 'over', 2.5, -110, 1), 'a total side on a spread'], [body(G[2], 'total', 'home', 41, -110, 1), 'a spread side on a total'],
      [body('XX-YY', 'spread', 'away', 2.5, -110, 1), 'a game that is not on the slate'], [body(G[2], 'moneyline', 'away', 2.5, -110, 1), 'an unknown market'], [[valid], 'an array body'], [null, 'a null body'],
    ];
    for (const [value, label] of invalid) await assert.rejects(() => save(SEAN, rev, value), /GTL_VIRTUAL_INVALID/, label);
    await rejects(() => save(SEAN, rev, body(G[0], 'total', 'under', 41, -110, 1)), 'P0001', /GTL_VIRTUAL_CLOSED/);
    assert.deepEqual(await rows(SEAN), before); assert.equal(await revision(SEAN), rev, 'a refused call writes nothing and keeps the revision');
    // Boundary values the rules allow still save: a 100-point spread, a 200 total, +10000 odds, a half-unit stake and a trimmed source.
    assert.equal(await save(TROY, 0, body(G[2], 'spread', 'home', -100, 10000, 0.5, { source: '  FanDuel  ' })), 1);
    assert.equal(await save(TROY, 1, body(G[2], 'total', 'over', 200, -10000, 3.5)), 2);
    const troy = await rows(TROY);
    assert.deepEqual([pick(troy, G[2], 'spread').selection.source, pick(troy, G[2], 'spread').selection.riskDollars, pick(troy, G[2], 'total').selection.units, pick(troy, G[2], 'total').selection.riskDollars], ['FanDuel', 50, 3.5, 350]);
  });

  await t.test('(d) the conflict branch works through the function: an edit appends to the audit, and a settled pick re-saved returns to pending and is graded again', async () => {
    // A plain pre-kickoff edit (units only) keeps the placement, appends an edited event and counts the replacement stake only.
    assert.equal(await save(SEAN, 2, body(G[3], 'total', 'under', 47.5, -115, 1)), 3);
    const placed = pick(await rows(SEAN), G[3], 'total');
    assert.equal(await save(SEAN, 3, body(G[3], 'total', 'under', 47.5, -115, 2)), 4);
    const edited = pick(await rows(SEAN), G[3], 'total');
    assert.deepEqual([edited.status, edited.result, edited.selection.units, edited.selection.riskDollars, edited.audit.length, edited.audit[1].type], ['pending', null, 2, 200, 2, 'edited']);
    assert.deepEqual([edited.audit[1].before, edited.audit[1].after], [placed.selection, edited.selection]);
    assert.equal(edited.created_at.toISOString(), placed.created_at.toISOString()); assert.ok(edited.updated_at > placed.updated_at);
    assert.deepEqual([(await read(SEAN)).summary.qualificationPicks, (await read(SEAN)).summary.qualificationUnits], [3, 3.5], 'one qualifying pick at the replacement stake');
    // The scenario PR #33's settlement suite had to reproduce with a direct update: a cancellation recorded before kickoff
    // voids the pick; the player re-saves through the ordinary save path, which resets the row to pending; the identical
    // cancellation run again voids the re-saved pick as a fresh placement.
    const cancelled = await settle({ source: 'official notice', games: [{ gameId: G[1], status: 'cancelled' }] });
    assert.deepEqual([cancelled.settled, cancelled.picksSettled], [1, 2]);
    let spread = pick(await rows(SEAN), G[1], 'spread');
    assert.deepEqual([spread.status, spread.result.reason, spread.result.version, spread.audit.map(event => event.type)], ['void', 'cancelled', 1, ['placed', 'settled']]);
    assert.equal(await save(SEAN, 4, body(G[1], 'spread', 'home', -4, -105, 1.5)), 5);
    spread = pick(await rows(SEAN), G[1], 'spread');
    assert.deepEqual([spread.status, spread.result, spread.selection.line, spread.selection.odds, spread.selection.units, spread.audit.map(event => event.type)], ['pending', null, -4, -105, 1.5, ['placed', 'settled', 'edited']]);
    assert.deepEqual([spread.audit[2].before.line, spread.audit[2].after, spread.audit[2].before.selectedAt < spread.audit[2].after.selectedAt], [-3.5, spread.selection, true]);
    assert.ok(spread.updated_at > spread.created_at);
    assert.deepEqual([pick(await rows(SEAN), G[1], 'total').status, (await read(SEAN)).summary.pending, (await read(SEAN)).summary.voids], ['void', 2, 1], 'the untouched total stays void');
    const repeat = await settle({ source: 'official notice', games: [{ gameId: G[1], status: 'cancelled' }] });
    assert.deepEqual([repeat.settled, repeat.corrected, repeat.unchanged, repeat.picksSettled], [0, 0, 1, 1]);
    assert.deepEqual(repeat.games, [{ gameId: G[1], status: 'cancelled', version: 1, changed: false, picksSettled: 1 }]);
    spread = pick(await rows(SEAN), G[1], 'spread');
    assert.deepEqual([spread.status, spread.result.reason, spread.result.version, spread.result.previous, Number(spread.result.returnedUnits), spread.audit.map(event => event.type)], ['void', 'cancelled', 1, null, 1.5, ['placed', 'settled', 'edited', 'settled']]);
    assert.equal((await db.query('select count(*)::int n from public.gtl_virtual_units_settlements')).rows[0].n, 1, 'still one ledger version');
  });

  await t.test('(e) the reader still returns results and settlement after the follow-up', async () => {
    const view = await read(SEAN);
    assert.deepEqual(Object.keys(view.results), [G[1]]);
    assert.deepEqual([view.results[G[1]].status, view.results[G[1]].home, view.results[G[1]].away, view.results[G[1]].version, view.results[G[1]].source], ['cancelled', null, null, 1, 'official notice']);
    assert.deepEqual([view.settlement.settledGames, view.settlement.settledPicks, view.settlement.pendingPicks], [1, 2, 1]);
    assert.ok(Number.isFinite(Date.parse(view.settlement.lastSettledAt)));
    assert.deepEqual(view.summary, { wins: 0, losses: 0, pushes: 0, pending: 1, voids: 2, riskUnits: 0, netUnits: 0, roi: null, qualificationPicks: 3, qualificationUnits: 4 });
    assert.deepEqual([view.revision, view.picks.map(row => `${row.gameId}/${row.market}:${row.status}`).sort()], [5, [`${G[1]}/spread:void`, `${G[1]}/total:void`, `${G[3]}/total:pending`].sort()]);
    const troy = await read(TROY);
    assert.deepEqual([troy.results, troy.settlement.settledGames, troy.summary.pending, troy.summary.qualificationUnits], [{ [G[1]]: view.results[G[1]] }, 1, 2, 4], 'results are per slate game, not per player');
  });
});
