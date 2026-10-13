import { buildQuoteReceipt, compareSelectionQuotes } from './quote-receipt.mjs';
import { applyDecisionAnalysisView } from './decision-analysis.mjs';
import { applyScoreHistoryView } from './score-history.mjs';
// A mode-scoped analysis projection, separate from frozen competition scoring.
const BOOKS = { draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM' };
const FRESH_MS = 5 * 60_000;
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };

function quotesFor(snapshot, game, market, now) {
  const captured = Date.parse(snapshot?.payload?.fetchedAt), stored = Date.parse(snapshot?.createdAt);
  if (snapshot?.payload?.provider !== 'the-odds-api' || snapshot?.payload?.sport !== 'americanfootball_nfl'
    || !Number.isFinite(captured) || !Number.isFinite(stored) || captured > stored || stored > now) return [];
  const entries = Array.isArray(snapshot?.payload?.games) ? snapshot.payload.games : [];
  const matches = entries.filter(g => g?.gameId === game.id && g.home === game.home && g.away === game.away && Date.parse(g.kickoff) === Date.parse(game.kickoff));
  if (matches.length !== 1 || matches[0].matchStatus !== 'matched' || typeof matches[0].providerEventId !== 'string' || !matches[0].providerEventId) return [];
  const raw = matches[0].markets?.[market]?.quotes;
  if (!Array.isArray(raw) || raw.length > 3) return [];
  const counts = new Map();
  for (const quote of raw) counts.set(quote.book, (counts.get(quote.book) || 0) + 1);
  return raw.filter(q => {
    const observed = Date.parse(q.providerObservedAt), collected = Date.parse(q.collectedAt);
    const paired = market === 'spread' ? q.outcomes?.home?.line === q.value && q.outcomes?.away?.line === -q.value
      : q.outcomes?.over?.line === q.value && q.outcomes?.under?.line === q.value;
    return Object.hasOwn(BOOKS, q.book) && counts.get(q.book) === 1 && q.market === market
      && q.provider === 'the-odds-api' && q.providerEventId === matches[0].providerEventId
      && q.timeBasis === 'provider_market_last_update' && paired
      && Number.isFinite(q.value) && Number.isInteger(q.value * 2) && Math.abs(q.value) <= (market === 'total' ? 200 : 100) && (market !== 'total' || q.value >= 0)
      && Number.isFinite(observed) && Number.isFinite(collected) && observed <= collected && collected === captured
      && captured - observed <= FRESH_MS
      && observed < Date.parse(game.kickoff) && collected < Date.parse(game.kickoff);
  }).map(q => ({
    book: q.book, source: BOOKS[q.book], value: q.value,
    observedAt: q.providerObservedAt, collectedAt: q.collectedAt,
    status: now - Date.parse(q.providerObservedAt) <= FRESH_MS && now < Date.parse(game.kickoff) ? 'fresh' : 'stale',
    tradability: 'not_confirmed',
  }));
}

function reference(quotes) {
  const fresh = quotes.filter(q => q.status === 'fresh');
  if (fresh.length < 3) return null;
  const value = median(fresh.map(q => q.value));
  if (fresh.filter(q => Math.abs(q.value - value) <= 5).length / fresh.length < .85) return null;
  return {
    value, source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/', bookCount: fresh.length,
    observedAt: new Date(Math.min(...fresh.map(q => Date.parse(q.observedAt)))).toISOString(),
    collectedAt: new Date(Math.max(...fresh.map(q => Date.parse(q.collectedAt)))).toISOString(),
    officialVerified: false,
  };
}

export function applyMarketView(view, snapshot, now = Date.now()) {
  const receipts = (game, markets) => markets.flatMap(market => Object.keys(BOOKS).flatMap(book =>
    (market === 'spread' ? ['home', 'away'] : ['over', 'under'])
      .map(side => buildQuoteReceipt(snapshot, game, market, book, side, now)).filter(Boolean)));
  if (view.mode === 'betting_challenge') {
    const markets = ['spread', 'total'].filter(market => view.marketAccess?.[market] === true);
    if (!markets.length) return view;
    const snapshots = [snapshot, ...(Array.isArray(snapshot?.history) ? snapshot.history : [])];
    return { ...view, games: view.games.map(game => ({ ...game, quoteReceipts: receipts(game, markets),
      selectionQuoteComparison: game.bet && markets.includes(game.bet.market) ? compareSelectionQuotes(game.bet, snapshots, game, now) : null })) };
  }
  // No snapshot metadata, spread or total leaks through a different reveal gate.
  if (!view.revealed || !['guess_spread', 'guess_total'].includes(view.mode)) return view;
  const market = view.mode === 'guess_total' ? 'total' : 'spread';
  const candidates = [snapshot, ...(Array.isArray(snapshot?.history) ? snapshot.history : [])]
    .filter(s => s && Number.isFinite(Date.parse(s.createdAt)) && Date.parse(s.createdAt) <= now);
  const history = [...new Map(candidates.map(s => [s.id || s.createdAt, s])).values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 20);
  const games = view.games.map(game => {
    const marketQuotes = quotesFor(snapshot, game, market, now);
    const analysisMarket = reference(marketQuotes);
    // Keep an observed reference usable for comparison after it becomes stale.
    // Later partial collections omit started games. Retain each game's latest
    // complete pre-start reference without constructing a scoring benchmark.
    const saved = history.map(s => { const ref = reference(quotesFor(s, game, market, Date.parse(s.createdAt))); return ref ? { ...ref, snapshotId: s.id } : null; }).find(Boolean);
    const submitted = Date.parse(view.submittedAt);
    // A saved later quote cannot stand in for one at submission. Compare only
    // genuinely retained observations collected before the submitted timestamp.
    const prior = Number.isFinite(submitted) && submitted <= now && submitted < Date.parse(game.kickoff)
      ? history.filter(s => Date.parse(s.createdAt) <= submitted)
        .map(s => { const ref = reference(quotesFor(s, game, market, submitted)); return ref ? { ...ref, snapshotId: s.id } : null; }).find(Boolean)
      : null;
    const stored = game.scoringReference;
    const submissionTimeComparison = view.scoringPolicy === 'submission-time' ? {
      status: stored?.status === 'available' ? 'available' : stored?.status === 'pending' ? 'pending' : 'unavailable',
      submittedAt: stored?.savedAt || null, reference: stored?.status === 'available' ? stored : null,
      discrepancy: stored?.status === 'available' && Number.isFinite(game.prediction) ? Math.round(Math.abs(game.prediction - stored.value) * 100) / 100 : null,
      scope: 'Scoring reference saved with this guess',
      reason: stored?.reason || 'Fixed at submission or the last edit to this guess.',
    } : {
      status: prior && Number.isFinite(game.prediction) ? 'available' : 'unavailable',
      submittedAt: Number.isFinite(submitted) ? view.submittedAt : null,
      reference: prior || null,
      discrepancy: prior && Number.isFinite(game.prediction) ? Math.round(Math.abs(game.prediction - prior.value) * 100) / 100 : null,
      scope: 'Separate recorded-reference comparison; does not change competition scoring',
      reason: prior ? 'Saved within five minutes before submission; not an executable selection quote.' : 'No qualifying saved reference from before submission.',
    };
    const current = analysisMarket || saved;
    const currentConsensus = current ? { ...current, status: analysisMarket ? 'available' : 'stale',
      capturedAt: current.collectedAt, savedAt: null, snapshotId: analysisMarket ? snapshot?.id : current.snapshotId }
      : { status: 'unavailable', value: null, source: null, sourceUrl: null, observedAt: null, capturedAt: null, savedAt: null, snapshotId: null };
    return { ...game, marketQuotes, analysisMarket, currentConsensus, quoteReceipts: receipts(game, [market]), submissionTimeComparison,
      lastMarketReference: !analysisMarket && saved ? { ...saved, status: 'stale' } : null };
  });
  const marketLineHistory = history.filter(s => Number.isFinite(Date.parse(s.createdAt)) && Date.parse(s.createdAt) <= now).map(s => ({
    id: s.id, quotedAt: s.createdAt, capturedAt: s.createdAt, timeBasis: 'collection',
    source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/',
    verified: false, status: 'collected',
    games: Object.fromEntries(view.games.flatMap(game => {
      const ref = reference(quotesFor(s, game, market, Date.parse(s.createdAt)));
      return ref ? [[game.id, { value: ref.value }]] : [];
    })),
  })).filter(s => Object.keys(s.games).length).sort((a, b) => Date.parse(a.quotedAt) - Date.parse(b.quotedAt));
  const fresh = games.filter(g => g.analysisMarket).length;
  const anyQuotes = games.some(g => g.marketQuotes.length || g.lastMarketReference);
  const someFresh = games.some(g => g.marketQuotes.some(q => q.status === 'fresh'));
  const withMovement = games.map(game => {
    const observations = marketLineHistory.filter(row => Number.isFinite(row.games[game.id]?.value));
    const first = observations[0], last = observations.at(-1);
    const delta = first && last && first !== last ? last.games[game.id].value - first.games[game.id].value : null;
    return { ...game, sampledMovement: {
      status: delta === null ? 'unavailable' : 'observed', cadenceHours: 12, immediate: false,
      from: first ? { value: first.games[game.id].value, capturedAt: first.capturedAt } : null,
      to: last ? { value: last.games[game.id].value, capturedAt: last.capturedAt } : null,
      delta, crossedThresholds: delta === null ? [] : [1.5, 3].filter(value => Math.abs(delta) >= value),
      meaning: 'Difference between saved samples; movement between samples and sharp bettor activity are unknown.',
    } };
  });
  return applyScoreHistoryView(applyDecisionAnalysisView({ ...view, games: withMovement, marketLineHistory, marketFeed: {
    status: fresh === games.length && games.length ? 'available' : someFresh ? 'partial' : anyQuotes ? 'stale' : 'waiting',
    source: 'The Odds API', collectedAt: snapshot?.createdAt || null, automatic: false,
    officialVerified: false,
  } }, {}, now), now);
}
