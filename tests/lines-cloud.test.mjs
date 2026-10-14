import test from 'node:test';
import assert from 'node:assert/strict';
import { LINES_METHODS, LinesError, handleLines, projectGameLines, projectLines, providerLinesError } from '../cloud/lines.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { leakScan, lineSecrets } from './helpers/leak-scan.mjs';

// Redesign build plan stage 23 (M-06): POST /lines/read and /lines/game in cloud/lines.mjs, without a database. The SQL gate
// (tests/lines-sql.test.mjs) decides what is open; this module rebuilds every reply from a fixed list of keys and drops every
// key under a market that is not exactly { visible: true }, even if SQL sent one. Fixture values only.
const VIEWER = '00000000-0000-4000-8000-0000000000a1';
const USER = { id: VIEWER, is_anonymous: false };
const NOW = Date.parse('2026-10-15T18:00:00Z');
const T = '2026-10-15T16:00:00+00:00';
const LINE = { value: -3.5, capturedAt: T, observedAt: T, bookCount: 3, source: 'The Odds API · 3-book median', sourceUrl: 'https://the-odds-api.com/' };
const SECRET = 61.5; // A hidden total that SQL wrongly sends under a closed market.

/** A forged gtl_read_lines answer: game A's Spread open, its Total closed but carrying everything; extra raw keys everywhere. */
function forgedBoard() {
  return {
    viewer: VIEWER, season: 2026, week: 6, now: T, published: true, deadline: T, payload: { games: [] },
    games: [{
      id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: T, started: false, providerEventId: 'event',
      final: null,
      spread: { ...LINE, visible: true, snapshotId: 'x', quotes: [{ value: -3.5 }] },
      total: { visible: false, value: SECRET, capturedAt: T, books: [{ book: 'draftkings', line: SECRET }], movement: [{ value: SECRET }], kickoffLine: { value: SECRET } },
      mine: { userId: 'someone-else', spread: { guess: -2.5, lockedIn: true, satOut: false, late: { deadline: T, minutes: 12, secret: 1 }, points: 8, lineAtGuess: { value: -3.5, status: 'available', basis: 'saved', label: 'line saved with guess', capturedAt: T, observedAt: T, snapshotId: 'x' } },
        total: { guess: 44.5, lockedIn: false, satOut: false, late: null, points: 7, lineAtGuess: { value: SECRET, status: 'available' } } },
    }, {
      id: 'TEN-IND', awayCode: 'TEN', homeCode: 'IND', away: 'Tennessee Titans', home: 'Indianapolis Colts', kickoff: T, started: true,
      final: { status: 'final', home: 24, away: 17, source: 'nflverse', sourceUrl: 'https://github.com/nflverse', observedAt: T, origin: 'settlement', settledAt: T, actorId: 'x' },
      spread: { visible: 'true', value: SECRET }, total: { value: SECRET }, mine: null,
    }],
  };
}

test('the routes: two POST readers, each refused before any database call when signed out, unknown or switched off', async () => {
  assert.deepEqual(LINES_METHODS, { '/lines/read': ['POST'], '/lines/game': ['POST'] });
  assert.ok(Object.isFrozen(LINES_METHODS));
  const service = { rpc: async () => assert.fail('no database call') };
  for (const user of [null, {}, { id: 'not-a-uuid' }, { ...USER, is_anonymous: true }]) {
    await assert.rejects(handleLines({ route: '/lines/read', body: {}, user, service }), e => e instanceof LinesError && e.status === 401);
  }
  await assert.rejects(handleLines({ route: '/lines/unknown', body: {}, user: USER, service }), e => e instanceof LinesError && e.status === 404);
  await assert.rejects(handleLines({ route: '/lines/read', body: {}, user: USER, service: null }), /Lines are not configured/);
  for (const route of Object.keys(LINES_METHODS)) {
    await assert.rejects(handleLines({ route, body: { gameId: 'SEA-DEN' }, user: USER, service, featureOff: new Set(['lines']) }),
      e => e instanceof LinesError && e.status === 503 && e.message === 'Lines are not available right now.', route);
  }
});

test('request bodies: no week (the newest) or a season and week together, a game id for /lines/game, identity only from sign-in', async () => {
  const calls = [];
  const service = { rpc: async (name, args) => { calls.push([name, args]); return name === 'gtl_read_lines' ? { games: [] } : { game: {} }; } };
  const call = (route, body) => handleLines({ route, body, user: USER, service, clock: () => NOW });
  await call('/lines/read', {});
  await call('/lines/read', { season: 2026, week: 6 });
  await call('/lines/read', { season: null, week: null });
  await call('/lines/game', { gameId: 'SEA-DEN' });
  await call('/lines/game', { season: 2026, week: 6, gameId: 'TEN-IND' });
  const now = new Date(NOW).toISOString();
  assert.deepEqual(calls, [
    ['gtl_read_lines', { p_user: VIEWER, p_season: null, p_week: null, p_now: now }],
    ['gtl_read_lines', { p_user: VIEWER, p_season: 2026, p_week: 6, p_now: now }],
    ['gtl_read_lines', { p_user: VIEWER, p_season: null, p_week: null, p_now: now }],
    ['gtl_read_game_lines', { p_user: VIEWER, p_season: null, p_week: null, p_game: 'SEA-DEN', p_now: now }],
    ['gtl_read_game_lines', { p_user: VIEWER, p_season: 2026, p_week: 6, p_game: 'TEN-IND', p_now: now }],
  ]);
  calls.length = 0;
  const refused = [
    ['/lines/read', { userId: VIEWER }, 'Unexpected request field. Player identity comes from sign-in.'],
    ['/lines/read', { gameId: 'SEA-DEN' }, 'Unexpected request field. Player identity comes from sign-in.'],
    ['/lines/game', { gameId: 'SEA-DEN', p_user: VIEWER }, 'Unexpected request field. Player identity comes from sign-in.'],
    ['/lines/read', { season: 2026 }, 'Check the week and game, then try again.'],
    ['/lines/read', { week: 6 }, 'Check the week and game, then try again.'],
    ['/lines/read', { season: 2026, week: 0 }, 'Check the week and game, then try again.'],
    ['/lines/read', { season: 1999, week: 6 }, 'Check the week and game, then try again.'],
    ['/lines/read', { season: '2026', week: 6 }, 'Check the week and game, then try again.'],
    ['/lines/read', { season: 2026, week: 6.5 }, 'Check the week and game, then try again.'],
    ['/lines/game', {}, 'Check the week and game, then try again.'],
    ['/lines/game', { gameId: 'sea-den' }, 'Check the week and game, then try again.'],
    ['/lines/game', { gameId: "SEA-DEN' or 1=1" }, 'Check the week and game, then try again.'],
    ['/lines/game', { gameId: ['SEA-DEN'] }, 'Check the week and game, then try again.'],
  ];
  for (const [route, body, message] of refused) {
    await assert.rejects(call(route, body), e => e instanceof LinesError && e.status === 400 && e.message === message, JSON.stringify(body));
  }
  assert.deepEqual(calls, [], 'a refused request never reaches the database');
});

test('database codes map to their sentences; anything else is the generic unavailable error', () => {
  assert.deepEqual([providerLinesError('GTL_LINES_INVALID').status, providerLinesError('GTL_LINES_INVALID').message], [400, 'Check the week and game, then try again.']);
  assert.deepEqual([providerLinesError('GTL_COMMUNITY_MEMBER').status, providerLinesError('GTL_COMMUNITY_MEMBER').message], [403, 'Open My games and save your display name to join the community.']);
  assert.deepEqual([providerLinesError('GTL_FEATURE_OFF').status, providerLinesError('GTL_FEATURE_OFF').message], [503, 'Lines are not available right now.']);
  for (const message of [undefined, 'GTL_UNKNOWN', '__proto__', 'constructor', 'function public.gtl_read_lines does not exist']) {
    const error = providerLinesError(message);
    assert.ok(!(error instanceof LinesError)); assert.equal(error.message, 'Lines are unavailable.');
  }
});

test('/lines/read projection: a closed market is { visible: false } even if SQL sent its line; own guesses stay, own lines only when open', () => {
  const board = projectLines(forgedBoard(), VIEWER);
  const [a, b] = board.games;
  assert.deepEqual(a.total, { visible: false }, 'the forged Total line, books, movement and kickoff line are dropped');
  assert.deepEqual(a.spread, { visible: true, ...LINE }, 'only the known keys of an open market');
  assert.deepEqual(a.mine, {
    userId: VIEWER, // From sign-in, never from SQL.
    spread: { guess: -2.5, lockedIn: true, satOut: false, late: { deadline: T, minutes: 12 }, points: 8,
      lineAtGuess: { value: -3.5, status: 'available', basis: 'saved', label: 'line saved with guess', capturedAt: T, observedAt: T } },
    total: { guess: 44.5, lockedIn: false, satOut: false, late: null, points: null, lineAtGuess: null },
  }, 'the own Total guess stays; its line and points under the closed market do not');
  assert.deepEqual([b.spread, b.total], [{ visible: false }, { visible: false }], '"true" as a string, or no flag, is closed');
  assert.deepEqual(b.final, { status: 'final', home: 24, away: 17, source: 'nflverse', sourceUrl: 'https://github.com/nflverse', observedAt: T, origin: 'settlement' });
  assert.deepEqual(b.mine.spread, { guess: null, lockedIn: false, satOut: false, late: null, points: null, lineAtGuess: null });
  assert.deepEqual(Object.keys(board).sort(), ['deadline', 'games', 'now', 'published', 'season', 'week']);
  assert.deepEqual(Object.keys(a).sort(), ['away', 'awayCode', 'final', 'home', 'homeCode', 'id', 'kickoff', 'mine', 'spread', 'started', 'total']);
  const text = JSON.stringify(board);
  for (const key of ['payload', 'providerEventId', 'snapshotId', 'quotes', 'books', 'movement', 'kickoffLine', 'settledAt', 'actorId', 'secret', 'viewer']) assert.ok(!text.includes(`"${key}"`), key);
  // Even with no owner exemption, the forged Total line is nowhere.
  assert.deepEqual(leakScan(board, { viewer: VIEWER, secrets: lineSecrets({ a: SECRET }, { market: 'total' }), ownerKeys: [] }), []);
  assert.throws(() => projectLines({ games: 'x' }, VIEWER), /Invalid lines reply/);
  assert.throws(() => projectLines(null, VIEWER), /Invalid lines reply/);
});

test('/lines/game projection: books, prices, movement and the kickoff line only under an open market, from known keys', () => {
  const raw = {
    viewer: VIEWER, season: 2026, week: 6, now: T, game: { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: T, started: false, venue: 'x' },
    spread: { visible: true, line: { ...LINE, snapshotId: 'x' }, kickoffLine: null,
      books: [
        { book: 'draftkings', source: 'Anything', line: -3.5, prices: { home: -105, away: -115, over: -110 }, observedAt: T, providerEventId: 'e' },
        { book: 'fanduel', line: -3, prices: { home: 100, away: 99 }, observedAt: T },
        { book: 'betmgm', line: -4, prices: { home: -110.5, away: '−110' }, observedAt: T },
        { book: 'caesars', line: -3.5, prices: { home: -110, away: -110 }, observedAt: T },
        { book: 'draftkings', line: -3.5, prices: { home: -110, away: -110 }, observedAt: T },
      ],
      movement: Array.from({ length: 60 }, (_, i) => ({ value: -3 - (i % 2) / 2, capturedAt: T, snapshotId: i })) },
    total: { visible: false, line: { value: SECRET }, books: [{ book: 'draftkings', line: SECRET, prices: { over: -110, under: -110 } }], movement: [{ value: SECRET }], kickoffLine: { value: SECRET } },
  };
  const detail = projectGameLines(raw);
  assert.deepEqual(detail.total, { visible: false });
  assert.deepEqual(detail.game, { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: T, started: false });
  assert.deepEqual(detail.spread.line, LINE);
  assert.deepEqual(detail.spread.books, [
    { book: 'draftkings', source: 'DraftKings', line: -3.5, prices: { home: -105, away: -115 }, observedAt: T },
    { book: 'fanduel', source: 'FanDuel', line: -3, prices: { home: 100, away: null }, observedAt: T },
    { book: 'betmgm', source: 'BetMGM', line: -4, prices: { home: null, away: null }, observedAt: T },
  ], 'named books only, at most three, each price a whole American price from 100 to 10000 either way');
  assert.equal(detail.spread.movement.length, 48, 'the newest 48');
  assert.deepEqual(detail.spread.movement[0], { value: -3, capturedAt: T });
  assert.equal(detail.spread.kickoffLine, null);
  assert.deepEqual(leakScan(detail, { viewer: VIEWER, secrets: lineSecrets({ a: SECRET }, { market: 'total' }), ownerKeys: [] }), []);
  const text = JSON.stringify(detail);
  for (const key of ['snapshotId', 'providerEventId', 'venue', 'viewer']) assert.ok(!text.includes(`"${key}"`), key);
  assert.throws(() => projectGameLines({ game: null }), /Invalid game lines reply/);
});

test('through the handler: signed out is 401, GTL_FEATURE_OFF=lines is 503 before any database call, a mapped refusal keeps its status', async () => {
  const calls = [];
  const lines = { rpc: async (name, args) => {
    calls.push(name);
    if (args.p_game === 'XX-YY') throw providerLinesError('GTL_LINES_INVALID');
    return name === 'gtl_read_lines' ? forgedBoard() : { game: { id: args.p_game }, spread: { visible: false, line: { value: SECRET } }, total: { visible: false } };
  } };
  const authenticate = async token => (token === 'fixture-token' ? { ...USER, email: 'viewer@example.test', emailConfirmed: true } : null);
  const send = (handler, route, body, token = 'fixture-token') => handler(new Request(`https://fixture.invalid/functions/v1/gtl-api/${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));
  const on = createCloudHandler({ authenticate, lines, clock: () => NOW });
  for (const token of [null, 'invalid']) assert.equal((await send(on, 'lines/read', {}, token)).status, 401);
  const board = await send(on, 'lines/read', {});
  assert.equal(board.status, 200);
  const body = await board.json();
  assert.deepEqual(body.games[0].total, { visible: false });
  assert.equal(body.games[0].mine.userId, VIEWER);
  const detail = await send(on, 'lines/game', { gameId: 'SEA-DEN' });
  assert.deepEqual(await detail.json(), { season: null, week: null, now: null, game: { id: 'SEA-DEN', awayCode: null, homeCode: null, away: null, home: null, kickoff: null, started: false }, spread: { visible: false }, total: { visible: false } });
  const bad = await send(on, 'lines/game', { gameId: 'XX-YY' });
  assert.deepEqual([bad.status, await bad.json()], [400, { error: 'Check the week and game, then try again.' }]);
  const query = await on(new Request('https://fixture.invalid/functions/v1/gtl-api/lines/read?season=2026', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer fixture-token' }, body: '{}' }));
  assert.equal(query.status, 400, 'group routes take no query parameters');
  const before = calls.length;
  const off = createCloudHandler({ authenticate, lines, clock: () => NOW, featureOff: 'notes, LINES' });
  for (const route of ['lines/read', 'lines/game']) {
    const response = await send(off, route, { gameId: 'SEA-DEN' });
    assert.deepEqual([response.status, await response.json()], [503, { error: 'Lines are not available right now.' }], route);
  }
  assert.equal(calls.length, before, 'switched off: nothing is read');
});

test('the adapter: PostgREST\'s function-not-found (M-06 not applied yet) reads as off; any other failure, a revoked grant included, is generic', async () => {
  const answers = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async () => answers.shift() });
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  answers.push(reply(404, { code: 'PGRST202', message: 'Could not find the function public.gtl_read_lines(p_user) in the schema cache' }));
  await assert.rejects(adapter.lines.rpc('gtl_read_lines', {}), e => e instanceof LinesError && e.status === 503 && e.message === 'Lines are not available right now.');
  answers.push(reply(400, { code: 'P0001', message: 'GTL_COMMUNITY_MEMBER' }));
  await assert.rejects(adapter.lines.rpc('gtl_read_lines', {}), e => e instanceof LinesError && e.status === 403);
  answers.push(reply(404, { code: '42883', message: 'secret detail' }));
  await assert.rejects(adapter.lines.rpc('gtl_read_lines', {}), e => !(e instanceof LinesError) && e.message === 'Lines are unavailable.');
  answers.push(reply(403, { code: '42501', message: 'permission denied for function gtl_read_lines' }));
  await assert.rejects(adapter.lines.rpc('gtl_read_lines', {}), e => !(e instanceof LinesError) && e.message === 'Lines are unavailable.');
  // The other groups have no code to map yet: function-not-found stays their generic error.
  answers.push(reply(404, { code: 'PGRST202', message: 'Could not find the function' }));
  await assert.rejects(adapter.bets.rpc('gtl_read_bets', {}), e => e.message === 'Bets are unavailable.' && e.status === undefined);
});
