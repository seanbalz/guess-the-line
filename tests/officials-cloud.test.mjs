import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { OFFICIALS_METHODS, providerOfficialsError } from '../cloud/officials.mjs';
import { REFEREE_ALIASES, canonicalReferee } from '../shared/referees.mjs';

const USER = '00000000-0000-4000-8000-000000000001';
const forbidden = new Proxy({}, { get: () => () => { throw new Error('Referee routes must not touch league, ballot, lobby or community services.'); } });

/** An in-memory stand-in for the two RPCs and the commissioner check (the PGlite test runs the real SQL). */
function memoryService({ admin = true, fail = null } = {}) {
  const calls = [], rows = new Map();
  return { calls, rows, rpc: async (name, args) => {
    calls.push([name, args]);
    if (fail) throw providerOfficialsError(fail);
    if (name === 'gtl_community_admin') return admin;
    if (name === 'gtl_read_game_officials') {
      return { season: args.p_season, week: args.p_week, assignments: Object.fromEntries([...rows].filter(([key]) => key.startsWith(`${args.p_season}:${args.p_week}:`)).map(([key, row]) => [key.split(':')[2], row])) };
    }
    if (name === 'gtl_set_game_official') {
      if (!admin) throw providerOfficialsError('GTL_OFFICIALS_FORBIDDEN');
      const key = `${args.p_season}:${args.p_week}:${args.p_game}`, cur = rows.get(key);
      if ((cur?.referee ?? null) === args.p_referee) return { gameId: args.p_game, referee: cur?.referee ?? null, setAt: cur?.setAt ?? null, revision: cur?.revision ?? 0, changed: false };
      const row = { referee: args.p_referee, setAt: '2026-10-14T18:00:00.000Z', setBy: args.p_user, revision: (cur?.revision ?? 0) + 1 };
      rows.set(key, row);
      return { season: args.p_season, week: args.p_week, gameId: args.p_game, ...row, changed: true };
    }
    throw new Error(`Unexpected RPC ${name}`);
  } };
}
function app(officials, user = { id: USER, emailConfirmed: true, email: 'sean@example.invalid' }) {
  return createCloudHandler({ authenticate: async () => user, storage: forbidden, weekly: forbidden, lobby: forbidden, social: forbidden, community: forbidden, officials });
}
const post = (handler, route, body, auth = 'Bearer token') => handler(new Request(`https://fixture.invalid/functions/v1/gtl-api/officials/${route}`, {
  method: 'POST', headers: { ...(auth ? { authorization: auth } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) }));

test('the commissioner sets a referee; aliases and spacing are canonicalized and members read it back', async () => {
  const service = memoryService(), handler = app(service);
  const saved = await post(handler, 'set', { season: 2026, week: 6, gameId: 'SEA-DEN', referee: ' Ronald  Torbert ' });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'Ron Torbert', setAt: '2026-10-14T18:00:00.000Z', revision: 1, changed: true });
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_community_admin', 'gtl_set_game_official'], 'the commissioner check runs before the write');
  assert.deepEqual(service.calls[1][1], { p_user: USER, p_season: 2026, p_week: 6, p_game: 'SEA-DEN', p_referee: 'Ron Torbert' });
  const again = await (await post(handler, 'set', { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'Ron Torbert' })).json();
  assert.deepEqual([again.revision, again.changed], [1, false]);
  const cleared = await (await post(handler, 'set', { season: 2026, week: 6, gameId: 'SEA-DEN', referee: null })).json();
  assert.deepEqual([cleared.referee, cleared.revision, cleared.changed], [null, 2, true]);
  await post(handler, 'set', { season: 2026, week: 6, gameId: 'HOU-JAX', referee: 'Scott Novak' });
  const read = await post(handler, 'read', { season: 2026, week: 6 });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), { season: 2026, week: 6, assignments: {
    'HOU-JAX': { referee: 'Scott Novak', setAt: '2026-10-14T18:00:00.000Z', revision: 1 },
    'SEA-DEN': { referee: null, setAt: '2026-10-14T18:00:00.000Z', revision: 2 } } });
});

test('a non-commissioner is refused with 403 before the write RPC is called', async () => {
  const service = memoryService({ admin: false }), handler = app(service);
  const response = await post(handler, 'set', { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'Scott Novak' });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Only the commissioner can set game referees.' });
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_community_admin'], 'no write RPC is attempted');
  assert.equal(service.rows.size, 0);
  // Reading stays open to every signed-in member.
  assert.equal((await post(handler, 'read', { season: 2026, week: 6 })).status, 200);
});

test('requests are validated strictly and never reach the database when malformed', async () => {
  const service = memoryService(), handler = app(service);
  for (const body of [{}, { season: 2026 }, { season: '2026', week: 6, gameId: 'SEA-DEN', referee: 'Scott Novak' }, { season: 2026, week: 0, gameId: 'SEA-DEN', referee: 'Scott Novak' },
    { season: 2026, week: 26, gameId: 'SEA-DEN', referee: 'Scott Novak' }, { season: 2026, week: 6, gameId: 'sea-den', referee: 'Scott Novak' },
    { season: 2026, week: 6, gameId: 'SEA-DEN' }, { season: 2026, week: 6, gameId: 'SEA-DEN', referee: '' }, { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'X' },
    { season: 2026, week: 6, gameId: 'SEA-DEN', referee: '<script>' }, { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 7 },
    { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'Scott Novak', userId: USER }]) {
    const response = await post(handler, 'set', body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  for (const body of [{}, { season: 2026, week: 6, extra: true }, { season: 2026, week: 1.5 }]) assert.equal((await post(handler, 'read', body)).status, 400, JSON.stringify(body));
  assert.equal(service.calls.length, 0, 'invalid requests never reach the database');
  assert.equal((await post(handler, 'read', { season: 2026, week: 6 }, null)).status, 401);
  assert.equal((await handler(new Request('https://fixture.invalid/officials/read', { method: 'GET', headers: { authorization: 'Bearer token' } }))).status, 405);
  assert.equal((await post(app(service, { id: USER, emailConfirmed: true, email: 'x@example.invalid', is_anonymous: true }), 'read', { season: 2026, week: 6 })).status, 401);
  assert.equal((await post(app(service, { id: 'not-a-uuid', emailConfirmed: true, email: 'x@example.invalid' }), 'read', { season: 2026, week: 6 })).status, 401);
});

test('provider errors map to safe messages and malformed provider data is never shown as an assignment', async () => {
  for (const [code, status] of [['GTL_COMMUNITY_MEMBER', 403], ['GTL_OFFICIALS_UNKNOWN_GAME', 409], ['GTL_OFFICIALS_FORBIDDEN', 403], ['GTL_OFFICIALS_INVALID', 400]]) {
    const response = await post(app(memoryService({ fail: code })), 'read', { season: 2026, week: 6 });
    assert.equal(response.status, status, code);
    assert.doesNotMatch((await response.json()).error, /GTL_|SQL|relation/);
  }
  const internal = await post(app(memoryService({ fail: 'relation "x" does not exist' })), 'read', { season: 2026, week: 6 });
  assert.equal(internal.status, 503, 'internal and provider details become the generic unavailable response');
  assert.doesNotMatch(JSON.stringify(await internal.json()), /relation/);
  const odd = { rpc: async () => ({ assignments: { 'SEA-DEN': { referee: '<img src=x>', setAt: 'never', revision: 'x' }, 'not a game': { referee: 'Scott Novak' }, 'HOU-JAX': { referee: 'Ronald Torbert', setAt: '2026-10-14T18:00:00Z', revision: 1 } } }) };
  assert.deepEqual(await (await post(app(odd), 'read', { season: 2026, week: 6 })).json(), { season: 2026, week: 6, assignments: {
    'HOU-JAX': { referee: 'Ron Torbert', setAt: '2026-10-14T18:00:00Z', revision: 1 }, 'SEA-DEN': { referee: null, setAt: null, revision: null } } });
  const wrongGame = { rpc: async name => (name === 'gtl_community_admin' ? true : { gameId: 'HOU-JAX', referee: 'Scott Novak', changed: true }) };
  assert.equal((await post(app(wrongGame), 'set', { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'Scott Novak' })).status, 503);
});

test('the hosted adapter calls the two service-only RPCs with the service key and maps their errors', async () => {
  const seen = [];
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'anon', serviceRoleKey: 'service', fetchImpl: async (url, init) => {
    seen.push([new URL(url).pathname, init.headers.Authorization]);
    return new Response(JSON.stringify({ message: 'GTL_OFFICIALS_FORBIDDEN' }), { status: 400 });
  } });
  await assert.rejects(() => adapter.officials.rpc('gtl_set_game_official', {}), error => error.status === 403);
  assert.deepEqual(seen, [['/rest/v1/rpc/gtl_set_game_official', 'Bearer service']]);
  assert.deepEqual(Object.keys(OFFICIALS_METHODS), ['/officials/read', '/officials/set']);
});

test('referee aliases match the trends corrections table and names canonicalize the same way everywhere', () => {
  const corrections = JSON.parse(fs.readFileSync(new URL('../shared/trends-corrections.json', import.meta.url), 'utf8'));
  assert.deepEqual({ ...REFEREE_ALIASES }, corrections.refereeAliases);
  assert.equal(canonicalReferee('Ronald Torbert'), 'Ron Torbert');
  assert.equal(canonicalReferee('  Scott\tNovak '), 'Scott Novak');
  assert.equal(canonicalReferee(null), null);
  for (const bad of ['', 'Al', 'Scott Novak 2', '<b>', 'A'.repeat(61), undefined, 5]) assert.equal(canonicalReferee(bad), undefined, String(bad));
  // The SQL check uses the same pattern (letters, space, period, apostrophe, hyphen).
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261012234500_gtl_game_officials.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes("referee ~ '^[A-Za-z][A-Za-z .''-]*[A-Za-z.]$'"));
});
