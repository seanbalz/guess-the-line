// Contract: Pick a Team draft rules are pure. Order, turn/change rules, deadline auto-picks and the winning-margin bonus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickOrder, onTheClock, canPick, resolveDeadline, marginRank, settleBonus, priceStrength } from '../shared/epl-draft.mjs';

const pk = (managerId, club) => ({ managerId, club });
const fin = (club, goalsFor, goalsAgainst) => ({ club, goalsFor, goalsAgainst, status: 'final' });

test('pickOrder sorts by score plus bonus ascending, ties by lower season total', () => {
  const order = pickOrder([
    { id: 'a', weekScore: 90, weekBonus: 0, seasonTotal: 800 },
    { id: 'b', weekScore: 80, weekBonus: 15, seasonTotal: 700 },
    { id: 'c', weekScore: 95, weekBonus: 0, seasonTotal: 650 },
  ]);
  assert.deepEqual(order, ['a', 'c', 'b']);
});

test('onTheClock is the first manager without a pick, null when all picked', () => {
  assert.equal(onTheClock(['n', 'c', 'd'], [pk('n', 'MNC')]), 'c');
  assert.equal(onTheClock(['n', 'c'], [pk('n', 'MNC'), pk('c', 'ARS')]), null);
});

test('canPick enforces turn, change window, taken, closed and not-playing', () => {
  const clubs = ['MNC', 'ARS', 'LIV'];
  const now = new Date('2026-10-30T10:00:00Z');
  const deadline = new Date('2026-10-30T12:00:00Z');
  const base = { order: ['n', 'c'], clubs, now, deadline };
  assert.deepEqual(canPick({ ...base, picks: [pk('n', 'MNC')], managerId: 'n', club: 'ARS' }), { ok: true });
  assert.deepEqual(canPick({ ...base, picks: [pk('n', 'MNC'), pk('c', 'LIV')], managerId: 'n', club: 'ARS' }), { ok: false, code: 'GTL_EPL_NOT_YOUR_TURN' });
  assert.deepEqual(canPick({ ...base, picks: [pk('n', 'MNC')], managerId: 'c', club: 'MNC' }), { ok: false, code: 'GTL_EPL_CLUB_TAKEN' });
  assert.deepEqual(canPick({ ...base, picks: [pk('n', 'MNC')], managerId: 'c', club: 'ARS' }), { ok: true });
  assert.deepEqual(canPick({ ...base, picks: [], managerId: 'c', club: 'ARS' }), { ok: false, code: 'GTL_EPL_NOT_YOUR_TURN' });
  assert.deepEqual(canPick({ ...base, picks: [pk('n', 'MNC')], managerId: 'c', club: 'ARS', now: deadline }), { ok: false, code: 'GTL_EPL_DRAFT_CLOSED' });
  assert.deepEqual(canPick({ ...base, picks: [pk('n', 'MNC')], managerId: 'c', club: 'XXX' }), { ok: false, code: 'GTL_EPL_CLUB_NOT_PLAYING' });
});

test('priceStrength is larger for shorter prices', () => {
  assert.ok(priceStrength(-200) > priceStrength(-150));
  assert.ok(priceStrength(-150) > priceStrength(120));
  assert.equal(priceStrength(-200), 200 / 300);
  assert.equal(priceStrength(100), 0.5);
});

test('resolveDeadline: clock manager gets queue pick or none; later managers queue then auto', () => {
  const order = ['n', 'c', 'a', 's'];
  const clubs = ['MNC', 'ARS', 'LIV', 'CHE'];
  const favorability = { LIV: { twoWay: -200, position: 3 }, CHE: { twoWay: -150, position: 2 }, ARS: { position: 1 }, MNC: { position: 4 } };
  const out = resolveDeadline({ order, picks: [pk('n', 'MNC')], queues: { a: ['MNC', 'ARS'] }, clubs, favorability });
  assert.deepEqual(out, [
    { managerId: 'n', club: 'MNC', source: 'pick' },
    { managerId: 'c', club: null, source: 'none' },
    { managerId: 'a', club: 'ARS', source: 'queue' },
    { managerId: 's', club: 'LIV', source: 'auto' },
  ]);
  const clockQueue = resolveDeadline({ order, picks: [pk('n', 'MNC')], queues: { c: ['MNC', 'CHE'] }, clubs, favorability });
  assert.deepEqual(clockQueue[1], { managerId: 'c', club: 'CHE', source: 'queue' });
});

test('resolveDeadline: a queued club taken earlier in the same pass falls to the next queued club', () => {
  const favorability = { LIV: { twoWay: -200, position: 3 }, CHE: { twoWay: -150, position: 2 } };
  const out = resolveDeadline({ order: ['n', 'c', 'a'], picks: [], queues: { a: ['LIV', 'CHE'] }, clubs: ['LIV', 'CHE', 'ARS'], favorability });
  // n is on the clock with no queue -> none; c auto takes LIV; a falls to CHE.
  assert.deepEqual(out.map(o => [o.managerId, o.club, o.source]), [['n', null, 'none'], ['c', 'LIV', 'auto'], ['a', 'CHE', 'queue']]);
});

test('resolveDeadline auto falls back to threeWay, then table position', () => {
  const three = resolveDeadline({ order: ['n', 'c'], picks: [pk('n', 'X')], queues: {}, clubs: ['X', 'A', 'B'], favorability: { A: { threeWay: -110, position: 9 }, B: { threeWay: -140, position: 8 } } });
  assert.deepEqual(three, [{ managerId: 'n', club: 'X', source: 'pick' }, { managerId: 'c', club: null, source: 'none' }]);
  const t = resolveDeadline({ order: ['n', 'c', 'd'], picks: [pk('n', 'X')], queues: {}, clubs: ['X', 'A', 'B'], favorability: { A: { threeWay: -110, position: 9 }, B: { threeWay: -140, position: 8 } } });
  assert.equal(t[2].club, 'B');
  assert.equal(t[2].source, 'auto');
  const p = resolveDeadline({ order: ['n', 'c', 'd'], picks: [pk('n', 'X')], queues: {}, clubs: ['X', 'A', 'B'], favorability: { A: { position: 5 }, B: { position: 2 } } });
  assert.equal(p[2].club, 'B');
});

test('marginRank ranks final winners only', () => {
  assert.equal(marginRank(fin('A', 1, 1)), null);
  assert.equal(marginRank({ club: 'A', goalsFor: 3, goalsAgainst: 0, status: 'pending' }), null);
  assert.deepEqual(marginRank(fin('A', 3, 1)), { margin: 2, goalsFor: 3, goalsAgainst: 1 });
});

test('settleBonus: widest winning margin x5, tiebreaks, no winner, pending, postponed', () => {
  const picks = [pk('m1', 'ARS'), pk('m2', 'MNC')];
  assert.deepEqual(settleBonus(picks, { ARS: fin('ARS', 3, 0), MNC: fin('MNC', 2, 0) }), { ready: true, awards: { m1: 15 }, winners: ['m1'] });
  assert.deepEqual(settleBonus([pk('m1', 'ARS'), pk('m2', 'TOT')], { ARS: fin('ARS', 3, 1), TOT: fin('TOT', 2, 0) }), { ready: true, awards: { m1: 10 }, winners: ['m1'] });
  assert.deepEqual(settleBonus([pk('m1', 'ARS'), pk('m2', 'TOT')], { ARS: fin('ARS', 1, 0), TOT: fin('TOT', 2, 1) }).awards, { m2: 5 });
  assert.deepEqual(settleBonus([pk('m1', 'ARS'), pk('m2', 'TOT')], { ARS: fin('ARS', 2, 0), TOT: fin('TOT', 2, 0) }), { ready: true, awards: { m1: 10, m2: 10 }, winners: ['m1', 'm2'] });
  assert.deepEqual(settleBonus(picks, { ARS: fin('ARS', 1, 1), MNC: fin('MNC', 0, 2) }), { ready: true, awards: {}, winners: [] });
  assert.equal(settleBonus(picks, { ARS: fin('ARS', 3, 0), MNC: { club: 'MNC', goalsFor: 0, goalsAgainst: 0, status: 'pending' } }).ready, false);
  assert.deepEqual(settleBonus(picks, { ARS: fin('ARS', 1, 0), MNC: { club: 'MNC', goalsFor: 0, goalsAgainst: 0, status: 'postponed' } }), { ready: true, awards: { m1: 5 }, winners: ['m1'] });
});
