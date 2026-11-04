import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../web/src/next/league/rankMoment.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES, scoreScope, sizeOf } from '../web/src/next/moments/catalog.js';

// Design lane, item 2: the rank-change moment's rules (web/src/next/league/rankMoment.js). D-69 P6A: the toast became
// engine moments. The arrow and the moment in a real browser are in tests/cloud-browser/next-design-home-league.spec.js.
function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
}

test('storage key: per account, league and market under gtl.; none without an account', () => {
  assert.equal(R.rankKey('u-1', 'community', 'guess_spread'), 'gtl.next.rank.v1.u-1.community.guess_spread');
  assert.equal(R.rankKey('u-1', null, 'guess_total'), 'gtl.next.rank.v1.u-1.community.guess_total');
  assert.notEqual(R.rankKey('u-1', 'community', 'guess_spread'), R.rankKey('u-1', 'community', 'guess_total'), 'Spread and Total are ranked apart');
  assert.notEqual(R.rankKey('u-1', 'g_1', 'guess_spread'), R.rankKey('u-1', 'community', 'guess_spread'));
  assert.equal(R.rankKey('', 'community', 'guess_spread'), null);
  assert.equal(R.rankKey(null, 'community', 'guess_spread'), null);
});

const board = { league: 'community', mode: 'guess_spread', market: 'Spread' };
test('the first look remembers the rank and says nothing; each change after it is counted once (no toast any more)', () => {
  assert.deepEqual(R.rankMoment(null, { rank: 3 }), { write: { rank: 3, from: null, n: 0 }, move: null });
  const up = R.rankMoment({ rank: 3, from: null }, { rank: 2 });
  assert.deepEqual(up, { write: { rank: 2, from: 3, n: 1 }, move: 1 });
  assert.deepEqual(R.rankMoment(up.write, { rank: 2 }), { write: null, move: 1 }, 'the same rank again keeps the arrow and writes nothing');
  assert.deepEqual(R.rankMoment(up.write, { rank: 3 }), { write: { rank: 3, from: 2, n: 2 }, move: -1 });
  for (const rank of [null, 0]) assert.deepEqual(R.rankMoment({ rank: 2, from: 3, n: 1 }, { rank }), { write: null, move: null }, 'unranked is not a rank');
  const cases = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 101: '101st', 112: '112th' };
  for (const [n, word] of Object.entries(cases)) assert.equal(R.ordinal(Number(n)), word);
});
test('candidates: rank up is small, reaching 1st is big, a drop or no change is none; each change has its own id', () => {
  const up = R.rankCandidate({ ...board, saved: { rank: 2, from: 3, n: 1 } });
  assert.deepEqual([up.id, up.kind, up.scopes, up.title, up.meta, sizeOf(up.kind)], ['rank:community:guess_spread:1', 'rankUp', [SCOPES.league, scoreScope('guess_spread')], 'Up to 2nd', 'Spread board · up 1', 'small']);
  const first = R.rankCandidate({ ...board, saved: { rank: 1, from: 4, n: 5 } });
  assert.deepEqual([first.kind, sizeOf(first.kind), first.title], ['rankFirst', 'big', 'You’re 1st']);
  assert.equal(R.rankCandidate({ ...board, saved: { rank: 1, from: 2, n: 6 }, tied: true }).title, 'Tied for 1st');
  assert.notEqual(R.rankCandidate({ ...board, saved: { rank: 2, from: 3, n: 3 } }).id, up.id, 'a later move to 2nd plays again');
  for (const saved of [{ rank: 3, from: 2, n: 2 }, { rank: 2, from: null, n: 0 }, null]) assert.equal(R.rankCandidate({ ...board, saved }), null);
  assert.equal(R.rankReport({ ...board, fresh: false, stored: { rank: 3, from: null }, rank: 1 }), null, 'a read that is not fresh decides nothing');
  const once = R.rankReport({ ...board, fresh: true, stored: { rank: 3, from: null }, rank: 2 }), again = R.rankReport({ ...board, fresh: true, stored: once.write, rank: 2 });
  assert.deepEqual([again.write, again.candidates.map(c => c.id)], [null, once.candidates.map(c => c.id)], 'the same list on every read until the rank moves');
});
test('through the engine: a launch read waits as NEW, plays once when League opens after the launch, and a drop is quiet', () => {
  const storage = memoryStorage(), settled = { value: false }, played = [];
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => settled.value, hasNavigated: () => settled.value,
    onBig: ms => played.push(...ms.map(m => `big:${m.kind}`)), onSmall: m => played.push(`small:${m.kind}`), setTimer: fn => { fn(); return 0; }, now: () => 0 });
  let stored = null;
  const read = (rank, fresh = true) => {
    const result = R.rankReport({ ...board, fresh, stored, rank });
    if (!result) return null;
    if (result.write) stored = result.write;
    engine.report(result.candidates, { source: R.rankSource(board.league, board.mode) });
    return result;
  };
  read(3);
  assert.equal(engine.newCount(SCOPES.league), 0, 'this device\'s first look seeds; nothing waits');
  read(2);
  assert.equal(engine.newCount(SCOPES.league), 1, 'up to 2nd waits as NEW on the League tile');
  engine.open(SCOPES.league)();
  assert.deepEqual(played, [], 'League showing on the launch screen plays nothing (never on page load)');
  settled.value = true;
  const opened = engine.open(SCOPES.league);
  assert.deepEqual([played, engine.newCount(SCOPES.league)], [['small:rankUp'], 0]);
  read(2);
  assert.equal(read(1, false), null);
  assert.deepEqual([played, stored], [['small:rankUp'], { rank: 2, from: 3, n: 1 }], 'never replays; a stale read writes nothing');
  read(1);
  read(4);
  assert.deepEqual(played, ['small:rankUp', 'big:rankFirst'], 'reaching 1st while League shows plays big in place; the drop stays quiet');
  opened();
});

test('Home reads the arrow without spending the moment: peekMove never writes, and matches what the board will show', () => {
  assert.equal(R.peekMove(null, { rank: 2 }), null);
  assert.equal(R.peekMove({ rank: 4, from: null }, { rank: 2 }), 2, 'a change the engine moment has not shown yet');
  assert.equal(R.peekMove({ rank: 2, from: 4 }, { rank: 2 }), 2, 'the last change, after the engine moment showed it');
  assert.equal(R.peekMove({ rank: 2, from: null }, { rank: 2 }), null);
  assert.equal(R.peekMove({ rank: 2, from: 1 }, { rank: null }), null);
  for (const [stored, rank] of [[{ rank: 4, from: null }, 2], [{ rank: 2, from: 3 }, 2], [{ rank: 1, from: null }, 3]]) {
    assert.equal(R.peekMove(stored, { rank }), R.rankMoment(stored, { rank }).move, JSON.stringify(stored));
  }
});

test('storage: { rank, from, n } round-trips; anything unreadable is null, and only a real rank is written', () => {
  const store = memoryStorage({ junk: '{', zero: JSON.stringify({ rank: 0 }), text: JSON.stringify({ rank: '2' }) });
  R.writeRank('k', { rank: 2, from: 3, n: 4 }, store);
  assert.deepEqual(R.readRank('k', store), { rank: 2, from: 3, n: 4 });
  R.writeRank('k2', { rank: 2, from: -1 }, store);
  assert.deepEqual(R.readRank('k2', store), { rank: 2, from: null, n: 0 });
  for (const key of ['junk', 'zero', 'text', 'missing']) assert.equal(R.readRank(key, store), null, key);
  R.writeRank('none', { rank: null }, store);
  assert.equal(store.map.has('none'), false);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(R.readRank('k', blocked), null);
  assert.doesNotThrow(() => R.writeRank('k', { rank: 1 }, blocked));
});
