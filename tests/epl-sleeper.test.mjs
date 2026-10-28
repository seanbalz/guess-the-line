// Contract: Sleeper exposes no weekly matchups for this league, so weekly scores are the difference of two saved
// season-total snapshots and head-to-head pairs are inferred; anything ambiguous stays unpaired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MANAGER_NAMES, seasonPoints, seasonAgainst, managersFromSnapshot, weeklyScores, pairMatchups } from '../shared/epl-sleeper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/epl-sleeper-after-mw08.json', import.meta.url), 'utf8'));

const snap = totals => ({
  users: Object.keys(totals).map(id => ({ user_id: id, display_name: `u${id}` })),
  rosters: Object.entries(totals).map(([id, [pf, pa]], i) => ({
    roster_id: i + 1, owner_id: id,
    settings: { fpts: Math.floor(pf), fpts_decimal: Math.round((pf % 1) * 100), fpts_against: Math.floor(pa), fpts_against_decimal: Math.round((pa % 1) * 100), wins: 0, losses: 0 },
  })),
});

test('MANAGER_NAMES maps the eight immutable owner ids and is frozen with no prototype', () => {
  assert.equal(MANAGER_NAMES['719658248843632640'], 'Evan');
  assert.equal(Object.getPrototypeOf(MANAGER_NAMES), null);
  assert.equal(Object.keys(MANAGER_NAMES).length, 8);
  assert.ok(Object.isFrozen(MANAGER_NAMES));
});

test('seasonPoints and seasonAgainst combine whole and decimal parts', () => {
  assert.equal(seasonPoints({ fpts: 918, fpts_decimal: 75 }), 918.75);
  assert.equal(seasonPoints({ fpts: 10 }), 10);
  assert.equal(seasonAgainst({ fpts_against: 778, fpts_against_decimal: 75 }), 778.75);
});

test('managersFromSnapshot reads all eight managers from the real MW8 snapshot', () => {
  const managers = managersFromSnapshot(fixture);
  assert.equal(managers.length, 8);
  const evan = managers.find(m => m.ownerId === '719658248843632640');
  assert.equal(evan.name, 'Evan');
  assert.equal(evan.seasonTotal, 918.75);
  assert.ok(Number.isInteger(evan.rosterId));
  assert.equal(typeof evan.wins, 'number');
  assert.equal(typeof evan.losses, 'number');
});

test('managersFromSnapshot names by owner_id, ignoring a changed display_name', () => {
  const s = { users: [{ user_id: '719658248843632640', display_name: 'Renamed' }], rosters: [{ roster_id: 1, owner_id: '719658248843632640', settings: {} }] };
  const [m] = managersFromSnapshot(s);
  assert.equal(m.name, 'Evan');
  assert.equal(m.sleeperName, 'Renamed');
});

test('managersFromSnapshot does not resolve prototype keys from untrusted ids or display names', () => {
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const s = { users: [{ user_id: key, display_name: key }], rosters: [{ roster_id: 1, owner_id: key, settings: {} }] };
    const [m] = managersFromSnapshot(s);
    assert.equal(m.name, key);
    assert.equal(m.sleeperName, key);
  }
});

test('managersFromSnapshot falls back to a prototype-key display name for an unmapped owner id', () => {
  for (const key of ['constructor', '__proto__']) {
    const s = { users: [{ user_id: '999', display_name: key }], rosters: [{ roster_id: 1, owner_id: '999', settings: {} }] };
    const [m] = managersFromSnapshot(s);
    assert.equal(m.name, key);
    assert.equal(typeof m.name, 'string');
  }
});

test('managersFromSnapshot maps every MW8 fixture owner to the expected name', () => {
  const byName = Object.fromEntries(managersFromSnapshot(fixture).map(m => [m.sleeperName, m.name]));
  assert.deepEqual(byName, {
    nemoheye: 'Nemo', steezyc9: 'Cullen', aharrison2: 'Adam', seanbalz: 'Sean',
    NLGooner: 'Evan', LFCRed: 'Mark', sthomas111: 'Steven', Freudian: 'Darin',
  });
});

test('managersFromSnapshot falls back to the Sleeper name when unmapped', () => {
  const s = snap({ x: [1, 2] });
  assert.equal(managersFromSnapshot(s)[0].name, 'ux');
});

test('weeklyScores differences two snapshots, rounded, owners in both only', () => {
  const prev = snap({ a: [100.1, 50.2], b: [10, 20], gone: [1, 1] });
  const next = snap({ a: [200.3, 140.25], b: [100, 120], fresh: [5, 5] });
  const w = weeklyScores(prev, next);
  assert.deepEqual(Object.keys(w).sort(), ['a', 'b']);
  assert.deepEqual(w.a, { for: 100.2, against: 90.05 });
  assert.deepEqual(w.b, { for: 90, against: 100 });
});

test('pairMatchups pairs mutual scores once, sorted', () => {
  const r = pairMatchups({ B: { for: 90, against: 100 }, A: { for: 100, against: 90 } });
  assert.deepEqual(r, { pairs: [['A', 'B']], unpaired: [] });
});

test('pairMatchups sends ambiguous owners to unpaired', () => {
  const r = pairMatchups({
    A: { for: 100, against: 90 }, B: { for: 90, against: 100 },
    C: { for: 70, against: 60 }, D: { for: 70, against: 60 }, E: { for: 60, against: 70 },
  });
  assert.deepEqual(r.pairs, [['A', 'B']]);
  assert.deepEqual(r.unpaired, ['C', 'D', 'E']);
});

test('pairMatchups leaves a lone owner with no partner unpaired', () => {
  const r = pairMatchups({ A: { for: 1, against: 2 } });
  assert.deepEqual(r, { pairs: [], unpaired: ['A'] });
});
