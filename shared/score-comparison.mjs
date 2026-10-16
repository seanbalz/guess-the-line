// Comparisons consume already authorized history. They never compute a new scoring reference or rank.
const number = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export function comparisonRows(history, mode) {
  const roster = new Set((history.members || []).map(member => member.id));
  return (history.weeks || []).flatMap(week => (week.games || []).map(game => ({
    key: `${week.season}:${week.week}:${game.id}`, season: week.season, week: week.week, game,
    players: (week.entries || []).filter(entry => entry.mode === mode && roster.has(entry.userId)).flatMap(entry => {
      const pick = entry.picks?.find(row => row.gameId === game.id);
      const market = mode === 'guess_total' ? 'total' : 'spread';
      const open = entry.userId === history.viewer || (week.gate ? week.gate[game.id]?.[market] === true : week.revealed?.[mode] === true);
      const locked = pick?.lockedIn === true || (pick?.lockedIn !== false && entry.status === 'submitted');
      if (!open || !locked || entry.eligible === false || pick?.hidden || entry.hiddenGames?.includes(game.id)
        || pick?.closedAtKickoff || !number(pick?.points) || !number(pick?.guess) || !number(pick?.reference?.value)) return [];
      return [{ userId: entry.userId, guess: pick.guess, points: pick.points, reference: pick.reference }];
    }),
  })));
}
/** All: owner + >=1 other eligible member per game. Selected: strict intersection, owner included.
 * Benchmark averages each game's contributors (including owner), then weights games equally. */
export function buildComparison({ rows = [], selection, filters = {} }) {
  const selected = [...new Set([selection.viewer, ...(selection.players || [])])];
  const all = selection.kind === 'all';
  const filtered = rows.filter(row => (filters.season == null || row.season === filters.season)
    && (filters.from == null || row.week >= filters.from) && (filters.to == null || row.week <= filters.to)
    && (!filters.team || [row.game.awayCode, row.game.homeCode].includes(filters.team))
    && (!filters.matchup || row.game.id === filters.matchup));
  const games = filtered.flatMap(row => {
    const players = [...new Map(row.players.filter(p => number(p.points) && (all || selected.includes(p.userId))).map(p => [p.userId, p])).values()];
    const mine = players.find(p => p.userId === selection.viewer);
    if (!mine || players.length < 2 || (!all && players.length !== selected.length)) return [];
    return [{ ...row, players, mine, contributors: players.length, benchmark: mean(players.map(p => p.points)) }];
  });
  const ids = all ? [...new Set(games.flatMap(game => game.players.map(p => p.userId)))] : selected;
  const players = ids.map(userId => {
    const points = games.flatMap(game => game.players.filter(p => p.userId === userId).map(p => p.points));
    return { userId, games: points.length, points: points.length ? points.reduce((a, b) => a + b, 0) : null, average: mean(points) };
  });
  const trend = [...new Set(games.map(g => g.week))].sort((a,b) => a-b).map(week => {
    const sample = games.filter(g => g.week === week);
    return { week, games: sample.length, mine: mean(sample.map(g => g.mine.points)), benchmark: mean(sample.map(g => g.benchmark)) };
  });
  return { games, players, trend, considered: filtered.length, excluded: filtered.length - games.length, benchmark: mean(games.map(g => g.benchmark)) };
}
