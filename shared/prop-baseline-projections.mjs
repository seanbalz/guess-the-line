// A deliberately simple, transparent player-stat baseline. This is NOT a betting
// value model. Callers must supply ONE stat/unit, with verified source receipts;
// neither a market price nor an opponent adjustment enters the calculation.
const WINDOW = 8;
const MIN_TRAIN = 5;
const MIN_INTERVAL = 20;
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const timestamp = value => typeof value === 'string' && value.trim() !== '' ? Date.parse(value) : NaN;
const identity = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const LIMITATIONS = Object.freeze([
  'Experimental last-eight-appearance mean, not an injury-, role-, opponent- or market-adjusted forecast.',
  'Appearances with a supplied observed value only; missing games are not silently scored as zero.',
  'Rolling-origin historical errors are descriptive and do not establish future accuracy or betting value.',
  'Any residual range is an empirical historical range, not a calibrated prediction interval or guaranteed coverage.',
  'Retrospective chronological holdout on the supplied current final data, not live or pregame point-in-time validation; later source revisions may affect the historical errors.',
  'Availability dates may be conservative completion boundaries, not archived publication receipts; this helper cannot verify the input source.',
]);
const method = Object.freeze({ id: 'last-eight-appearances-mean-v1', label: 'Experimental appearance-mean baseline', window: WINDOW, minimumSample: MIN_TRAIN });
const base = () => ({ status: 'unavailable', reason: null, method, projection: null, sample: 0, trainingGameIds: [],
  lastObservationAt: null, holdout: { count: 0, mae: null, bias: null, intervalMinimum: MIN_INTERVAL },
  interval: null, excluded: 0, limitations: [...LIMITATIONS] });

/**
 * Compute a source-independent baseline for ONE player/stat/unit.
 * rows: [{ playerId, gameId, kickoff, availableAt, value }]. value must already
 * be the verified single-game numeric stat, not a cumulative or per-play value.
 * kickoff/asOf: ISO timestamps; asOf may not be later than target kickoff.
 * gameId is the future target identity, excluded even if it has a result row.
 *
 * Rolling-origin evaluation holds out every eligible completed appearance with
 * >=5 earlier available observations, training on the latest <=8 each time.
 * A holdout result is included only when itself available before target asOf.
 * With current final-data extracts, this is retrospective, not a point-in-time
 * backtest: future outcome rows are excluded, but later revisions can remain.
 * The interval is point forecast + historical 10th/90th percentile signed
 * residual (actual minus prediction), nearest-rank, withheld below20 holdouts.
 * It is NOT advertised as 80% coverage: no out-of-sample calibration is implied.
 */
export function buildPropBaselineProjection({ rows, playerId, gameId, kickoff, asOf = kickoff } = {}) {
  const result = base(), targetTime = timestamp(kickoff), knowledgeTime = timestamp(asOf);
  if (!Array.isArray(rows) || rows.length > 100000 || !identity(playerId) || !identity(gameId)
    || !Number.isFinite(targetTime) || !Number.isFinite(knowledgeTime) || knowledgeTime > targetTime) {
    return { ...result, reason: 'invalid_scope' };
  }
  const observations = new Map();
  for (const row of rows) {
    if (row?.playerId !== playerId || row.gameId === gameId) continue;
    const played = timestamp(row.kickoff), available = timestamp(row.availableAt);
    if (!identity(row.gameId) || !Number.isFinite(played) || !Number.isFinite(available)
      || typeof row.value !== 'number' || !Number.isFinite(row.value) || Math.abs(row.value) > 1000000
      || available < played) { result.excluded++; continue; }
    if (played >= targetTime || available >= knowledgeTime) continue;
    const prior = observations.get(row.gameId);
    if (prior && (prior.value !== row.value || prior.played !== played || prior.available !== available)) {
      return { ...result, reason: 'conflicting_game_observations' };
    }
    observations.set(row.gameId, { gameId: row.gameId, played, available, value: row.value });
  }
  const ordered = [...observations.values()].sort((a, b) => a.played - b.played || a.gameId.localeCompare(b.gameId));
  // Two reported games at one kickoff for the same player cannot be interpreted
  // as distinct, independent appearances without an identity correction.
  if (ordered.some((row, i) => i > 0 && row.played === ordered[i - 1].played)) return { ...result, reason: 'conflicting_game_times' };
  const training = ordered.slice(-WINDOW);
  result.sample = training.length;
  result.trainingGameIds = training.map(row => row.gameId);
  result.lastObservationAt = ordered.length ? new Date(Math.max(...ordered.map(row => row.available))).toISOString() : null;
  if (training.length < MIN_TRAIN) return { ...result, reason: 'insufficient_history' };
  const errors = [];
  for (let i = MIN_TRAIN; i < ordered.length; i++) {
    const held = ordered[i];
    const past = ordered.slice(0, i).filter(row => row.available < held.played).slice(-WINDOW);
    if (past.length >= MIN_TRAIN) errors.push(held.value - mean(past.map(row => row.value)));
  }
  result.projection = mean(training.map(row => row.value));
  result.status = 'available';
  result.holdout = { ...result.holdout, count: errors.length, mae: errors.length ? mean(errors.map(Math.abs)) : null,
    bias: errors.length ? mean(errors) : null };
  if (errors.length >= MIN_INTERVAL) {
    const sorted = [...errors].sort((a, b) => a - b);
    const quantile = q => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
    result.interval = { lower: result.projection + quantile(0.1), upper: result.projection + quantile(0.9),
      label: 'Empirical historical residual range', method: 'nearest-rank signed residual percentiles',
      residualPercentiles: [10, 90], calibration: 'not-calibrated', sample: errors.length };
  }
  return result;
}
