// D-69 moments engine: the launch guard and the engine that plays moments (web/src/next/moments). Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { armLaunch, isSettled, markSettled, onSettled, resetLaunch } from '../web/src/next/moments/launch.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES } from '../web/src/next/moments/catalog.js';

const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
const badge = id => ({ id, kind: 'badge', scopes: [SCOPES.features, SCOPES.home], title: id });
const streak = id => ({ id, kind: 'streak', scopes: [SCOPES.home], title: id });
function rig({ storage = memory(), settled = { value: false } } = {}) {
  const big = [], small = [], timers = [];
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => settled.value, onBig: ms => big.push(ms.map(x => x.id)), onSmall: x => small.push(x.id),
    setTimer: (fn, ms) => { timers.push(ms); fn(); } });
  return { engine, big, small, timers, settled, storage };
}

test('launch guard: settled only by the member\'s own press or key, once; tests and sign-in reset it', () => {
  resetLaunch();
  const handlers = {};
  const target = { addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: type => { delete handlers[type]; } };
  const disarm = armLaunch(target);
  let calls = 0; onSettled(() => { calls += 1; });
  assert.equal(isSettled(), false);
  handlers.pointerdown({ isTrusted: false });
  assert.equal(isSettled(), false, 'a script-made event is not the member');
  handlers.keydown({ isTrusted: true });
  assert.equal(isSettled(), true);
  markSettled();
  assert.equal(calls, 1, 'listeners hear it once');
  disarm();
  assert.deepEqual(Object.keys(handlers), []);
  resetLaunch();
  assert.equal(isSettled(), false);
});

test('engine: a first read seeds silently; a new badge at launch waits as NEW and plays when its card is opened after the launch', () => {
  const r = rig();
  r.engine.open(SCOPES.home);
  r.engine.report([badge('b1')]);
  assert.deepEqual(r.big, [], 'first read on this device: nothing plays');
  r.engine.report([badge('b1'), badge('b2')]);
  assert.deepEqual(r.big, [], 'never on page load');
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'marked NEW');
  r.settled.value = true;
  const close = r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['b2']], 'opening its card plays it');
  assert.equal(r.engine.newCount(SCOPES.features), 0);
  close();
  r.engine.report([badge('b1'), badge('b2')]);
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['b2']], 'never replays');
});

test('engine: after the launch a moment that arrives where you are plays in place; two big ones share one card; small ones 240 ms apart', () => {
  const r = rig({ settled: { value: true } });
  r.engine.report([]);
  r.engine.open(SCOPES.home);
  r.engine.report([badge('b1'), badge('b2'), streak('s1'), streak('s2')]);
  assert.deepEqual(r.big, [['b1', 'b2']]);
  assert.deepEqual(r.small, ['s1', 's2']);
  assert.deepEqual(r.timers, [0, 240]);
});

test('engine: the record survives a reload; another account starts its own; a quiet loss never waits', () => {
  const storage = memory();
  const a = rig({ storage, settled: { value: true } });
  a.engine.report([]);
  a.engine.open(SCOPES.features);
  a.engine.report([badge('b1'), { id: 'l1', kind: 'loss', scopes: [SCOPES.features], title: 'l1' }]);
  assert.deepEqual(a.big, [['b1']]);
  assert.equal(a.engine.newCount(SCOPES.features), 0, 'the loss is never pending');
  const reload = rig({ storage, settled: { value: true } });
  reload.engine.open(SCOPES.features);
  reload.engine.report([badge('b1')]);
  assert.deepEqual(reload.big, [], 'seen before the reload');
  const other = createMomentsEngine({ account: 'acct-2', storage, isSettled: () => true, onBig: () => assert.fail('a first read for a new account seeds'), onSmall: () => {} });
  other.open(SCOPES.features);
  other.report([badge('b9')]);
});

test('engine: subscribers hear NEW counts change; without an account nothing ever plays', () => {
  const r = rig();
  r.engine.report([]);
  let heard = 0; const off = r.engine.subscribe(() => { heard += 1; });
  r.engine.report([badge('b3')]);
  assert.ok(heard >= 1);
  off();
  const none = createMomentsEngine({ account: null, isSettled: () => true, onBig: () => assert.fail('no account'), onSmall: () => assert.fail('no account') });
  none.open(SCOPES.features);
  none.report([badge('b1')]);
  none.report([badge('b1'), badge('b2')]);
  assert.equal(none.newCount(SCOPES.features), 0);
});
