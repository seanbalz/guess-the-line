const safeUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
};
const number = (value, market) => Number.isFinite(value) && (market === 'total' ? value >= 0 && value <= 200 : Math.abs(value) <= 100);
const direction = (forecast, reference, market) => forecast === reference ? null
  : market === 'total' ? (forecast > reference ? 'over' : 'under') : (forecast < reference ? 'home' : 'away');

// Reuse this projection for API, export and notification consumers. Never send a
// raw forecast object: score pairs and models with cross-market inputs can reveal
// the other blind market even when only one scalar was requested.
export function applyDecisionAnalysisView(view, { forecasts = [], models = [], ownerId } = {}, now = Date.now()) {
  if (!view.revealed || !['guess_spread', 'guess_total'].includes(view.mode) || !Number.isFinite(now)) return view;
  const market = view.mode === 'guess_total' ? 'total' : 'spread';
  return { ...view, games: view.games.map(game => {
    const reference = game.analysisMarket || game.lastMarketReference || null;
    const rows = forecasts.filter(row => ownerId && row.ownerId === ownerId && row.season === view.league?.season
      && row.week === view.league?.week && row.gameId === game.id && row.market === market
      && number(row.value, market) && Number.isInteger(row.revision) && row.revision >= 1
      && Number.isFinite(Date.parse(row.savedAt)) && Date.parse(row.savedAt) <= now)
      .sort((a, b) => b.revision - a.revision);
    const personal = rows[0] ? { value: rows[0].value, savedAt: rows[0].savedAt, revision: rows[0].revision, kind: 'personal_outcome_forecast' } : null;
    const eligible = models.filter(row => row.gameId === game.id && row.season === view.league?.season && row.week === view.league?.week
      && row.market === market && number(row.value, market) && row.permission === 'approved_display_and_retention'
      && row.validation === 'approved_prospective' && row.status === 'available' && typeof row.version === 'string' && row.version
      && typeof row.source === 'string' && row.source && safeUrl(row.sourceURL)
      && Array.isArray(row.requiredMarkets) && row.requiredMarkets.includes(market)
      && row.requiredMarkets.every(key => ['spread', 'total'].includes(key) && view.marketAccess?.[key] === true)
      && [row.generatedAt, row.inputCutoff, row.availableAt, row.expiresAt].every(value => Number.isFinite(Date.parse(value)))
      && Date.parse(row.inputCutoff) <= Date.parse(row.generatedAt) && Date.parse(row.generatedAt) <= Date.parse(row.availableAt)
      && Date.parse(row.availableAt) <= now && now < Date.parse(row.expiresAt) && now < Date.parse(game.kickoff));
    const model = eligible.length === 1 ? { value: eligible[0].value, source: eligible[0].source,
      sourceURL: safeUrl(eligible[0].sourceURL), version: eligible[0].version, generatedAt: eligible[0].generatedAt,
      availableAt: eligible[0].availableAt, inputCutoff: eligible[0].inputCutoff, kind: 'independent_outcome_forecast' } : null;
    const fresh = !!game.analysisMarket && number(reference?.value, market);
    const modelSide = fresh && model ? direction(model.value, reference.value, market) : null;
    const personalSide = fresh && personal ? direction(personal.value, reference.value, market) : null;
    return { ...game, decisionAnalysis: {
      market, savedGuess: Number.isFinite(game.prediction) ? game.prediction : null,
      reference: reference ? { value: reference.value, source: reference.source, observedAt: reference.observedAt,
        collectedAt: reference.collectedAt, status: fresh ? 'fresh' : 'stale' } : null,
      guessDiscrepancy: reference && Number.isFinite(game.prediction) ? Math.abs(game.prediction - reference.value) : null,
      personalForecast: personal, model, modelDiscrepancy: model && reference ? Math.abs(model.value - reference.value) : null,
      directionalAgreement: modelSide && personalSide ? modelSide === personalSide : null,
      candidateSide: modelSide && (!personalSide || modelSide === personalSide) ? modelSide : null,
      candidateKind: 'forecast_discrepancy_only', probability: null, expectedValue: null,
      explanation: !model ? 'No eligible current independent forecast; a sportsbook-number guess is not an outcome forecast.'
        : !fresh ? 'The saved market reference is stale or unavailable; no current candidate.'
          : modelSide && personalSide && modelSide !== personalSide ? 'Personal and independent forecasts disagree; no combined candidate.'
            : 'Direction compares an outcome forecast with the recorded line. It does not establish cover probability or betting value.',
    } };
  }) };
}
