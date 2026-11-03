// D-69 step 1, Guess the Points on Play (Sean's P4A and P1B, November 3, 2026): the "Guess the Points exact" moment
// (web/src/next/play/points/pointsMoments.js) through the real moments engine. Fixture players and values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isExact } from '../web/src/next/play/points/pointsModel.js';
import { pointsMoments, pointsSource } from '../web/src/next/play/points/pointsMoments.js';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';

const slot = (name, patch = {}) => ({ slot: name, name: `Fixture ${name} Player`, team: 'PIT', gameKey: '2026_07_PIT_CLE', kickoff: '2026-10-25T17:00:00Z',
  closed: false, state: 'open', actual: null, revealed: false, own: null, house: null, lockedIn: [], guesses: [], ...patch });
const own = (guess, patch = {}) => ({ guess, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: null, ...patch });
const scored = (name, guess, actual, patch = {}) => slot(name, { closed: true, state: 'scored', actual, revealed: true, own: own(guess, { points: Math.max(0, 10 - Math.abs(guess - actual)) }), ...patch });
const week = (slots, patch = {}) => ({ season: 2026, week: 7, status: 'open', result: { status: 'PROVISIONAL', maximum: 50, points: null }, standings: { week: [], season: [] }, slots, ...patch });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig({ storage = memory(), settled = false, navigated = settled } = {}) {
  const big = [], small = [];
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => settled, hasNavigated: () => navigated, onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => fn() });
  return { engine, big, small, storage };
}
const SOURCE = pointsSource(null);

test('exact: a scored slot whose locked whole-number guess is its actual; a miss, a draft, a pending or void slot is not', () => {
  assert.equal(isExact(scored('QB', 18, 18)), true);
  for (const miss of [scored('QB', 18, 18.1), scored('QB', 18, 17.9), scored('QB', 18, 18, { own: own(18, { locked: false }) }),
    slot('QB', { closed: true, state: 'pending', own: own(18) }), slot('QB', { state: 'void', actual: null, own: own(18) }), slot('QB', { own: own(18) })]) {
    assert.equal(isExact(miss), false, JSON.stringify(miss.own) + miss.state + miss.actual);
  }
});

test('pointsMoments: one big Points moment per exact slot, from a read only; a save reply, an unopened week or a miss gives none', () => {
  const read = week([scored('QB', 21, 21), scored('RB', 12, 9.2), slot('WR', { own: own(15, { locked: false }) })]);
  const moments = pointsMoments(read);
  assert.deepEqual(moments.map(m => [m.id, m.kind, m.scopes]), [['points-exact:2026:7:QB', 'pointsExact', [SCOPES.points]]]);
  assert.equal(sizeOf(moments[0].kind), 'big', 'D-69: Guess the Points exact is a big moment');
  assert.equal(moments[0].title, 'Exact guess');
  assert.equal(moments[0].meta, 'Week 7 · QB · Fixture QB Player · 21 points');
  assert.equal(typeof moments[0].icon, 'string');
  // A lock-in's own answer is not a read (rule 1: a request still pending confirms nothing), nor is a 404 or an unopened week.
  for (const reply of [{ season: 2026, week: 7, slot: 'QB', guess: 21, locked: true }, null, { status: 'unopened', slots: [] }, week([scored('RB', 12, 9.2)])]) {
    assert.deepEqual(pointsMoments(reply), []);
  }
  assert.equal(pointsSource(null), 'points:community');
  assert.equal(pointsSource('g1'), 'points:g1');
});

test('engine: an exact guess scored while you were away waits as NEW for the Points tile and plays once when the ballot opens, never on page load', () => {
  const storage = memory();
  const first = rig({ storage });
  first.engine.report(pointsMoments(week([slot('QB', { own: own(21) })])), { source: SOURCE });
  assert.equal(first.engine.newCount(SCOPES.points), 0, 'this device’s first Points read seeds silently');
  // A later launch: the stats landed while the member was away.
  const launch = rig({ storage });
  const close = launch.engine.open(SCOPES.points); // the ballot open at launch (a reload at #play/points)
  launch.engine.report(pointsMoments(week([scored('QB', 21, 21)])), { source: SOURCE });
  assert.deepEqual(launch.big, [], 'never on page load');
  assert.equal(launch.engine.newCount(SCOPES.points), 1, 'NEW on the Points tile');
  assert.equal(launch.engine.newCount(SCOPES.play), 0, 'no other tile counts it');
  close();
  // The member taps the tile: the ballot opens after the launch and the moment plays, once.
  const opened = rig({ storage, settled: true });
  opened.engine.report(pointsMoments(week([scored('QB', 21, 21)])), { source: SOURCE });
  assert.deepEqual(opened.big, []);
  opened.engine.open(SCOPES.points);
  assert.deepEqual(opened.big, [['points-exact:2026:7:QB']]);
  assert.equal(opened.engine.newCount(SCOPES.points), 0);
  opened.engine.report(pointsMoments(week([scored('QB', 21, 21)])), { source: SOURCE });
  assert.deepEqual(opened.big, [['points-exact:2026:7:QB']], 'never replays');
});

test('engine: an exact guess that arrives while the ballot is open plays in place; a miss stays quiet', () => {
  const r = rig({ settled: true });
  r.engine.report(pointsMoments(week([slot('QB', { own: own(21) }), slot('RB', { own: own(12) })])), { source: SOURCE });
  r.engine.open(SCOPES.points);
  r.engine.report(pointsMoments(week([scored('QB', 21, 18.4), slot('RB', { own: own(12) })])), { source: SOURCE });
  assert.deepEqual([r.big, r.small, r.engine.newCount(SCOPES.points)], [[], [], 0], 'a miss by 2.6: the number updates, nothing pops');
  r.engine.report(pointsMoments(week([scored('QB', 21, 18.4), scored('RB', 12, 12)])), { source: SOURCE });
  assert.deepEqual(r.big, [['points-exact:2026:7:RB']]);
});
