import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { hashInviteToken, normalizeEmail, providerLobbyError } from '../cloud/lobby.mjs';
import { seed } from '../server/store.mjs';

const uid = '00000000-0000-4000-8000-000000000001';
const inviteId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const leagueId = 'g_00000000000040008000000000000001';
const verified = { id: uid, email: 'owner@example.invalid', emailConfirmed: true, is_anonymous: false };
function app({ user = verified, rpc, storage, weekly } = {}) {
  const calls = [];
  const handler = createCloudHandler({ authenticate: async () => user, storage, weekly,
    lobby: { async rpc(name, args) { calls.push({ name, args }); return rpc ? rpc(name, args) : { ok: true }; } },
  });
  return { calls, async request(path, body, options = {}) {
    const response = await handler(new Request(`https://project.supabase.co/functions/v1/gtl-api${path}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...options.headers }, body: body ? JSON.stringify(body) : undefined,
    }));
    return { status: response.status, data: await response.json() };
  } };
}

test('any confirmed account can open lobby without an existing league membership', async () => {
  const server = app({ rpc: () => ({ profile: { id: uid, displayName: '' }, leagues: [], pendingInvites: [] }) });
  const result = await server.request('/lobby');
  assert.equal(result.status, 200); assert.deepEqual(result.data.leagues, []);
  assert.deepEqual(server.calls, [{ name: 'gtl_lobby', args: { p_user_id: uid, p_email: 'owner@example.invalid' } }]);
});

test('lobby operations require Auth-confirmed email and ignore editable metadata', async () => {
  for (const user of [{ ...verified, emailConfirmed: false }, { ...verified, email: null }, { ...verified, email: null, user_metadata: { email: 'owner@example.invalid', emailConfirmed: true } }]) {
    const server = app({ user });
    for (const [path, body] of [['/lobby'], ['/profile', { displayName: 'Player' }], ['/leagues', { name: 'Game', format: 'duel', practice: false, requestId }], ['/invite/accept', { inviteId }]]) {
      assert.equal((await server.request(path, body)).status, 403);
    }
    assert.deepEqual(server.calls, []);
  }
});

test('profile and creation whitelist fields and derive actor from verified identity', async () => {
  const server = app();
  assert.equal((await server.request('/profile', { displayName: '  New Player  ' })).status, 200);
  assert.deepEqual(server.calls[0], { name: 'gtl_save_profile', args: { p_user_id: uid, p_display_name: 'New Player' } });
  assert.equal((await server.request('/leagues', { name: 'Private group', format: 'group', practice: true, requestId })).status, 200);
  assert.equal(server.calls[1].args.p_practice, true); assert.equal(server.calls[1].args.p_request_id, requestId);
  for (const body of [{ displayName: '' }, { displayName: 'x'.repeat(61) }, { displayName: 'Bad\nName' }, { displayName: 'Name', userId: inviteId }]) assert.equal((await server.request('/profile', body)).status, 400);
  for (const body of [{ name: 'Game', format: 'triple-threat', practice: false, requestId }, { name: 'Game', format: 'duel', practice: false }, { name: 'Game', format: 'duel', practice: false, requestId, roster: [] }]) assert.equal((await server.request('/leagues', body)).status, 400);
  assert.equal((await server.request('/lobby?email=victim@example.invalid')).status, 400);
});

test('invitation uses random fragment token, stores only SHA256, and does not claim email delivery', async () => {
  const server = app({ rpc: () => ({ inviteId, expiresAt: '2026-10-15T17:00:00Z' }) });
  const result = await server.request(`/invites?league=${leagueId}`, { email: ' Guest+Tag@Example.invalid ', requestId });
  assert.equal(result.status, 200); assert.equal(result.data.delivery, 'link_only');
  const link = new URL(result.data.inviteUrl); assert.equal(link.origin, 'https://guess-the-line.pages.dev'); assert.equal(link.search, '');
  const token = link.hash.slice('#invite='.length); assert.match(token, /^[0-9a-f]{64}$/);
  const args = server.calls[0].args;
  assert.equal(args.p_email, 'guest+tag@example.invalid'); assert.equal(args.p_actor_email, verified.email);
  assert.equal(args.p_token_hash, await hashInviteToken(token)); assert.notEqual(args.p_token_hash, token);
  assert.equal(JSON.stringify(args).includes(token), false);
  assert.equal((await server.request(`/invites?league=${leagueId}`, { email: 'OWNER@EXAMPLE.INVALID', requestId })).status, 400);
  assert.equal((await server.request(`/invites?league=${leagueId}`, { email: 'guest@example.invalid', requestId, delivery: 'email' })).status, 400);
});

test('accept accepts exactly one selector and always binds verified email', async () => {
  const server = app(); const token = 'a'.repeat(64);
  assert.equal((await server.request('/invite/accept', { token })).status, 200);
  assert.deepEqual(server.calls[0].args, { p_user_id: uid, p_email: verified.email, p_token_hash: await hashInviteToken(token), p_invite_id: null });
  assert.equal((await server.request('/invite/accept', { inviteId })).status, 200);
  assert.equal(server.calls[1].args.p_invite_id, inviteId); assert.equal(server.calls[1].args.p_token_hash, null);
  for (const body of [{ token, inviteId }, {}, { token: 'short' }, { inviteId: 'not-uuid' }, { token, email: 'victim@example.invalid' }]) assert.equal((await server.request('/invite/accept', body)).status, 400);
  assert.equal((await server.request(`/invite/accept?token=${token}`, { inviteId })).status, 400);
  assert.equal(server.calls.length, 2);
});

test('invite management propagates safe authorization errors and hides unknown provider errors', async () => {
  const denied = app({ rpc: () => { throw providerLobbyError('GTL_FORBIDDEN'); } });
  assert.equal((await denied.request(`/invites?league=${leagueId}`)).status, 403);
  assert.equal((await denied.request(`/invite/revoke?league=${leagueId}`, { inviteId })).status, 403);
  const failed = app({ rpc: () => { throw new Error('token=SECRET private database contents'); } });
  const result = await failed.request('/lobby');
  assert.equal(result.status, 503); assert.equal(JSON.stringify(result.data).includes('SECRET'), false);
  const fixed = app({ rpc: () => { throw providerLobbyError('GTL_FIXED_ROSTER'); } });
  assert.match((await fixed.request('/invites?league=sean-troy-luke', { email: 'guest@example.invalid', requestId })).data.error, /fixed roster/);
});

test('league-scoped game API checks membership in selected league before loading it', async () => {
  const calls = [], state = seed(); state.league.id = leagueId;
  const server = app({ storage: {
    async membership(user, league) { calls.push(['member', user, league]); return league === leagueId ? { player_id: 'sean', active: true } : null; },
  }, weekly: {
    async load(user, league) { calls.push(['load', league]); return { state, revision: 2, leagueRevision: 2 }; },
  } });
  assert.equal((await server.request(`/state?league=${leagueId}&mode=guess_total`)).status, 200);
  assert.deepEqual(calls, [['member', uid, leagueId], ['load', leagueId]]);
  assert.equal((await server.request('/state?league=sean-troy-luke')).status, 403);
  assert.equal(calls.filter(call => call[0] === 'load').length, 1);
  assert.equal((await server.request(`/state?league=${leagueId}&player=sean`)).status, 400);
});

test('Supabase native RPC adapter uses service credentials and maps only known errors', async () => {
  const requests = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'private-test-key',
    fetchImpl: async (url, options) => { requests.push({ url, options }); return Response.json({ message: 'GTL_INVITE_UNAVAILABLE' }, { status: 400 }); },
  });
  await assert.rejects(() => adapter.lobby.rpc('gtl_lobby', { p_user_id: uid, p_email: verified.email }), error => error.status === 404);
  assert.equal(requests[0].url.pathname, '/rest/v1/rpc/gtl_lobby');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer private-test-key');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(normalizeEmail('Name.Last+tag@Example.invalid'), 'name.last+tag@example.invalid');
});
