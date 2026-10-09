import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderResults, recordReviewedResult, reviewedSettlement } from '../server/results.mjs';
import { gradeBet, freezeBenchmark, validateBet } from '../server/domain.mjs';
const context = { season: 2026, week: 5 };
const game = { id: 'fixture', providerEventId: 'event', home: 'Home', away: 'Away', kickoff: '2026-10-09T00:15:00Z' };
const payload = [{ id: 'event', sport_key: 'americanfootball_nfl', commence_time: game.kickoff, completed: true, home_team: game.home, away_team: game.away,
  scores: [{ name: 'Home', score: '27' }, { name: 'Away', score: '24' }], last_update: '2026-10-09T03:30:00Z' }];
const collectedAt = '2026-10-09T03:31:00Z', reviewedAt = '2026-10-09T03:32:00Z';
test('documented provider finals become review candidates, never actual start evidence', () => {
  const row = normalizeProviderResults(payload, [game], collectedAt, context)[0];
  assert.equal(row.status, 'review_required'); assert.equal(row.home, 27); assert.equal(row.away, 24);
  assert.equal(row.actualKickoff, null); assert.equal(row.verifiedActualStart, false);
  assert.equal(normalizeProviderResults([{ ...payload[0], completed: false }], [game], collectedAt, context)[0].status, 'pending');
  assert.throws(() => normalizeProviderResults(payload, [game], collectedAt), /Invalid/);
});
test('identity changes, duplicate events, future timestamps and ambiguous score names fail closed', () => {
  for (const patch of [{ home_team: 'Wrong' }, { commence_time: '2026-10-10T00:15:00Z' }, { sport_key: 'wrong' }, { last_update: '2026-10-09T04:00:00Z' },
    { scores: [{ name: 'Home', score: '27' }, { name: 'Home', score: '24' }] }, { scores: [{ name: 'Home', score: '-1' }, { name: 'Away', score: '24' }] }]) {
    assert.equal(normalizeProviderResults([{ ...payload[0], ...patch }], [game], collectedAt, context)[0].status, 'unavailable');
  }
  assert.equal(normalizeProviderResults([...payload, ...payload], [game], collectedAt, context)[0].reason, 'ambiguous_event');
});
test('reviewed settlement preserves quote and audit history, retries exactly once, and regrades by version', () => {
  const candidate = normalizeProviderResults(payload, [game], collectedAt, context)[0];
  const options = { actorId: 'reviewer-fixture', requestId: 'one', reason: 'Reviewed final source receipt', reviewedAt };
  const first = recordReviewedResult([], candidate, options);
  assert.equal(first.event.version, 1); assert.equal(first.replayed, false);
  assert.equal(recordReviewedResult(first.ledger, candidate, options).replayed, true);
  assert.throws(() => recordReviewedResult(first.ledger, { ...candidate, home: 28 }, options), /different content/);
  const picks = [{ ...context, id: 'pick', gameId: game.id, market: 'spread', side: 'home', line: -3 },
    { ...context, id: 'other', gameId: game.id, market: 'total', side: 'under', line: 51 },
    { ...context, season: 2027, id: 'different-year', gameId: game.id, market: 'spread', side: 'home', line: -3 }];
  const savedPicks = structuredClone(picks), savedLedger = structuredClone(first.ledger);
  assert.deepEqual(reviewedSettlement(picks, first.ledger).map(row => row.outcome), ['P', 'P', null]);
  assert.throws(() => recordReviewedResult(first.ledger, { ...candidate, home: 28 }, { ...options, requestId: 'two' }), /history changed/);
  const second = recordReviewedResult(first.ledger, { ...candidate, home: 28 }, { ...options, requestId: 'two', expectedVersion: 1, reason: 'Publisher corrected final score' });
  assert.deepEqual(reviewedSettlement(picks, second.ledger).map(row => row.outcome), ['W', 'L', null]);
  assert.equal(second.event.type, 'reviewed_result_correction'); assert.equal(second.event.previous.home, 27);
  assert.deepEqual(first.ledger, savedLedger); assert.deepEqual(picks, savedPicks);
});
test('unsupported result statuses and invalid selections never receive a fabricated loss or void', () => {
  const pick = { market: 'total', side: 'over', line: 44.5 }, result = { status: 'final', home: 27, away: 24 };
  for (const status of ['postponed', 'cancelled', 'suspended', 'live', 'void']) assert.equal(gradeBet(pick, { ...result, status }), null);
  for (const bad of [null, {}, { ...pick, side: 'home' }, { ...pick, market: 'moneyline' }, { ...pick, line: null }]) assert.equal(gradeBet(bad, result), null);
  assert.throws(() => validateBet(pick, Date.now(), 'invalid'), /verified scheduled kickoff/);
});
test('pure official freeze honors five-minute source gate and requires a nonempty slate', () => {
  const kickoff = '2026-10-09T00:15:00Z', now = Date.parse(kickoff), quotedAt = new Date(now - 6 * 60000).toISOString();
  const snapshot = { mode: 'guess_spread', capturedAt: new Date(now - 1000).toISOString(), games: { fixture: {
    quotes: [1, 2, 3].map(book => ({ book: String(book), value: -3, quotedAt })), crossCheck: { source: 'Action Network', value: -3, quotedAt } } } };
  assert.equal(freezeBenchmark(null, [snapshot], kickoff, now, ['fixture'], 'guess_spread', { practice: false }), null);
  assert.equal(freezeBenchmark(null, [snapshot], kickoff, now, [], 'guess_spread', { practice: false }), null);
  const fresh = new Date(now - 60000).toISOString(); snapshot.games.fixture.quotes.forEach(q => { q.quotedAt = fresh; }); snapshot.games.fixture.crossCheck.quotedAt = fresh;
  assert(freezeBenchmark(null, [snapshot], kickoff, now, ['fixture'], 'guess_spread', { practice: false }));
});
