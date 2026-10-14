import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_METHODS, ROUTE_MODULES, createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { BETS_METHODS, BetsError, handleBets, providerBetsError } from '../cloud/bets.mjs';
import { LEAGUE_METHODS, LeagueError, handleLeague, providerLeagueError } from '../cloud/league.mjs';
import { LINES_METHODS, LinesError, handleLines, providerLinesError } from '../cloud/lines.mjs';
import { ME_METHODS, MeError, handleMe, providerMeError } from '../cloud/me.mjs';

// Redesign build plan, stage 4: cloud/{lines,bets,league,me}.mjs are wired into cloud/handler.mjs once, so a
// later server stage edits only its own module. The gtl-api route map of October 14, 2026 (main a5a218d):
const GET = ['GET'], POST = ['POST'];
const BEFORE = Object.freeze({
  '/state': GET, '/export': GET, '/lobby': GET, '/personal': GET, '/virtual-units': GET, '/invites': ['GET', 'POST'],
  ...Object.fromEntries([
    '/ballot', '/bet', '/profile', '/leagues', '/invite/accept', '/invite/revoke',
    '/personal/read', '/personal/ballot', '/personal/forecast', '/favorite/set', '/journal/create', '/journal/correct', '/journal/archive', '/journal/history',
    '/social/read', '/social/create', '/social/tail', '/social/settle', '/social/include', '/social/correct', '/social/follow',
    '/community/read', '/community/history', '/community/like', '/community/comment', '/community/member', '/community/publish-preview', '/community/publish',
    '/community/interest', '/community/sit-out', '/community/week-open',
    '/officials/read', '/officials/set', '/results/review', '/odds/preflight', '/odds/collect', '/benchmark/freeze',
    '/virtual-pick', '/virtual-units/settle', '/wind/read', '/push/status', '/push/subscribe', '/push/unsubscribe',
  ].map(route => [route, POST])),
});
const GROUPS = [
  ['lines', LINES_METHODS, handleLines, LinesError, providerLinesError, 'Lines are unavailable.'],
  ['bets', BETS_METHODS, handleBets, BetsError, providerBetsError, 'Bets are unavailable.'],
  ['league', LEAGUE_METHODS, handleLeague, LeagueError, providerLeagueError, 'League data is unavailable.'],
  ['me', ME_METHODS, handleMe, MeError, providerMeError, 'Your records are unavailable.'],
];
const USER = { id: '00000000-0000-4000-8000-00000000000b', is_anonymous: false };

test('the merged route map keeps every route of October 14 with the same methods', () => {
  assert.equal(Object.keys(BEFORE).length, 49);
  for (const [route, methods] of Object.entries(BEFORE)) assert.deepEqual(ROUTE_METHODS[route], methods, route);
});

test('the merged route map is exactly the union of the modules\' maps, and no route belongs to two modules', () => {
  const union = {}, owner = {};
  for (const [name, methods] of Object.entries(ROUTE_MODULES)) {
    for (const [route, allowed] of Object.entries(methods)) {
      assert.ok(!Object.hasOwn(owner, route), `${route} is claimed by ${owner[route]} and ${name}`);
      owner[route] = name; union[route] = allowed;
      assert.ok(Array.isArray(allowed) && allowed.length && allowed.every(method => ['GET', 'POST'].includes(method)), route);
      assert.match(route, /^\/[a-z][a-z0-9/-]*$/, route);
    }
  }
  assert.deepEqual({ ...ROUTE_METHODS }, union);
  assert.ok(Object.isFrozen(ROUTE_METHODS) && Object.isFrozen(ROUTE_MODULES));
});

test('the four redesign groups are wired once, through their own maps', () => {
  for (const [name, methods] of GROUPS) {
    assert.equal(ROUTE_MODULES[name], methods, `${name}: the handler reads the module's own map`);
    assert.ok(Object.isFrozen(methods), name);
  }
});

test('each group handler requires a signed-in user, serves only its own routes and needs its service', async () => {
  for (const [name, , handle, GroupError] of GROUPS) {
    for (const user of [null, {}, { id: 'not-a-uuid' }, { ...USER, is_anonymous: true }]) {
      await assert.rejects(handle({ route: `/${name}/read`, body: {}, user, service: { rpc: async () => ({}) } }), error => error instanceof GroupError && error.status === 401, name);
    }
    await assert.rejects(handle({ route: `/${name}/unknown`, body: {}, user: USER, service: { rpc: async () => assert.fail('no route, no database call') } }),
      error => error instanceof GroupError && error.status === 404 && error.message === 'Not found.', name);
  }
});

test('an unmapped database code never reaches the player: it is the generic unavailable error', () => {
  for (const [name, , , GroupError, providerError, generic] of GROUPS) {
    for (const message of [undefined, 'GTL_UNKNOWN_CODE', 'constructor', '__proto__', 'toString', 'database secret detail']) {
      const error = providerError(message);
      assert.ok(!(error instanceof GroupError), `${name}: ${message}`);
      assert.equal(error.message, generic, `${name}: ${message}`);
    }
  }
});

test('the adapter gives each group a service-only RPC caller mapped through its own errors', async () => {
  const requests = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), options });
    return requests.length % 2 ? Response.json({ ok: true }) : Response.json({ message: 'database secret detail' }, { status: 400 });
  } });
  for (const [name, , , , , generic] of GROUPS) {
    assert.deepEqual(await adapter[name].rpc('gtl_fixture_read', { p_user: USER.id }), { ok: true });
    await assert.rejects(adapter[name].rpc('gtl_fixture_read', {}), error => error.message === generic && !/secret/.test(error.message));
    await assert.rejects(adapter[name].rpc('../auth/v1/user', {}), /Invalid operation/);
  }
  assert.equal(requests.length, GROUPS.length * 2, 'an invalid name is never sent');
  for (const { url, options } of requests) {
    assert.equal(url.pathname, '/rest/v1/rpc/gtl_fixture_read');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer server-test-secret');
  }
});

test('a route outside every module is still 404 before any sign-in check, including the new group prefixes', async () => {
  let authenticated = 0;
  const handler = createCloudHandler({ authenticate: async () => { authenticated++; return null; } });
  for (const path of ['/lines', '/bets', '/league', '/me', '/lines/', '/me/', '/unknown']) {
    if (Object.hasOwn(ROUTE_METHODS, path)) continue;
    const response = await handler(new Request(`https://fixture.invalid/functions/v1/gtl-api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    assert.equal(response.status, 404, path);
    assert.deepEqual(await response.json(), { error: 'Not found.' });
  }
  assert.equal(authenticated, 0);
});
