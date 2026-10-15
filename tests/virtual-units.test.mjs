import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler } from '../cloud/handler.mjs';
import { providerVirtualError } from '../cloud/virtual-units.mjs';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'sean@example.test', emailConfirmed: true };
const kickoff = '2099-10-08T20:00:00.000Z';
const observed = '2099-10-08T18:00:00.000Z';
const game = { id: 'NYJ-BUF', away: 'New York Jets', home: 'Buffalo Bills', kickoff };
const state = { revision: 3, state: { league: { season: 2099, week: 5 }, games: [game] } };
const snapshot = { id: '22222222-2222-4222-8222-222222222222', createdAt: observed, payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: observed, games: [{ gameId: game.id, home: game.home, away: game.away, kickoff, matchStatus: 'matched', markets: { spread: { quotes: [{ provider: 'the-odds-api', providerEventId: 'event-1', book: 'draftkings', market: 'spread', value: -3.5, providerObservedAt: observed, collectedAt: observed, outcomes: { home: { line: -3.5, odds: -110 }, away: { line: 3.5, odds: -110 } } }] }, total: { quotes: [] } } }] } };

function make({ market = snapshot, picks = [] } = {}) {
  let saved = null;
  const handler = createCloudHandler({
    authenticate: async token => token === 'token' ? user : null,
    storage: { membership: async () => ({ active: true, player_id: 'sean', role: 'commissioner' }) },
    weekly: { load: async () => state },
    odds: { marketSnapshot: async () => market },
    virtual: { read: async () => ({ season: 2099, week: 5, revision: 3, games: [game], picks, summary: { wins: 0, losses: 0, pushes: 0, pending: 0, voids: 0, riskUnits: 0, netUnits: 0, roi: null, qualificationPicks: 0, qualificationUnits: 0 } }), save: async (_user, _league, revision, body) => { saved = { revision, body }; return 4; },
      // Stage 20 line lock: this player has sent both Guess the Line markets of the published week, so every line is open
      // (tests/virtual-units-line-lock.test.mjs covers the lock itself).
      publishedWeek: async () => ({ season: 2099, week: 5 }), weekRevealed: async () => true },
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

// Stage 14, D-18 best price (shared/best-offer.mjs). Fixture books and prices only.
const spreadQuote = (book, at, homeLine, homeOdds, awayOdds) => ({ provider: 'the-odds-api', providerEventId: 'event-1', book, market: 'spread', value: homeLine, providerObservedAt: at, collectedAt: at,
  outcomes: { home: { line: homeLine, odds: homeOdds }, away: { line: -homeLine, odds: awayOdds } } });
const snapshotAt = (id, createdAt, quotes) => ({ id, createdAt, payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: createdAt,
  games: [{ gameId: game.id, home: game.home, away: game.away, kickoff, matchStatus: 'matched', markets: { spread: { quotes }, total: { quotes: [] } } }] } });
// gtl_read_market_snapshot returns the latest snapshot plus its history, oldest first.
const withHistory = (...snapshots) => ({ ...snapshots.at(-1), officialVerified: false, history: snapshots });
const readOffers = async handler => {
  const response = await handler(new Request('https://example.test/gtl-api/virtual-units?league=sean-troy-luke', { headers: { authorization: 'Bearer token' } }));
  assert.equal(response.status, 200);
  return response.json();
};
const place = (handler, pick) => handler(new Request('https://example.test/gtl-api/virtual-pick?league=sean-troy-luke', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(pick) }));

test('virtual units breaks a same-line tie by the better price, not the price closest to -110', async () => {
  const at = '2099-10-08T18:00:00.000Z';
  const { handler } = make({ market: withHistory(snapshotAt('one', at, [
    spreadQuote('draftkings', at, -3.5, -110, -110), spreadQuote('fanduel', at, -3.5, 100, -120), spreadQuote('betmgm', at, -3.5, -115, -105)])) });
  const { spread } = (await readOffers(handler)).games[0].offers;
  assert.deepEqual([spread.home.book, spread.home.source, spread.home.line, spread.home.odds, spread.home.observedAt], ['fanduel', 'FanDuel', -3.5, 100, at]);
  assert.deepEqual([spread.away.book, spread.away.line, spread.away.odds], ['betmgm', 3.5, -105]);
});

test('a book missing from the latest snapshot is offered at its newest retained quote, saved picks keep their terms, and only a book\'s newest retained quote saves', async () => {
  const early = '2099-10-08T12:00:00.000Z', middle = '2099-10-08T14:00:00.000Z', late = '2099-10-08T16:00:00.000Z';
  const market = withHistory(
    snapshotAt('early', early, [spreadQuote('betmgm', early, -2.5, -110, -110)]),
    snapshotAt('middle', middle, [spreadQuote('betmgm', middle, -4, -110, -110)]),
    snapshotAt('late', late, [spreadQuote('draftkings', late, -3.5, -110, -110)]));
  const savedPick = { gameId: game.id, market: 'spread', status: 'pending', selection: { side: 'away', line: 2.5, odds: -110, units: 1, source: 'BetMGM', quotedAt: early } };
  const { handler, getSaved } = make({ market, picks: [savedPick] });
  const body = await readOffers(handler);
  const { spread } = body.games[0].offers;
  // BetMGM's newest quote is -4 (away +4), not its oldest -2.5 (away +2.5).
  assert.deepEqual([spread.away.book, spread.away.line, spread.away.observedAt], ['betmgm', 4, middle]);
  assert.deepEqual([spread.home.book, spread.home.line, spread.home.observedAt], ['draftkings', -3.5, late]);
  assert.deepEqual(body.games[0].consensus.spread, { value: -3.75, source: 'Latest retained named-book median', books: 2, observedAt: middle });
  // The read passes saved picks through untouched (decorate() never rewrites them), whatever the offers are now.
  assert.deepEqual(body.picks, [savedPick], 'a saved pick keeps its own line, odds, book and time');
  const stale = await place(handler, { gameId: game.id, market: 'spread', side: 'away', line: 2.5, odds: -110, units: 1, source: 'betmgm', quotedAt: early });
  assert.equal(stale.status, 409);
  assert.equal(getSaved(), null);
  const fresh = await place(handler, { gameId: game.id, market: 'spread', side: 'away', line: 4, odds: -110, units: 1, source: 'betmgm', quotedAt: middle });
  assert.equal(fresh.status, 200);
  assert.deepEqual(getSaved().body, { gameId: game.id, market: 'spread', side: 'away', line: 4, odds: -110, units: 1, source: 'BetMGM', quotedAt: middle });
  // Not only the best offer: any book's newest retained quote for the side saves (DraftKings away +3.5 here, behind
  // BetMGM's +4). That is the old D-18 behaviour; the stage 20 line lock does not change it.
  const other = await place(handler, { gameId: game.id, market: 'spread', side: 'away', line: 3.5, odds: -110, units: 1, source: 'draftkings', quotedAt: late });
  assert.equal(other.status, 200);
});

test('/virtual-pick: a retained quote that prices only one side refuses the other side with 409, never a server error', async () => {
  // Follow-up to the stage 14 review: /virtual-units guarded a missing side, but /virtual-pick read q.outcomes[side].line.
  const at = '2099-10-08T18:00:00.000Z';
  const oneSided = { ...spreadQuote('draftkings', at, -3.5, -110, -110), outcomes: { home: { line: -3.5, odds: -110 } } };
  const { handler, getSaved } = make({ market: withHistory(snapshotAt('one', at, [oneSided])) });
  const { spread } = (await readOffers(handler)).games[0].offers;
  assert.equal(spread.away, null);
  assert.equal(spread.home.book, 'draftkings');
  const away = await place(handler, { gameId: game.id, market: 'spread', side: 'away', line: 3.5, odds: -110, units: 1, source: 'draftkings', quotedAt: at });
  assert.equal(away.status, 409, JSON.stringify(await away.clone().json()));
  assert.equal(getSaved(), null);
  const home = await place(handler, { gameId: game.id, market: 'spread', side: 'home', line: -3.5, odds: -110, units: 1, source: 'draftkings', quotedAt: at });
  assert.equal(home.status, 200);
});

test('a quote observed at or after kickoff never becomes the offer; the book keeps its last quote before kickoff', async () => {
  const before = '2099-10-08T18:00:00.000Z', after = '2099-10-08T20:05:00.000Z';
  const market = withHistory(
    snapshotAt('before', before, [spreadQuote('draftkings', before, -3.5, -105, -115), spreadQuote('fanduel', before, -3.5, -110, -110)]),
    snapshotAt('after', after, [spreadQuote('fanduel', kickoff, -3.5, 150, -200), spreadQuote('draftkings', after, -3, -110, -110)]));
  const { handler } = make({ market });
  const { spread } = (await readOffers(handler)).games[0].offers;
  assert.deepEqual([spread.home.book, spread.home.odds, spread.home.observedAt], ['draftkings', -105, before]);
  assert.deepEqual([spread.away.book, spread.away.odds, spread.away.observedAt], ['fanduel', -110, before]);
});

// D-26 commissioner-only settlement route. The same admin check the community
// routes use (gtl_community_admin) gates it; finals come from the public file.
const finalsCsv = ['game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,location',
  '2099_05_NYJ_BUF,2099,REG,5,2099-10-08,16:00,NYJ,20,BUF,27,Home', '2099_05_SEA_DEN,2099,REG,5,2099-10-11,13:00,SEA,,DEN,,Home'].join('\n');
function makeSettle({ admin = true, scheduleError = null, settleError = null } = {}) {
  const calls = [];
  const handler = createCloudHandler({
    authenticate: async token => token === 'token' ? user : null,
    storage: { membership: async () => ({ active: true, player_id: admin ? 'sean' : 'troy', role: admin ? 'commissioner' : 'player' }) },
    weekly: { load: async () => state }, odds: { marketSnapshot: async () => snapshot },
    virtual: {
      read: async () => ({ season: 2099, week: 5, revision: 3, games: [game], picks: [], summary: {} }), save: async () => 4,
      admin: async userId => { calls.push(['admin', userId]); return admin; },
      schedule: async () => { if (scheduleError) throw scheduleError; return finalsCsv; },
      settle: async (season, week, payload) => { calls.push(['settle', season, week, payload]); if (settleError) throw settleError; return { settledAt: '2099-10-12T08:00:00.000Z', settled: 1, corrected: 0, unchanged: 0, picksSettled: 2, games: [{ gameId: 'NYJ-BUF', status: 'final', version: 1, changed: true, picksSettled: 2, previous: null }], picks: [{ userId: user.id }], players: [{ userId: user.id, picksSettled: 2, netUnitsDelta: 1.8 }] }; },
    },
    clock: () => Date.parse('2099-10-12T08:00:00.000Z'),
  });
  const post = (body, query = '', method = 'POST') => handler(new Request(`https://example.test/gtl-api/virtual-units/settle${query}`, { method, headers: { authorization: 'Bearer token', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  return { post, calls };
}

test('settlement route refuses members with 403 before touching the finals file or the RPC', async () => {
  const { post, calls } = makeSettle({ admin: false });
  const response = await post({ season: 2099, week: 5 });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Only the commissioner can settle Virtual Units.' });
  assert.deepEqual(calls, [['admin', user.id]]);
});

test('settlement route builds finals from the public file for the commissioner and returns counts without account ids', async () => {
  const { post, calls } = makeSettle();
  const response = await post({ season: 2099, week: 5 });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls[1], ['settle', 2099, 5, { source: 'nflverse nfldata games.csv final scores', sourceUrl: 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv', observedAt: '2099-10-12T08:00:00.000Z', actorId: user.id, games: [{ gameId: 'NYJ-BUF', status: 'final', home: 27, away: 20 }] }]);
  assert.deepEqual(body, { season: 2099, week: 5, source: 'nflverse nfldata games.csv final scores', sourceUrl: 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv', observedAt: '2099-10-12T08:00:00.000Z', finals: 1, pending: ['SEA-DEN'],
    settledAt: '2099-10-12T08:00:00.000Z', settled: 1, corrected: 0, unchanged: 0, picksSettled: 2, skipped: [], games: [{ gameId: 'NYJ-BUF', status: 'final', version: 1, changed: true, picksSettled: 2, previous: null }] });
  assert.equal(JSON.stringify(body).includes(user.id), false);
});

test('settlement route validates the body, rejects query parameters and other methods, and maps RPC refusals', async () => {
  for (const [body, status] of [[{}, 400], [{ season: 2099 }, 400], [{ season: 2099, week: 0 }, 400], [{ season: 2099, week: 5, extra: 1 }, 400], [{ season: '2099', week: 5 }, 400]]) {
    const { post, calls } = makeSettle();
    assert.equal((await post(body)).status, status);
    assert.equal(calls.some(([name]) => name === 'settle'), false);
  }
  assert.equal((await makeSettle().post({ season: 2099, week: 5 }, '?league=sean-troy-luke')).status, 400);
  assert.equal((await makeSettle().post(undefined, '', 'GET')).status, 405);
  assert.equal((await makeSettle().post({ season: 2099, week: 7 })).status, 422, 'a week missing from the file settles nothing');
  assert.equal((await makeSettle({ scheduleError: new Error('offline') }).post({ season: 2099, week: 5 })).status, 503);
  for (const [code, status] of [['GTL_SETTLEMENT_WEEK', 404], ['GTL_SETTLEMENT_EARLY', 409], ['GTL_SETTLEMENT_INPUT', 400]]) {
    const error = providerVirtualError(code); error.code = code;
    const response = await makeSettle({ settleError: error }).post({ season: 2099, week: 5 });
    assert.equal(response.status, status);
    assert.match((await response.json()).error, /nothing was settled/i);
  }
  const leak = new Error('postgres://user:secret@host/db'); leak.code = 'UNAVAILABLE';
  const response = await makeSettle({ settleError: leak }).post({ season: 2099, week: 5 });
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('secret'), false);
});
