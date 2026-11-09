import baseline from './nfl-gap-baseline.mjs';

// Empirical percentile of absolute final-minus-market errors, separately by
// market. This is a magnitude comparison, never a chance of winning a bet.
export const NFL_GAP_BASELINE = baseline;
export const LARGE_GAP_SCORE = 75;
export const GAP_SCALE_EXPLANATION = 'Gap size runs from 0 to 100: your point gap is at least as large as that share of historical final-minus-line errors in the same market. Zero means no gap. It is not a win probability or a tested betting edge.';
export const GAP_SCALE_SAMPLE = 'Baseline: 2,639 NFL regular-season games per market, 2016–2025. Spread uses winning-margin error; Total uses combined-score error. Both use the last recorded historical line.';
export const GAP_SCALE_LARGE = 'Large gaps reach the historical top quarter: at least 14 points for Spread or 14.5 for Total. The same fixed scale applies to everyone and to the historical record; it does not use your guessing history.';
export const GAP_SCALE_NOTES = Object.freeze([GAP_SCALE_EXPLANATION, GAP_SCALE_SAMPLE, GAP_SCALE_LARGE,
  baseline.source.credit + '. ' + baseline.source.lineSource + '. ' + baseline.source.caveat]);
export const gapSizeLabel = score => score >= LARGE_GAP_SCORE ? 'Large gap' : score >= 50 ? 'Moderate gap' : 'Small gap';
export function historicalGapScore(market, gap) {
  if (market !== 'spread' && market !== 'total') return null;
  const sample = baseline.markets[market];
  if (!sample || !Number.isFinite(gap) || gap < 0) return null;
  if (gap === 0) return 0;
  let count = 0;
  for (const [error, n] of sample.bins) {
    if (error > gap) break;
    count += n;
  }
  return 100 * count / sample.n;
}
