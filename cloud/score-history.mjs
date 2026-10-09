import { accuracy, closestResults, round } from '../server/domain.mjs';

// Reconstruct each player's comparison from current saved guesses and complete saved
// collections. This does not assert those scores were displayed at capture time,
// apply a later benchmark retroactively, or aggregate different competition rules.
export function applyScoreHistoryView(view, now = Date.now()) {
  if (view.scoringPolicy === 'submission-time' || !view.revealed || !['guess_spread', 'guess_total'].includes(view.mode) || !Array.isArray(view.standings)
    || !Array.isArray(view.games) || !view.games.length || !Number.isFinite(now)) return view;
  const valid = n => Number.isFinite(n) && Number.isInteger(n * 2) && (view.mode === 'guess_total' ? n >= 0 && n <= 200 : Math.abs(n) <= 100);
  const value = (player, game) => player.id === view.playerId ? game.prediction : game.opponents?.find(row => row.id === player.id)?.value;
  const complete = player => player.submitted === true && view.games.every(game => valid(value(player, game)));
  const players = view.standings.filter(complete);
  const canCompare = view.standings.length >= 2 && players.length === view.standings.length;
  const seen = new Set();
  const scoreComparisonHistory = (view.marketLineHistory || []).filter(row => {
    if (typeof row?.id !== 'string' || seen.has(row.id) || row.status !== 'collected' || row.verified !== false || row.timeBasis !== 'collection'
      || !Number.isFinite(Date.parse(row.capturedAt)) || Date.parse(row.capturedAt) > now || !row.games
      || Object.keys(row.games).length !== view.games.length || !view.games.every(game => valid(row.games[game.id]?.value)
        && Date.parse(row.capturedAt) < Date.parse(game.kickoff))) return false;
    seen.add(row.id); return true;
  }).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt)).slice(-20).map(row => {
    const standings = players.map(player => {
      const results = view.games.map(game => accuracy(value(player, game), row.games[game.id].value));
      const record = { W: 0, L: 0, T: 0 };
      if (canCompare) for (const game of view.games) {
        const outcomes = closestResults(Object.fromEntries(players.map(p => [p.id, value(p, game)])), row.games[game.id].value);
        record[outcomes[player.id]]++;
      }
      return { id: player.id, points: round(results.reduce((sum, points) => sum + points, 0)), exact: results.filter(points => points === 10).length,
        error: round(view.games.reduce((sum, game) => sum + Math.abs(value(player, game) - row.games[game.id].value), 0)), record: canCompare ? record : null };
    }).sort((a, b) => b.points - a.points || a.error - b.error || b.exact - a.exact);
    return { snapshotId: row.id, source: row.source, capturedAt: row.capturedAt, mode: view.mode,
      status: 'retrospective_comparison', official: false, maxPoints: view.games.length * 10, standings };
  });
  return { ...view, scoreComparisonHistory };
}
