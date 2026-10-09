import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';

// Optional disposable PostgreSQL runtime; never connects to the hosted project.
// Install: npm install --prefix .local/sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip below. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MIGRATIONS = [
  '20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql', '20261008200926_gtl_twelve_hour_odds_refresh.sql',
  '20261008240000_gtl_virtual_units.sql', '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql',
  '20261009170000_gtl_virtual_units_settlement.sql',
];
const SEAN = 30, TROY = 1, LUKE = 2;

test('D-26 virtual units settlement: sportsbook grading from saved terms, void, idempotence, corrections, late picks, qualification and RLS', { skip: PGlite ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.' }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to service_role;');
  const now = Date.now(), iso = value => new Date(value).toISOString();
  // Every game kicked off four hours ago except the fifth, which is still an hour away.
  const state = seed(); state.league.deadline = iso(now - 5 * 3600000);
  state.games.forEach((game, index) => { game.kickoff = iso(now - 4 * 3600000 + (index === 4 ? 5 * 3600000 : 0)); });
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file === MIGRATIONS[0]) {
      await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
      for (const n of [SEAN, TROY, LUKE]) await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner'),($2,'sean-troy-luke','troy','player'),($3,'sean-troy-luke','luke','player')", [id(SEAN), id(TROY), id(LUKE)]);
    }
  }
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const G = state.games.map(game => game.id);
  const selection = (gameId, market, side, line, odds, units) => ({ gameId, market, side, line, odds, units, source: 'DraftKings', quotedAt: iso(now - 6 * 3600000), selectedAt: iso(now - 5.5 * 3600000), riskDollars: units * 100 });
  await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,2026,5),($2,2026,5),($3,2026,5) on conflict do nothing', [id(SEAN), id(TROY), id(LUKE)]);
  const place = (user, value) => db.query("insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,audit,created_at,updated_at) values($1,2026,5,$2,$3,$4,'[]',$5,$5)", [id(user), value.gameId, value.market, value, iso(now - 5.5 * 3600000)]);
  await place(SEAN, selection(G[0], 'spread', 'home', -9.5, -110, 1));   // covers by 17 -> win +0.9091
  await place(SEAN, selection(G[1], 'spread', 'home', -3, -110, 1));     // lands exactly -> push
  await place(SEAN, selection(G[1], 'total', 'over', 44.5, -110, 1));    // 45 points -> win
  await place(SEAN, selection(G[2], 'spread', 'away', 3.5, 120, 2));     // loses by 10 -> loss -2
  await place(SEAN, selection(G[3], 'total', 'under', 50, -110, 1));     // postponed -> void
  await place(TROY, selection(G[0], 'spread', 'away', 9.5, -110, 1));    // loss
  await place(TROY, selection(G[2], 'total', 'over', 49.5, -110, 1));    // 50 points -> win by half a point
  const settle = (payload, season = 2026, week = 5, role = 'service_role') => as(role, 'select public.gtl_settle_virtual_units($1,$2,$3) value', [season, week, payload]).then(result => result.rows[0].value);
  const read = user => as('service_role', "select public.gtl_read_virtual_units($1,'sean-troy-luke') value", [id(user)]).then(result => result.rows[0].value);
  const rows = user => db.query('select game_id,market,selection,status,result,audit,created_at,updated_at from public.gtl_virtual_units_picks where user_id=$1 order by game_id,market', [id(user)]).then(result => result.rows);
  const ledger = () => db.query('select game_id,version,status,home,away,source,actor_id,previous,picks_settled from public.gtl_virtual_units_settlements order by game_id,version').then(result => result.rows);
  const pick = (list, gameId, market) => list.find(row => row.game_id === gameId && row.market === market);
  const finals = { source: 'nflverse fixture', sourceUrl: 'https://example.invalid/games.csv', observedAt: iso(now - 60000), actorId: id(SEAN), games: [
    { gameId: G[0], status: 'final', home: 31, away: 14 }, { gameId: G[1], status: 'final', home: 24, away: 21 },
    { gameId: G[2], status: 'final', home: 30, away: 20 }, { gameId: G[3], status: 'postponed' },
  ] };
  const before = await rows(SEAN), beforeRead = await read(SEAN);
  assert.deepEqual([beforeRead.summary.qualificationPicks, beforeRead.summary.qualificationUnits, beforeRead.summary.pending], [5, 6, 5]);
  assert.deepEqual(beforeRead.results, {}); assert.equal(beforeRead.settlement.lastSettledAt, null);

  await t.test('browser roles cannot read the ledger or call the settlement function; it is an invoker function', async () => {
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.gtl_virtual_units_settlements'::regclass")).rows[0].relrowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(() => as(role, 'select * from public.gtl_virtual_units_settlements'), /permission denied/);
      await assert.rejects(() => settle(finals, 2026, 5, role), /permission denied for function gtl_settle_virtual_units/);
    }
    assert.equal((await db.query("select prosecdef from pg_proc where proname='gtl_settle_virtual_units'")).rows[0].prosecdef, false);
    assert.deepEqual(await ledger(), [], 'a denied call wrote nothing');
    await assert.rejects(() => as('service_role', 'delete from public.gtl_virtual_units_settlements'), /permission denied/, 'the ledger is append-only even for the service role');
  });

  await t.test('refusals settle nothing: non-final status, missing or extra scores, early final, unpublished week, duplicates; an off-slate game is skipped, not refused', async () => {
    const cases = [
      [{ ...finals, games: [{ gameId: G[0], status: 'pending' }] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: G[0], status: 'in_progress', home: 7, away: 3 }] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: G[0], status: 'final', home: 31 }] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: G[0], status: 'final', home: 31.5, away: 14 }] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: G[0], status: 'final', home: 201, away: 14 }] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: G[3], status: 'postponed', home: 1, away: 0 }] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: G[0], status: 'final', home: 31, away: 14, extra: true }] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: G[4], status: 'final', home: 10, away: 3 }] }, /GTL_SETTLEMENT_EARLY/],
      [{ ...finals, games: [finals.games[0], finals.games[0]] }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, source: 'x' }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, sourceUrl: 'http://example.invalid/plain' }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, observedAt: iso(now + 3600000) }, /GTL_SETTLEMENT_INPUT/],
      [{ ...finals, games: [{ gameId: 'XX-YY', status: 'final', home: 1 }] }, /GTL_SETTLEMENT_INPUT/],
      [{ games: finals.games }, /GTL_SETTLEMENT_INPUT/],
      [finals.games, /GTL_SETTLEMENT_INPUT/],
    ];
    for (const [payload, expected] of cases) await assert.rejects(() => settle(payload), expected);
    await assert.rejects(() => settle(finals, 2026, 6), /GTL_SETTLEMENT_WEEK/);
    // A mixed payload with one bad row (here a final before kickoff) rolls back the good rows too.
    await assert.rejects(() => settle({ ...finals, games: [...finals.games, { gameId: G[4], status: 'final', home: 10, away: 3 }] }), /GTL_SETTLEMENT_EARLY/);
    // The public file carries every NFL game of the week while a published slate may be a subset or a game may have
    // moved weeks: a well-formed row for a game that is not on this slate settles nothing and blocks nothing.
    const offSlate = await settle({ ...finals, games: [{ gameId: 'XX-YY', status: 'final', home: 1, away: 2 }] });
    assert.deepEqual([offSlate.settled, offSlate.corrected, offSlate.unchanged, offSlate.picksSettled, offSlate.games, offSlate.skipped], [0, 0, 0, 0, [], ['XX-YY']]);
    assert.deepEqual(await ledger(), []);
    assert.deepEqual(await rows(SEAN), before);
  });

  await t.test('win, loss, push and void grade from the saved line and odds; the summary counts settled picks only', async () => {
    const result = await settle({ ...finals, games: [...finals.games, { gameId: 'XX-YY', status: 'final', home: 1, away: 2 }] });
    assert.deepEqual([result.settled, result.corrected, result.unchanged, result.picksSettled, result.skipped], [4, 0, 0, 7, ['XX-YY']], 'an off-slate row never holds up the rest of the week');
    assert.deepEqual(result.games.map(game => [game.gameId, game.status, game.version, game.changed, game.picksSettled]), [[G[0], 'final', 1, true, 2], [G[1], 'final', 1, true, 2], [G[2], 'final', 1, true, 2], [G[3], 'postponed', 1, true, 1]]);
    assert.deepEqual(result.players.map(player => [player.userId, player.picksSettled, Number(player.netUnitsDelta)]), [[id(TROY), 2, -0.0909], [id(SEAN), 5, -0.1818]]);
    const sean = await rows(SEAN), troy = await rows(TROY);
    assert.deepEqual(sean.map(row => [row.game_id, row.market, row.status, Number(row.result.netUnits)]), [[G[2], 'spread', 'loss', -2], [G[3], 'total', 'void', 0], [G[1], 'spread', 'push', 0], [G[1], 'total', 'win', 0.9091], [G[0], 'spread', 'win', 0.9091]]);
    assert.deepEqual(troy.map(row => [row.game_id, row.market, row.status, Number(row.result.netUnits)]), [[G[2], 'total', 'win', 0.9091], [G[0], 'spread', 'loss', -1]]);
    const win = pick(sean, G[0], 'spread');
    assert.deepEqual([win.result.outcome, win.result.status, win.result.home, win.result.away, Number(win.result.margin), Number(win.result.payoutDecimal), Number(win.result.returnedUnits), win.result.version, win.result.source, win.result.previous],
      ['win', 'final', 31, 14, 7.5, 1.9091, 1.9091, 1, 'nflverse fixture', null]);
    assert.equal(Number(pick(sean, G[2], 'spread').result.payoutDecimal), 2.2, '+120 converts to 2.2 decimal');
    const voided = pick(sean, G[3], 'total');
    assert.deepEqual([voided.result.outcome, voided.result.reason, voided.result.home, Number(voided.result.returnedUnits)], ['void', 'postponed', null, 1]);
    for (const [index, row] of sean.entries()) {
      assert.deepEqual(row.selection, before[index].selection, 'saved side, line, odds, units, source and quote/placement times are untouched');
      assert.equal(row.created_at.toISOString(), before[index].created_at.toISOString()); assert.equal(row.updated_at.toISOString(), before[index].updated_at.toISOString());
      assert.equal(row.audit.length, 1); assert.equal(row.audit[0].type, 'settled'); assert.equal(row.audit[0].before, null); assert.deepEqual(row.audit[0].after, row.result);
    }
    const summary = (await read(SEAN)).summary;
    assert.deepEqual(summary, { wins: 2, losses: 1, pushes: 1, pending: 0, voids: 1, riskUnits: 5, netUnits: -0.1818, roi: -3.64, qualificationPicks: 5, qualificationUnits: 6 });
    const view = await read(SEAN);
    assert.deepEqual(Object.keys(view.results).sort(), [G[0], G[1], G[2], G[3]].sort());
    assert.deepEqual([view.results[G[0]].status, view.results[G[0]].home, view.results[G[0]].away, view.results[G[0]].version, view.results[G[3]].status, view.results[G[3]].home], ['final', 31, 14, 1, 'postponed', null]);
    assert.deepEqual([view.settlement.settledGames, view.settlement.settledPicks, view.settlement.pendingPicks], [4, 5, 0]);
    assert.ok(Number.isFinite(Date.parse(view.settlement.lastSettledAt)));
    const troySummary = (await read(TROY)).summary;
    assert.deepEqual([troySummary.wins, troySummary.losses, troySummary.riskUnits, troySummary.netUnits, troySummary.roi], [1, 1, 2, -0.0909, -4.55]);
  });

  await t.test('re-running the same finals changes nothing', async () => {
    const sean = await rows(SEAN), log = await ledger(), view = await read(SEAN);
    const again = await settle({ ...finals, observedAt: iso(now - 1000), source: 'nflverse fixture (later fetch)' });
    assert.deepEqual([again.settled, again.corrected, again.unchanged, again.picksSettled, again.picks, again.skipped], [0, 0, 4, 0, [], []]);
    assert.ok(again.games.every(game => game.changed === false && game.version === 1));
    assert.deepEqual(await rows(SEAN), sean); assert.deepEqual(await ledger(), log); assert.deepEqual(await read(SEAN), view);
  });

  await t.test('a corrected final re-settles from the original saved terms with a before/after audit and a new ledger version', async () => {
    const corrected = await settle({ ...finals, games: [{ gameId: G[0], status: 'final', home: 23, away: 14 }] });
    assert.deepEqual([corrected.settled, corrected.corrected, corrected.unchanged, corrected.picksSettled], [0, 1, 0, 2]);
    assert.deepEqual(corrected.games[0].previous, { version: 1, status: 'final', home: 31, away: 14 });
    const sean = await rows(SEAN), troy = await rows(TROY);
    const flipped = pick(sean, G[0], 'spread');
    assert.deepEqual([flipped.status, Number(flipped.result.netUnits), flipped.result.version, flipped.result.previous], ['loss', -1, 2, { outcome: 'win', netUnits: 0.9091, version: 1 }]);
    assert.deepEqual(flipped.selection, before.find(row => row.game_id === G[0]).selection);
    assert.equal(flipped.audit.length, 2); assert.equal(flipped.audit[1].type, 'resettled'); assert.equal(flipped.audit[1].before.outcome, 'win'); assert.equal(flipped.audit[1].after.outcome, 'loss');
    assert.deepEqual([pick(troy, G[0], 'spread').status, Number(pick(troy, G[0], 'spread').result.netUnits)], ['win', 0.9091]);
    const log = await ledger();
    assert.deepEqual(log.filter(row => row.game_id === G[0]).map(row => [row.version, row.home, row.away, row.picks_settled, row.previous?.version ?? null]), [[1, 31, 14, 2, null], [2, 23, 14, 2, 1]]);
    const summary = (await read(SEAN)).summary;
    assert.deepEqual([summary.wins, summary.losses, summary.pushes, summary.voids, summary.riskUnits, summary.netUnits, summary.roi, summary.qualificationPicks, summary.qualificationUnits], [1, 2, 1, 1, 5, -2.0909, -41.82, 5, 6]);
    assert.equal((await read(SEAN)).results[G[0]].version, 2);
  });

  await t.test('a cancellation voids settled picks and a later verified final re-grades them; a postponed void is terminal for that placement', async () => {
    const cancelled = await settle({ ...finals, games: [{ gameId: G[1], status: 'cancelled' }] });
    assert.deepEqual([cancelled.corrected, cancelled.picksSettled], [1, 2]);
    let sean = await rows(SEAN);
    assert.deepEqual([pick(sean, G[1], 'spread').status, pick(sean, G[1], 'spread').result.reason, pick(sean, G[1], 'spread').audit.at(-1).type, pick(sean, G[1], 'total').status], ['void', 'cancelled', 'voided', 'void']);
    let summary = (await read(SEAN)).summary;
    assert.deepEqual([summary.wins, summary.losses, summary.pushes, summary.voids, summary.riskUnits, summary.netUnits, summary.qualificationPicks, summary.qualificationUnits], [0, 2, 0, 3, 3, -3, 5, 6]);
    const restored = await settle({ ...finals, games: [{ gameId: G[1], status: 'final', home: 24, away: 21 }] });
    assert.deepEqual([restored.corrected, restored.picksSettled, restored.games[0].version], [1, 2, 3]);
    sean = await rows(SEAN);
    assert.deepEqual([pick(sean, G[1], 'spread').status, pick(sean, G[1], 'total').status, pick(sean, G[1], 'total').result.previous.outcome, pick(sean, G[1], 'total').audit.length], ['push', 'win', 'void', 3]);
    // The postponed game later gets a final: the voided placement stays void; only a fresh pick (pending again) is graded.
    await place(TROY, selection(G[3], 'spread', 'home', -2.5, -110, 1.5));
    const played = await settle({ ...finals, games: [{ gameId: G[3], status: 'final', home: 20, away: 24 }] });
    assert.deepEqual([played.corrected, played.picksSettled, played.games[0].version, played.games[0].previous.status], [1, 1, 2, 'postponed']);
    sean = await rows(SEAN);
    assert.deepEqual([pick(sean, G[3], 'total').status, pick(sean, G[3], 'total').result.version, pick(sean, G[3], 'total').audit.length], ['void', 1, 1], 'the postponed void keeps its original credit and is never re-graded');
    assert.deepEqual([pick(await rows(TROY), G[3], 'spread').status, Number(pick(await rows(TROY), G[3], 'spread').result.netUnits)], ['loss', -1.5]);
    summary = (await read(SEAN)).summary;
    assert.deepEqual([summary.wins, summary.losses, summary.pushes, summary.voids, summary.pending, summary.qualificationPicks, summary.qualificationUnits], [1, 2, 1, 1, 0, 5, 6], 'weekly qualification is unchanged by every settlement');
    assert.deepEqual((await rows(SEAN)).map(row => row.selection), before.map(row => row.selection));
  });

  await t.test('the same finals again grade picks placed or re-saved since, half-unit stakes round once, and a small clock skew is clamped', async () => {
    // G[0] stands at version 2 (23-14). Luke's picks arrive behind that recorded final and must not stay pending.
    await place(LUKE, selection(G[0], 'spread', 'home', -8.5, -110, 0.5));   // covers by half a point -> win +0.4545, not the double-rounded 0.4546
    await place(LUKE, selection(G[0], 'total', 'over', 30.5, -110, 1.5));    // 37 points -> win +1.3636, not 1.3637
    const log = await ledger(), sean = await rows(SEAN), troy = await rows(TROY);
    const again = await settle({ ...finals, observedAt: iso(now + 120000), games: [{ gameId: G[0], status: 'final', home: 23, away: 14 }] });
    assert.deepEqual([again.settled, again.corrected, again.unchanged, again.picksSettled, again.skipped], [0, 0, 1, 2, []]);
    assert.deepEqual(again.games, [{ gameId: G[0], status: 'final', version: 2, changed: false, picksSettled: 2 }]);
    assert.deepEqual(again.players.map(player => [player.userId, player.picksSettled, Number(player.netUnitsDelta)]), [[id(LUKE), 2, 1.8181]]);
    const luke = await rows(LUKE);
    assert.deepEqual(luke.map(row => [row.market, row.status, Number(row.result.netUnits), Number(row.result.returnedUnits), Number(row.result.payoutDecimal), row.result.version, row.audit.length, row.audit[0].type]),
      [['spread', 'win', 0.4545, 0.9545, 1.9091, 2, 1, 'settled'], ['total', 'win', 1.3636, 2.8636, 1.9091, 2, 1, 'settled']]);
    assert.ok(Date.parse(luke[0].result.observedAt) <= Date.parse(luke[0].result.settledAt), 'a fetch time two minutes ahead of the database clock is clamped, not refused');
    assert.deepEqual(await ledger(), log, 'the same final writes no ledger version');
    assert.deepEqual(await rows(SEAN), sean); assert.deepEqual(await rows(TROY), troy);
    const lukeSummary = (await read(LUKE)).summary;
    assert.deepEqual([lukeSummary.wins, lukeSummary.pending, lukeSummary.riskUnits, lukeSummary.netUnits, lukeSummary.roi], [2, 0, 2, 1.8181, 90.91]);
    // A cancellation can be recorded before kickoff (G[4] is still an hour away). The player then re-saves at that
    // market through the ordinary save path, which resets the row to pending; the identical cancellation run again
    // must void the re-saved pick instead of leaving it pending forever.
    await place(SEAN, selection(G[4], 'spread', 'home', -2.5, -110, 1));
    const cancelled = await settle({ ...finals, games: [{ gameId: G[4], status: 'cancelled' }] });
    assert.deepEqual([cancelled.settled, cancelled.picksSettled, pick(await rows(SEAN), G[4], 'spread').status], [1, 1, 'void']);
    // The save path's conflict branch (gtl_save_virtual_units_pick: selection=excluded.selection, status='pending', result=null,
    // audit||edited event, updated_at=stamp) is reproduced directly: the hosted D-18 function calls isfinite() on numeric
    // values, which PostgreSQL does not define, so it cannot run under PGlite either (pre-existing; tracked separately).
    await db.query(`update public.gtl_virtual_units_picks set selection=selection||$3::jsonb,status='pending',result=null,updated_at=clock_timestamp(),
      audit=audit||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'type','edited','timestamp',clock_timestamp(),'before',selection,'after',selection||$3::jsonb))
      where user_id=$1 and season=2026 and week=5 and game_id=$2 and market='spread'`, [id(SEAN), G[4], JSON.stringify({ line: -3.5, selectedAt: iso(now) })]);
    let resaved = pick(await rows(SEAN), G[4], 'spread');
    assert.deepEqual([resaved.status, resaved.result, resaved.audit.at(-1).type], ['pending', null, 'edited']);
    const repeat = await settle({ ...finals, games: [{ gameId: G[4], status: 'cancelled' }] });
    assert.deepEqual([repeat.settled, repeat.corrected, repeat.unchanged, repeat.picksSettled], [0, 0, 1, 1]);
    assert.deepEqual(repeat.games, [{ gameId: G[4], status: 'cancelled', version: 1, changed: false, picksSettled: 1 }]);
    resaved = pick(await rows(SEAN), G[4], 'spread');
    assert.deepEqual([resaved.status, resaved.result.reason, resaved.result.version, resaved.audit.at(-1).type, resaved.audit.at(-1).before, Number(resaved.result.returnedUnits), Number(resaved.selection.line)], ['void', 'cancelled', 1, 'settled', null, 1, -3.5], 'a re-saved pick is a fresh placement: first grading, no previous outcome');
    assert.equal((await ledger()).filter(row => row.game_id === G[4]).length, 1, 'still one ledger version for the cancelled game');
    const seanSummary = (await read(SEAN)).summary;
    assert.deepEqual([seanSummary.pending, seanSummary.voids, seanSummary.qualificationPicks, seanSummary.qualificationUnits], [0, 2, 6, 7], 'nothing stays pending behind a recorded result; the voided placement keeps its qualification credit');
  });
});
