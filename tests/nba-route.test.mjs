import test from 'node:test';
import assert from 'node:assert/strict';
import { nbaRoute, nbaHash, displayUnits, recoverOperation } from '../web/src/next/nba/route.js';
test('NBA namespace preserves date/filter routes without consuming NFL links', () => {
  assert.equal(nbaRoute('#play'), null);
  assert.deepEqual(nbaRoute('#nba/history?market=spread&from=2026-10-01'), { screen: 'history', filters: { status: 'settled', market: 'spread', from: '2026-10-01' } });
  assert.equal(nbaHash(nbaRoute('#nba/games?date=2026-10-21')), '#nba/games?date=2026-10-21');
  assert.deepEqual(nbaRoute('#nba/bets'), { screen: 'bets', filters: { status: 'pending' } });
  assert.deepEqual(nbaRoute('#nba/bets?status=all'), { screen: 'bets', filters: {} });
});
test('decimal accounting display retains exact fractional digits', () => {
  assert.equal(displayUnits('9999991110.56790869'), '9999991110.56790869');
  assert.equal(displayUnits('1.23000000'), '1.23');
  assert.equal(displayUnits(null), '—');
});
test('uncertain saves recover by immutable operation receipt, including later revisions', async () => {
  const pending = { operationId: 'same-operation', ticket: { id: 'same-ticket' } };
  let body;
  const ticket = { id: 'same-ticket', revision: 3, audit: [{ operationId: 'same-operation' }] };
  assert.equal(await recoverOperation(pending, async (_, value) => { body = value; return { tickets: [ticket] }; }), ticket);
  assert.deepEqual(body, { ticketId: 'same-ticket' });
  assert.equal(await recoverOperation(pending, async () => ({ tickets: [] })), null);
});
