import { appCode } from './nfl-schedule.mjs';
const known = n => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
const mean = a => a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
/** Observed season scoring context, no model or fabricated matchup adjustment. */
export function matchupStatistics(board, rows, now, availableAt) {
  return board.games.map(g => ({ gameId: g.id, teams: [g.awayCode, g.homeCode].map(team => {
    const games = rows.filter(r => Number(r.season) === board.season && known(r.home_score) && known(r.away_score) && Number(r.home_score) >= 0 && Number(r.away_score) >= 0
      && Date.parse(availableAt(r.gameday)) <= now && Date.parse(availableAt(r.gameday)) < Date.parse(g.kickoff)
      && [appCode(r.away_team), appCode(r.home_team)].includes(team)).sort((a, b) => a.gameday.localeCompare(b.gameday));
    const values = games.map(r => ({ gameId: r.game_id, date: r.gameday, scored: Number(appCode(r.home_team) === team ? r.home_score : r.away_score), allowed: Number(appCode(r.home_team) === team ? r.away_score : r.home_score) }));
    return { team, sample: games.length, from: games[0]?.gameday ?? null, to: games.at(-1)?.gameday ?? null,
      pointsPerGame: mean(values.map(v => v.scored)), pointsAllowedPerGame: mean(values.map(v => v.allowed)),
      recent: { sample: Math.min(5, values.length), pointsPerGame: mean(values.slice(-5).map(v => v.scored)), pointsAllowedPerGame: mean(values.slice(-5).map(v => v.allowed)) },
      games: values, definition: 'Completed season games available before this matchup; unadjusted scoring averages.', source: 'nflverse schedules' };
  }) }));
}
