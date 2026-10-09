import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMarketView } from '../cloud/market-view.mjs';
const now = Date.parse('2026-10-08T18:00:00Z');
const game = { id: 'TEST-A', home: 'Test Home', away: 'Test Away', kickoff: '2026-10-09T00:15:00Z', prediction: -8, market: -6, points: 6 };
const base = { revealed: true, mode: 'guess_spread', games: [game], score: 6, snapshot: { id: 'preserved-archive' } };
function snapshot(time = now, value = -7) {
  const at = new Date(time).toISOString();
  const quotes = (market, n) => ['draftkings', 'fanduel', 'betmgm'].map(book => ({ book, market, value: n, provider: 'the-odds-api', providerEventId: 'fixture-event', timeBasis: 'provider_market_last_update', providerObservedAt: at, collectedAt: at, privateDebug: 'never return', outcomes: market === 'spread' ? { home: { line: n }, away: { line: -n } } : { over: { line: n }, under: { line: n } } }));
  return { id: `fixture-${time}`, createdAt: at, payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: at, games: [{ ...game, gameId: game.id, providerEventId: 'fixture-event', matchStatus: 'matched', markets: { spread: { quotes: quotes('spread', value) }, total: { quotes: quotes('total', 44) } } }] } };
}
test('analysis projects only the submitted mode and cannot mutate historical scores', () => {
  const sample = snapshot(), before = structuredClone(sample), result = applyMarketView(base, sample, now);
  assert.equal(result.games[0].analysisMarket.value, -7);
  assert.equal(result.games[0].analysisMarket.officialVerified, false);
  assert.equal(result.marketFeed.status, 'available');
  assert.equal(result.games[0].market, -6); assert.equal(result.games[0].points, 6); assert.equal(result.score, 6);
  assert.deepEqual(result.snapshot, base.snapshot);
  assert.equal(JSON.stringify(result).includes('44'), false); assert.equal(JSON.stringify(result).includes('never return'), false);
  assert.deepEqual(sample, before); assert.equal(Object.hasOwn(game, 'analysisMarket'), false);
  const total = applyMarketView({ ...base, mode: 'guess_total' }, sample, now);
  assert.equal(total.games[0].analysisMarket.value, 44);
  for (const view of [{ ...base, revealed: false }, { ...base, mode: 'betting_challenge' }]) assert.equal(applyMarketView(view, sample, now), view);
});
test('stale, future, ambiguous, mismatched or insufficient quotes never become current market analysis', () => {
  const stale = applyMarketView(base, snapshot(now - 300001), now);
  assert.equal(stale.games[0].analysisMarket, null); assert.equal(stale.marketFeed.status, 'stale');
  assert.equal(stale.games[0].lastMarketReference.value, -7);
  assert.equal(stale.games[0].lastMarketReference.status, 'stale');
  assert.equal(stale.games[0].lastMarketReference.officialVerified, false);
  assert.equal(stale.marketLineHistory[0].games[game.id].value, -7, 'stale observations remain historical');
  const future = applyMarketView(base, snapshot(now + 1), now);
  assert.equal(future.games[0].analysisMarket, null); assert.deepEqual(future.marketLineHistory, []);
  assert.equal(future.games[0].lastMarketReference, null);
  for (const mutate of [s => s.payload.games[0].home = 'Wrong home', s => s.payload.games.push(s.payload.games[0]), s => s.payload.games[0].markets.spread.quotes.pop(), s => s.payload.games[0].markets.spread.quotes[1].book = 'draftkings', s => s.payload.games[0].markets.spread.quotes[1].value = 20]) {
    const sample = snapshot(); mutate(sample); assert.equal(applyMarketView(base, sample, now).games[0].analysisMarket, null);
  }
});
test('collected history contains only this mode and real finite source points, without filling missing observations', () => {
  const sample = snapshot(); sample.history = [snapshot(), snapshot(now - 60000, -6.5)];
  const result = applyMarketView(base, sample, now);
  assert.deepEqual(result.marketLineHistory.map(s => s.games[game.id].value), [-6.5, -7]);
  assert(result.marketLineHistory.every(s => s.timeBasis === 'collection' && s.verified === false));
  assert.deepEqual(applyMarketView(base, null, now).marketLineHistory, []);
  const staleZero = applyMarketView(base, snapshot(now - 600000, 0), now);
  assert.equal(staleZero.games[0].lastMarketReference.value, 0);
  assert.equal(staleZero.games[0].market, -6);
});

test('partial later collections retain the last pre-kickoff reference without inventing a new observation', () => {
  const old = snapshot(now, 0), later = snapshot(Date.parse(game.kickoff) + 60_000, -9);
  later.payload.games[0].matchStatus = 'kickoff_passed';
  later.payload.games[0].markets.spread.quotes = [];
  later.history = [old, later];
  const before = structuredClone(later);
  const result = applyMarketView(base, later, Date.parse(later.createdAt));
  assert.equal(result.games[0].analysisMarket, null);
  assert.equal(result.games[0].lastMarketReference.value, 0);
  assert.equal(result.games[0].lastMarketReference.collectedAt, old.createdAt);
  assert.equal(result.marketFeed.status, 'stale');
  assert.equal(result.marketLineHistory.length, 1);
  assert.equal(result.marketLineHistory[0].quotedAt, old.createdAt);
  assert.equal(result.games[0].market, -6);
  assert.equal(result.score, base.score);
  assert.equal(JSON.stringify(result).includes('44'), false);
  assert.deepEqual(later, before);
});

test('moving consensus remains separate from a saved scoring reference and never backfills missing evidence', () => {
  const reference = { status: 'available', value: -6, source: 'Fixture median', sourceUrl: 'https://example.invalid/odds',
    snapshotId: 'saved-before-submit', observedAt: new Date(now - 120_000).toISOString(),
    capturedAt: new Date(now - 90_000).toISOString(), savedAt: new Date(now - 60_000).toISOString() };
  const view = { ...base, scoringPolicy: 'submission-time', submittedAt: reference.savedAt,
    games: [{ ...game, scoringReference: reference }] };
  const result = applyMarketView(view, snapshot(now, -9), now);
  assert.equal(result.games[0].currentConsensus.status, 'available'); assert.equal(result.games[0].currentConsensus.value, -9);
  assert.deepEqual(result.games[0].scoringReference, reference); assert.equal(result.games[0].market, -6);
  assert.equal(result.games[0].points, 6); assert.equal(result.score, 6);
  assert.deepEqual(result.games[0].submissionTimeComparison.reference, reference);
  const later = applyMarketView(view, snapshot(now, -9), now + 3600_000);
  assert.equal(later.games[0].currentConsensus.status, 'stale'); assert.equal(later.games[0].currentConsensus.value, -9);
  assert.equal(later.games[0].scoringReference.status, 'available'); assert.equal(later.games[0].points, 6);
  const missing = { ...view, games: [{ ...game, market: null, points: null, scoringReference: { status: 'unavailable', value: null } }], score: null };
  const withFeed = applyMarketView(missing, snapshot(now, -9), now);
  assert.equal(withFeed.games[0].submissionTimeComparison.status, 'unavailable');
  assert.equal(withFeed.games[0].market, null); assert.equal(withFeed.score, null);
});

test('current consensus rejects wrong provider, event, observation basis, timing, and unpaired outcomes', () => {
  const mutations = [
    sample => { sample.payload.provider = 'wrong-provider'; },
    sample => { sample.payload.sport = 'wrong-sport'; },
    sample => { sample.payload.fetchedAt = new Date(now - 1).toISOString(); },
    sample => { sample.payload.games[0].providerEventId = ''; },
    sample => { sample.payload.games[0].markets.spread.quotes[0].provider = 'wrong-provider'; },
    sample => { sample.payload.games[0].markets.spread.quotes[0].providerEventId = 'wrong-event'; },
    sample => { sample.payload.games[0].markets.spread.quotes[0].timeBasis = 'unknown'; },
    sample => { sample.payload.games[0].markets.spread.quotes[0].outcomes.away.line = -7; },
    sample => { sample.payload.games[0].markets.spread.quotes[0].providerObservedAt = new Date(now - 300001).toISOString(); },
  ];
  for (const mutate of mutations) {
    const sample = snapshot(); mutate(sample);
    const result = applyMarketView(base, sample, now);
    assert.equal(result.games[0].currentConsensus.status, 'unavailable');
    assert.equal(result.games[0].currentConsensus.value, null); assert.deepEqual(result.marketLineHistory, []);
    assert.equal(result.games[0].points, base.games[0].points);
  }
  const total = snapshot(); total.payload.games[0].markets.total.quotes[0].outcomes.under.line = 99;
  assert.equal(applyMarketView({ ...base, mode: 'guess_total' }, total, now).games[0].currentConsensus.value, null);
});
