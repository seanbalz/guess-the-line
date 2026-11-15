import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPropBaselineProjection as build } from '../shared/prop-baseline-projections.mjs';
const day = 86400000, start = Date.parse('2025-09-01T12:00:00Z');
const iso = n => new Date(start + n * day).toISOString();
const rows = (n, value = i => i + 1) => Array.from({ length: n }, (_, i) => ({ playerId: 'p', gameId: `g${i}`, kickoff: iso(i * 7), availableAt: iso(i * 7 + 1), value: value(i) }));
const scope = list => ({ rows: list, playerId: 'p', gameId: 'target', kickoff: iso(300), asOf: iso(299) });

test('baseline needs five observations, averages latest eight, does not mutate inputs', () => {
  const list = rows(12), copy = structuredClone(list);
  assert.equal(build(scope(rows(4))).reason, 'insufficient_history');
  const r = build(scope(list));
  assert.equal(r.status, 'available'); assert.equal(r.projection, 8.5); assert.equal(r.sample, 8);
  assert.deepEqual(r.trainingGameIds, ['g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11']);
  assert.deepEqual(list, copy); assert.equal(r.interval, null); assert.equal(r.holdout.count, 7);
  assert.match(r.method.label, /Experimental/); assert.ok(r.limitations.length >= 4);
});

test('rolling-origin holdouts use only previously available observations', () => {
  const r = build(scope(rows(6, i => [10, 20, 30, 40, 50, 90][i])));
  assert.equal(r.holdout.count, 1); assert.equal(r.holdout.mae, 60); assert.equal(r.holdout.bias, 60);
  const late = rows(6); late[0].availableAt = iso(40); // after the held sixth kickoff
  const delayed = build(scope(late));
  assert.equal(delayed.status, 'available'); assert.equal(delayed.holdout.count, 0); assert.equal(delayed.holdout.mae, null);
});

test('future results, current target, other players and knowledge-time ties do not leak', () => {
  const list = rows(8), original = build(scope(list));
  const poisoned = [...list,
    { playerId: 'p', gameId: 'target', kickoff: iso(1), availableAt: iso(2), value: 900000 },
    { playerId: 'other', gameId: 'other', kickoff: iso(100), availableAt: iso(101), value: 900000 },
    { playerId: 'p', gameId: 'late', kickoff: iso(100), availableAt: iso(299), value: 900000 },
    { playerId: 'p', gameId: 'future', kickoff: iso(301), availableAt: iso(302), value: 900000 }];
  assert.deepEqual(build(scope(poisoned)), original);
  assert.equal(build({ ...scope(list), asOf: iso(301) }).reason, 'invalid_scope');
});

test('empirical ranges need twenty holdouts and are not advertised as calibrated coverage', () => {
  assert.equal(build(scope(rows(24))).interval, null);
  const r = build(scope(rows(25, () => 7)));
  assert.equal(r.holdout.count, 20); assert.equal(r.holdout.mae, 0); assert.equal(r.projection, 7);
  assert.equal(r.interval.lower, 7); assert.equal(r.interval.upper, 7);
  assert.equal(r.interval.calibration, 'not-calibrated'); assert.equal(r.interval.sample, 20);
  assert.deepEqual(r.interval.residualPercentiles, [10, 90]);
  assert.equal(r.probability, undefined); assert.equal(r.edge, undefined);
});

test('duplicate/conflicting identities fail closed and malformed values never coerce to zero', () => {
  const list = rows(8);
  assert.deepEqual(build(scope([...list, { ...list[0] }])), build(scope(list)));
  assert.equal(build(scope([...list, { ...list[0], value: 99 }])).reason, 'conflicting_game_observations');
  assert.equal(build(scope([...list, { ...list[0], gameId: 'duplicateTime' }])).reason, 'conflicting_game_times');
  const r = build(scope([...list, { playerId: 'p', gameId: 'bad', kickoff: iso(80), availableAt: iso(81), value: '' }]));
  assert.equal(r.excluded, 1); assert.equal(r.projection, 4.5);
  assert.equal(build({}).reason, 'invalid_scope');
});

test('input order does not change forecast or time-ordered evaluation; signed yards remain valid', () => {
  const list = rows(30, i => i % 3 ? -2 : 4);
  assert.deepEqual(build(scope([...list].reverse())), build(scope(list)));
  assert.equal(build(scope(rows(8, () => -3))).projection, -3);
});
