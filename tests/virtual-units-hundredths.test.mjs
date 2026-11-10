import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { HOSTED, without } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable, storeBookLines } from './cloud-browser/community-world.mjs';
import { sendBallot, serviceSql } from './helpers/guess-week.mjs';
import { readVirtualUnitRules } from '../cloud/virtual-unit-rules.mjs';
import { FEATURE_OFF } from '../cloud/optional-rpc.mjs';
import { halfUnits, validVirtualUnits } from '../shared/virtual-unit-amount.mjs';

const migration = fs.readFileSync('supabase/migrations/20261108022135_gtl_virtual_units_hundredths.sql', 'utf8');
const rollback = fs.readFileSync('supabase/rollback/20261108022135_gtl_virtual_units_hundredths.sql', 'utf8');
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed.';
const names = ['gtl_save_virtual_units_pick', 'gtl_save_recommended_virtual_pick', 'gtl_place_bets'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('M-41 capabilities fail closed; only the explicit known version enables custom writes', async () => {
  for (const result of [FEATURE_OFF, null, {}, { hundredths: true }, { version: 2, hundredths: true }, { version: 1, hundredths: false }])
    assert.deepEqual(await readVirtualUnitRules(async () => result), { hundredths: false });
  assert.deepEqual(await readVirtualUnitRules(), { hundredths: false });
  assert.deepEqual(await readVirtualUnitRules(async () => { throw Error('offline'); }), { hundredths: false });
  assert.deepEqual(await readVirtualUnitRules(async () => ({ version: 1, hundredths: true })), { hundredths: true });
  for (const value of [0.01, 0.1, 0.29, 0.5, 0.99, 100, 100.5, 1000]) assert.equal(validVirtualUnits(value), true, String(value));
  for (const value of [null, '0.01', 0, -1, NaN, Infinity, 0.001, 0.019, 100.01, 0.010000000001, 0.999999999999, 99.999999999999]) assert.equal(validVirtualUnits(value), false, String(value));
  assert.equal(halfUnits(0.01), false);
  for (let cents = 1; cents <= 10000; cents++) assert.equal(validVirtualUnits(cents / 100), true, `canonical cent ${cents}`);
});

async function fixture(t) {
  // The upgrade and rollback contract starts from the schema just before M-41. M-41 is hosted since November 10, 2026
  // (RELEASE_2026_11_10_MIGRATIONS_M41_M47.md), so it is left out here and each test applies it itself.
  const world = await createCommunityWorld({ migrations: without(HOSTED, '20261108022135_gtl_virtual_units_hundredths.sql'), games: 2, troyBallots: false, groupScreens: true, virtualUnits: true, optionalRpc: true });
  t.after(() => world.db.close());
  const { db, state } = world, { season, week } = state.league, [g0, g1] = state.games.map(g => g.id);
  const lines = { spread: { [g0]: -3.5, [g1]: 6.5 }, total: { [g0]: 44.5, [g1]: 51.5 } };
  const quotedAt = await storeBookLines(world, lines);
  await sendBallot(world, 'luke', 'guess_spread', { [g0]: -7, [g1]: 3 });
  await sendBallot(world, 'luke', 'guess_total', { [g0]: 48, [g1]: 50 });
  const bet = (gameId, market, changes = {}) => ({ gameId, market, side: market === 'spread' ? 'home' : 'over', line: lines[market][gameId],
    odds: -110, units: 0.01, source: 'DraftKings', quotedAt, expected: null, ...changes });
  const place = (bets, requestId = randomUUID()) => world.api('luke', 'bets/place', { season, week, requestId, bets });
  const rows = async () => (await db.query('select * from public.gtl_virtual_units_picks order by user_id,season,week,game_id,market')).rows;
  const dataHash = async () => hash(await Promise.all([
    ...['gtl_virtual_units_picks','gtl_virtual_units_settlements','gtl_bet_receipts','gtl_weekly_ballots'].map(async table =>
      (await db.query(`select row_to_json(t) value from public.${table} t order by row_to_json(t)::text`)).rows),
    db.query('select row_to_json(ps) value from public.gtl_weekly_ballots b cross join lateral public.gtl_ballot_pick_scores(b.season,b.week,b.mode,b.ballot,b.audit) ps order by row_to_json(ps)::text').then(result => result.rows),
  ]));
  const bodies = async () => (await db.query('select proname,prosrc,proargnames,proargtypes::text from pg_proc where proname=any($1) order by proname',[names])).rows;
  return { world, db, season, week, g0, g1, bet, place, rows, dataHash, bodies };
}

test('recommendation API and SQL separate malformed amounts, unsupported cents and supported writes', { skip }, async t => {
  const f = await fixture(t), rpc = serviceSql(f.db);
  for (const hundredths of [false, true]) {
    if (hundredths) await f.db.exec(migration);
    const read = (await f.world.api('luke', 'bets/recommendations', {})).body;
    assert.equal(read.virtual.unitRules.hundredths, hundredths);
    const offer = read.virtual.games.find(game => game.id === f.g0).offers.spread.home;
    const pick = { gameId: f.g0, market: 'spread', side: 'home', line: offer.line, odds: offer.odds,
      units: 0.1, source: offer.book, quotedAt: offer.observedAt };
    const place = patch => f.world.api('luke', 'bets/recommendations/place', {
      ...pick, ...patch, season: f.season, week: f.week, revision: read.virtual.revision,
    });
    const sql = patch => rpc('gtl_save_recommended_virtual_pick', { p_user: ACCOUNTS.luke.id, p_season: f.season,
      p_week: f.week, p_revision: read.virtual.revision, p_body: { ...pick, source: offer.source, ...patch } });
    const before = await f.dataHash();
    for (const units of [0, -1, '0.1', 0.001, 0.010000000001, 0.999999999999, 100.01]) {
      assert.equal((await place({ units })).status, 400, String(units));
      await assert.rejects(() => sql({ units }), /GTL_VIRTUAL_INVALID/);
    }
    assert.equal(await f.dataHash(), before, 'malformed API and direct SQL attempts preserve picks, audits, receipts, ballots and scores');
    if (!hundredths) {
      assert.equal((await place({})).status, 409, 'valid cents need M-41 capability');
      await assert.rejects(() => sql({}), /GTL_VIRTUAL_INVALID/);
      assert.equal(await f.dataHash(), before, 'old SQL and the API refuse unsupported cents without writes');
    } else {
      const saved = await place({});
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const row = (await f.rows()).find(row => row.game_id === f.g0 && row.market === 'spread');
      assert.equal(row.selection.units, 0.1);
      assert.equal(row.audit.length, 1);
      assert.equal(row.audit[0].type, 'placed');
    }
    const current = (await f.world.api('luke', 'bets/recommendations', {})).body.virtual;
    const gameId = hundredths ? f.g1 : f.g0, halfOffer = current.games.find(game => game.id === gameId).offers.total.over;
    const half = await f.world.api('luke', 'bets/recommendations/place', { season: f.season, week: f.week, revision: current.revision,
      gameId, market: 'total', side: 'over', line: halfOffer.line, odds: halfOffer.odds, units: 0.5,
      source: halfOffer.book, quotedAt: halfOffer.observedAt });
    assert.equal(half.status, 200, JSON.stringify(half.body));
    assert.equal((await f.rows()).find(row => row.game_id === gameId && row.market === 'total').selection.units, 0.5);
  }
});

test('M-41 upgrades all three writers, preserves exact history and rollback keeps custom saved rows', { skip }, async t => {
  const f = await fixture(t);
  const oldBodies = await f.bodies();
  assert.equal((await f.world.api('luke', 'bets/read', {})).body.unitRules.hundredths, false);
  assert.equal((await f.place([f.bet(f.g1, 'spread')])).status, 409, 'new API + old SQL refuses custom without writing');
  assert.equal((await f.place([f.bet(f.g1, 'total', { units: 100.5 })])).status, 200, 'legacy half stakes above the screen maximum still work before apply');
  const before = await f.dataHash();
  await f.db.exec(migration);
  assert.equal(await f.dataHash(), before, 'apply changes no pick, audit, receipt, ballot, score or result');
  assert.equal((await f.rows()).find(row => row.game_id === f.g1 && row.market === 'total').selection.units, 100.5);
  await f.db.exec(migration);
  assert.equal(await f.dataHash(), before, 'apply is idempotent');
  assert.equal((await f.world.api('luke', 'bets/read', {})).body.unitRules.hundredths, true);
  for (const signature of ['gtl_virtual_unit_rules()', 'gtl_virtual_units_supported(numeric)']) {
    for (const role of ['anon','authenticated','service_role'])
      assert.equal((await f.db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,`public.${signature}`])).rows[0].ok, role === 'service_role');
  }
  assert.deepEqual((await f.db.query('select proname,count(*)::int n,bool_or(prosecdef) definer from pg_proc where proname=any($1) group by proname',[names])).rows.map(row => [row.n,row.definer]), [[1,false],[1,false],[1,false]]);
  assert.equal((await f.db.query('select count(*)::int n from generate_series(1,10000) cents where not public.gtl_virtual_units_supported(cents::numeric/100)')).rows[0].n, 0, 'SQL accepts every canonical cent amount');
  for (const value of ['0.01','0.29','99.99','100','100.5','1000','1e100','0','-0.01','0.001','100.01','0.010000000001','0.999999999999','99.999999999999','5e-324','NaN','Infinity','-Infinity'])
    assert.equal((await f.db.query('select public.gtl_virtual_units_supported($1::numeric) ok',[value])).rows[0].ok, validVirtualUnits(Number(value)), value);

  const group = f.bet(f.g0, 'spread', { units: 0.29, source: 'draftkings' }); delete group.expected;
  assert.equal((await f.world.api('luke', 'virtual-pick', group)).status, 200, 'group route accepts cents with capability');
  const read = (await f.world.api('luke', 'bets/recommendations', {})).body;
  assert.equal(read.virtual.unitRules.hundredths, true);
  const offer = read.virtual.games.find(game => game.id === f.g0).offers.total.over;
  const recommended = f.bet(f.g0, 'total', { source: offer.book, line: offer.line, odds: offer.odds, quotedAt: offer.observedAt }); delete recommended.expected;
  const saved = await f.world.api('luke', 'bets/recommendations/place', { ...recommended, season: f.season, week: f.week, revision: read.virtual.revision });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const requestId = randomUUID(), slip = [f.bet(f.g1, 'spread')];
  assert.equal((await f.place(slip, requestId)).status, 200);
  const placedHash = await f.dataHash();
  assert.equal((await f.place(slip, requestId)).body.placed.replayed, true);
  assert.equal(await f.dataHash(), placedHash, 'replay does not add receipts/audits');
  const existing = (await f.rows()).find(row => row.game_id === f.g1 && row.market === 'spread').selection;
  const expected = Object.fromEntries(['side','line','odds','units','source','quotedAt'].map(key=>[key,existing[key]]));
  const edit = f.bet(f.g1,'spread',{units:0.11,expected});
  assert.equal((await f.place([edit])).status, 200);
  assert.equal((await f.place([edit])).status, 409, 'cent stake stays in the exact expected-terms CAS');
  const safeHash = await f.dataHash();
  for (const amount of [0, -1, 0.001, 100.01, 0.010000000001, 0.999999999999]) assert.equal((await f.place([f.bet(f.g1,'spread',{units:amount,expected})])).status, 400);
  assert.equal(await f.dataHash(), safeHash, 'invalid amounts write nothing');
  await f.db.exec(rollback);
  assert.equal(await f.dataHash(), safeHash, 'rollback preserves all new cent picks and history');
  assert.deepEqual(await f.bodies(), oldBodies, 'all prior writer bodies/signatures restored byte for byte');
  const restoredRules = await f.db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query('select public.gtl_virtual_unit_rules() value')).rows[0].value; });
  assert.deepEqual(restoredRules,{version:1,hundredths:false},'rollback explicitly reports restored rules without a permission error');
  assert.equal((await f.world.api('luke', 'bets/read', {})).body.unitRules.hundredths, false);
  assert.equal((await f.place([f.bet(f.g1,'spread',{units:0.21,expected})])).status, 409);
  assert.equal((await f.rows()).find(row => row.game_id===f.g1 && row.market==='spread').selection.units, 0.11, 'saved custom row remains readable after rollback');
});

test('committed cent receipts replay through API during capability failure and after SQL rollback', { skip }, async t => {
  const f = await fixture(t);
  await f.db.exec(migration);
  const requestId = randomUUID(), slip = [f.bet(f.g1, 'spread')];
  // The server commits, but the caller does not receive/use the first response.
  const committed = await f.place(slip, requestId);
  assert.equal(committed.status, 200);
  const savedHash = await f.dataHash();
  await f.db.exec("create or replace function public.gtl_virtual_unit_rules() returns jsonb language plpgsql security invoker set search_path='' as $$ begin raise exception 'fixture capability outage'; end $$");
  const unavailable = await f.place(slip, requestId);
  assert.equal(unavailable.status, 200, JSON.stringify(unavailable.body));
  assert.equal(unavailable.body.placed.replayed, true);
  assert.equal(unavailable.body.bets.unitRules.hundredths, false);
  assert.equal(await f.dataHash(), savedHash);
  await f.db.exec(rollback);
  const replay = await f.place(slip, requestId);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.placed.replayed, true);
  assert.equal(replay.body.bets.unitRules.hundredths, false);
  assert.equal((await f.place(slip)).status, 409, 'new unsupported write is refused by restored SQL');
  const changed = await f.place([f.bet(f.g1, 'spread', { units: 0.11 })], requestId);
  assert.equal(changed.status, 409);
  assert.match(changed.body.error, /already used/);
  const foreign = await f.world.api('troy', 'bets/place', { season:f.season, week:f.week, requestId, bets:slip });
  assert.equal(foreign.status, 409);
  assert.equal(foreign.body.placed, undefined, 'another account cannot replay the receipt');
  assert.equal(await f.dataHash(), savedHash, 'replay and refused writes leave all rows and audits unchanged');
});

test('existing D-26 settlement keeps four-place win profit, exact losses/returns and replay for cent stakes', { skip }, async t => {
  const now = Date.now(), stamp = new Date(now - 3 * 3600_000).toISOString();
  const world = await createCommunityWorld({ migrations: HOSTED, games: 2, troyBallots: false,
    prepare: state => { state.league.deadline = stamp; state.games.forEach(game => { game.kickoff = new Date(now - 3600_000).toISOString(); }); } });
  t.after(() => world.db.close());
  const { db, state } = world, { season, week } = state.league, [g0,g1] = state.games.map(game => game.id);
  const seed = async (who, game, market, side, line) => {
    await db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing',[ACCOUNTS[who].id,season,week]);
    const selection = { gameId:game, market, side, line, odds:-110, units:0.01, source:'DraftKings', quotedAt:stamp, selectedAt:stamp, riskDollars:1 };
    await db.query("insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection,audit,created_at,updated_at) values($1,$2,$3,$4,$5,$6,'[]',$7,$7)", [ACCOUNTS[who].id,season,week,game,market,selection,stamp]);
  };
  await seed('luke',g0,'spread','home',-3.5);
  await seed('troy',g0,'spread','away',3.5);
  await seed('sean',g0,'total','over',45);
  await seed('luke',g1,'total','over',44.5);
  const snapshot = async () => (await db.query('select * from public.gtl_virtual_units_picks order by user_id,game_id,market')).rows;
  const before = await snapshot();
  await db.exec(migration);
  assert.deepEqual(await snapshot(),before);
  const results = { source:'Local fixture',sourceUrl:'https://example.invalid/finals.csv',observedAt:new Date(now-60_000).toISOString(),actorId:ACCOUNTS.sean.id,
    games:[{gameId:g0,status:'final',home:31,away:14},{gameId:g1,status:'postponed'}] };
  const settle = () => db.transaction(async tx => { await tx.exec('set local role service_role'); return tx.query('select public.gtl_settle_virtual_units($1,$2,$3)',[season,week,results]); });
  await settle();
  const settled = await snapshot();
  const outcome = status => settled.find(row=>row.status===status);
  assert.equal(outcome('win').result.netUnits,0.0091);
  assert.equal(outcome('win').result.returnedUnits,0.0191);
  assert.equal(outcome('loss').result.netUnits,-0.01);
  assert.equal(outcome('loss').result.returnedUnits,0);
  for(const status of ['push','void']) { assert.equal(outcome(status).result.netUnits,0); assert.equal(outcome(status).result.returnedUnits,0.01); }
  assert.deepEqual(settled.map(row=>row.selection),before.map(row=>row.selection),'settlement never rewrites saved terms');
  await settle();
  assert.deepEqual(await snapshot(),settled,'replayed verified finals do not add an audit/result');
  await db.exec(rollback);
  assert.deepEqual(await snapshot(),settled,'rollback preserves nonempty settled-result and history hashes');
});
