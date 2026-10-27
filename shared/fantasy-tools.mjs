// Fantasy player tools (queue Q12–Q14): profiles, side-by-side comparisons and opponent context, all derived from one
// public Fantasy snapshot. Observed history and GTL's pace estimate stay separate fields; a missing statistic stays null
// (shown as "—"), never zero. Pure functions only; nothing here fetches or predicts.
import { scoreStats } from './fantasy-rankings.mjs';
import { MATCHUP_POSITIONS, opponentOf } from './fantasy-context.mjs';

export const USAGE_METRICS = Object.freeze([
  { key: 'targets', label: 'Targets', short: 'Tgt' }, { key: 'carries', label: 'Carries', short: 'Car' },
  { key: 'passingAttempts', label: 'Passing attempts', short: 'Att' }, { key: 'receptions', label: 'Receptions', short: 'Rec' },
]);
export const COMPARE_PERIODS = Object.freeze([
  { value: 'season', label: 'Season' }, { value: 'recent', label: 'Last 3' }, { value: 'week', label: 'This week' },
]);
export const RECENT_WEEKS = 3;
export const MAX_COMPARE = 3;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const average = values => {
  const known = values.filter(finite);
  return { value: known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null, games: known.length };
};
const points = (stats, player, settings) => scoreStats(stats, { scoring: settings.scoring, passingTds: settings.passingTds, position: player.position });
const usageOf = stats => Object.fromEntries(USAGE_METRICS.map(({ key }) => [key, finite(stats?.[key]) ? stats[key] : null]));

/** Weeks the team played, from the snapshot's own defense game lists; null when the snapshot carries none (schema 1). */
export function teamWeeks(snapshot, team) {
  if (!snapshot?.matchups) return null;
  const weeks = new Set();
  for (const games of Object.values(snapshot.matchups)) for (const game of games) if (game.opponent === team) weeks.add(game.week);
  return weeks;
}

/** Every completed week through statsThroughWeek: a recorded game, the team's bye, or no recorded statistics. */
export function playerWeeks(snapshot, player, settings = {}) {
  const through = snapshot?.statsThroughWeek ?? 0, played = teamWeeks(snapshot, player.team);
  const byWeek = new Map((player.history || []).filter(row => row.week <= through).map(row => [row.week, row]));
  return Array.from({ length: through }, (_, index) => {
    const week = index + 1, row = byWeek.get(week);
    if (row) return { week, status: 'played', usage: usageOf(row), points: points(row, player, settings) };
    return { week, status: played && !played.has(week) ? 'bye' : 'none', usage: usageOf(null), points: null };
  });
}

/** Season and last-three-calendar-weeks averages over recorded games; each value carries its own sample size. */
export function summarize(weeks, through = weeks.length) {
  const played = weeks.filter(row => row.status === 'played'), recent = played.filter(row => row.week > through - RECENT_WEEKS);
  const of = rows => ({
    games: rows.length, points: average(rows.map(row => row.points)),
    usage: Object.fromEntries(USAGE_METRICS.map(({ key }) => [key, average(rows.map(row => row.usage[key]))])),
  });
  return { season: of(played), recent: of(recent), recentFrom: Math.max(1, through - RECENT_WEEKS + 1), through };
}

/** GTL's pace estimate, kept apart from observed production. */
export function paceEstimate(player, settings = {}) {
  const weekly = player.weekly ?? null, ros = player.restOfSeason ?? null;
  return {
    status: weekly?.status ?? 'unknown', opponent: weekly?.opponent ?? null, kickoff: weekly?.kickoff ?? null, sampleGames: player.sampleGames ?? 0,
    week: weekly?.stats ? { points: points(weekly.stats, player, settings), usage: usageOf(weekly.stats) } : null,
    restOfSeason: ros?.stats && Number.isInteger(ros.games) ? { points: points(ros.stats, player, settings), games: ros.games } : null,
  };
}

export function playerProfile(snapshot, playerId, settings = {}) {
  const player = snapshot?.players?.find(item => item.id === playerId);
  if (!player) return null;
  const weeks = playerWeeks(snapshot, player, settings);
  return { player, weeks, summary: summarize(weeks, snapshot.statsThroughWeek), estimate: paceEstimate(player, settings),
    matchup: opponentAllowed(snapshot, player, settings), byeKnown: !!snapshot.matchups };
}

/** One scoring format and one period for 2–3 players; per-game points for observed periods, the estimate for this week. */
export function comparePlayers(snapshot, ids, settings = {}, period = 'season') {
  const rows = ids.slice(0, MAX_COMPARE).map(id => snapshot?.players?.find(player => player.id === id)).filter(Boolean).map(player => {
    const base = { id: player.id, name: player.name, team: player.team, position: player.position };
    if (period === 'week') {
      const estimate = paceEstimate(player, settings);
      return { ...base, kind: 'estimate', status: estimate.status, opponent: estimate.opponent, games: estimate.sampleGames,
        points: estimate.week?.points ?? null, usage: estimate.week?.usage ?? usageOf(null) };
    }
    const summary = summarize(playerWeeks(snapshot, player, settings), snapshot.statsThroughWeek)[period === 'recent' ? 'recent' : 'season'];
    return { ...base, kind: 'observed', games: summary.games, pointsGames: summary.points.games, points: summary.points.value,
      usage: Object.fromEntries(Object.entries(summary.usage).map(([key, value]) => [key, value.value])),
      usageGames: Object.fromEntries(Object.entries(summary.usage).map(([key, value]) => [key, value.games])) };
  });
  const through = snapshot?.statsThroughWeek ?? 0;
  return { period, rows, weeks: period === 'season' ? [1, through] : period === 'recent' ? [Math.max(1, through - RECENT_WEEKS + 1), through] : [snapshot?.week, snapshot?.week] };
}

/** What the upcoming opponent's defense allowed to this position in each completed game, with league context. */
export function opponentAllowed(snapshot, player, settings = {}) {
  const opponent = opponentOf(player);
  if (!snapshot?.matchups || !MATCHUP_POSITIONS.includes(player?.position) || player.weekly?.status !== 'scheduled' || !opponent) return null;
  const score = game => scoreStats(game.allowed?.[player.position], { ...settings, position: player.position });
  const games = (snapshot.matchups[opponent.opponent] ?? []).map(game => ({ week: game.week, offense: game.opponent, points: score(game) }));
  const recent = games.slice(-RECENT_WEEKS);
  const league = average(Object.values(snapshot.matchups).flat().map(score));
  return { defense: opponent.opponent, home: opponent.home, position: player.position, games,
    season: average(games.map(game => game.points)), recent: average(recent.map(game => game.points)), league };
}

/** Players for the comparison picker: name/team/position search, excluding those already chosen. */
export function searchPlayers(snapshot, query, exclude = [], limit = 8) {
  const text = String(query ?? '').trim().toLocaleLowerCase('en-US');
  if (!text) return [];
  return (snapshot?.players ?? []).filter(player => !exclude.includes(player.id)
    && `${player.name} ${player.team} ${player.position}`.toLocaleLowerCase('en-US').includes(text))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, limit);
}
