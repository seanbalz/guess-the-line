// Browser-only synthetic source observations, processed by the real math and
// allowlist helpers. These records never enter app bundles or hosted providers.
import { buildPropBaselineProjection } from '../../shared/prop-baseline-projections.mjs';
import { buildPositionDefenseMatchups } from '../../shared/position-defense-matchups.mjs';
import { projectPropResearch } from '../../shared/project-prop-research.mjs';
import { buildResearchAssessments } from '../../shared/research-assessments.mjs';
const DAY = 86400000;
export function propModelBrowserFixture({ game, season, week, now }) {
  const generatedAt = new Date(now).toISOString(), [team, opponent] = game.id.split('-');
  const alternate = opponent === 'CHI' ? 'DEN' : 'CHI';
  const board = { season, week, games: [{ id: game.id, awayCode: team, homeCode: opponent, kickoff: game.kickoff,
    started: false, spread: { visible: true }, total: { visible: true } }] };
  const source = Object.fromEntries(Object.entries({
    stats: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
    rosters: `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`,
    schedule: 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',
  }).map(([key, url]) => [key, { url, sha256: 'a'.repeat(64), updatedAt: generatedAt, retrievedAt: generatedAt,
    ...(key === 'schedule' ? { semanticSha256: 'b'.repeat(64) } : {}) }]));
  const matchup = (position, period) => {
    const completedGames = [opponent, alternate].flatMap(defense => Array.from({ length: 6 }, (_, i) => ({ gameId: `${defense}-history-${i}`,
      defense, season, kickoff: new Date(now - (8 - i) * 7 * DAY).toISOString(), availableAt: new Date(now - (8 - i) * 7 * DAY + DAY).toISOString(), complete: true })));
    const rows = completedGames.flatMap(g => [0, 1].map(i => ({ gameId: g.gameId, opponent: g.defense, playerId: `history-player-${i}`, position,
      kickoff: g.kickoff, availableAt: g.availableAt, value: g.defense === opponent ? (Number(g.gameId.at(-1)) + 1) * 10 + (position === 'RB' ? 10 : 0) : 5 })));
    const result = buildPositionDefenseMatchups({ rows, completedGames, position, season, asOf: generatedAt, period });
    return { ...result.teams.find(r => r.defense === opponent), rankedDefenses: result.rankedDefenses };
  };
  const players = Array.from({ length: 8 }, (_, i) => {
    const playerId = `00-${String(3000000 + i).padStart(7, '0')}`, position = i < 4 ? 'WR' : 'RB';
    const rows = Array.from({ length: 8 }, (_, n) => ({ playerId, gameId: `player-history-${n}`,
      kickoff: new Date(now - (10 - n) * 7 * DAY).toISOString(), availableAt: new Date(now - (10 - n) * 7 * DAY + DAY).toISOString(), value: 50 + i + n }));
    return { playerId, playerName: `Synthetic ${String(i + 1).padStart(2, '0')}`, team, opponent, position,
      markets: [{ key: position === 'WR' ? 'player_reception_yds' : 'player_rush_yds', unit: 'yards',
        baseline: buildPropBaselineProjection({ rows, playerId, gameId: game.id, kickoff: game.kickoff, asOf: generatedAt }),
        matchups: { season: matchup(position, 'season'), last5: matchup(position, 'last5') } }] };
  });
  const raw = { version: 1, generatedAt, source, games: [{ gameId: game.id, kickoff: game.kickoff, week, players }] };
  const propResearch = projectPropResearch(raw, board, now);
  if (propResearch.status !== 'available' || propResearch.games[0].players.length !== 8) throw new Error('Invalid synthetic prop-model browser fixture.');
  return { ...buildResearchAssessments({ board, now }), propResearch, statistics: [], playStatistics: [] };
}
