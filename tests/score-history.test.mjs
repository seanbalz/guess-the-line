import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScoreHistoryView } from '../cloud/score-history.mjs';
const now = Date.parse('2026-10-08T18:00:00Z');
const view = { revealed: true, mode: 'guess_total', playerId: 'one', games: [{ id: 'fixture', prediction: 44, kickoff: '2026-10-09T00:15:00Z', opponents: [{ id: 'two', value: 45 }] }],
  standings: [{ id: 'one', submitted: true }, { id: 'two', submitted: true }], score: 9,
  marketLineHistory: [{ id: 'first', source: 'Fixture', status: 'collected', verified: false, timeBasis: 'collection', capturedAt: '2026-10-08T17:00:00Z', games: { fixture: { value: 44.5 } } },
    { id: 'second', source: 'Fixture', status: 'collected', verified: false, timeBasis: 'collection', capturedAt: '2026-10-08T17:30:00Z', games: { fixture: { value: 45 } } }] };
test('both submitted players get separate accuracy and closest-pick records for each shared historical reference', () => {
  const before = structuredClone(view), result = applyScoreHistoryView(view, now);
  assert.equal(result.scoreComparisonHistory.length, 2);
  assert(result.scoreComparisonHistory.every(row => row.official === false && row.status === 'retrospective_comparison'));
  assert.deepEqual(result.scoreComparisonHistory[0].standings.map(row => row.record), [{ W: 0, L: 0, T: 1 }, { W: 0, L: 0, T: 1 }]);
  assert.equal(result.scoreComparisonHistory[1].standings[0].id, 'two'); assert.equal(result.scoreComparisonHistory[1].standings[0].points, 10);
  assert.equal(result.score, 9); assert.deepEqual(view, before);
});
test('unsubmitted opponents, partial/future samples and opposite modes cannot contribute or leak', () => {
  const hidden = { ...view, revealed: false }; assert.equal(applyScoreHistoryView(hidden, now), hidden);
  const partial = structuredClone(view); partial.standings[1].submitted = false;
  partial.marketLineHistory.push({ ...partial.marketLineHistory[0], id: 'partial', games: {} }, { ...partial.marketLineHistory[0], id: 'future', capturedAt: '2026-10-08T18:01:00Z' });
  const result = applyScoreHistoryView(partial, now).scoreComparisonHistory;
  assert.equal(result.length, 2); assert(result.every(row => row.standings.length === 1 && row.standings[0].record === null));
  const challenge = { ...view, mode: 'betting_challenge' }; assert.equal(applyScoreHistoryView(challenge, now), challenge);
});
