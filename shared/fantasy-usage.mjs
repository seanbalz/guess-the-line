// The usage method: one weekly projection shared by the live Fantasy estimate (shared/fantasy-build.mjs) and the offline
// backtest that chose it (shared/fantasy-projections.mjs, Board item 64). It lives apart from both so neither imports
// the other: the backtest grades exactly the code the build ships. Pure functions; nothing from fantasy-build.
import { scoreStats } from './fantasy-rankings.mjs';

export const USAGE_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
// [stat, opportunity, prior strength]. Touchdowns are rarer than catches or yards, so their rates take the larger K.
export const RATES = Object.freeze([
  ['receptions', 'targets', 'kEff'], ['receivingYards', 'targets', 'kEff'], ['receivingTds', 'targets', 'kTd'],
  ['rushingYards', 'carries', 'kEff'], ['rushingTds', 'carries', 'kTd'],
  ['passingYards', 'passingAttempts', 'kEff'], ['interceptions', 'passingAttempts', 'kEff'], ['passingTds', 'passingAttempts', 'kTd'],
]);
export const OPPORTUNITIES = Object.freeze(['targets', 'carries', 'passingAttempts']);
export const AVERAGED = Object.freeze(['fumblesLost', 'twoPointConversions', 'specialTeamsTds']);
export const USED = Object.freeze([...OPPORTUNITIES, ...RATES.map(([stat]) => stat), ...AVERAGED]);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);

/**
 * Whether one prior appearance counts toward its position's league rates: a QB, RB, WR or TE line with every used stat
 * known that scores under the Points game's rules (Full PPR, 4-point passing TD).
 */
export const countsTowardLeague = (position, stats) => USAGE_POSITIONS.includes(position)
  && USED.every(key => finite(stats[key])) && scoreStats(stats, { scoring: 'ppr', passingTds: 4, position }) !== null;

/** Empirical-Bayes rate: weight n ÷ (n + k) on the player's own rate, the rest on the league's. */
export function shrinkRate(made, opportunities, leagueRate, k) {
  return opportunities > 0 ? (made + k * leagueRate) / (opportunities + k) : leagueRate;
}

/** Mean of prior appearances, each weighted 0.5^(weeks ago ÷ halfLife). */
export function recencyMean(history, key, week, halfLife) {
  let total = 0, weights = 0;
  for (const row of history) { const weight = 0.5 ** ((week - row.week) / halfLife); total += weight * row[key]; weights += weight; }
  return total / weights;
}

/** Per-opportunity league rates by position, opportunity-weighted over every prior appearance. */
export function leagueRates(entries) {
  const totals = Object.fromEntries(USAGE_POSITIONS.map(position => [position, Object.fromEntries(USED.map(key => [key, 0]))]));
  for (const { position, stats } of entries) if (totals[position]) for (const key of USED) totals[position][key] += stats[key];
  return Object.fromEntries(USAGE_POSITIONS.map(position => [position, Object.fromEntries(RATES.map(([stat, opportunity]) => {
    const t = totals[position]; return [stat, t[opportunity] > 0 ? t[stat] / t[opportunity] : 0];
  }))]));
}

/** Opportunities from recency-weighted volume, times shrunk season-to-date rates; rare events use the season average. */
export function usage(history, { week, position, league, halfLife, kEff, kTd }) {
  if (history.length < 2 || history.some(row => USED.some(key => !finite(row[key])))) return null;
  const k = { kEff, kTd }, rates = league[position], line = {};
  for (const opportunity of OPPORTUNITIES) line[opportunity] = recencyMean(history, opportunity, week, halfLife);
  for (const [stat, opportunity, prior] of RATES) line[stat] = line[opportunity] * shrinkRate(sum(history, stat), sum(history, opportunity), rates[stat], k[prior]);
  for (const key of AVERAGED) line[key] = sum(history, key) / history.length;
  return line;
}
