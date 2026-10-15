import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { CLOSED_GATE, lineLockedSentence, lockedMarkets, parseMarketsVisible, readLineGate } from '../cloud/line-lock.mjs';
import { FEATURE_OFF } from '../cloud/optional-rpc.mjs';
import { providerVirtualError } from '../cloud/virtual-units.mjs';
import { TODAYS_RULES } from '../cloud/live-rules.mjs';
import { assertNoLeak, leakScan, lineSecrets } from './helpers/leak-scan.mjs';
import { ALL, HOSTED } from './migrations.mjs';
import { ACCOUNTS, createCommunityWorld, pgliteAvailable, sendBallot, storeBookLines } from './cloud-browser/community-world.mjs';

// Redesign build plan stage 20 (D-36 as amended by D-39): the line lock on the old Virtual Units routes. A game's Spread
// or Total book offers and consensus stay hidden until the player locks in that game's pick for that market (today: a
// submitted ballot), sits out that market, or the game kicks off; until M-01 is applied the week's deadline also opens
// it (today's D-23 gate). /virtual-pick refuses a locked market before it compares any quote. Own picks keep their full
// terms. Fixture games, books and lines only: every line is an unusual half point, so the leak scan can find it.

const USER = '11111111-1111-4111-8111-111111111111';
const KICK_A = '2099-10-08T20:00:00.000Z', KICK_B = '2099-10-11T17:00:00.000Z';
const NOW = Date.parse('2099-10-08T19:00:00.000Z'), OBSERVED = '2099-10-08T18:00:00.000Z';
const A = { id: 'NYJ-BUF', away: 'New York Jets', home: 'Buffalo Bills', awayCode: 'NYJ', homeCode: 'BUF', kickoff: KICK_A };
const B = { id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', kickoff: KICK_B };
const LINES = { spread: { [A.id]: -11.5, [B.id]: 13.5 }, total: { [A.id]: 58.5, [B.id]: 31.5 } };
const SECRETS = { spread: lineSecrets(LINES.spread, { market: 'spread' }), total: lineSecrets(LINES.total, { market: 'total' }) };
const BOOKS = ['draftkings', 'fanduel', 'betmgm'];
const quote = (book, game, market) => {
  const line = LINES[market][game.id];
  return { provider: 'the-odds-api', providerEventId: `event-${game.id}`, book, market, value: line, providerObservedAt: OBSERVED, collectedAt: OBSERVED,
    outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } } };
};
const SNAPSHOT = { id: '22222222-2222-4222-8222-222222222222', createdAt: OBSERVED, officialVerified: false, payload: { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: OBSERVED,
  games: [A, B].map(game => ({ gameId: game.id, home: game.home, away: game.away, kickoff: game.kickoff, matchStatus: 'matched',
    markets: { spread: { quotes: BOOKS.map(book => quote(book, game, 'spread')) }, total: { quotes: BOOKS.map(book => quote(book, game, 'total')) } } })) } };
// The player's own earlier pick, placed at an older line (-9.5, not a secret): it always comes back whole.
const OWN = { gameId: A.id, market: 'spread', status: 'pending', selection: { side: 'home', line: -9.5, odds: -110, units: 1, source: 'BetMGM', quotedAt: '2099-10-07T18:00:00.000Z' }, audit: [] };
const SUMMARY = { wins: 0, losses: 0, pushes: 0, pending: 1, voids: 0, riskUnits: 0, netUnits: 0, roi: null, qualificationPicks: 1, qualificationUnits: 1 };
const OWN_PICKS = path => path.startsWith('$.picks');

/**
 * The real handler over in-memory services. published: the community week ({ season, week } or null);
 * revealed: today's gate per mode (gtl_week_revealed); optional: an optional-RPC caller (name, body) => value.
 */
function make({ published = { season: 2099, week: 5 }, revealed = {}, optional, clock = NOW, groupWeek = 5 } = {}) {
  const calls = [];
  const handler = createCloudHandler({
    authenticate: async token => (token === 'token' ? { id: USER, email: 'player@example.test', emailConfirmed: true } : null),
    storage: { membership: async () => ({ active: true, player_id: 'luke', role: 'player' }) },
    weekly: { load: async () => ({ revision: 3, state: { league: { season: 2099, week: groupWeek }, games: [A, B] } }) },
    odds: { marketSnapshot: async () => { calls.push(['marketSnapshot']); return SNAPSHOT; } },
    virtual: {
      read: async () => ({ season: 2099, week: groupWeek, revision: 3, games: [A, B], picks: [OWN], summary: SUMMARY }),
      save: async (_user, _league, revision, body) => { calls.push(['save', revision, body]); return 4; },
      publishedWeek: async () => { calls.push(['publishedWeek']); if (published instanceof Error) throw published; return published; },
      weekRevealed: async (user, season, week, mode, now) => { calls.push(['weekRevealed', user, season, week, mode, now]); if (revealed instanceof Error) throw revealed; return revealed[mode] === true; },
    },
    ...(optional ? { optionalRpc: async (name, body) => { calls.push(['optional', name, body]); return optional(name, body); } } : {}),
    clock: typeof clock === 'function' ? clock : () => clock,
  });
  const read = async () => {
    const response = await handler(new Request('https://example.test/gtl-api/virtual-units?league=sean-troy-luke', { headers: { authorization: 'Bearer token' } }));
    assert.equal(response.status, 200);
    return response.json();
  };
  const place = async (game, market, terms = {}) => {
    const side = market === 'spread' ? 'home' : 'over', line = LINES[market][game.id];
    const body = { gameId: game.id, market, side, line, odds: -110, units: 1, source: 'draftkings', quotedAt: OBSERVED, ...terms };
    const response = await handler(new Request('https://example.test/gtl-api/virtual-pick?league=sean-troy-luke', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  return { read, place, calls };
}
const locks = reply => Object.fromEntries(reply.games.map(game => [game.id, game.locked]));
const visible = reply => Object.fromEntries(reply.games.map(game => [game.id, [Object.keys(game.offers).sort(), Object.keys(game.consensus).sort()]]));

test('parseMarketsVisible keeps only { gameId: { spread, total } } booleans; anything else throws', () => {
  const games = parseMarketsVisible({ [A.id]: { spread: true, total: false }, [B.id]: { spread: false, total: false } });
  assert.deepEqual({ ...games }, { [A.id]: { spread: true, total: false }, [B.id]: { spread: false, total: false } });
  assert.deepEqual({ ...parseMarketsVisible({}) }, {});
  for (const bad of [null, [], 'x', { [A.id]: { spread: 'true', total: false } }, { [A.id]: { spread: true } }, { [A.id]: null }, { [A.id]: [true, true] }]) {
    assert.throws(() => parseMarketsVisible(bad), /Invalid line gate/, JSON.stringify(bad));
  }
  // A game named like an Object property is only ever an own key.
  assert.equal(Object.getPrototypeOf(parseMarketsVisible({ __proto__: { spread: true, total: true } })), null);
});

test('lockedMarkets: a kickoff opens both markets; before it only the gate\'s own week can open a game; nothing else does', () => {
  const week = { season: 2099, week: 5 }, before = Date.parse(KICK_A) - 1, at = Date.parse(KICK_A);
  const perGame = { ...week, games: parseMarketsVisible({ [A.id]: { spread: true, total: false } }), markets: null };
  const perMarket = { ...week, games: null, markets: { spread: false, total: true } };
  assert.deepEqual(lockedMarkets(A, { ...week, gate: CLOSED_GATE, now: before }), { spread: true, total: true });
  assert.deepEqual(lockedMarkets(A, { ...week, gate: CLOSED_GATE, now: at }), { spread: false, total: false }, 'kickoff opens it for everyone');
  assert.deepEqual(lockedMarkets(A, { ...week, gate: perGame, now: before }), { spread: false, total: true });
  assert.deepEqual(lockedMarkets(B, { ...week, gate: perGame, now: before }), { spread: true, total: true }, 'a game the gate does not list stays locked');
  assert.deepEqual(lockedMarkets(B, { ...week, gate: perMarket, now: before }), { spread: true, total: false });
  // The group's week is not the gate's week: only the kickoff opens its games.
  assert.deepEqual(lockedMarkets(A, { season: 2099, week: 4, gate: perMarket, now: before }), { spread: true, total: true });
  assert.deepEqual(lockedMarkets(A, { season: 2098, week: 5, gate: perGame, now: before }), { spread: true, total: true });
  assert.deepEqual(lockedMarkets(A, { season: 2099, week: 4, gate: perMarket, now: at }), { spread: false, total: false });
  // An unreadable kickoff never opens anything; a gate entry on the prototype is not a game.
  assert.deepEqual(lockedMarkets({ ...A, kickoff: 'soon' }, { ...week, gate: CLOSED_GATE, now: at }), { spread: true, total: true });
  assert.deepEqual(lockedMarkets({ ...A, id: 'toString' }, { ...week, gate: perGame, now: before }), { spread: true, total: true });
});

test('readLineGate: M-01\'s gtl_markets_visible when present, today\'s gtl_week_revealed while it is missing, closed on anything else', async () => {
  const service = (over = {}) => ({ publishedWeek: async () => ({ season: 2099, week: 5 }), weekRevealed: async (_u, _s, _w, mode) => mode === 'guess_spread', ...over });
  const asked = [];
  const m01 = await readLineGate({ userId: USER, service: service({ weekRevealed: async () => assert.fail('today\'s gate is not read when M-01 answers') }),
    optionalRpc: async (name, body) => { asked.push([name, body]); return { [A.id]: { spread: true, total: false } }; }, rules: TODAYS_RULES, now: NOW });
  assert.deepEqual([m01.season, m01.week, { ...m01.games }, m01.markets], [2099, 5, { [A.id]: { spread: true, total: false } }, null]);
  assert.deepEqual(asked, [['gtl_markets_visible', { p_user: USER, p_season: 2099, p_week: 5, p_now: new Date(NOW).toISOString() }]]);
  const today = await readLineGate({ userId: USER, service: service(), optionalRpc: async () => FEATURE_OFF, rules: Promise.resolve(TODAYS_RULES), now: NOW });
  assert.deepEqual([today.season, today.week, today.games, { ...today.markets }], [2099, 5, null, { spread: true, total: false }]);
  assert.deepEqual({ ...(await readLineGate({ userId: USER, service: service(), rules: TODAYS_RULES, now: NOW })).markets }, { spread: true, total: false }, 'no optional caller reads as M-01 missing');
  const closed = [
    ['no gate service', { service: {} }],
    ['no published week', { service: service({ publishedWeek: async () => null }) }],
    ['an impossible week', { service: service({ publishedWeek: async () => ({ season: 2099, week: 0 }) }) }],
    ['the week read fails', { service: service({ publishedWeek: async () => { throw new Error('offline'); } }) }],
    ['gtl_markets_visible fails (not missing)', { service: service(), optionalRpc: async () => { throw new Error('Optional feature unavailable.'); } }],
    ['gtl_markets_visible answers the wrong shape', { service: service(), optionalRpc: async () => ({ [A.id]: true }) }],
    ['gtl_week_revealed fails', { service: service({ weekRevealed: async () => { throw new Error('offline'); } }), optionalRpc: async () => FEATURE_OFF }],
    ['no gtl_week_revealed caller', { service: service({ weekRevealed: undefined }), optionalRpc: async () => FEATURE_OFF }],
    // Today's gate knows only today's rules: were sent picks final (M-02) or picks open until kickoff (M-07) without M-01's
    // gate, it would open a line too early, so the lock holds until kickoff instead.
    ['M-02 rules without M-01', { service: service(), optionalRpc: async () => FEATURE_OFF, rules: { sentFinal: true, lateWindow: 'deadline', revealAt: 'deadline' } }],
    ['M-07 rules without M-01', { service: service(), optionalRpc: async () => FEATURE_OFF, rules: { sentFinal: false, lateWindow: 'kickoff', revealAt: 'kickoff' } }],
    ['no rules', { service: service(), optionalRpc: async () => FEATURE_OFF, rules: undefined }],
  ];
  for (const [label, input] of closed) assert.equal(await readLineGate({ userId: USER, rules: TODAYS_RULES, now: NOW, ...input }), CLOSED_GATE, label);
  const truthy = await readLineGate({ userId: USER, service: service({ weekRevealed: async () => 'true' }), rules: TODAYS_RULES, now: NOW });
  assert.deepEqual({ ...truthy.markets }, { spread: false, total: false }, 'only a real true opens a market');
});

test('the lock sentence follows the live rules (the new app\'s copy.js lineLocked says the same)', () => {
  assert.equal(lineLockedSentence('spread', TODAYS_RULES), 'Submit your Spread picks to see this line.');
  assert.equal(lineLockedSentence('total', undefined), 'Submit your Total picks to see this line.');
  assert.equal(lineLockedSentence('total', { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' }), 'Lock in your Total pick to see this line.');
  // One wording: a GTL_LINE_LOCKED from the database (none raises it today; the route words its own refusal) reads as the
  // route's sentence under D-39, for no market in particular, never as a second explanation of the lock.
  const fromDatabase = providerVirtualError('GTL_LINE_LOCKED');
  assert.deepEqual([fromDatabase.status, fromDatabase.message], [409, 'Lock in your Guess the Line pick to see this line.']);
  assert.equal(fromDatabase.message, lineLockedSentence(null, { sentFinal: true }));
});

test('/virtual-units before a send: no book offer and no consensus for either market, every market locked, own pick whole', async () => {
  const { read, calls } = make();
  const reply = await read();
  assert.deepEqual(locks(reply), { [A.id]: { spread: true, total: true }, [B.id]: { spread: true, total: true } });
  assert.deepEqual(visible(reply), { [A.id]: [[], []], [B.id]: [[], []] });
  assertNoLeak(reply, { viewer: USER, secrets: [...SECRETS.spread, ...SECRETS.total], exempt: OWN_PICKS }, '/virtual-units');
  assert.deepEqual(reply.picks, [OWN], 'the player\'s own pick keeps its side, line, odds, units, book and time');
  assert.deepEqual(reply.rules, TODAYS_RULES, 'the reply carries the live rules, which word the lock');
  assert.deepEqual(calls.filter(([name]) => name === 'weekRevealed').map(call => call.slice(2, 6)), [[2099, 5, 'guess_spread', new Date(NOW).toISOString()], [2099, 5, 'guess_total', new Date(NOW).toISOString()]]);
  // The scan is not vacuous: with both markets sent, the same reply carries every line.
  const open = await make({ revealed: { guess_spread: true, guess_total: true } }).read();
  assert.deepEqual(locks(open), { [A.id]: { spread: false, total: false }, [B.id]: { spread: false, total: false } });
  assert.equal(leakScan(open, { viewer: USER, secrets: [...SECRETS.spread, ...SECRETS.total], exempt: OWN_PICKS }).length >= 8, true);
  assert.deepEqual(open.games[0].offers.spread.home, { book: 'betmgm', source: 'BetMGM', value: -11.5, outcomes: quote('betmgm', A, 'spread').outcomes, observedAt: OBSERVED, collectedAt: OBSERVED, side: 'home', line: -11.5, odds: -110 });
});

test('/virtual-pick refuses a locked market before comparing any quote: the offered terms and a guessed line get the same answer', async () => {
  const { place, calls } = make();
  const exact = await place(A, 'spread'), guessed = await place(A, 'spread', { line: -3.5 }), total = await place(B, 'total');
  assert.deepEqual([exact.status, exact.body], [409, { error: 'Submit your Spread picks to see this line.' }]);
  assert.deepEqual([guessed.status, guessed.body], [exact.status, exact.body], 'no answer tells whether a line is on offer');
  assert.deepEqual([total.status, total.body], [409, { error: 'Submit your Total picks to see this line.' }]);
  assert.deepEqual(calls.filter(([name]) => name === 'save' || name === 'marketSnapshot'), [], 'nothing is saved and no quote is even read');
  // Shape checks still come first, and a game that kicked off is closed, not locked.
  assert.equal((await place(A, 'spread', { units: 0 })).status, 400);
  const late = await make({ clock: Date.parse(KICK_A) + 60_000 }).place(A, 'spread');
  assert.deepEqual([late.status, late.body.error], [400, 'This matchup has started. Virtual picks and edits are closed.']);
});

test('a Spread send opens Spread only, and only the open market saves', async () => {
  const sent = make({ revealed: { guess_spread: true } });
  const reply = await sent.read();
  assert.deepEqual(locks(reply), { [A.id]: { spread: false, total: true }, [B.id]: { spread: false, total: true } });
  assert.deepEqual(visible(reply), { [A.id]: [['spread'], ['spread']], [B.id]: [['spread'], ['spread']] });
  assert.equal(reply.games[0].consensus.spread.value, -11.5);
  assertNoLeak(reply, { viewer: USER, secrets: SECRETS.total, exempt: OWN_PICKS }, '/virtual-units after a Spread send');
  const saved = await sent.place(A, 'spread');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(sent.calls.find(([name]) => name === 'save').slice(1), [3, { gameId: A.id, market: 'spread', side: 'home', line: -11.5, odds: -110, units: 1, source: 'DraftKings', quotedAt: OBSERVED }]);
  assertNoLeak(saved.body, { viewer: USER, secrets: SECRETS.total, exempt: OWN_PICKS }, '/virtual-pick reply');
  assert.equal((await sent.place(B, 'total')).status, 409);
});

test('each game opens at its own kickoff, sent or not', async () => {
  const kicked = make({ clock: Date.parse(KICK_A) + 60_000 });
  const reply = await kicked.read();
  assert.deepEqual(locks(reply), { [A.id]: { spread: false, total: false }, [B.id]: { spread: true, total: true } });
  assertNoLeak(reply, { viewer: USER, secrets: [LINES.spread[B.id], LINES.total[B.id]].map((value, i) => ({ value, kind: 'line', market: i ? 'total' : 'spread' })), exempt: OWN_PICKS }, 'game B before its kickoff');
});

test('the gate is the published community week\'s: a group on another week opens its games only at kickoff', async () => {
  // The community has moved on to Week 6 and this player sent both markets there; the group still shows Week 5.
  const lagging = make({ published: { season: 2099, week: 6 }, revealed: { guess_spread: true, guess_total: true } });
  const reply = await lagging.read();
  assert.deepEqual(locks(reply), { [A.id]: { spread: true, total: true }, [B.id]: { spread: true, total: true } });
  assertNoLeak(reply, { viewer: USER, secrets: [...SECRETS.spread, ...SECRETS.total], exempt: OWN_PICKS }, 'group week behind the community week');
  assert.ok(lagging.calls.some(call => call[0] === 'weekRevealed' && call[3] === 6), 'the community week was asked, not the group\'s');
  assert.equal((await lagging.place(A, 'spread')).status, 409);
  assert.deepEqual(locks(await make({ published: { season: 2099, week: 6 }, clock: Date.parse(KICK_A) }).read())[A.id], { spread: false, total: false });
});

test('with M-01 applied the per-game gtl_markets_visible decides, and the lock sentence follows M-02\'s rules', async () => {
  const optional = (name, body) => {
    if (name === 'gtl_live_rules') return { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' };
    assert.deepEqual([name, body], ['gtl_markets_visible', { p_user: USER, p_season: 2099, p_week: 5, p_now: new Date(NOW).toISOString() }]);
    return { [A.id]: { spread: true, total: false }, [B.id]: { spread: false, total: false } };
  };
  const m01 = make({ optional, revealed: { guess_spread: true, guess_total: true } });
  const reply = await m01.read();
  assert.deepEqual(locks(reply), { [A.id]: { spread: false, total: true }, [B.id]: { spread: true, total: true } });
  assert.deepEqual(reply.rules, { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' });
  assert.equal(m01.calls.some(([name]) => name === 'weekRevealed'), false, 'today\'s gate is not read when M-01 answers');
  assert.deepEqual((await m01.place(B, 'spread')).body, { error: 'Lock in your Spread pick to see this line.' });
  assert.equal((await m01.place(A, 'spread')).status, 200);
});

test('a gate that cannot be read locks every market that has not kicked off; the route still answers', async () => {
  const cases = [
    { published: new Error('offline'), revealed: { guess_spread: true, guess_total: true } },
    { published: null, revealed: { guess_spread: true, guess_total: true } },
    { revealed: new Error('offline') },
    { optional: name => { if (name === 'gtl_markets_visible') throw new Error('Optional feature unavailable.'); return FEATURE_OFF; }, revealed: { guess_spread: true, guess_total: true } },
    { optional: name => (name === 'gtl_markets_visible' ? { [A.id]: 'yes' } : FEATURE_OFF), revealed: { guess_spread: true, guess_total: true } },
  ];
  for (const options of cases) {
    const { read, place } = make(options);
    const reply = await read();
    assert.deepEqual(locks(reply), { [A.id]: { spread: true, total: true }, [B.id]: { spread: true, total: true } });
    assertNoLeak(reply, { viewer: USER, secrets: [...SECRETS.spread, ...SECRETS.total], exempt: OWN_PICKS }, 'unreadable gate');
    assert.equal((await place(A, 'spread')).status, 409);
  }
});

test('the Supabase adapter reads the newest published week and gtl_week_revealed with the service role, and M-01 through the optional caller', async () => {
  const requests = [];
  const reply = (body, status = 200) => Response.json(body, { status });
  const routes = ({ m01 }) => async (url, options = {}) => {
    const { pathname, search } = new URL(url), body = options.body ? JSON.parse(options.body) : null;
    requests.push({ pathname, search, body, auth: options.headers?.Authorization });
    if (pathname === '/auth/v1/user') return reply({ id: USER, role: 'authenticated', email: 'player@example.test', email_confirmed_at: '2099-10-01T00:00:00Z' });
    if (pathname === '/rest/v1/gtl_memberships') return reply([{ player_id: 'luke', active: true, role: 'player' }]);
    if (pathname === '/rest/v1/gtl_weekly_slates') return reply([{ season: 2099, week: 5 }]);
    if (pathname === '/rest/v1/rpc/gtl_read_virtual_units') return reply({ season: 2099, week: 5, revision: 3, games: [A, B], picks: [OWN], summary: SUMMARY });
    if (pathname === '/rest/v1/rpc/gtl_read_market_snapshot') return reply(SNAPSHOT);
    if (pathname === '/rest/v1/rpc/gtl_live_rules') return reply({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    if (pathname === '/rest/v1/rpc/gtl_markets_visible') return m01 ? reply({ [B.id]: { spread: false, total: true } }) : reply({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    if (pathname === '/rest/v1/rpc/gtl_week_revealed') return reply(body.p_mode === 'guess_total');
    return reply({ message: 'unexpected' }, 500);
  };
  const handlerFor = options => createCloudHandler({ ...createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: routes(options) }), clock: () => NOW });
  const get = async handler => (await handler(new Request('https://project.supabase.co/functions/v1/gtl-api/virtual-units', { headers: { authorization: 'Bearer token' } }))).json();

  const today = await get(handlerFor({ m01: false }));
  assert.deepEqual(locks(today), { [A.id]: { spread: true, total: false }, [B.id]: { spread: true, total: false } });
  const slates = requests.find(({ pathname }) => pathname === '/rest/v1/gtl_weekly_slates');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(slates.search)), { select: 'season,week', order: 'season.desc,week.desc', limit: '1' });
  assert.equal(slates.auth, 'Bearer server-test-secret');
  assert.deepEqual(requests.filter(({ pathname }) => pathname === '/rest/v1/rpc/gtl_week_revealed').map(({ body, auth }) => [body, auth]), ['guess_spread', 'guess_total'].map(mode => [
    { p_user: USER, p_season: 2099, p_week: 5, p_mode: mode, p_now: new Date(NOW).toISOString() }, 'Bearer server-test-secret']));
  assert.deepEqual(requests.find(({ pathname }) => pathname === '/rest/v1/rpc/gtl_markets_visible').body, { p_user: USER, p_season: 2099, p_week: 5, p_now: new Date(NOW).toISOString() });

  requests.length = 0;
  const m01 = await get(handlerFor({ m01: true }));
  assert.deepEqual(locks(m01), { [A.id]: { spread: true, total: true }, [B.id]: { spread: true, total: false } });
  assert.equal(requests.some(({ pathname }) => pathname === '/rest/v1/rpc/gtl_week_revealed'), false);
});

// The real handler, the migrations and PGlite (tests/cloud-browser/community-world.mjs). Luke has sent nothing; Troy sent
// both markets of the open week (troyBallots). Fixture book lines, stored as one three-book collection.
const skip = pgliteAvailable ? false : 'Optional local PGlite runtime is not installed; no remote database tests are run.';
const WORLD_LINES = { spread: [-11.5, 13.5], total: [58.5, 31.5] };

async function linesWorld(t, options = {}) {
  const world = await createCommunityWorld({ groupScreens: true, virtualUnits: true, ...options });
  t.after(() => world.db.close());
  const { db, state } = world, { season, week } = state.league, ids = state.games.map(g => g.id);
  const map = values => Object.fromEntries(ids.map((g, i) => [g, values[i]]));
  const lines = { spread: map(WORLD_LINES.spread), total: map(WORLD_LINES.total) };
  const observed = await storeBookLines(world, lines);
  const units = async account => {
    const reply = await world.api(account, 'virtual-units');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    return reply.body;
  };
  const place = (account, gameId, market) => world.api(account, 'virtual-pick', { gameId, market, side: market === 'spread' ? 'home' : 'over', line: lines[market][gameId], odds: -110, units: 1, source: 'draftkings', quotedAt: observed });
  const send = (account, mode, picks) => sendBallot(world, account, mode, picks);
  const secrets = market => lineSecrets(lines[market], { market });
  const picksOf = async account => (await db.query('select game_id,market from public.gtl_virtual_units_picks where user_id=$1 order by game_id,market', [ACCOUNTS[account].id])).rows.map(r => `${r.game_id}:${r.market}`);
  return { world, db, state, season, week, ids, lines, map, units, place, send, secrets, picksOf };
}

test('HOSTED schema: locked before a send, Spread opens with a Spread send, Total with a Total sit-out; own picks stay whole', { skip }, async t => {
  const f = await linesWorld(t);
  const [g0, g1] = f.ids;
  const before = await f.units('luke');
  assert.deepEqual(locks(before), { [g0]: { spread: true, total: true }, [g1]: { spread: true, total: true } });
  assertNoLeak(before, { viewer: ACCOUNTS.luke.id, secrets: [...f.secrets('spread'), ...f.secrets('total')] }, '/virtual-units before a send');
  const refused = await f.place('luke', g0, 'spread');
  assert.deepEqual([refused.status, refused.body], [409, { error: 'Submit your Spread picks to see this line.' }]);
  assert.deepEqual(await f.picksOf('luke'), [], 'a refused pick writes nothing');
  // Troy sent both markets: everything is open to him, and the scan finds the lines in his reply.
  const troy = await f.units('troy');
  assert.deepEqual(locks(troy), { [g0]: { spread: false, total: false }, [g1]: { spread: false, total: false } });
  assert.ok(leakScan(troy, { viewer: ACCOUNTS.luke.id, secrets: [...f.secrets('spread'), ...f.secrets('total')] }).length >= 8);

  await f.send('luke', 'guess_spread', f.map([-6.5, 2.5]));
  const sent = await f.units('luke');
  assert.deepEqual(locks(sent), { [g0]: { spread: false, total: true }, [g1]: { spread: false, total: true } });
  assert.ok(leakScan(sent, { viewer: ACCOUNTS.luke.id, secrets: f.secrets('spread') }).length >= 4, 'his Spread lines are open');
  assertNoLeak(sent, { viewer: ACCOUNTS.luke.id, secrets: f.secrets('total') }, '/virtual-units after a Spread send');
  const placed = await f.place('luke', g0, 'spread');
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  assert.equal((await f.place('luke', g0, 'total')).status, 409);
  assert.deepEqual(await f.picksOf('luke'), [`${g0}:spread`]);

  const satOut = await f.world.api('luke', 'community/sit-out', { season: f.season, week: f.week, mode: 'guess_total' });
  assert.equal(satOut.status, 200, JSON.stringify(satOut.body));
  const open = await f.units('luke');
  assert.deepEqual(locks(open), { [g0]: { spread: false, total: false }, [g1]: { spread: false, total: false } });
  assert.equal((await f.place('luke', g1, 'total')).status, 200);
  assert.deepEqual(await f.picksOf('luke'), [`${g0}:spread`, `${g1}:total`].sort());

  // Own entries are never redacted: Sean (nothing sent) holds a pick saved earlier; it comes back whole while his lines stay locked.
  const terms = { gameId: g1, market: 'spread', side: 'away', line: -7.5, odds: 105, units: 2, source: 'FanDuel', quotedAt: new Date(Date.now() - 86_400_000).toISOString() };
  await f.db.transaction(async tx => { await tx.exec('set local role service_role'); await tx.query("select public.gtl_save_virtual_units_pick($1,'sean-troy-luke',0,$2)", [ACCOUNTS.sean.id, terms]); });
  const sean = await f.units('sean');
  assert.deepEqual(locks(sean)[g1], { spread: true, total: true });
  assert.deepEqual(sean.picks.map(p => [p.gameId, p.market, p.selection.side, p.selection.line, p.selection.odds, p.selection.units, p.selection.source, Date.parse(p.selection.quotedAt)]),
    [[g1, 'spread', 'away', -7.5, 105, 2, 'FanDuel', Date.parse(terms.quotedAt)]]);
});

test('without M-01 (the schema before October 14) the deadline opens every line (D-23); with M-01 each game waits for its own kickoff', { skip }, async t => {
  // Half an hour after the deadline: the first game has kicked off, the second kicks off in half an hour.
  const late = state => Date.parse(state.league.deadline) + 30 * 60_000;
  let clockAt = Date.now();
  const hosted = await linesWorld(t, { migrations: HOSTED.filter(file => file !== '20261014223000_gtl_guess_gate_per_game.sql'), clock: () => clockAt });
  clockAt = late(hosted.state);
  const [g0, g1] = hosted.ids;
  assert.deepEqual(locks(await hosted.units('luke')), { [g0]: { spread: false, total: false }, [g1]: { spread: false, total: false } });

  let clockAll = Date.now();
  const m01 = await linesWorld(t, { migrations: ALL, optionalRpc: true, clock: () => clockAll });
  const before = await m01.units('luke');
  // ALL also has M-02 (stage 18), so a sent guess is final; M-01's field is the kickoff reveal.
  assert.deepEqual(before.rules, { sentFinal: true, lateWindow: 'deadline', revealAt: 'kickoff' }, 'M-01 reports the kickoff reveal');
  await m01.send('luke', 'guess_spread', m01.map([-6.5, 2.5]));
  assert.deepEqual(locks(await m01.units('luke')), { [g0]: { spread: false, total: true }, [g1]: { spread: false, total: true } }, 'a locked-in game opens its market');
  clockAll = late(m01.state);
  const after = await m01.units('luke');
  assert.deepEqual(locks(after), { [g0]: { spread: false, total: false }, [g1]: { spread: false, total: true } }, 'the deadline opens nothing; the first kickoff opens its game');
  assertNoLeak(after, { viewer: ACCOUNTS.luke.id, secrets: [{ value: m01.lines.total[g1], kind: 'line', market: 'total' }] }, 'M-01, the second game before its kickoff');
  assert.deepEqual(locks(await m01.units('sean'))[g1], { spread: true, total: true }, 'nothing sent: the second game stays locked after the deadline');
});

test('HOSTED schema: a group whose week is behind the published community week opens its games only at kickoff', { skip }, async t => {
  let clockAt = Date.now();
  const f = await linesWorld(t, { clock: () => clockAt });
  const [g0, g1] = f.ids;
  assert.deepEqual(locks(await f.units('troy')), { [g0]: { spread: false, total: false }, [g1]: { spread: false, total: false } }, 'Troy sent both markets of the group\'s week');
  // The community publishes the next week; the group league still shows this one (nothing advances a group's week).
  const next = f.week + 1, kickoff = Math.floor(Date.parse(f.state.league.deadline) / 1000) + 7 * 86_400;
  await f.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [f.season, next,
    { season: f.season, week: next, deadline: kickoff, games: [{ id: 'KC-LV', away: 'KC', home: 'LV', kickoff }] }]);
  const lagging = await f.units('troy');
  assert.equal(lagging.week, f.week, 'Virtual Units still shows the group\'s week');
  assert.deepEqual(locks(lagging), { [g0]: { spread: true, total: true }, [g1]: { spread: true, total: true } });
  assertNoLeak(lagging, { viewer: ACCOUNTS.troy.id, secrets: [...f.secrets('spread'), ...f.secrets('total')] }, 'group week behind the community week');
  assert.equal((await f.place('troy', g0, 'spread')).status, 409);
  clockAt = Date.parse(f.state.games[0].kickoff);
  assert.deepEqual(locks(await f.units('troy')), { [g0]: { spread: false, total: false }, [g1]: { spread: true, total: true } });
});
