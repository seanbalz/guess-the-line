import { availableScoringReference, finite, playerReference, referenceTime, submissionTimeScoring } from './scoringReferences.js';

const buckets = [
  { id: 'exact', label: 'Exact' },
  { id: 'withinOne', label: 'Within 1 point' },
  { id: 'overOne', label: 'More than 1 point' },
  { id: 'unscored', label: 'Unscored' },
];

// Current consensus and historical shared snapshots are deliberately absent.
// Only the reference saved for this player's submitted guess can award points.
export function buildDashboardInsights(data, selectedGames) {
  if (!submissionTimeScoring(data) || !data.revealed) return null;
  const roster = data.league?.roster || [], standings = data.standings || [];
  if (!roster.some(player => player.id === data.playerId) || standings.find(player => player.id === data.playerId)?.submitted !== true) return null;
  const seen = new Set();
  const games = (data.games || []).filter(game => game?.id && !seen.has(game.id) && seen.add(game.id));
  const selectedIds = selectedGames === undefined ? null : new Set((selectedGames || []).map(game => game?.id));
  const visibleGames = games.filter(game => selectedIds === null || selectedIds.has(game.id));
  const players = roster.map(player => {
    const standing = standings.find(row => row.id === player.id), submitted = standing?.submitted === true;
    const rows = games.map(game => {
      const candidate = submitted ? playerReference(data, game, player.id) : null;
      const reference = availableScoringReference(candidate) ? candidate : null;
      const value = submitted ? player.id === data.playerId ? game.prediction : game.opponents?.find(row => row.id === player.id)?.value : null;
      const guess = finite(value) ? value : null;
      const error = guess !== null && reference ? Math.abs(guess - reference.value) : null;
      return {
        id: game.id, label: `${game.awayCode} at ${game.homeCode}`, guess,
        reference: reference?.value ?? null, error,
        points: error === null ? null : Math.max(0, 10 - error * 2),
        source: reference?.source || null, savedAt: referenceTime(reference) || null,
        observedAt: reference?.observedAt || reference?.quotedAt || null,
        collectedAt: reference?.capturedAt || reference?.collectedAt || null,
        reason: !submitted ? 'Ballot not submitted' : guess === null ? 'Guess unavailable' : reference ? null : candidate?.status === 'stale' ? 'Reference was stale when this guess was saved' : candidate?.reason || 'No eligible reference was saved',
      };
    });
    const scored = rows.filter(row => row.points !== null);
    const error = scored.length ? scored.reduce((sum, row) => sum + row.error, 0) : null;
    return { id: player.id, name: player.name, submitted, own: player.id === data.playerId,
      officialEligible: standing?.officialEligible, record: submitted ? standing?.record || null : null,
      games: rows, scoredGames: scored.length, unscoredGames: games.length - scored.length,
      points: games.length && scored.length === games.length ? scored.reduce((sum, row) => sum + row.points, 0) : null,
      scoredSubtotal: scored.length ? scored.reduce((sum, row) => sum + row.points, 0) : null,
      maxPoints: games.length * 10, scoredMaxPoints: scored.length * 10,
      exact: scored.length ? scored.filter(row => row.error === 0).length : null,
      error, meanError: scored.length ? error / scored.length : null,
    };
  });
  const own = players.find(player => player.own);
  const visibleIds = new Set(visibleGames.map(game => game.id));
  const ownGames = own.games.filter(game => visibleIds.has(game.id));
  const counts = { exact: 0, withinOne: 0, overOne: 0, unscored: 0 };
  ownGames.forEach(game => counts[game.error === null ? 'unscored' : game.error === 0 ? 'exact' : game.error <= 1 ? 'withinOne' : 'overOne']++);
  const mix = buckets.map(bucket => ({ ...bucket, count: counts[bucket.id] }));
  return { mode: data.mode, market: data.mode === 'guess_total' ? 'Total' : 'Spread',
    totalGames: games.length, visibleGames, players, ownGames, mix,
    mixScored: ownGames.length - counts.unscored, filtered: visibleGames.length !== games.length,
  };
}
