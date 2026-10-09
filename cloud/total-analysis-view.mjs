import { accuracy, closestResults, round } from '../server/domain.mjs';

const FRESH_MS = 5 * 60_000;
const validTotal = value => Number.isFinite(value) && value >= 0 && value <= 200 && Number.isInteger(value * 2);
const validSpread = value => Number.isFinite(value) && Math.abs(value) <= 100 && Number.isInteger(value * 2);

// This is a read-only analysis estimate, not a scoring policy or an official
// freeze. Call only after applyMarketView has validated the collected history.
// Keep the complete snapshot intact: never assemble a reference from different
// collection times or substitute another mode's/historical competition values.
export function applyProvisionalAnalysisView(view, now = Date.now()) {
  if (view.scoringPolicy === 'submission-time' || !view.revealed || !['guess_spread', 'guess_total'].includes(view.mode) || !Number.isFinite(now)
    || ['provisional', 'frozen'].includes(view.scoringBenchmark?.status) || view.snapshot?.status === 'frozen'
    || !Array.isArray(view.games) || !view.games.length || !Array.isArray(view.standings)) return view;
  const validValue = view.mode === 'guess_total' ? validTotal : validSpread;
  const ids = view.games.map(game => game.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) return view;

  const pick = (player, game) => player.id === view.playerId ? game.prediction
    : game.opponents?.find(opponent => opponent.id === player.id)?.value;
  const complete = player => player.submitted === true && view.games.every(game => validValue(pick(player, game)));
  const own = view.standings.find(player => player.id === view.playerId);
  if (!own || !complete(own)) return view;

  const snapshot = (Array.isArray(view.marketLineHistory) ? view.marketLineHistory : [])
    .filter(item => {
      const captured = Date.parse(item?.capturedAt);
      return item?.timeBasis === 'collection' && item.status === 'collected' && item.verified === false
        && typeof item.id === 'string' && !!item.id && typeof item.source === 'string'
        && Number.isFinite(captured) && captured <= now && Date.parse(item.quotedAt) === captured
        && item.games && Object.keys(item.games).length === ids.length
        && view.games.every(game => validValue(item.games[game.id]?.value)
          && Number.isFinite(Date.parse(game.kickoff)) && captured < Date.parse(game.kickoff));
    })
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0];
  if (!snapshot) return view;

  const captured = Date.parse(snapshot.capturedAt);
  // History preserves collection time, not every source-observation timestamp.
  // Only call it fresh when the current per-game projection independently
  // verifies this exact collection's observations within the freshness window.
  const fresh = now - captured <= FRESH_MS && view.games.every(game => {
    const reference = game.analysisMarket, observed = Date.parse(reference?.observedAt);
    return reference?.value === snapshot.games[game.id].value && reference.bookCount === 3
      && Date.parse(reference.collectedAt) === captured && Number.isFinite(observed)
      && observed <= captured && now - observed <= FRESH_MS && now < Date.parse(game.kickoff);
  });
  const compare = view.standings.length >= 2 && view.standings.every(complete);
  const standings = view.standings.map(player => {
    const values = complete(player) ? view.games.map(game => accuracy(pick(player, game), snapshot.games[game.id].value)) : [];
    const record = { W: 0, L: 0, T: 0 };
    if (compare) for (const game of view.games) {
      const outcomes = closestResults(Object.fromEntries(view.standings.map(row => [row.id, pick(row, game)])), snapshot.games[game.id].value);
      record[outcomes[player.id]]++;
    }
    return { ...player,
      points: values.length ? round(values.reduce((sum, value) => sum + value, 0)) : null,
      error: values.length ? round(view.games.reduce((sum, game) => sum + Math.abs(pick(player, game) - snapshot.games[game.id].value), 0)) : null,
      exact: values.length ? values.filter(value => value === 10).length : null,
      record: compare ? record : null,
    };
  }).sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || (a.error ?? Infinity) - (b.error ?? Infinity) || (b.exact ?? -1) - (a.exact ?? -1));

  return { ...view, provisionalAnalysis: {
    mode: view.mode, status: 'provisional', officialVerified: false,
    source: snapshot.source, snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt, timeBasis: 'collection', stale: !fresh,
    games: Object.fromEntries(view.games.map(game => [game.id, {
      value: snapshot.games[game.id].value, points: accuracy(game.prediction, snapshot.games[game.id].value),
    }])),
    standings, score: standings.find(player => player.id === view.playerId)?.points ?? null,
    maxPoints: view.games.length * 10,
  } };
}

// Compatibility for existing Total-only callers. New cloud reads explicitly
// use the mode-generic projection after any scoped scoring policy is applied.
export function applyTotalAnalysisView(view, now = Date.now()) {
  return view.mode === 'guess_total' ? applyProvisionalAnalysisView(view, now) : view;
}
