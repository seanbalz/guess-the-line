import test from 'node:test';
import assert from 'node:assert/strict';
import { POINTS_SLOTS, POINTS_RULES, validGuess, roundActual, slotPoints, housePoints, weekMax, rankPoints, rankLabel, pointsOpenAt, finalizeAt } from '../shared/points-rules.mjs';

test('contract: five slots, Full PPR with 4-point passing TDs, pinned version', () => {
  assert.deepEqual(POINTS_SLOTS, ['QB', 'RB', 'WR', 'TE', 'FLEX']);
  assert.deepEqual(POINTS_RULES, { format: 'ppr', passingTds: 4, version: 'points-1' });
});

test('contract: guesses are whole numbers 0–60', () => {
  for (const ok of [0, 1, 18, 60]) assert.equal(validGuess(ok), true);
  for (const bad of [-1, 61, 12.5, '12', null, NaN]) assert.equal(validGuess(bad), false);
});

test('contract: actuals round half away from zero to one decimal; missing stays null', () => {
  assert.equal(roundActual(14.64), 14.6);
  assert.equal(roundActual(14.65), 14.7);            // float 146.4999… must not round down
  assert.equal(roundActual(-1.25), -1.3);
  assert.equal(roundActual(0.04), 0);
  assert.equal(Object.is(roundActual(-0.04), -0), false);
  assert.equal(roundActual(null), null);
  assert.equal(roundActual(Number.NaN), null);
});

test('contract: 10 minus fantasy points off, floor 0, exact to the tenth', () => {
  assert.equal(slotPoints(18, 14.6), 6.6);
  assert.equal(slotPoints(15, 15), 10);
  assert.equal(slotPoints(9, 0), 1);
  assert.equal(slotPoints(0, 25.3), 0);
  assert.equal(slotPoints(12, -1.2), 0);
  assert.equal(slotPoints(12.5, 12), null);         // not a valid guess
  assert.equal(slotPoints(12, null), null);          // missing actual is not 0
  assert.equal(housePoints(16.4, 14.6), 8.2);
  assert.equal(weekMax(0), 50);
  assert.equal(weekMax(2), 30);
});

test('contract: ties share the rank on exact tenths; unscored rows are not ranked', () => {
  const ranked = rankPoints([{ id: 'a', name: 'Ann', points: 6.6 + 8.2 }, { id: 'b', name: 'Bo', points: 14.8 }, { id: 'c', name: 'Cy', points: 20 }, { id: 'd', name: 'Di', points: null }]);
  assert.deepEqual(ranked.map(r => [r.id, r.rank, r.tied]), [['c', 1, false], ['a', 2, true], ['b', 2, true]]);
  assert.equal(rankLabel(ranked[1]), 'T-2');
  assert.equal(rankLabel(ranked[0]), '1');
  assert.equal(rankLabel(null), '—');
});

test('contract: week opens Tuesday 12:00 PM PT and finalizes the following Thursday 12:00 PM PT', () => {
  assert.equal(pointsOpenAt('2026-10-30T00:15:00Z'), '2026-10-27T19:00:00.000Z');   // Week 8 TNF Oct 29 PT → Tue Oct 27 noon PDT
  assert.equal(pointsOpenAt('2026-11-06T01:15:00Z'), '2026-11-03T20:00:00.000Z');   // after fall-back → PST
  assert.equal(finalizeAt('2026-10-27T00:15:00Z'), '2026-10-29T19:00:00.000Z');     // Week 7 MNF (Mon Oct 26 PT) → Thu Oct 29
  assert.equal(finalizeAt('2026-11-03T01:15:00Z'), '2026-11-05T20:00:00.000Z');     // Mon Nov 2 PT → Thu Nov 5 PST
});
