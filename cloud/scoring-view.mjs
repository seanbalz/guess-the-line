import { accuracy, closestResults, round } from '../server/domain.mjs';

// Apply only a server-selected, explicitly scoped policy. Market collection,
// eligibility rulings and immutable kickoff evidence belong to separate storage.
export function applyScoringBenchmark(view, benchmark, now = Date.now()) {
  if (view.scoringPolicy === 'submission-time' || !view.revealed || view.mode !== 'guess_spread' || view.league.practice || view.officialEligible === false || !benchmark
    || benchmark.leagueId !== view.league.id || benchmark.season !== view.league.season || benchmark.week !== view.league.week
    || benchmark.mode !== view.mode || typeof benchmark.policyId !== 'string') return view;
  const metadata = {
    policyId: benchmark.policyId, leagueId: benchmark.leagueId, season: benchmark.season, week: benchmark.week, mode: benchmark.mode,
    status: benchmark.status, source: 'DraftKings / FanDuel / BetMGM median',
    sourceUrl: /^https:\/\//.test(benchmark.sourceUrl || '') ? benchmark.sourceUrl : null,
    capturedAt: benchmark.capturedAt, quotedAt: benchmark.quotedAt, actualKickoff: benchmark.actualKickoff || null,
    stale: benchmark.status === 'provisional' && now - Date.parse(benchmark.quotedAt) > 5 * 60_000,
  };
  if (benchmark.status === 'unavailable') return { ...view, scoringBenchmark: metadata };
  const captured = Date.parse(benchmark.capturedAt), observed = Date.parse(benchmark.quotedAt), actual = Date.parse(benchmark.actualKickoff);
  if (!['provisional', 'frozen'].includes(benchmark.status) || !Number.isFinite(captured) || !Number.isFinite(observed)
    || captured > now || observed > captured || captured - observed > 5 * 60_000
    || !benchmark.games || Object.keys(benchmark.games).length !== view.games.length
    || view.games.some(g => {
      const quote = benchmark.games[g.id], oldest = Date.parse(quote?.oldestObservedAt), newest = Date.parse(quote?.newestObservedAt);
      return !Number.isFinite(quote?.value) || !Number.isInteger(quote.value * 2) || Math.abs(quote.value) > 100
        || !Number.isFinite(oldest) || !Number.isFinite(newest) || oldest < observed || oldest > newest || newest > captured;
    }) || (benchmark.status === 'frozen' && (!Number.isFinite(actual) || actual > now || captured >= actual || actual - observed > 5 * 60_000))) return view;

  const pick = (player, game) => player.id === view.playerId ? game.prediction : game.opponents.find(p => p.id === player.id)?.value;
  const complete = player => player.submitted && player.officialEligible !== false && view.games.every(g => Number.isFinite(pick(player, g)));
  const compare = view.standings.length >= 2 && view.standings.every(complete);
  const standings = view.standings.map(player => {
    const values = complete(player) ? view.games.map(g => accuracy(pick(player, g), benchmark.games[g.id].value)) : [];
    const record = { W: 0, L: 0, T: 0 };
    if (compare) for (const game of view.games) {
      const outcome = closestResults(Object.fromEntries(view.standings.map(p => [p.id, pick(p, game)])), benchmark.games[game.id].value);
      record[outcome[player.id]]++;
    }
    return { ...player, points: values.length ? round(values.reduce((sum, n) => sum + n, 0)) : null,
      exact: values.length ? values.filter(n => n === 10).length : null,
      error: values.length ? round(view.games.reduce((sum, g) => sum + Math.abs(pick(player, g) - benchmark.games[g.id].value), 0)) : null,
      record: compare ? record : null };
  }).sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || (a.error ?? Infinity) - (b.error ?? Infinity) || (b.exact ?? -1) - (a.exact ?? -1));
  return { ...view, scoringBenchmark: metadata, standings,
    games: view.games.map(g => ({ ...g, market: benchmark.games[g.id].value, points: accuracy(g.prediction, benchmark.games[g.id].value), previousMarket: null })),
    score: standings.find(p => p.id === view.playerId)?.points ?? null,
    snapshot: { id: benchmark.policyId, source: metadata.source, sourceUrl: metadata.sourceUrl, capturedAt: metadata.capturedAt,
      quotedAt: metadata.quotedAt, status: metadata.status, verified: metadata.status === 'frozen' },
    officialStatus: metadata.status === 'frozen' ? 'Week 5 benchmark frozen at commissioner-reported actual kickoff' : 'Provisional three-book score — actual kickoff benchmark pending',
  };
}
