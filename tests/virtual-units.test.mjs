import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler } from '../cloud/handler.mjs';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'sean@example.test', emailConfirmed: true };
const kickoff = '2099-10-08T20:00:00.000Z';
const observed = '2099-10-08T18:00:00.000Z';
const game = { id: 'NYJ-BUF', away: 'New York Jets', home: 'Buffalo Bills', kickoff };
const state = { revision: 3, state: { league: { season: 2099, week: 5 }, games: [game] } };
const snapshot = { id: '22222222-2222-4222-8222-222222222222', createdAt: observed, payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: observed, games: [{ gameId: game.id, home: game.home, away: game.away, kickoff, matchStatus: 'matched', markets: { spread: { quotes: [{ provider: 'the-odds-api', providerEventId: 'event-1', book: 'draftkings', market: 'spread', value: -3.5, providerObservedAt: observed, collectedAt: observed, outcomes: { home: { line: -3.5, odds: -110 }, away: { line: 3.5, odds: -110 } } }] }, total: { quotes: [] } } }] } };

function make() {
  let saved = null;
  const handler = createCloudHandler({
    authenticate: async token => token === 'token' ? user : null,
    storage: { membership: async () => ({ active: true, player_id: 'sean', role: 'commissioner' }) },
    weekly: { load: async () => state },
    odds: { marketSnapshot: async () => snapshot },
    virtual: { read: async () => ({ season: 2099, week: 5, revision: 3, games: [game], picks: [], summary: { wins: 0, losses: 0, pushes: 0, pending: 0, voids: 0, riskUnits: 0, netUnits: 0, roi: null, qualificationPicks: 0, qualificationUnits: 0 } }), save: async (_user, _league, revision, body) => { saved = { revision, body }; return 4; } },
    clock: () => Date.parse('2099-10-08T19:00:00.000Z'),
  });
  return { handler, getSaved: () => saved };
}

test('virtual units reads best retained book offer and saves a matching pick', async () => {
  const { handler, getSaved } = make();
  const read = await handler(new Request('https://example.test/gtl-api/virtual-units?league=sean-troy-luke', { headers: { authorization: 'Bearer token' } }));
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.games[0].offers.spread.home.book, 'draftkings');
  assert.equal(body.games[0].offers.spread.home.line, -3.5);
  assert.equal(body.games[0].consensus.spread.value, -3.5);
  const save = await handler(new Request('https://example.test/gtl-api/virtual-pick?league=sean-troy-luke', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify({ gameId: game.id, market: 'spread', side: 'home', line: -3.5, odds: -110, units: 1, source: 'draftkings', quotedAt: observed }) }));
  assert.equal(save.status, 200);
  assert.equal(getSaved().revision, 3);
  assert.equal(getSaved().body.units, 1);
});

test('virtual units keeps a saved quote usable after it ages', async () => {
  const { handler } = make();
  const response = await handler(new Request('https://example.test/gtl-api/virtual-pick?league=sean-troy-luke', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify({ gameId: game.id, market: 'spread', side: 'away', line: 3.5, odds: -110, units: 0.5, source: 'draftkings', quotedAt: observed }) }));
  assert.equal(response.status, 200);
});
