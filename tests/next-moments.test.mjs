// D-69 moments engine, the pure rules (web/src/next/moments). Each test names the contract it guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS, SCOPES, scoreScope, sizeOf } from '../web/src/next/moments/catalog.js';
import { SEEN_CAP, clearMomentSeen, momentsKey, readMomentSeen, writeMomentSeen } from '../web/src/next/moments/seen.js';
import { SMALL_GAP_MS, freshMoments, planMoments } from '../web/src/next/moments/detect.js';

const memory = () => {
  const map = new Map();
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k),
    key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
};
const m = (id, kind, scopes = [SCOPES.features], extra = {}) => ({ id, kind, scopes, title: id, ...extra });

test('moments size: every moment plays at the size Sean chose (Q3, "Use PICK column"); a loss is quiet', () => {
  assert.deepEqual({ ...MOMENTS }, {
    lockIn: 'small', weekLocked: 'small', bullseye: 'big', weekFinal: 'big', rankUp: 'small', rankFirst: 'big',
    pointsExact: 'big', badge: 'big', award: 'big', streak: 'small', betWin: 'small', loss: 'quiet',
  });
  assert.equal(sizeOf('loss'), 'quiet');
  assert.equal(sizeOf('somethingElse'), 'quiet', 'an unknown kind never celebrates');
  assert.equal(sizeOf('toString'), 'quiet', 'only own keys count');
});

test('scopes: Play cards that hold moments each have a scope, so a landing tile can show NEW for its own card', () => {
  assert.deepEqual({ ...SCOPES }, { home: 'home', play: 'play', league: 'league', features: 'features', score: 'score', picks: 'picks', points: 'points' });
});

test('scoreScope: Your score holds a scope per market, so a rank tile’s waiting move plays on its own market only', () => {
  assert.equal(scoreScope('guess_spread'), 'score:guess_spread');
  assert.equal(scoreScope('guess_total'), 'score:guess_total');
});

test('seen record: per account under gtl.next.moments.v1, capped, cleared on sign-out, and never trusted when broken', () => {
  const store = memory();
  assert.equal(momentsKey('acct-1'), 'gtl.next.moments.v1.acct-1');
  assert.equal(momentsKey(''), null);
  assert.equal(readMomentSeen('acct-1', store), null, 'no record yet');
  writeMomentSeen('acct-1', ['a', 'b', 'a'], store);
  assert.deepEqual([...readMomentSeen('acct-1', store)], ['a', 'b']);
  assert.equal(readMomentSeen('acct-2', store), null, 'another account has its own record');
  writeMomentSeen('acct-1', Array.from({ length: SEEN_CAP + 5 }, (_, i) => `id-${i}`), store);
  const kept = [...readMomentSeen('acct-1', store)];
  assert.equal(kept.length, SEEN_CAP);
  assert.equal(kept.at(-1), `id-${SEEN_CAP + 4}`, 'the newest ids are kept');
  store.setItem('gtl.next.moments.v1.acct-3', '{not json');
  assert.equal(readMomentSeen('acct-3', store), null, 'a broken record reads as none (a first read seeds it again)');
  store.setItem('gtl.next.other', 'keep');
  clearMomentSeen(store);
  assert.equal(readMomentSeen('acct-1', store), null);
  assert.equal(store.getItem('gtl.next.other'), 'keep', 'only the moments records are cleared');
});

test('fresh: a first read on this device seeds everything and plays nothing; later only unseen ids are new', () => {
  const all = [m('badge:1', 'badge'), m('award:7:x', 'award'), m('loss:1', 'loss')];
  assert.deepEqual(freshMoments(all, null), { fresh: [], seed: ['badge:1', 'award:7:x', 'loss:1'] });
  const seen = new Set(['badge:1']);
  const { fresh, seed } = freshMoments([...all, m('badge:1', 'badge')], seen);
  assert.deepEqual(fresh.map(x => x.id), ['award:7:x'], 'unseen and not quiet; duplicates collapse');
  assert.deepEqual(seed, ['loss:1'], 'a quiet moment is remembered at once and never waits');
  assert.deepEqual(freshMoments([{ id: '', kind: 'badge', scopes: ['features'], title: 'x' }, { id: 'y', kind: 'badge', scopes: [], title: 'y' }], seen), { fresh: [], seed: [] }, 'malformed candidates are dropped');
});

test('plan: nothing plays at launch; a card opened after the launch plays what waited; a moment that arrives later plays where it is open', () => {
  const waiting = [{ ...m('badge:2', 'badge'), late: false }, { ...m('streak:5', 'streak', [SCOPES.home]), late: false }];
  assert.deepEqual(planMoments({ pending: waiting, open: new Map([[SCOPES.features, 'launch'], [SCOPES.home, 'launch']]) }), { big: [], small: [], keep: waiting }, 'open since launch: never on page load');
  const opened = planMoments({ pending: waiting, open: new Map([[SCOPES.features, 'settled']]) });
  assert.deepEqual(opened.big.map(x => x.id), ['badge:2']);
  assert.deepEqual(opened.keep.map(x => x.id), ['streak:5'], 'its card is not open');
  const late = [{ ...m('badge:3', 'badge'), late: true }];
  assert.deepEqual(planMoments({ pending: late, open: new Map([[SCOPES.features, 'launch']]) }).big.map(x => x.id), ['badge:3'], 'arrived while you watch: plays in place');
  const two = [{ ...m('a', 'badge'), late: true }, { ...m('b', 'award'), late: true }, { ...m('c', 'streak'), late: true }];
  const both = planMoments({ pending: two, open: new Map([[SCOPES.features, 'settled']]) });
  assert.deepEqual([both.big.map(x => x.id), both.small.map(x => x.id)], [['a', 'b'], ['c']], 'big ones together (one card), small ones apart');
  assert.equal(SMALL_GAP_MS, 240);
});
