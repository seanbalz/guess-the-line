// Synthetic evidence for isolated tests only. The Action Network source label is
// required by the local validation protocol; it is not a connected feed or quote.
// Never import this helper from production code or write its output to app data.
export function withSyntheticLocalQuotes(state, now, { values = { guess_spread: -3, guess_total: 45 }, gameIds = state.games.map(game => game.id) } = {}) {
  if (!Number.isFinite(now)) throw new Error('Synthetic fixture requires an explicit clock.');
  const quotedAt = new Date(now - 30_000).toISOString(), capturedAt = new Date(now - 10_000).toISOString();
  const rows = Object.entries(values).map(([mode, value]) => ({
    id: `synthetic-local-${mode}-${now}`, mode,
    source: 'SYNTHETIC TEST EVIDENCE · never current odds', sourceUrl: 'https://example.invalid/local-test-odds',
    quotedAt, capturedAt, games: Object.fromEntries(gameIds.map(id => [id, {
      value, quotes: ['Synthetic Book A', 'Synthetic Book B', 'Synthetic Book C'].map(book => ({ book, value, quotedAt })),
      crossCheck: { source: 'Action Network', value, quotedAt },
    }])),
  }));
  return { ...state, consensusHistory: [...(state.consensusHistory || []), ...rows] };
}
