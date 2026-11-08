import test from 'node:test';
import assert from 'node:assert/strict';
import { pickComparison } from '../web/src/next/ui/pickScorecard.js';

test('pick scorecard uses one signed linear scale; missing comparisons stay unavailable', () => {
  const c = pickComparison(-3.5, -4);
  assert.equal(c.difference, 0.5);
  assert.ok(Math.abs((c.guessAt - c.lineAt) / 100 - 0.5 / (c.to - c.from)) < 1e-12);
  assert.equal(pickComparison(44.5, null), null);
  assert.equal(pickComparison(null, 44.5), null);
  assert.equal(pickComparison(0, 0).difference, 0);
});
