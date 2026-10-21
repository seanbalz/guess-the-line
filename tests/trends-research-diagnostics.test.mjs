import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffledResearchCandidates } from '../scripts/trends-research-diagnostics.mjs';
test('null shuffle preserves shared-game dependence, pushes, membership and immutable input', () => {
  const input = [
    { id: 'a', historicalTier: 2, records: [{ gameId: 'g1', result: 1 }, { gameId: 'g2', result: 0 }] },
    { id: 'b', historicalTier: 3, records: [{ gameId: 'g1', result: -1 }] },
  ];
  const out = shuffledResearchCandidates(input, 20261021);
  assert.equal(out[0].records[0].result, -out[1].records[0].result);
  assert.equal(out[0].records[1].result, 0);
  assert.deepEqual(out.map(c => c.records.map(r => r.gameId)), input.map(c => c.records.map(r => r.gameId)));
  assert.deepEqual(out, shuffledResearchCandidates(input, 20261021));
  assert.equal(input[0].records[0].result, 1);
  assert.ok(out.every(c => c.historicalTier === 3));
});
