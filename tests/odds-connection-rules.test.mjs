// Redesign stage 78: the Odds connection rules both commissioner screens share (web/src/oddsConnection.js). A fetch needs a
// measured quota that keeps the 50-credit reserve whole, counts show only whole numbers, and a reply keeps only its counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ODDS_FAILURES, ODDS_FETCH_MIN_CREDITS, ODDS_LOW_QUOTA, oddsCount, oddsFetchAllowed, oddsSummary } from '../web/src/oddsConnection.js';

test('a fetch is allowed only after a check measured enough free credits', () => {
  assert.equal(ODDS_FETCH_MIN_CREDITS, 52);
  assert.equal(oddsFetchAllowed({ status: 'succeeded', quota: { remaining: 52 } }), true);
  assert.equal(oddsFetchAllowed({ status: 'succeeded', quota: { remaining: 51 } }), false);
  for (const remaining of [undefined, null, '400', 52.5, Number.NaN]) assert.equal(oddsFetchAllowed({ quota: { remaining } }), false);
  assert.equal(oddsFetchAllowed(null), false);
  assert.match(ODDS_LOW_QUOTA, /at least 52 free credits/);
});

test('counts are whole numbers or "Unavailable"', () => {
  assert.equal(oddsCount(0), '0');
  assert.equal(oddsCount(398), '398');
  for (const value of [-1, 1.5, '6', null, undefined]) assert.equal(oddsCount(value), 'Unavailable');
});

test('a reply keeps only its status and counts, never market values', () => {
  const reply = { status: 'succeeded', matchedEvents: 2, availableQuotes: 6, quota: { remaining: 398, last: 2 }, quotes: [{ book: 'x', spread: -3.5 }], errorCode: null };
  assert.deepEqual(oddsSummary('collect', reply), { operation: 'collect', status: 'succeeded', matchedEvents: 2, availableQuotes: 6, quota: { remaining: 398, last: 2 } });
  assert.deepEqual(Object.keys(ODDS_FAILURES).sort(), ['ODDS_AUTH', 'ODDS_BUDGET', 'ODDS_LEASE_EXPIRED', 'ODDS_QUOTA_COST', 'ODDS_RATE_LIMIT']);
});
