import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDecisionAnalysisView } from '../cloud/decision-analysis.mjs';
import { validatePersonalForecast } from '../server/personal-forecast.mjs';
const now = Date.parse('2026-10-08T18:00:00Z');
const view = { mode: 'guess_spread', revealed: true, league: { season: 2026, week: 5 }, marketAccess: { spread: true, total: false },
  games: [{ id: 'fixture', kickoff: '2026-10-09T00:15:00Z', prediction: -8, analysisMarket: { value: -3, source: 'Fixture', observedAt: '2026-10-08T17:59:00Z', collectedAt: '2026-10-08T18:00:00Z' } }] };
const model = { gameId: 'fixture', season: 2026, week: 5, market: 'spread', value: -5, permission: 'approved_display_and_retention', validation: 'approved_prospective', status: 'available',
  source: 'Fictional test model', sourceURL: 'https://example.com/test-model', version: 'fixture-v1', requiredMarkets: ['spread'],
  generatedAt: '2026-10-08T17:57:00Z', inputCutoff: '2026-10-08T17:56:00Z', availableAt: '2026-10-08T17:58:00Z', expiresAt: '2026-10-08T18:05:00Z',
  predictedTotal: 999, scorePair: [123, 456] };
test('forecast validation is separate, strict and cannot accept owner or scoring overrides', () => {
  const body = { season: 2026, week: 5, gameId: 'fixture', market: 'spread', value: -4.5, requestId: 'adapter-validates-this', revision: 0 };
  assert.deepEqual(validatePersonalForecast(body, { games: view.games, season: 2026, week: 5 }), { season: 2026, week: 5, gameId: 'fixture', market: 'spread', value: -4.5 });
  for (const patch of [{ ownerId: 'other' }, { score: 150 }, { gameId: 'other' }, { value: -4.25 }, { market: 'total', value: -1 }, { week: 6 }]) {
    assert.throws(() => validatePersonalForecast({ ...body, ...patch }, { games: view.games, season: 2026, week: 5 }));
  }
});
test('guesses alone never become outcome probabilities, recommendations or expected value', () => {
  const result = applyDecisionAnalysisView(view, {}, now).games[0].decisionAnalysis;
  assert.equal(result.guessDiscrepancy, 5); assert.equal(result.model, null); assert.equal(result.candidateSide, null);
  assert.equal(result.probability, null); assert.equal(result.expectedValue, null);
});
test('eligible model only projects allowlisted scalar and conflicting personal forecast abstains', () => {
  const inputs = { models: [model], ownerId: 'own', forecasts: [{ ownerId: 'own', season: 2026, week: 5, gameId: 'fixture', market: 'spread', value: -1, revision: 1, savedAt: '2026-10-08T17:55:00Z' }] };
  let result = applyDecisionAnalysisView(view, inputs, now).games[0].decisionAnalysis;
  assert.equal(result.directionalAgreement, false); assert.equal(result.candidateSide, null);
  inputs.forecasts[0].value = -6;
  result = applyDecisionAnalysisView(view, inputs, now).games[0].decisionAnalysis;
  assert.equal(result.directionalAgreement, true); assert.equal(result.candidateSide, 'home');
  assert.equal(JSON.stringify(result).includes('999'), false); assert.equal(JSON.stringify(result).includes('scorePair'), false);
  inputs.forecasts[0].ownerId = 'someone-else';
  assert.equal(applyDecisionAnalysisView(view, inputs, now).games[0].decisionAnalysis.personalForecast, null);
});
test('hidden, stale, unlicensed, future, ambiguous and cross-market models fail closed', () => {
  const hidden = { ...view, revealed: false }; assert.equal(applyDecisionAnalysisView(hidden, { models: [model] }, now), hidden);
  for (const patch of [{ requiredMarkets: ['spread', 'total'] }, { permission: 'unknown' }, { validation: 'historical_prototype' },
    { availableAt: '2026-10-08T18:01:00Z' }, { expiresAt: '2026-10-08T17:59:00Z' }, { sourceURL: 'javascript:secret' }]) {
    assert.equal(applyDecisionAnalysisView(view, { models: [{ ...model, ...patch }] }, now).games[0].decisionAnalysis.model, null);
  }
  assert.equal(applyDecisionAnalysisView(view, { models: [model, model] }, now).games[0].decisionAnalysis.model, null);
  const stale = structuredClone(view); stale.games[0].lastMarketReference = stale.games[0].analysisMarket; delete stale.games[0].analysisMarket;
  assert.equal(applyDecisionAnalysisView(stale, { models: [model] }, now).games[0].decisionAnalysis.candidateSide, null);
});
