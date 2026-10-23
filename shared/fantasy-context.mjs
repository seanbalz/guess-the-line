// Public Fantasy game context (D-57): what defenses allowed, kickoff windows, and implied team totals from the viewer's own
// gated lines reply. Pure functions only; nothing here fetches, and no line is ever stored in a Fantasy file.
import { scoreStats, formatFantasyNumber } from './fantasy-rankings.mjs';

export const MATCHUP_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
const tenth = value => Math.round((value + Number.EPSILON) * 10) / 10;
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const enough = values => values.length >= 2 && values.every(value => value !== null);

export const ordinal = n => {
  const suffixes = ['th', 'st', 'nd', 'rd'], rest = n % 100;
  return `${n}${suffixes[(rest - 20) % 10] || suffixes[rest] || suffixes[0]}`;
};

/** Points allowed per game to one position under the selected scoring; rank 1 = most allowed; ties on the shown tenth share. */
export function matchupTable(snapshot, position, settings = {}, recentGames = 4) {
  if (!snapshot?.matchups || !MATCHUP_POSITIONS.includes(position)) return null;
  const rows = Object.entries(snapshot.matchups).map(([team, games]) => {
    const points = games.map(game => scoreStats(game.allowed?.[position], { ...settings, position }));
    const recent = points.slice(-recentGames);
    return { team, season: enough(points) ? mean(points) : null, seasonGames: points.length,
      recent: enough(recent) ? mean(recent) : null, recentGames: recent.length };
  });
  const rank = key => {
    const out = new Map(); let previous = null, current = 0;
    rows.filter(row => row[key] !== null).sort((a, b) => b[key] - a[key] || a.team.localeCompare(b.team)).forEach((row, index) => {
      const shown = tenth(row[key]); if (shown !== previous) current = index + 1;
      out.set(row.team, current); previous = shown;
    });
    return out;
  };
  const seasonRanks = rank('season'), recentRanks = rank('recent');
  return { position, teams: rows.length, recentGames, rows: new Map(rows.map(row => [row.team, {
    ...row, seasonRank: seasonRanks.get(row.team) ?? null, recentRank: recentRanks.get(row.team) ?? null,
  }])) };
}
