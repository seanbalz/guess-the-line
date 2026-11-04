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
import { confirmedPlacements, forKey, placementStep, pricesStale } from '../web/src/next/bets/place.js';

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002';
const SETTLED = '2026-11-03T12:00:00.000Z';
const ticket = (id, outcome, ownerId = LUKE, extra = {}) => ({ id, ownerId, outcome, kind: 'single', legs: [{}], settledAt: outcome === 'pending' ? null : SETTLED, ...extra });
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

// Review fix wave 1: the summary reads every week, but the shared seen record keeps only SEEN_CAP ids, so a win that is
// long settled must not be a candidate (once its id aged out of the record it would replay). Reference time is the read's
// server time, else the newest settlement among the viewer's tickets; never the device clock.
test('candidates: only wins settled within 14 days of the read’s server time', () => {
  const day = 86400000, now = Date.parse('2026-11-04T00:00:00.000Z');
  const at = days => new Date(now - days * day).toISOString();
  const entries = [ticket('old', 'win', LUKE, { settledAt: at(15) }), ticket('recent', 'win', LUKE, { settledAt: at(13) }), ticket('edge', 'win', LUKE, { settledAt: at(14) }), ticket('nodate', 'win', LUKE, { settledAt: null, updatedAt: null })];
  assert.deepEqual(betWinMoments({ now: new Date(now).toISOString(), entries }, LUKE).map(m => m.id), [betWinId('recent'), betWinId('edge')]);
  const viaUpdated = [ticket('u', 'win', LUKE, { settledAt: null, updatedAt: at(1) })];
  assert.deepEqual(betWinMoments({ now: new Date(now).toISOString(), entries: viaUpdated }, LUKE).map(m => m.id), [betWinId('u')], 'updatedAt stands in for settledAt');
});

test('candidates: without server time the newest settlement among the viewer’s tickets is the reference, never the device clock', () => {
  const day = 86400000, newest = Date.parse('2026-01-20T00:00:00.000Z'); // years before the device clock
  const at = days => new Date(newest - days * day).toISOString();
  const entries = [ticket('new', 'win', LUKE, { settledAt: at(0) }), ticket('week', 'win', LUKE, { settledAt: at(7) }), ticket('old', 'win', LUKE, { settledAt: at(30) }), ticket('loss', 'loss', LUKE, { settledAt: at(0) }), ticket('theirs', 'win', TROY, { settledAt: new Date(newest + 400 * day).toISOString() })];
  assert.deepEqual(betWinMoments({ entries }, LUKE).map(m => m.id), [betWinId('new'), betWinId('week')], 'another player’s newer ticket does not move the reference');
});

test('engine: a win aged out of the candidates after being seen never replays', () => {
  const storage = memory(), day = 86400000, now = Date.parse('2026-11-04T00:00:00.000Z');
  const fresh = ticket('a', 'win', LUKE, { settledAt: new Date(now - day).toISOString() });
  const first = rig(storage, { settled: true, navigated: true });
  report(first.engine, []); // seeded empty
  first.engine.dispose();
  const second = rig(storage, { settled: true, navigated: true });
  second.engine.report(betWinMoments({ now: new Date(now).toISOString(), entries: [fresh] }, LUKE), { source: BET_WIN_SOURCE });
  second.engine.open(ticketScope('a'));
  assert.deepEqual(second.small, [betWinId('a')]);
  second.engine.dispose();
  // 30 days on, the win is no longer a candidate; the record may have forgotten it, and it still plays nothing.
  const later = rig(storage, { settled: true, navigated: true }), off = now + 30 * day;
  const candidates = betWinMoments({ now: new Date(off).toISOString(), entries: [fresh] }, LUKE);
  assert.deepEqual(candidates, []);
  later.engine.report(candidates, { source: BET_WIN_SOURCE });
  later.engine.open(ticketScope('a'));
  assert.deepEqual(later.small, []);
});

test('place: stale prices are not placeable after a failed refresh; a scoped placement state follows its read key', () => {
  const data = { published: true }, err = { status: 0 };
  assert.equal(pricesStale({ error: err, data: null, loading: false }, data), true, 'failed refresh over a kept copy');
  assert.equal(pricesStale({ error: null, data: null, loading: true }, data), false, 'refreshing is its own state');
  assert.equal(pricesStale({ error: null, data, loading: false }, data), false, 'a fresh read clears it');
  assert.equal(pricesStale({ error: err, data: null, loading: false }, null), false, 'nothing kept: the failure screen stands alone');
  const held = { key: 'a:place:L1', id: 'r1', bets: [] };
  assert.equal(forKey(held, 'a:place:L1'), held);
  assert.equal(forKey(held, 'a:place:community'), null, 'a league switch drops the placement moment');
  assert.equal(forKey(null, 'x'), null);
});
