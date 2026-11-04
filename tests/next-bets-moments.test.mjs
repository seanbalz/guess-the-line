// D-69 step 4, the moments table's "Tracked bet wins" (small) and "Loss" (quiet). Contracts: only your own ticket settled
// as a win is a candidate (never a loss, push, void, pending ticket or another player's); it waits on its own ticket's card
// and counts on the My bets tile; on the real engine it seeds on this device's first read, waits as NEW in a later
// session, never plays on a card opened on the launch screen, plays once on its own card after a navigation, never on
// another ticket's card and never again. And a placement's confirmation: only a fresh read that holds your sent terms,
// and only the read that starts after the write (the reply on screen, or one already on its way, confirms nothing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { MOMENTS, SCOPES, ticketScope } from '../web/src/next/moments/catalog.js';
import { BET_WIN_SOURCE, betWinId, betWinMoments } from '../web/src/next/bets/betMoments.js';
import { confirmedPlacements, placementStep } from '../web/src/next/bets/place.js';

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002';
const ticket = (id, outcome, ownerId = LUKE, extra = {}) => ({ id, ownerId, outcome, kind: 'single', legs: [{}], ...extra });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage, { settled = false, navigated = false } = {}) {
  const small = [];
  const engine = createMomentsEngine({ account: LUKE, storage, isSettled: () => settled, hasNavigated: () => navigated, onBig: () => assert.fail('a tracked win is small'), onSmall: m => small.push(m.id), setTimer: fn => { fn(); return 0; } });
  return { engine, small };
}
const report = (engine, entries) => engine.report(betWinMoments({ entries }, LUKE), { source: BET_WIN_SOURCE });

test('candidates: your own tickets settled as a win, each on its own card and the My bets tile; nothing else', () => {
  const summary = { entries: [ticket('a', 'win'), ticket('b', 'loss'), ticket('c', 'push'), ticket('d', 'void'), ticket('e', 'pending'), ticket('f', 'win', TROY), ticket('g', 'win', LUKE, { kind: 'parlay', legs: [{}, {}, {}] })] };
  const found = betWinMoments(summary, LUKE);
  assert.deepEqual(found.map(m => m.id), [betWinId('a'), betWinId('g')]);
  assert.deepEqual(found[0].scopes, [ticketScope('a'), SCOPES.bets]);
  assert.deepEqual(found.map(m => m.title), ['Tracked bet won', '3-leg parlay won']);
  assert.equal(MOMENTS[found[0].kind], 'small');
  for (const empty of [null, {}, { entries: null }]) assert.deepEqual(betWinMoments(empty, LUKE), []);
  assert.deepEqual(betWinMoments(summary, ''), [], 'no viewer, no moment');
});

test('engine: this device’s first read seeds; a later session’s new win waits as NEW and never plays on a card opened at launch', () => {
  const storage = memory(), first = rig(storage);
  report(first.engine, [ticket('a', 'win')]);
  assert.equal(first.engine.newCount(SCOPES.bets), 0, 'a first sighting shows the result as it is');
  first.engine.dispose();
  const next = rig(storage);
  next.engine.open(ticketScope('b')); // a Roomy card on the launch screen (a reload at #bets/active)
  report(next.engine, [ticket('a', 'win'), ticket('b', 'win')]);
  assert.equal(next.engine.newCount(SCOPES.bets), 1);
  assert.deepEqual(next.small, [], 'never on launch');
});

test('engine: it plays once on its own card after a navigation, never on another ticket’s card, and never again on this device', () => {
  const storage = memory();
  report(rig(storage).engine, []); // seeded empty
  const r = rig(storage, { settled: true, navigated: true });
  report(r.engine, [ticket('a', 'win'), ticket('b', 'win')]);
  r.engine.open(ticketScope('zzz'));
  assert.deepEqual(r.small, [], 'another ticket’s card plays nothing');
  r.engine.open(ticketScope('b'));
  assert.deepEqual(r.small, [betWinId('b')]);
  assert.equal(r.engine.newCount(SCOPES.bets), 1, 'a still waits for its own card');
  r.engine.dispose();
  const again = rig(storage, { settled: true, navigated: true });
  report(again.engine, [ticket('a', 'win'), ticket('b', 'win')]);
  again.engine.open(ticketScope('b'));
  assert.deepEqual(again.small, [], 'never replays');
});

test('a placement is confirmed only by a fresh read that holds your sent terms', () => {
  const sent = [{ gameId: 'SEA-DEN', market: 'spread', side: 'home', line: -3, odds: -110, units: 2 }, { gameId: 'KC-BUF', market: 'total', side: 'over', line: 44.5, odds: -105, units: 1 }];
  const row = (userId, bet, change = {}) => ({ userId, gameId: bet.gameId, market: bet.market, selection: { side: bet.side, line: bet.line, odds: bet.odds, units: bet.units, ...change } });
  assert.deepEqual(confirmedPlacements({ bets: [row(LUKE, sent[0]), row(LUKE, sent[1])] }, LUKE, sent), ['SEA-DEN:spread', 'KC-BUF:total']);
  assert.deepEqual(confirmedPlacements({ bets: [row(LUKE, sent[0], { units: 3 }), row(TROY, sent[1])] }, LUKE, sent), [], 'other terms or another player confirm nothing');
  assert.deepEqual(confirmedPlacements(null, LUKE, sent), []);
});

test('a placement waits for the read that starts after its write; a failed read or other terms pop nothing', () => {
  const bets = [{ gameId: 'SEA-DEN', market: 'spread', side: 'home', line: -3, odds: -110, units: 2 }];
  const saved = { bets: [{ userId: LUKE, gameId: 'SEA-DEN', market: 'spread', selection: { side: 'home', line: -3, odds: -110, units: 2 } }] };
  const waiting = { id: 'r1', bets };
  assert.deepEqual(placementStep(null, { loading: false, data: saved }, LUKE), { waiting: null }, 'nothing placed, nothing waits');
  const before = placementStep(waiting, { loading: false, data: saved }, LUKE);
  assert.equal(before.waiting, waiting, 'a reply already on screen was read before the write');
  assert.equal('placed' in before, false);
  const reading = placementStep(waiting, { loading: true, data: null }, LUKE);
  assert.deepEqual(reading, { waiting: { ...waiting, reading: true } }, 'the read after the write is on its way: nothing yet');
  assert.equal(placementStep(reading.waiting, { loading: true, data: null }, LUKE).waiting, reading.waiting);
  const done = placementStep(reading.waiting, { loading: false, data: saved }, LUKE);
  assert.deepEqual([done.waiting, done.placed.id, [...done.placed.keys]], [null, 'r1', ['SEA-DEN:spread']]);
  assert.deepEqual(placementStep(reading.waiting, { loading: false, data: null, error: { status: 0 } }, LUKE), { waiting: null, placed: null }, 'a failed read pops nothing');
  assert.deepEqual(placementStep(reading.waiting, { loading: false, data: { bets: [] } }, LUKE), { waiting: null, placed: null }, 'a read without your terms pops nothing');
});
