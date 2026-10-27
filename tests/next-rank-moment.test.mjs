import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../web/src/next/league/rankMoment.js';

// Design lane, item 2: the rank-change moment's rules (web/src/next/league/rankMoment.js). The toast and the arrow in a
// real browser are in tests/cloud-browser/next-design-home-league.spec.js.
function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
}

test('storage key: per account, league and market under gtl.; none without an account', () => {
  assert.equal(R.rankKey('u-1', 'community', 'guess_spread'), 'gtl.next.rank.v1.u-1.community.guess_spread');
  assert.equal(R.rankKey('u-1', null, 'guess_total'), 'gtl.next.rank.v1.u-1.community.guess_total');
  assert.notEqual(R.rankKey('u-1', 'community', 'guess_spread'), R.rankKey('u-1', 'community', 'guess_total'), 'Spread and Total are ranked apart');
  assert.notEqual(R.rankKey('u-1', 'g_1', 'guess_spread'), R.rankKey('u-1', 'community', 'guess_spread'));
  assert.equal(R.rankKey('', 'community', 'guess_spread'), null);
  assert.equal(R.rankKey(null, 'community', 'guess_spread'), null);
});

test('the first look on a device remembers the rank and says nothing', () => {
  assert.deepEqual(R.rankMoment(null, { rank: 3 }), { write: { rank: 3, from: null }, move: null, toast: null });
});

test('up: one "You moved up to 2nd" toast, the arrow says up 1, and the new rank is remembered with the old one', () => {
  const first = R.rankMoment({ rank: 3, from: null }, { rank: 2 });
  assert.deepEqual(first, { write: { rank: 2, from: 3 }, move: 1, toast: { text: 'You moved up to 2nd', tone: 'done' } });
  // Once per change: the same rank again (a re-render, a reload, the next visit) never toasts, and the arrow stays.
  const again = R.rankMoment(first.write, { rank: 2 });
  assert.deepEqual(again, { write: null, move: 1, toast: null });
});

test('down: a quiet "Down to 3rd" (plain tone, losses stay quiet), and the arrow says down 1', () => {
  assert.deepEqual(R.rankMoment({ rank: 2, from: null }, { rank: 3 }), { write: { rank: 3, from: 2 }, move: -1, toast: { text: 'Down to 3rd', tone: 'plain' } });
  assert.deepEqual(R.rankMoment({ rank: 1, from: 4 }, { rank: 5, tied: true }).toast, { text: 'Down to 5th, tied', tone: 'plain' });
});

test('unranked ("—") is not a rank: no toast, no arrow, and the rank last seen is kept', () => {
  assert.deepEqual(R.rankMoment({ rank: 2, from: 3 }, { rank: null }), { write: null, move: null, toast: null });
  assert.deepEqual(R.rankMoment({ rank: 2, from: 3 }, { rank: 0 }), { write: null, move: null, toast: null }, 'never a rank 0');
});

test('ordinals in words', () => {
  const cases = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd', 101: '101st', 111: '111th', 112: '112th' };
  for (const [n, word] of Object.entries(cases)) assert.equal(R.ordinal(Number(n)), word);
  assert.equal(R.rankToast(4, 1).text, 'You moved up to 1st');
  assert.equal(R.rankToast(4, 2, true).text, 'You moved up to 2nd, tied');
});

test('Home reads the arrow without spending the moment: peekMove never writes, and matches what the board will show', () => {
  assert.equal(R.peekMove(null, { rank: 2 }), null);
  assert.equal(R.peekMove({ rank: 4, from: null }, { rank: 2 }), 2, 'a change the board has not toasted yet');
  assert.equal(R.peekMove({ rank: 2, from: 4 }, { rank: 2 }), 2, 'the last change, after the board toasted it');
  assert.equal(R.peekMove({ rank: 2, from: null }, { rank: 2 }), null);
  assert.equal(R.peekMove({ rank: 2, from: 1 }, { rank: null }), null);
  for (const [stored, rank] of [[{ rank: 4, from: null }, 2], [{ rank: 2, from: 3 }, 2], [{ rank: 1, from: null }, 3]]) {
    assert.equal(R.peekMove(stored, { rank }), R.rankMoment(stored, { rank }).move, JSON.stringify(stored));
  }
});

test('storage: { rank, from } round-trips; anything unreadable is null, and only a real rank is written', () => {
  const store = memoryStorage({ junk: '{', zero: JSON.stringify({ rank: 0 }), text: JSON.stringify({ rank: '2' }) });
  R.writeRank('k', { rank: 2, from: 3 }, store);
  assert.deepEqual(R.readRank('k', store), { rank: 2, from: 3 });
  R.writeRank('k2', { rank: 2, from: -1 }, store);
  assert.deepEqual(R.readRank('k2', store), { rank: 2, from: null });
  for (const key of ['junk', 'zero', 'text', 'missing']) assert.equal(R.readRank(key, store), null, key);
  R.writeRank('none', { rank: null }, store);
  assert.equal(store.map.has('none'), false);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(R.readRank('k', blocked), null);
  assert.doesNotThrow(() => R.writeRank('k', { rank: 1 }, blocked));
});
