// M-11 / redesign stage 41: account-level Virtual Units placement. The real handler, every repo migration and PGlite
// (tests/cloud-browser/community-world.mjs). Contracts: one request places several bets atomically and edits until
// kickoff with a full audit; kickoff, the line lock, half units and the exact newest named-book quote are refused in
// SQL; a Guess autosave between the read and the place never causes a 409; an old /virtual-pick edit between the read
// and the place refuses with "This bet changed"; a replayed request id returns its first reply and writes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ALL, NOT_HOSTED, version } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable, storeBookLines } from './cloud-browser/community-world.mjs';
import { sendBallot } from './helpers/guess-week.mjs';

const MIGRATION = '20261028181000_gtl_bets_place.sql';
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed.';
const FUNCTIONS = ['gtl_place_bets(uuid,integer,integer,uuid,jsonb)', 'gtl_bets_newest_quote(integer,integer,jsonb,text,text,text,timestamptz)', 'gtl_bets_terms(jsonb)'];

test('M-11 is hosted (October 29 apply record, hosted version 20261029041843)', () => {
  assert.ok(ALL.includes(MIGRATION));
  assert.ok(!NOT_HOSTED.includes(version(MIGRATION)), 'removed from NOT_HOSTED by its apply record (Gate M step 8)');
});

async function placeWorld(t) {
  const world = await createCommunityWorld({ migrations: ALL, games: 2, troyBallots: false, groupScreens: true, virtualUnits: true });
  t.after(() => world.db.close());
  const { db, state } = world, { season, week } = state.league, [g0, g1] = state.games.map(g => g.id);
  const lines = { spread: { [g0]: -3.5, [g1]: 6.5 }, total: { [g0]: 44.5, [g1]: 51.5 } };
  const quotedAt = await storeBookLines(world, lines);
  const bet = (gameId, market, changes = {}) => ({ gameId, market, side: market === 'spread' ? 'home' : 'over', line: lines[market][gameId],
    odds: -110, units: 1, source: 'DraftKings', quotedAt, expected: null, ...changes });
  const place = (account, bets, requestId = randomUUID()) => world.api(account, 'bets/place', { season, week, requestId, bets });
  // The Spread bet on the first game, when there is one, comes first.
  const rows = async account => (await db.query('select game_id,market,selection,audit from public.gtl_virtual_units_picks where user_id=$1 order by game_id<>$2,market',
    [ACCOUNTS[account].id, g0])).rows;
  return { world, db, state, season, week, g0, g1, lines, quotedAt, bet, place, rows };
}

test('M-11 service-only table and functions deny browser roles', { skip }, async t => {
  const { db } = await placeWorld(t);
  for (const signature of FUNCTIONS) {
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', ['service_role', `public.${signature}`, 'EXECUTE'])).rows[0].ok, true);
    for (const role of ['anon', 'authenticated'])
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false, `${role} ${signature}`);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.gtl_bet_receipts'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated'])
    assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok', [role, 'public.gtl_bet_receipts', 'SELECT'])).rows[0].ok, false);
});

test('two bets place at once, an edit keeps the audit, and a replay writes nothing', { skip }, async t => {
  const f = await placeWorld(t);
  await sendBallot(f.world, 'luke', 'guess_spread', { [f.g0]: -7, [f.g1]: 3 });
  await sendBallot(f.world, 'luke', 'guess_total', { [f.g0]: 48, [f.g1]: 50 });
  const requestId = randomUUID(), slip = [f.bet(f.g0, 'spread', { units: 2 }), f.bet(f.g1, 'total', { units: 0.5 })];
  const first = await f.place('luke', slip, requestId);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.placed.bets.length, 2);
  assert.equal(first.body.placed.bets.every(row => row.edited === false), true);
  assert.equal(first.body.bets.bets.filter(row => row.userId === ACCOUNTS.luke.id).length, 2, 'the reply carries the fresh Bets read');
  assert.deepEqual((await f.rows('luke')).map(row => `${row.game_id}:${row.market}:${row.selection.units}`).sort(), [`${f.g0}:spread:2`, `${f.g1}:total:0.5`].sort());

  const replay = await f.place('luke', slip, requestId);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.placed.replayed, true);
  assert.equal((await f.rows('luke')).every(row => row.audit.length === 1), true, 'a replay adds no audit event');
  const reused = await f.place('luke', [f.bet(f.g1, 'spread')], requestId);
  assert.equal(reused.status, 409);
  assert.match(reused.body.error, /already used/);

  const saved = (await f.rows('luke'))[0].selection;
  const expected = { side: saved.side, line: saved.line, odds: saved.odds, units: saved.units, source: saved.source, quotedAt: saved.quotedAt };
  const edit = await f.place('luke', [f.bet(f.g0, 'spread', { units: 3, expected })]);
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.placed.bets[0].edited, true);
  const edited = (await f.rows('luke'))[0];
  assert.equal(edited.selection.units, 3);
  assert.deepEqual(edited.audit.map(event => event.type), ['placed', 'edited']);
  assert.equal(edited.audit[1].before.units, 2);

  const stale = await f.place('luke', [f.bet(f.g0, 'spread', { units: 1, expected })]);
  assert.equal(stale.status, 409, 'the terms the client read are no longer stored');
  assert.match(stale.body.error, /This bet changed/);
  const again = await f.place('luke', [f.bet(f.g1, 'total')]);
  assert.equal(again.status, 409, 'a bet the client thought new already exists');
  assert.match(again.body.error, /This bet changed/);
  assert.equal((await f.rows('luke'))[0].selection.units, 3, 'a refused request writes nothing');
});

test('one refused bet refuses the whole slip: line lock, half units, a stale quote and kickoff', { skip }, async t => {
  const f = await placeWorld(t);
  await sendBallot(f.world, 'luke', 'guess_spread', { [f.g0]: -7, [f.g1]: 3 });
  const locked = await f.place('luke', [f.bet(f.g0, 'spread'), f.bet(f.g0, 'total')]);
  assert.equal(locked.status, 409, 'Total is not locked in yet');
  assert.match(locked.body.error, /lock in/i);
  assert.deepEqual(await f.rows('luke'), [], 'the valid Spread bet in the same slip was not written');
  const quarter = await f.place('luke', [f.bet(f.g0, 'spread', { units: 0.25 })]);
  assert.equal(quarter.status, 400);
  const moved = await f.place('luke', [f.bet(f.g0, 'spread', { line: -4 })]);
  assert.equal(moved.status, 409, 'a line that is not the book’s newest quote');
  assert.match(moved.body.error, /quote/i);
  const priced = await f.place('luke', [f.bet(f.g0, 'spread', { odds: -105 })]);
  assert.equal(priced.status, 409);
  // Only this game's kickoff moves into the past; the slate keeps its other game.
  await f.db.query(`update public.gtl_weekly_slates set signature=jsonb_set(signature,'{games}',(select jsonb_agg(case when x->>'id'=$1
    then jsonb_set(x,'{kickoff}',to_jsonb(extract(epoch from now())::integer - 60)) else x end) from jsonb_array_elements(signature->'games') x))
    where season=$2 and week=$3`, [f.g0, f.season, f.week]);
  const started = await f.place('luke', [f.bet(f.g0, 'spread')]);
  assert.equal(started.status, 409);
  assert.match(started.body.error, /started/);
  assert.deepEqual(await f.rows('luke'), []);
});

test('a Guess autosave between the read and the place causes no 409', { skip }, async t => {
  const f = await placeWorld(t);
  await sendBallot(f.world, 'luke', 'guess_spread', { [f.g0]: -7, [f.g1]: 3 });
  const read = await f.world.api('luke', 'bets/read', {});
  assert.equal(read.status, 200);
  await sendBallot(f.world, 'luke', 'guess_total', { [f.g0]: 48 }, false);
  const placed = await f.place('luke', [f.bet(f.g0, 'spread')]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
});

test('an old /virtual-pick edit between the read and the place gives "This bet changed"', { skip }, async t => {
  const f = await placeWorld(t);
  await sendBallot(f.world, 'luke', 'guess_spread', { [f.g0]: -7, [f.g1]: 3 });
  const placed = await f.place('luke', [f.bet(f.g0, 'spread')]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  const read = (await f.rows('luke'))[0].selection;
  const expected = { side: read.side, line: read.line, odds: read.odds, units: read.units, source: read.source, quotedAt: read.quotedAt };
  const old = await f.world.api('luke', 'virtual-pick', { gameId: f.g0, market: 'spread', side: 'home', line: f.lines.spread[f.g0], odds: -110,
    units: 2.5, source: 'draftkings', quotedAt: f.quotedAt });
  assert.equal(old.status, 200, JSON.stringify(old.body));
  const changed = await f.place('luke', [f.bet(f.g0, 'spread', { units: 1.5, expected })]);
  assert.equal(changed.status, 409);
  assert.match(changed.body.error, /This bet changed/);
  assert.equal((await f.rows('luke'))[0].selection.units, 2.5, 'the old route’s edit stands');
});

test('bets-place and bets switches turn placement off; malformed slips are refused before SQL', { skip }, async t => {
  const f = await placeWorld(t);
  const { handleBets } = await import('../cloud/bets.mjs');
  const user = { id: ACCOUNTS.luke.id }, service = { rpc: () => assert.fail('no SQL for a refused request') };
  const body = { season: f.season, week: f.week, requestId: randomUUID(), bets: [f.bet(f.g0, 'spread')] };
  for (const name of ['bets', 'bets-place'])
    await assert.rejects(handleBets({ route: '/bets/place', body, user, service, featureOff: new Set([name]) }), error => error.status === 503);
  for (const bad of [{ ...body, requestId: 'x' }, { ...body, bets: [] }, { ...body, bets: [f.bet(f.g0, 'spread'), f.bet(f.g0, 'spread')] },
    { ...body, bets: [{ ...f.bet(f.g0, 'spread'), expected: undefined }] }, { ...body, bets: [f.bet(f.g0, 'spread', { source: 'draftkings' })] },
    { ...body, extra: 1 }])
    await assert.rejects(handleBets({ route: '/bets/place', body: JSON.parse(JSON.stringify(bad)), user, service }), error => error.status === 400);
});
