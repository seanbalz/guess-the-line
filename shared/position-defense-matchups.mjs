// Descriptive position-versus-defense history. No forecast, favorable grade or betting edge.
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const token = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const key = (gameId, defense) => JSON.stringify([gameId, defense]);
const limitations = [
  'Raw stat allowed per defense game, not opponent-adjusted or pace-adjusted.',
  'Ranks describe this covered sample only, not future player output or betting value.',
  'A zero is included only when the input explicitly certifies complete stat and position coverage.',
  'Missing or conflicting games are excluded, not replaced with zero or older games.',
];

/**
 * Aggregate one stat and position from normalized, verified source records.
 * rows: {playerId, position, opponent, gameId, kickoff, availableAt, value}.
 * completedGames: {gameId, defense, season, kickoff, availableAt, complete}.
 * `complete: true` must be established by the caller from verified schedule,
 * player-position joins and complete stat coverage for that defense-game. Merely
 * seeing a row or a final score is NOT evidence of complete stat coverage.
 * Both timestamps must be source-grounded; availableAt is when the result was
 * available (>= kickoff), not merely the historical game date. Only observations
 * available by asOf enter calculations. A season is explicitly required.
 * last5 selects the defense's latest five scheduled completed games FIRST, then
 * removes incomplete games. It never substitutes an older game for a missing one.
 * Exact duplicate player rows collapse; conflicting player rows invalidate a game.
 * Return teams with total, meanAllowed, sampleGames, playerAppearances, period,
 * missingGames, rank (competition ties: 1,1,3) and status. At least minGames (>=3)
 * are needed for a rank. Unranked teams retain descriptive values and sample size.
 */
export function buildPositionDefenseMatchups({ rows, completedGames, position, season,
  period = 'season', asOf, minGames = 3 } = {}) {
  const result = { version: 1, position, season, period, asOf, minGames, status: 'unavailable', teams: [], rankedDefenses: 0, limitations: [...limitations] };
  const now = Date.parse(asOf);
  if (!stamp(asOf) || !POSITIONS.includes(position) || !Number.isSafeInteger(season)
    || !['season', 'last5'].includes(period) || !Number.isSafeInteger(minGames) || minGames < 3
    || !Array.isArray(rows) || rows.length > 250000 || !Array.isArray(completedGames) || completedGames.length > 20000) return result;
  const games = new Map(), invalid = new Set();
  for (const g of completedGames) {
    if (!g || g.season !== season || !token(g.gameId) || !token(g.defense)
      || !stamp(g.kickoff) || !stamp(g.availableAt) || Date.parse(g.kickoff) >= now
      || Date.parse(g.availableAt) > now || Date.parse(g.availableAt) < Date.parse(g.kickoff)) continue;
    const k = key(g.gameId, g.defense), prior = games.get(k);
    const normalized = { ...g, complete: g.complete === true, players: new Map() };
    if (prior && (prior.kickoff !== normalized.kickoff || prior.availableAt !== normalized.availableAt
      || prior.complete !== normalized.complete)) invalid.add(k);
    else if (!prior) games.set(k, normalized);
  }
  const identities = new Map();
  for (const row of rows) {
    if (!row || !token(row.gameId) || !token(row.opponent)) continue;
    const k = key(row.gameId, row.opponent), g = games.get(k);
    if (!g) continue;
    // Unknown positions can hide a target-position appearance, so fail closed.
    if (!token(row.position)) { invalid.add(k); continue; }
    if (token(row.playerId)) {
      const identity = JSON.stringify([k, row.playerId]);
      if (identities.has(identity) && identities.get(identity) !== row.position) invalid.add(k);
      else identities.set(identity, row.position);
    }
    if (row.position !== position) continue;
    if (!token(row.playerId) || !stamp(row.kickoff) || Date.parse(row.kickoff) !== Date.parse(g.kickoff)
      || !stamp(row.availableAt) || Date.parse(row.availableAt) > now
      || Date.parse(row.availableAt) < Date.parse(row.kickoff)
      || typeof row.value !== 'number' || !Number.isFinite(row.value)) { invalid.add(k); continue; }
    const previous = g.players.get(row.playerId);
    if (previous !== undefined && previous !== row.value) invalid.add(k);
    else g.players.set(row.playerId, row.value);
  }
  const defenses = [...new Set([...games.values()].map(g => g.defense))];
  for (const defense of defenses) {
    const calendar = [...games.values()].filter(g => g.defense === defense)
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff) || a.gameId.localeCompare(b.gameId));
    const selected = period === 'last5' ? calendar.slice(0, 5) : calendar;
    const covered = selected.filter(g => g.complete && !invalid.has(key(g.gameId, defense)));
    const total = covered.reduce((sum, g) => sum + [...g.players.values()].reduce((n, value) => n + value, 0), 0);
    const sampleGames = covered.length;
    const meanAllowed = sampleGames ? total / sampleGames : null;
    if (!Number.isFinite(total) || meanAllowed !== null && !Number.isFinite(meanAllowed)) continue;
    result.teams.push({ defense, position, total: sampleGames ? total : null, meanAllowed, sampleGames,
      playerAppearances: covered.reduce((n, g) => n + g.players.size, 0), selectedGames: selected.length,
      missingGames: selected.length - sampleGames,
      period: { from: covered.at(-1)?.kickoff ?? null, to: covered[0]?.kickoff ?? null },
      asOf, rank: null, status: sampleGames >= minGames ? 'ranked' : 'insufficient-sample' });
  }
  const ranked = result.teams.filter(t => t.status === 'ranked').sort((a, b) => b.meanAllowed - a.meanAllowed || a.defense.localeCompare(b.defense));
  ranked.forEach((team, i) => { team.rank = i && team.meanAllowed === ranked[i - 1].meanAllowed ? ranked[i - 1].rank : i + 1; });
  result.teams.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.defense.localeCompare(b.defense));
  result.rankedDefenses = ranked.length;
  result.status = result.teams.some(t => t.sampleGames) ? 'available' : 'unavailable';
  return result;
}
