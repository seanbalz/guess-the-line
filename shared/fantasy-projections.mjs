// Weekly projection methods for the offline backtest (Board item 64). Each method sees only a player's appearances
// before week w plus league and defense aggregates from those same weeks. usage won; since D-76 the live weekly estimate
// for QB, RB, WR and TE calls the same usage() from shared/fantasy-usage.mjs, so this file grades exactly what ships.
import { appCode } from './nfl-schedule.mjs';
import { estimatePace, normalizePlayerStats } from './fantasy-build.mjs';
import { scoreStats } from './fantasy-rankings.mjs';
import { USAGE_POSITIONS, countsTowardLeague, leagueRates, usage } from './fantasy-usage.mjs';

export { RATES, leagueRates, recencyMean, shrinkRate, usage } from './fantasy-usage.mjs';
export const POSITIONS = USAGE_POSITIONS;
export const METHODS = Object.freeze(['seasonAverage', 'pace11', 'usage', 'usageOpp']);
export const DEFAULT_SETTINGS = Object.freeze({ halfLife: 4, kEff: 50, kTd: 200, kOpp: 4 });
export const FACTOR_RANGE = Object.freeze([0.8, 1.2]);
/** The Points game's rules: Full PPR with a 4-point passing touchdown. */
export const points = (stats, position) => scoreStats(stats, { scoring: 'ppr', passingTds: 4, position });

const round = value => Math.round(value * 1e6) / 1e6;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;

/** Today's review baseline, as fantasy-review.mjs averageStats: per stat, the mean of every prior appearance. */
export function seasonAverage(history) {
  if (history.length < 2) return null;
  const keys = Object.keys(history[0]).filter(key => key !== 'week');
  return Object.fromEntries(keys.map(key => [key, history.some(row => !finite(row[key])) ? null : round(sum(history, key) / history.length)]));
}

/** Pace 1.1, the live method before D-76 and still the kickers' method, imported rather than reimplemented. */
export const pace11 = history => estimatePace(history);

/** Full PPR points each defense allowed to each position, totalled per defense with its game count. */
export function defenseAllowed(entries) {
  const zero = () => Object.fromEntries(POSITIONS.map(position => [position, 0]));
  const games = new Map(), teams = {}, league = zero();
  for (const { defense, week, position, stats } of entries) {
    const key = `${defense}|${week}`;
    if (!games.has(key)) games.set(key, { defense, allowed: zero() });
    games.get(key).allowed[position] += points(stats, position);
  }
  for (const { defense, allowed } of games.values()) {
    const team = teams[defense] ??= { games: 0, allowed: zero() };
    team.games++;
    for (const position of POSITIONS) { team.allowed[position] += allowed[position]; league[position] += allowed[position]; }
  }
  return { teams, leaguePerGame: Object.fromEntries(POSITIONS.map(position => [position, games.size ? league[position] / games.size : 0])) };
}

/** Opponent's points allowed per game to the position ÷ the league's, shrunk toward 1 by g ÷ (g + kOpp), then clamped. */
export function opponentFactor({ position, opponent, defenses, kOpp }) {
  const team = defenses.teams[opponent], league = defenses.leaguePerGame[position];
  if (!team?.games || !(league > 0)) return 1;
  const raw = team.allowed[position] / team.games / league, weight = team.games / (team.games + kOpp);
  return Math.min(FACTOR_RANGE[1], Math.max(FACTOR_RANGE[0], 1 + (raw - 1) * weight));
}

/** Scoring is linear, so scaling every stat scales the projected points by the same factor. */
export const scaleStats = (stats, factor) => Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, value * factor]));

/** Usage times the week-w opponent factor. A bye (no opponent) has no game and so no projection. */
export function usageOpp(history, context) {
  if (!context.opponent) return null;
  const line = usage(history, context);
  return line && scaleStats(line, opponentFactor(context));
}

/**
 * Everything a week-w projection may see: each player's appearances before week w, league rates and defense totals
 * from those same weeks, and week w's schedule, which is known in advance. Rows from week w on never enter.
 */
export function buildWeekContext({ rows, schedule, season, week }) {
  const players = new Map(), entries = [];
  for (const row of rows) {
    const w = Number(row.week);
    if (Number(row.season) !== season || row.season_type !== 'REG' || !(w >= 1 && w < week) || !POSITIONS.includes(row.position)) continue;
    const stats = normalizePlayerStats(row);
    let player = players.get(row.player_id);
    if (!player) players.set(row.player_id, player = { id: row.player_id, name: row.player_display_name ?? row.player_id, history: [], lastWeek: 0 });
    if (player.history.some(item => item.week === w)) throw new Error(`Duplicate player-week ${row.player_id}.`);
    player.history.push({ week: w, ...stats });
    // The latest prior appearance names team and position; a traded player keeps his old team until he appears again.
    if (w > player.lastWeek) Object.assign(player, { lastWeek: w, team: appCode(row.team), position: row.position });
    if (countsTowardLeague(row.position, stats)) entries.push({ position: row.position, defense: appCode(row.opponent_team), week: w, stats });
  }
  for (const player of players.values()) player.history.sort((a, b) => a.week - b.week);
  const opponents = new Map();
  for (const game of schedule) {
    if (Number(game.season) !== season || game.game_type !== 'REG' || Number(game.week) !== week) continue;
    const home = appCode(game.home_team), away = appCode(game.away_team);
    opponents.set(home, away); opponents.set(away, home);
  }
  return { season, week, players, opponents, league: leagueRates(entries), defenses: defenseAllowed(entries) };
}

/** Every method's week-w stat line per player with a prior appearance; tuned methods carry their own settings. */
export function projectWeek(context, { usage: usageSettings = DEFAULT_SETTINGS, usageOpp: usageOppSettings = DEFAULT_SETTINGS } = {}) {
  const out = new Map();
  for (const player of context.players.values()) {
    const opponent = context.opponents.get(player.team) ?? null;
    const base = { week: context.week, position: player.position, league: context.league, defenses: context.defenses, opponent };
    out.set(player.id, {
      position: player.position, team: player.team, opponent,
      seasonAverage: seasonAverage(player.history), pace11: pace11(player.history),
      usage: usage(player.history, { ...base, ...usageSettings }), usageOpp: usageOpp(player.history, { ...base, ...usageOppSettings }),
    });
  }
  return out;
}

/** mulberry32: a small seeded generator, so bootstrap intervals are reproducible run to run. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted, q) => {
  const at = (sorted.length - 1) * q, low = Math.floor(at), high = Math.min(low + 1, sorted.length - 1);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
};

/**
 * Paired MAE difference, mean(a) − mean(b) of absolute errors (negative favours a), with a 95% percentile bootstrap
 * interval. Resamples player-weeks, or whole clusters (players) when cluster ids are given, from a fixed seed.
 */
export function pairedBootstrap(errorsA, errorsB, { iterations = 2000, seed = 64, clusters = null } = {}) {
  if (!errorsA.length || errorsA.length !== errorsB.length || (clusters && clusters.length !== errorsA.length)) throw new Error('Paired errors must be non-empty and the same length.');
  const diffs = errorsA.map((value, i) => value - errorsB[i]), random = seededRandom(seed), draws = new Float64Array(iterations);
  if (clusters) {
    const groups = new Map();
    diffs.forEach((value, i) => { const group = groups.get(clusters[i]) ?? groups.set(clusters[i], { total: 0, count: 0 }).get(clusters[i]); group.total += value; group.count++; });
    const list = [...groups.values()];
    for (let b = 0; b < iterations; b++) {
      let total = 0, count = 0;
      for (let i = 0; i < list.length; i++) { const group = list[Math.floor(random() * list.length)]; total += group.total; count += group.count; }
      draws[b] = total / count;
    }
  } else {
    for (let b = 0; b < iterations; b++) {
      let total = 0;
      for (let i = 0; i < diffs.length; i++) total += diffs[Math.floor(random() * diffs.length)];
      draws[b] = total / diffs.length;
    }
  }
  draws.sort();
  return { diff: mean(diffs), low: quantile(draws, 0.025), high: quantile(draws, 0.975), iterations, seed, resample: clusters ? 'player' : 'player-week' };
}

const ranks = values => {
  const order = values.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]), out = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
};

/** Spearman rank correlation with average ranks for ties; null under three pairs or with no variation. */
export function spearman(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  const rx = ranks(x), ry = ranks(y), mx = mean(rx), my = mean(ry);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < rx.length; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
