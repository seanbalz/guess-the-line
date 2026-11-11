// Opportunity signals: expected fantasy points from usage, points over expected, and a Buy / Hold / Sell read for QB, RB,
// WR and TE. Ported from the fantasy-football waiver research (seanbalz/fantasy-football, waiver-wire/), reduced to what
// a public Fantasy snapshot already carries: targets, carries and passing attempts per recorded game. Pure functions;
// nothing here fetches, and nothing is written back into a snapshot or the weekly estimate.
//
// Expected points for one game are that game's opportunities times the position's league per-opportunity rates (the
// same rates as the usage estimate, shared/fantasy-usage.mjs), scored under the selected format. A player whose
// expected points per game rank well above his actual points per game, within his position, reads Buy; the reverse
// reads Sell. Points over expected barely carries from one week to the next (the research measured a week-to-week
// correlation near zero), while opportunity does, which is the whole basis of the read. It is a descriptive signal of
// role versus production, not a projection, and it knows nothing about air yards, red-zone usage, injuries or depth charts.
import { scoreStats } from './fantasy-rankings.mjs';
import { USAGE_POSITIONS, countsTowardLeague, leagueRates } from './fantasy-usage.mjs';

/**
 * minGames: recorded games needed before a player gets a read (the estimate's own minimum).
 * minGroup: a position needs this many qualified players before percentiles mean anything (the research's MIN_GROUP).
 * gap: percentile points between role and production that make a Buy or Sell (the research's ±18 threshold).
 * Change them only with a new run of scripts/fantasy-signals-backtest.mjs.
 */
export const SIGNAL_SETTINGS = Object.freeze({ minGames: 2, minGroup: 10, gap: 18 });
export const SIGNALS = Object.freeze({
  buy: { label: 'Buy', description: 'Role ranks well above production: usage says more points than he has scored.' },
  hold: { label: 'Hold', description: 'Production is in line with role.' },
  sell: { label: 'Sell', description: 'Production ranks well above role: points have outrun usage.' },
  insufficient: { label: 'Not enough data', description: 'Too few recorded games, or too few qualified players at the position.' },
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const ZERO_RARE = Object.freeze({ fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 });

/** One game's opportunities times its position's league rates. Rare events (fumbles, two-pointers, return TDs) are zero. */
export function expectedLine(row, rates) {
  const { targets: t, carries: c, passingAttempts: a } = row;
  return {
    targets: t, carries: c, passingAttempts: a,
    receptions: t * rates.receptions, receivingYards: t * rates.receivingYards, receivingTds: t * rates.receivingTds,
    rushingYards: c * rates.rushingYards, rushingTds: c * rates.rushingTds,
    passingYards: a * rates.passingYards, interceptions: a * rates.interceptions, passingTds: a * rates.passingTds,
    ...ZERO_RARE,
  };
}

/** Average-rank percentile (0–100] of each value within its list, ties sharing a rank. */
export function percentiles(values) {
  const order = values.map((value, index) => [value, index]).sort((x, y) => x[0] - y[0]), out = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = (rank / values.length) * 100;
    i = j + 1;
  }
  return out;
}

/** A game counts when every usage stat is known and it scores: the same rule as the league rates. */
const usable = (position, row) => countsTowardLeague(position, row);

/**
 * Signals for every QB, RB, WR and TE in `players` ({ id, position, history }), from the games in their histories
 * before `week`. League rates come from those same games. Returns a Map of id → read; kickers and other positions are
 * absent. Every value is per game over recorded games only.
 */
export function opportunitySignals(players, { week, scoring = 'ppr', passingTds = 4, settings = SIGNAL_SETTINGS } = {}) {
  const prior = player => (player.history || []).filter(row => Number.isInteger(row.week) && (week == null || row.week < week));
  const entries = [];
  for (const player of players) if (USAGE_POSITIONS.includes(player.position)) for (const row of prior(player)) if (usable(player.position, row)) entries.push({ position: player.position, stats: row });
  const league = leagueRates(entries), format = { scoring, passingTds };
  const rows = [];
  for (const player of players) {
    if (!USAGE_POSITIONS.includes(player.position)) continue;
    const games = prior(player).filter(row => usable(player.position, row));
    const score = stats => scoreStats(stats, { ...format, position: player.position });
    const expected = games.length ? mean(games.map(row => score(expectedLine(row, league[player.position])))) : null;
    const actual = games.length ? mean(games.map(score)) : null;
    rows.push({ id: player.id, position: player.position, games: games.length, expected, actual,
      overExpected: games.length ? actual - expected : null, rolePercentile: null, productionPercentile: null, gap: null, signal: 'insufficient' });
  }
  for (const position of USAGE_POSITIONS) {
    const group = rows.filter(row => row.position === position && row.games >= settings.minGames);
    if (group.length < settings.minGroup) continue;
    const role = percentiles(group.map(row => row.expected)), production = percentiles(group.map(row => row.actual));
    group.forEach((row, index) => {
      row.rolePercentile = role[index]; row.productionPercentile = production[index]; row.gap = role[index] - production[index];
      row.signal = row.gap >= settings.gap ? 'buy' : row.gap <= -settings.gap ? 'sell' : 'hold';
    });
  }
  return new Map(rows.map(row => [row.id, row]));
}

/** The snapshot's signals under the viewer's scoring, from games before the snapshot's week. */
export const snapshotSignals = (snapshot, { scoring = 'ppr', passingTds = 4 } = {}) =>
  opportunitySignals(snapshot?.players ?? [], { week: snapshot?.week, scoring, passingTds });

/** Buy and Sell lists for one position (or FLEX / all), strongest gap first; ties by name. */
export function signalBoard(snapshot, signals, { position = 'ALL', limit = 10 } = {}) {
  const fits = player => position === 'ALL' ? true : position === 'FLEX' ? ['RB', 'WR', 'TE'].includes(player.position) : player.position === position;
  const read = (snapshot?.players ?? []).filter(fits).map(player => ({ player, ...signals.get(player.id) })).filter(row => finite(row.gap));
  const pick = (kind, direction) => read.filter(row => row.signal === kind)
    .sort((a, b) => direction * (b.gap - a.gap) || a.player.name.localeCompare(b.player.name)).slice(0, limit);
  return { buy: pick('buy', 1), sell: pick('sell', -1), qualified: read.length };
}
