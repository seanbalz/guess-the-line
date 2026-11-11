import test from 'node:test';
import assert from 'node:assert/strict';
import { nbaRoute, nbaHash, nbaFragment, displayUnits, recoverOperation } from '../web/src/next/nba/route.js';
test('NBA namespace keeps its date and filter values on the new places without consuming NFL links', () => {
  assert.equal(nbaRoute('#play'), null);
  assert.deepEqual(nbaRoute('#nba/history?market=spread&from=2026-10-01'), { tab: 'bets', view: { pane: 'history', status: undefined, market: 'spread', from: '2026-10-01', to: undefined }, legacy: true });
  assert.equal(nbaHash(nbaRoute('#nba/games?date=2026-10-21')), '#nba/research/games?date=2026-10-21');
  assert.deepEqual(nbaRoute('#nba/bets/open'), { tab: 'bets', view: { pane: 'open', status: undefined, market: undefined, from: undefined, to: undefined }, legacy: false });
  assert.equal(nbaHash(nbaRoute('#nba/bets?status=all')), '#nba/bets/open');
  // Values outside each tab's allowlist never reach an NBA read.
  assert.equal(nbaHash(nbaRoute('#nba/bets/history?status=nope&market=props&from=2026-13-40')), '#nba/bets/history');
});
test('in-page #nba fragments stay in the NBA section; NFL addresses and empty hashes do not', () => {
  // SportEntry keeps NBA mounted for these while NBA shows, so an in-page anchor never reads as a sport change.
  assert.equal(nbaRoute('#nba-main'), null);
  assert.equal(nbaFragment('#nba-main'), true);
  assert.equal(nbaFragment('#nba/games'), true);
  for (const hash of ['#main', '#home', '#play', '', null, undefined]) assert.equal(nbaFragment(hash), false, String(hash));
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
