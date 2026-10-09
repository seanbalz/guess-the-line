import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteReceipt, confirmQuoteReceipt, compareSelectionQuotes } from '../cloud/quote-receipt.mjs';
import { applyMarketView } from '../cloud/market-view.mjs';
const now = Date.parse('2026-10-08T18:00:00Z');
const game = { id: 'fixture', home: 'Home', away: 'Away', kickoff: '2026-10-09T00:15:00Z', prediction: -4 };
function snapshot(at = now, value = -3) {
  const time = new Date(at).toISOString();
  return { id: `saved-${at}`, createdAt: time, payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: time, games: [{ gameId: game.id, ...game, providerEventId: 'event-fixture', matchStatus: 'matched',
    markets: Object.fromEntries(['spread', 'total'].map(market => [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: 'event-fixture', book, market, value: market === 'spread' ? value : 44.5,
      providerObservedAt: time, collectedAt: time, timeBasis: 'provider_market_last_update',
      outcomes: market === 'spread' ? { home: { line: value, odds: -110 }, away: { line: -value, odds: 100 } }
        : { over: { line: 44.5, odds: -105 }, under: { line: 44.5, odds: -115 } }, secret: 'never project',
    })) }])) }] } };
}
test('paired receipts preserve side, separate timestamps and server selection time without promising tradability', () => {
  const s = snapshot(), before = structuredClone(s);
  const receipt = buildQuoteReceipt(s, game, 'spread', 'draftkings', 'away', now);
  assert.equal(receipt.line, 3); assert.equal(receipt.odds, 100); assert.equal(receipt.tradability, 'not_confirmed');
  assert.equal(receipt.quotedAt, s.createdAt); assert.equal(receipt.collectedAt, s.createdAt);
  const chosen = confirmQuoteReceipt(receipt, s, game, now + 1000);
  assert.equal(chosen.selectedAt, '2026-10-08T18:00:01.000Z'); assert.equal(chosen.enteredAt, chosen.selectedAt);
  assert(!JSON.stringify(chosen).includes('secret')); assert.deepEqual(s, before);
});
test('re-review is required for new snapshots, tampering, stale quotes, ambiguous mapping and closed events', () => {
  const s = snapshot(), receipt = buildQuoteReceipt(s, game, 'spread', 'draftkings', 'home', now);
  for (const changed of [snapshot(now + 1000, -3.5), snapshot(now + 1000, -3)]) {
    assert.throws(() => confirmQuoteReceipt(receipt, changed, game, now + 1000), /Review/);
  }
  assert.throws(() => confirmQuoteReceipt({ ...receipt, odds: 250 }, s, game, now), /Review/);
  for (const mutate of [s => s.payload.games.push(s.payload.games[0]), s => s.payload.games[0].markets.spread.quotes[0].providerEventId = 'wrong',
    s => s.payload.games[0].markets.spread.quotes[0].outcomes.away.line = 4,
    s => s.payload.games[0].markets.spread.quotes[0].outcomes.home.odds = 0,
    s => s.payload.games[0].markets.spread.quotes[0].collectedAt = new Date(now + 1).toISOString(),
    s => s.payload.games[0].markets.spread.quotes.push(s.payload.games[0].markets.spread.quotes[0])]) {
    const bad = snapshot(); mutate(bad); assert.equal(buildQuoteReceipt(bad, game, 'spread', 'draftkings', 'home', now), null);
  }
  assert.equal(buildQuoteReceipt(s, game, 'spread', 'draftkings', 'home', now + 300001), null);
  assert.equal(buildQuoteReceipt(s, game, 'spread', 'draftkings', 'home', Date.parse(game.kickoff)), null);
});
test('Challenge receipt projection requires each matching ballot and contains no hidden opposite market', () => {
  const view = { mode: 'betting_challenge', games: [game], marketAccess: { spread: true, total: false } };
  const result = applyMarketView(view, snapshot(), now);
  assert.equal(result.games[0].quoteReceipts.length, 6);
  assert(result.games[0].quoteReceipts.every(receipt => receipt.market === 'spread'));
  assert(!JSON.stringify(result).includes('44.5'));
  const hidden = { ...view, marketAccess: { spread: false, total: false } };
  assert.equal(applyMarketView(hidden, snapshot(), now), hidden);
});
test('submission-time reference rejects future backfill, old samples and preserves scoring', () => {
  const view = { mode: 'guess_spread', revealed: true, games: [game], submittedAt: new Date(now - 60000).toISOString(), score: 91 };
  let result = applyMarketView(view, snapshot(), now);
  assert.equal(result.games[0].submissionTimeComparison.status, 'unavailable');
  const s = snapshot(); s.history = [snapshot(now - 120000, -2), snapshot(now - 9 * 60000, -1)];
  result = applyMarketView(view, s, now);
  assert.equal(result.games[0].submissionTimeComparison.reference.value, -2);
  assert.equal(result.games[0].submissionTimeComparison.discrepancy, 2);
  assert.equal(result.score, 91); assert.equal(result.games[0].sampledMovement.immediate, false);
  assert.equal(result.games[0].sampledMovement.delta, -2);
  assert.deepEqual(result.games[0].sampledMovement.crossedThresholds, [1.5]);
  const old = snapshot(now - 9 * 60000); old.history = [];
  assert.equal(applyMarketView(view, old, now).games[0].submissionTimeComparison.status, 'unavailable');
});

test('selection comparison uses only subsequent saved same-book quotes and preserves original entry times', () => {
  const first = snapshot(), receipt = buildQuoteReceipt(first, game, 'spread', 'draftkings', 'away', now);
  const selection = { ...confirmQuoteReceipt(receipt, first, game, now + 1000), quoteReceipt: receipt };
  const later = snapshot(now + 60000, -4), future = snapshot(now + 180000, -10);
  const result = compareSelectionQuotes(selection, [first, later, future], game, now + 120000);
  assert.equal(result.status, 'available'); assert.equal(result.selectedQuote.line, 3); assert.equal(result.laterQuote.line, 4);
  assert.equal(result.lineDifference, 1); assert.equal(result.selectedAt, '2026-10-08T18:00:01.000Z');
  const before = structuredClone(selection);
  assert.equal(compareSelectionQuotes(selection, [first, future], game, now + 120000).status, 'unavailable');
  assert.equal(compareSelectionQuotes({ ...selection, quoteReceipt: undefined }, [later], game, now + 120000).status, 'unavailable');
  assert.deepEqual(selection, before);
});
