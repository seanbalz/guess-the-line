import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler } from '../cloud/handler.mjs';
import { createSupabaseAdapter } from '../cloud/handler.mjs';
import { BOUNDARY_AREAS, awaitingDeploy, privateResponse } from '../scripts/check-cloud-boundary.mjs';
const shared = await import('../shared/nba-games.mjs').catch(() => ({}));
const cloud = await import('../cloud/nba-games.mjs').catch(() => ({}));
const observedAt = '2026-10-22T01:00:00.000Z';
const request = { date: '2026-10-21', timeZone: 'America/Los_Angeles' };
export const fixtureGame = (changes = {}) => ({ id: 1, date: '2026-10-22', datetime: '2026-10-22T02:00:00Z',
  home_team: { id: 1, full_name: 'Synthetic Home', abbreviation: 'HOM' }, visitor_team: { id: 2, full_name: 'Synthetic Away', abbreviation: 'AWY' },
  status_state: 'scheduled', status: '7:00 pm ET', home_team_score: 0, visitor_team_score: 0, ...changes });
const payload = (...games) => ({ data: games, meta: { next_cursor: null, per_page: 100 } });
function memoryCache(snapshot = {}) {
  return { snapshot, calls: [], async read(args) { this.calls.push(args); return { games: null, observedAt: null, leaseToken: null, ...this.snapshot }; },
    async publish(args) { this.published = args; return true; } };
}

test('provider states preserve scheduled nulls, live zeros, finals and exceptional states without score inference', () => {
  assert.equal(typeof shared.normalizeNbaGames, 'function');
  for (const [status_state, status, expected, score] of [['scheduled', '7:00 pm ET', 'scheduled', null], ['in_progress', '1st Qtr', 'in_progress', 0],
    ['final', 'Final', 'final', 0], ['postponed', 'Postponed', 'postponed', null], ['canceled', 'Canceled', 'canceled', null],
    ['delayed', 'Delayed', 'delayed', null], ['suspended', 'Suspended', 'suspended', null], ['abandoned', 'Abandoned', 'abandoned', null],
    ['mystery', 'Unrecognized', 'unknown', null]]) {
    const game = shared.normalizeNbaGames(payload(fixtureGame({ status_state, status })), observedAt)[0];
    assert.equal(game.status, expected); assert.equal(game.homeScore, score); assert.equal(game.id, 'NBA:balldontlie:1');
    assert.equal(game.observedAt, observedAt); assert.ok(!('home_team' in game));
  }
  assert.equal(shared.normalizeNbaGames(payload(fixtureGame({ status_state: undefined, status: '3rd Qtr', home_team_score: null })), observedAt)[0].homeScore, null);
  assert.equal(shared.normalizeNbaGames(payload(fixtureGame({ status_state: 'in_progress', status: 'Final', period: 4 })), observedAt)[0].status, 'in_progress');
});

test('normalizer rejects malformed/partial/duplicate games and never manufactures tipoff times', () => {
  assert.equal(typeof shared.normalizeNbaGames, 'function');
  for (const value of [{}, { data: {} }, { data: [], meta: { next_cursor: 4 } }, payload(fixtureGame({ datetime: 'bad' })),
    payload(fixtureGame({ id: '1' })), payload(fixtureGame({ home_team_score: -1 })), payload(fixtureGame(), fixtureGame())]) {
    assert.throws(() => shared.normalizeNbaGames(value, observedAt));
  }
  const untimed = shared.normalizeNbaGames(payload(fixtureGame({ datetime: null })), observedAt)[0];
  assert.equal(untimed.startTime, null); assert.equal(untimed.sourceDate, '2026-10-22');
  assert.equal(shared.gamesForLocalDate([untimed], '2026-10-22', request.timeZone).length, 1);
});

test('local dates include midnight boundaries, extreme zones and both DST transitions', () => {
  assert.equal(typeof shared.gamesForLocalDate, 'function');
  const canonical = time => shared.normalizeNbaGames(payload(fixtureGame({ datetime: time })), observedAt);
  assert.equal(shared.gamesForLocalDate(canonical('2026-10-22T02:00:00Z'), request.date, request.timeZone).length, 1);
  assert.equal(shared.gamesForLocalDate(canonical('2026-10-22T07:00:00Z'), request.date, request.timeZone).length, 0);
  for (const time of ['2026-11-01T08:30:00Z', '2026-11-01T09:30:00Z']) assert.equal(shared.gamesForLocalDate(canonical(time), '2026-11-01', request.timeZone).length, 1);
  for (const time of ['2026-03-08T09:30:00Z', '2026-03-08T10:30:00Z']) assert.equal(shared.gamesForLocalDate(canonical(time), '2026-03-08', request.timeZone).length, 1);
  assert.equal(shared.gamesForLocalDate(canonical('2026-10-20T12:00:00Z'), request.date, 'Pacific/Kiritimati').length, 1);
  for (const [date, zone] of [['2026-02-30', 'UTC'], ['2026-10-21', 'fake/zone'], ['2026-10-21', '+01:00']]) assert.throws(() => shared.gamesForLocalDate([], date, zone));
});

test('service uses one fixed HTTPS request for adjacent dates with a bounded timeout and publishes only a complete page', async () => {
  assert.equal(typeof cloud.createNbaGamesService, 'function');
  const cache = memoryCache({ leaseToken: 'lease', leasedAt: observedAt }); let calls = 0;
  const service = cloud.createNbaGamesService({ apiKey: 'synthetic-key', cache, clock: () => Date.parse(observedAt), fetchImpl: async (url, options) => {
    calls++; assert.equal(url.origin, 'https://api.balldontlie.io'); assert.equal(url.pathname, '/v1/games');
    assert.equal(url.searchParams.get('per_page'), '100'); assert.deepEqual(url.searchParams.getAll('dates[]'), ['2026-10-20', '2026-10-21', '2026-10-22']);
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'synthetic-key'); assert.ok(options.signal instanceof AbortSignal);
    return Response.json(payload(fixtureGame()));
  } });
  const result = await service.read(request); assert.equal(calls, 1); assert.equal(result.games.length, 1);
  assert.equal(result.unavailable, false); assert.equal(result.stale, false); assert.equal(result.source, 'BALLDONTLIE');
  assert.equal(cache.published.games[0].id, 'NBA:balldontlie:1'); assert.equal(cache.published.leaseToken, 'lease');
});

test('missing key, denied lease, stale failures, pagination, bad JSON, HTTP errors and abort retain cache honestly', async () => {
  assert.equal(typeof cloud.createNbaGamesService, 'function');
  const games = shared.normalizeNbaGames(payload(fixtureGame()), observedAt);
  for (const failure of [() => Response.json({ data: [fixtureGame()], meta: { next_cursor: 2 } }), () => Response.json({ bad: true }),
    () => new Response('private provider body', { status: 401 }), () => new Response('private', { status: 429 }),
    () => new Response('{'), () => { throw new DOMException('timeout private', 'TimeoutError'); }]) {
    const cache = memoryCache({ games, observedAt, leaseToken: 'lease', leasedAt: new Date(Date.parse(observedAt) + 301000).toISOString() });
    let calls = 0;
    const result = await cloud.createNbaGamesService({ apiKey: 'synthetic', cache, clock: () => Date.parse(observedAt) + 301000, fetchImpl: (...args) => { calls++; return failure(...args); } }).read(request);
    assert.equal(calls, 1);
    assert.equal(result.unavailable, true); assert.equal(result.stale, true); assert.deepEqual(result.games, games);
    assert.equal(cache.published.games, null); assert.ok(!JSON.stringify(result).includes('private'));
  }
  for (const apiKey of [undefined, '']) {
    const cache = memoryCache(); let calls = 0;
    const result = await cloud.createNbaGamesService({ apiKey, cache, fetchImpl: () => { calls++; throw new Error('unexpected'); } }).read(request);
    assert.equal(calls, 0);
    assert.equal(result.unavailable, true); assert.equal(result.observedAt, null); assert.equal(cache.calls[0].refresh, false);
  }
  for (const fresh of [true, false]) {
    const cache = memoryCache({ games, observedAt }); let calls = 0;
    const result = await cloud.createNbaGamesService({ apiKey: 'synthetic', cache, clock: () => Date.parse(observedAt) + (fresh ? 0 : 301000), fetchImpl: () => { calls++; throw new Error('unexpected'); } }).read(request);
    assert.equal(calls, 0);
    assert.equal(result.stale, !fresh); assert.equal(result.unavailable, !fresh);
  }
});

test('lost publication ownership and cache outages cannot advertise an unpublished successful refresh', async () => {
  assert.equal(typeof cloud.createNbaGamesService, 'function');
  const cache = memoryCache({ leaseToken: 'lease', leasedAt: observedAt }); cache.publish = async () => false;
  const result = await cloud.createNbaGamesService({ apiKey: 'synthetic', cache, clock: () => Date.parse(observedAt), fetchImpl: async () => Response.json(payload(fixtureGame())) }).read(request);
  assert.equal(result.unavailable, true); assert.deepEqual(result.games, []);
  cache.read = async () => { throw new Error('private'); };
  assert.equal((await cloud.createNbaGamesService({ apiKey: 'synthetic', cache }).read(request)).unavailable, true);
  const games = shared.normalizeNbaGames(payload(fixtureGame()), observedAt);
  const brokenRelease = memoryCache({ games, observedAt, leaseToken: 'lease', leasedAt: new Date(Date.parse(observedAt) + 301000).toISOString() });
  brokenRelease.publish = async () => { throw new Error('private release failure'); };
  const retained = await cloud.createNbaGamesService({ apiKey: 'synthetic', cache: brokenRelease,
    clock: () => Date.parse(observedAt) + 301000, fetchImpl: async () => Response.json(payload(fixtureGame())) }).read(request);
  assert.equal(retained.unavailable, true); assert.equal(retained.stale, true); assert.deepEqual(retained.games, games);
});

test('cached games are validated and projected without internal fields or malformed successful slates', async () => {
  const games = shared.normalizeNbaGames(payload(fixtureGame()), observedAt);
  const cache = memoryCache({ games: [{ ...games[0], source_record: { private: true }, home: { ...games[0].home, secret: true } }], observedAt });
  const service = cloud.createNbaGamesService({ apiKey: 'synthetic', cache, clock: () => Date.parse(observedAt) });
  const result = await service.read(request); assert.equal(result.unavailable, false);
  assert.ok(!JSON.stringify(result).match(/source_record|secret/));
  cache.snapshot.games = [{ ...games[0], startTime: 'bad' }];
  assert.equal((await service.read(request)).unavailable, true);
});

test('ten-second timeout covers a response body that never resolves and still releases the failed claim', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cache = memoryCache({ leaseToken: 'lease', leasedAt: observedAt }); let signal;
  const promise = cloud.createNbaGamesService({ apiKey: 'synthetic', cache, clock: () => Date.parse(observedAt), fetchImpl: async (_url, options) => {
    signal = options.signal; return { ok: true, json: () => new Promise(() => {}) };
  } }).read(request);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10000);
  const result = await promise;
  assert.equal(signal.aborted, true); assert.equal(result.unavailable, true); assert.equal(cache.published.games, null);
});

test('a worker delayed past its lease cannot start a provider call', async () => {
  const cache = memoryCache({ leaseToken: 'lease', leasedAt: observedAt }); let calls = 0;
  const result = await cloud.createNbaGamesService({ apiKey: 'synthetic', cache, clock: () => Date.parse(observedAt) + 15000,
    fetchImpl: async () => { calls++; return Response.json(payload(fixtureGame())); } }).read(request);
  assert.equal(calls, 0);
  assert.equal(result.unavailable, true); assert.equal(cache.published.games, null);
});

test('NBA game cache adapter uses only reviewed service RPCs, and boundary probes cover both capabilities', async () => {
  const calls = [];
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'public', serviceRoleKey: 'synthetic-secret',
    fetchImpl: async (url, options) => { calls.push({ url: new URL(url), options }); return Response.json(true); } });
  await adapter.nbaGamesCache.read({ date: request.date, refresh: false });
  await adapter.nbaGamesCache.publish({ date: request.date, leaseToken: 'synthetic', games: null });
  assert.deepEqual(calls.map(call => call.url.pathname), ['/rest/v1/rpc/gtl_nba_claim_games', '/rest/v1/rpc/gtl_nba_finish_games']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_date: request.date, p_refresh: false });
  assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer synthetic-secret'));
  for (const name of ['gtl_nba_claim_games', 'gtl_nba_finish_games']) {
    assert.ok(BOUNDARY_AREAS.bets.rpcChecks.some(([rpc]) => rpc === name));
    assert.equal(awaitingDeploy[`rpc/${name}`], 'migration 20261021223100_gtl_nba_game_cache.sql');
    await assert.rejects(adapter.nba.rpc(name, {}), /Invalid operation/);
  }
  assert.ok(BOUNDARY_AREAS.bets.apiChecks.some(([route]) => route === 'nba/games'));
  assert.equal(awaitingDeploy['gtl-api/nba/games'], 'the gtl-api deploy with /nba/games');
  assert.ok(privateResponse.test('{"leaseToken":"synthetic"}'));
});

test('games route authenticates, rejects forged keys and avoids NFL services', async () => {
  const calls = [];
  const handler = createCloudHandler({ authenticate: async token => token === 'valid' ? { id: '00000000-0000-4000-8000-000000000001', emailConfirmed: true, email: 'synthetic@example.test' } : null,
    nbaGames: { read: async body => { calls.push(body); return { ...body, games: [], unavailable: true }; } }, storage: { membership: () => assert.fail('NFL membership') } });
  const send = (body, token = 'valid') => handler(new Request('https://fixture.invalid/nba/games', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  assert.equal((await send(request, 'bad')).status, 401);
  assert.equal((await send(request)).status, 200);
  for (const body of [{ ...request, apiKey: 'secret' }, { ...request, date: '2026-02-30' }, { ...request, timeZone: 'fake/zone' }]) assert.equal((await send(body)).status, 400);
  assert.deepEqual(calls, [request]);
});
