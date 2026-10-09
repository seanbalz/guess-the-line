const finite = value => typeof value === 'number' && Number.isFinite(value);
const savedReference = value => ['available','captured'].includes(value?.status) && finite(value.value) ? value : null;
export function buildPlayerComparison(data, benchmark) {
  if (!data.revealed || !['guess_spread', 'guess_total'].includes(data.mode)) return null;
  const individual = data.scoringPolicy === 'submission-time';
  const analysis = !individual && !benchmark && data.provisionalAnalysis?.mode === data.mode && data.provisionalAnalysis.status === 'provisional' ? data.provisionalAnalysis : null;
  const capturedAt = individual ? null : benchmark?.capturedAt || analysis?.capturedAt;
  if (!individual && ((!benchmark && !analysis) || !Number.isFinite(Date.parse(capturedAt)))) return null;
  const references = individual ? {} : Object.fromEntries(data.games.map(game => [game.id, benchmark ? game.market : analysis.games?.[game.id]?.value]));
  // Legacy common-snapshot analysis cannot mix partial sources. D16 uses each
  // submitted player's own saved references; missing values remain unscored.
  if (!data.games.length || !individual && data.games.some(game => !finite(references[game.id]))) return null;
  const standings = analysis?.standings || data.standings || [];
  const players = data.league.roster.map(player => {
    const submitted = standings.find(row => row.id === player.id)?.submitted === true;
    const games = data.games.map(game => {
      const own = player.id === data.playerId, opponent = game.opponents?.find(row => row.id === player.id);
      const guess = submitted ? own ? game.prediction : opponent?.value : null;
      const saved = submitted && individual ? savedReference(own ? game.scoringReference : opponent?.scoringReference) : null;
      const reference = individual ? saved?.value ?? null : references[game.id];
      return { id: game.id, label: `${game.awayCode} at ${game.homeCode}`, guess: finite(guess) ? guess : null, reference, scoringReference:saved, referenceSavedAt:saved?.savedAt || saved?.recordedAt || null, source:saved?.source || null, error: finite(guess) && finite(reference) ? Math.abs(guess - reference) : null };
    });
    const errors = games.map(game => game.error).filter(finite), sorted = [...errors].sort((a, b) => a - b);
    const bins = [0, 0, 0, 0]; errors.forEach(error => bins[error === 0 ? 0 : error <= 1 ? 1 : error <= 3 ? 2 : 3]++);
    return { ...player, submitted, games, sample: errors.length, bins, mean: errors.length ? errors.reduce((sum, error) => sum + error, 0) / errors.length : null, median: errors.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : null };
  });
  return { timestamped:individual, basis:individual?'individual':'common', capturedAt, source:individual?'Reference saved with each player’s guess':benchmark?.source || analysis.source, status:individual?'Saved submission references':benchmark?.status === 'frozen' ? 'Frozen' : 'Provisional', totalGames: data.games.length, players };
}
