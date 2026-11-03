// D-69 sections 7 and 8: signing out or switching accounts clears what this device remembers of the moments (the seen
// record and the count-ups' last values) and makes the next screen a launch again. Fixture keys only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetMomentsDevice } from '../web/src/next/moments/forget.js';
import { clearCountUpSeen, countUpKey } from '../web/src/next/moments/countUp.js';
import { momentsKey } from '../web/src/next/moments/seen.js';
import { hasNavigated, isSettled, markNavigated, markSettled, resetLaunch } from '../web/src/next/moments/launch.js';

const memory = () => {
  const map = new Map();
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k),
    key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
};
const blocked = { get length() { throw new Error('SecurityError'); }, key() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
function device() {
  const store = memory();
  store.setItem(momentsKey('acct-1'), JSON.stringify(['source:features:community', 'badge:community:k1']));
  store.setItem(momentsKey('acct-2'), JSON.stringify(['source:default']));
  store.setItem(countUpKey('acct-1', 'community.guess_spread.season.acct-1'), '20');
  store.setItem(countUpKey('acct-2', 'community.guess_total.season.acct-9'), '4');
  for (const [key, value] of [['gtl.app', 'next'], ['gtl.theme', 'dark'], ['gtl.next.countUpish', '1'], ['other', 'x']]) store.setItem(key, value);
  return store;
}
const OTHERS = ['gtl.app', 'gtl.next.countUpish', 'gtl.theme', 'other'];

test('forget: clears every account\'s moments and count-up records, keeps other gtl. keys, and resets both launch signals', () => {
  const store = device();
  markSettled();
  markNavigated();
  forgetMomentsDevice(store);
  assert.deepEqual([...store.map.keys()].sort(), OTHERS);
  assert.equal(isSettled(), false, 'the next account starts on a launch');
  assert.equal(hasNavigated(), false, 'and on the launch screen');
});

test('forget: without a storage argument it clears the device\'s own localStorage', () => {
  const store = device();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  try {
    forgetMomentsDevice();
    assert.deepEqual([...store.map.keys()].sort(), OTHERS);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
    resetLaunch();
  }
});

test('clearCountUpSeen: only gtl.next.countUp.v1. keys go; blocked or missing storage is a no-op', () => {
  const store = device();
  clearCountUpSeen(store);
  assert.deepEqual([...store.map.keys()].sort(), [momentsKey('acct-1'), momentsKey('acct-2'), ...OTHERS].sort());
  assert.doesNotThrow(() => clearCountUpSeen(blocked));
  assert.doesNotThrow(() => clearCountUpSeen(null));
  assert.doesNotThrow(() => forgetMomentsDevice(blocked));
});
