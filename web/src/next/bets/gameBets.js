import { everyoneBoard } from './everyone.js';

/** Select one game without disclosing a different week, roster or league. */
export function gameBets(data, scope, viewer) {
  if (data?.season !== scope.season || data.week !== scope.week || data.leagueId !== (scope.leagueId ?? null)
    || !Array.isArray(data.games) || !Array.isArray(data.roster) || !Array.isArray(data.bets)
    || !Number.isFinite(Date.parse(data.now)) || typeof data.published !== 'boolean') throw new Error('Wrong game bets reply');
  if (!data.published) return { published: false, game: null, closed: [], kickoff: null };
  const selected = data.games.find(game => game.id === scope.gameId);
  if (!selected) throw new Error('Game missing from bets reply');
  const members = new Set(data.roster.map(row => row.userId));
  const board = everyoneBoard({ ...data, games: [selected],
    bets: data.bets.filter(bet => bet.gameId === scope.gameId && members.has(bet.userId)),
    faces: { [scope.gameId]: (data.faces?.[scope.gameId] ?? []).filter(id => members.has(id)) }, qualification: [] }, viewer);
  return { published: true, game: board.games[0] ?? null, closed: board.closed, kickoff: selected.kickoff };
}
