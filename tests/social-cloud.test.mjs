import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { handleSocial, providerSocialError } from '../cloud/social.mjs';
import { emptySocialState } from '../shared/social-bets.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-08T20:00:00Z');
const body = () => ({ season: 2026, week: 5, weekRevision: 0, requestId: id(100), kind: 'single', odds: -140, stakeUnits: 1, source: 'Reported ticket', legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -6.5 }] });
function fixture(options = {}) {
  let state = emptySocialState(), revision = 0;
  const calls = [];
  const social = { rpc: async (name, args) => {
    calls.push({ name, args: structuredClone(args) });
    if (name === 'gtl_read_social') return { season: 2026, week: 5, availableWeeks: [{ season: 2026, week: 5 }], following: [], profiles: [{ id: id(1), displayName: 'Troy', email: 'private@example.invalid' }], weeks: [{ season: 2026, week: 5, revision, state, games: [{ id: 'TB-DAL', away: 'TB', home: 'DAL', kickoff: 1791504900, privatePick: -9.5 }] }] };
    if (name === 'gtl_commit_social') { state = structuredClone(args.p_state); revision++; return { revision, replayed: false }; }
    if (name === 'gtl_follow_social') return { following: [args.p_target], replayed: false };
    throw new Error('Unexpected RPC');
  } };
  const user = { id: id(1), email: 'fixture@example.invalid', emailConfirmed: true, is_anonymous: false, ...options.user };
  const handler = createCloudHandler({ authenticate: async () => user, social: options.missingService ? undefined : social, clock: () => now,
    storage: { membership() { throw new Error('Social routes must not require private membership.'); } },
    personal: { rpc() { throw new Error('Social routes must not read a private journal.'); } },
    weekly: { load() { throw new Error('Social routes must not inspect private ballots.'); } },
  });
  const request = (action, payload, method = 'POST', authorization = 'Bearer fixture') => handler(new Request(`https://fixture.invalid/social/${action}`, { method, headers: { ...(authorization ? { authorization } : {}), 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}) }));
  return { calls, request, social, user };
}
test('social endpoint requires verified confirmed sign-in before reading any shared data', async () => {
  const normal = fixture(); assert.equal((await normal.request('read', {}, 'POST', '')).status, 401); assert.equal(normal.calls.length, 0);
  for (const user of [{ is_anonymous: true }, { id: 'spoof' }, { emailConfirmed: false }]) {
    const f = fixture({ user }); assert([401, 403].includes((await f.request('read', {})).status)); assert.equal(f.calls.length, 0);
  }
  assert.equal((await fixture({ missingService: true }).request('read', {})).status, 503);
  const f = fixture(); const response = await f.request('read', { season: 2026, week: 5 }); assert.equal(response.status, 200);
  const view = await response.json(); assert.equal(view.actorId, id(1)); assert.equal(view.entries.length, 0);
  assert.deepEqual(view.profiles, [{ id: id(1), displayName: 'Troy' }]); assert.equal(JSON.stringify(view).includes('private'), false);
});
test('unknown fields, invalid filters and virtual quote forgery are rejected without committing', async () => {
  const f = fixture();
  for (const value of [{ ownerId: id(2) }, { email: 'x' }, { allHistory: true, season: 2026, week: 5 }, { season: 2026 }, { filters: { privateNotes: true } }, { filters: { following: 'true' } }, { filters: { outcome: 'guaranteed' } }, { filters: { playerId: 'troy' } }]) assert.equal((await f.request('read', value)).status, 400);
  for (const value of [{ ...body(), ownerId: id(2) }, { ...body(), outcome: 'win' }, { ...body(), legs: [{ ...body().legs[0], privateNotes: 'private' }] }, { ...body(), requestId: null }, { ...body(), weekRevision: -1 }]) assert.equal((await f.request('create', value)).status, 400);
  assert.equal((await f.request('create', { ...body(), origin: 'virtual', quotedAt: '2026-10-08T19:00:00Z' })).status, 409);
  assert.equal((await f.request('tail', { season: 2026, week: 5, weekRevision: 0, requestId: id(101), sourceEntryId: id(200), origin: 'virtual', odds: -110, stakeUnits: 1, source: 'Fake', quotedAt: '2026-10-08T19:00:00Z' })).status, 409);
  assert.equal(f.calls.filter(c => c.name === 'gtl_commit_social').length, 0);
});
test('create projection reuses authenticated identity and preserves null unknown odds and stake', async () => {
  const f = fixture(); const response = await f.request('create', { ...body(), odds: null, stakeUnits: null }); assert.equal(response.status, 200);
  const view = await response.json(); assert.equal(view.entries.length, 1); assert.equal(view.entries[0].ownerId, id(1)); assert.equal(view.entries[0].potentialProfitUnits, null); assert.equal(view.summary.roiPercent, null);
  const commit = f.calls.find(c => c.name === 'gtl_commit_social'); assert.equal(commit.args.p_user, id(1)); assert.equal(commit.args.p_expected_revision, 0); assert.equal(commit.args.p_state.entries.length, 1);
  assert.equal(commit.args.p_state.entries[0].countsForRecord, true); assert.equal(commit.args.p_state.receipts.length, 1);
});
test('follow mutation uses explicit target and errors are safe', async () => {
  const f = fixture(); assert.equal((await f.request('follow', { requestId: id(101), targetUserId: id(1), following: true })).status, 400);
  const response = await f.request('follow', { requestId: id(101), targetUserId: id(2), following: true }); assert.equal(response.status, 200); assert.deepEqual((await response.json()).following, [id(2)]);
  const error = providerSocialError('private SQL details with credential'); assert.equal(error.message, 'Shared bets are unavailable.');
  await assert.rejects(() => handleSocial({ route: '/social/read', body: {}, user: null, service: f.social }), error => error.status === 401);
});
test('adapter authenticates with the user token then reads social RPC with server-only credentials', async () => {
  const calls = []; let failure = null, confirmed = true;
  const adapter = createSupabaseAdapter({ url: 'https://provider.example.invalid', anonKey: 'fixture-publishable', serviceRoleKey: 'fixture-server-secret', fetchImpl: async (url, options) => {
    calls.push({ path: url.pathname, headers: options.headers, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    assert.equal(options.redirect, 'error');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: id(2), role: 'authenticated', is_anonymous: false, email: 'sean@example.invalid', email_confirmed_at: confirmed ? '2026-10-01T00:00:00Z' : null, user_metadata: { id: id(1), commissioner: true } });
    // Stage 21: the reply carries the live rules (cloud/live-rules.mjs); the function is missing here, as it is hosted today.
    if (url.pathname === '/rest/v1/rpc/gtl_live_rules') return Response.json({ code: 'PGRST202', message: 'Could not find the function' }, { status: 404 });
    assert.equal(url.pathname, '/rest/v1/rpc/gtl_read_social');
    if (failure) return Response.json({ message: failure, detail: 'Never expose provider internal details' }, { status: 400 });
    const sourceState = emptySocialState();
    sourceState.entries.push({ id: id(300), ownerId: id(1), season: 2026, week: 5, kind: 'single', origin: 'tracked', legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -6.5, selection: 'DAL -6.5' }], odds: -140, stakeUnits: 1, source: 'Reported ticket', quotedAt: null, placedAt: null, recordedAt: '2026-10-08T19:00:00Z', updatedAt: '2026-10-08T19:00:00Z', settledAt: null, outcome: 'pending', countsForRecord: true, revision: 1 });
    return Response.json({ season: 2026, week: 5, availableWeeks: [{ season: 2026, week: 5 }], following: [], profiles: [{ id: id(1), displayName: 'Troy' }, { id: id(2), displayName: 'Sean' }], weeks: [{ season: 2026, week: 5, revision: 1, state: sourceState, games: [{ id: 'TB-DAL', away: 'TB', home: 'DAL', kickoff: 1791504900 }] }] });
  } });
  const handler = createCloudHandler({ ...adapter, clock: () => now });
  const request = payload => handler(new Request('https://fixture.invalid/functions/v1/gtl-api/social/read', { method: 'POST', headers: { Authorization: 'Bearer fixture-user-token', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  const response = await request({ season: 2026, week: 5 }); assert.equal(response.status, 200);
  const view = await response.json(); assert.equal(view.actorId, id(2)); assert.equal(view.entries[0].ownerId, id(1)); assert.equal(view.entries[0].canTail, true); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls.map(call => call.path).sort(), ['/auth/v1/user', '/rest/v1/rpc/gtl_live_rules', '/rest/v1/rpc/gtl_read_social']);
  assert.deepEqual(view.rules, { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }, 'today\'s rules while gtl_live_rules is missing');
  assert.deepEqual(calls[0].headers, { apikey: 'fixture-publishable', Authorization: 'Bearer fixture-user-token' });
  const socialCall = calls.find(call => call.path === '/rest/v1/rpc/gtl_read_social');
  assert.equal(socialCall.headers.apikey, 'fixture-server-secret'); assert.equal(socialCall.headers.Authorization, 'Bearer fixture-server-secret'); assert.equal(socialCall.body.p_user, id(2));
  assert.equal(JSON.stringify(view).includes('fixture-server-secret'), false);
  confirmed = false; calls.length = 0; assert.equal((await request({})).status, 403); assert.deepEqual(calls.map(call => call.path), ['/auth/v1/user']);
  confirmed = true; calls.length = 0; assert.equal((await request({ p_user: id(1) })).status, 400); assert.deepEqual(calls.map(call => call.path), ['/auth/v1/user']);
  for (const [message, status] of [['GTL_SOCIAL_PROFILE', 400], ['GTL_SOCIAL_SLATE', 404], ['GTL_SOCIAL_FORBIDDEN', 403], ['GTL_SOCIAL_CONFLICT', 409], ['GTL_SOCIAL_RETRY_CONFLICT', 409], ['GTL_SOCIAL_LIMIT', 409], ['database internals secret=fixture-server-secret', 503]]) {
    failure = message; const result = await request({}); assert.equal(result.status, status); const error = await result.text(); assert.equal(error.includes('fixture-server-secret'), false); assert.equal(error.includes('Never expose'), false);
  }
});

test('hosted read accepts grouped settled and projects the same final-only summary', async () => {
  const f = fixture();
  let revision = 0;
  for (const [index, outcome] of ['pending', 'win', 'loss', 'push', 'void'].entries()) {
    const created = await f.request('create', { ...body(), requestId: id(600 + index), weekRevision: revision++ });
    assert.equal(created.status, 200);
    if (outcome === 'pending')
      continue;
    const view = await (await f.request('read', {})).json();
    const entry = view.entries.find(e => e.outcome === 'pending');
    const settled = await f.request('settle', { season: 2026, week: 5, weekRevision: revision++, requestId: id(700 + index), entryId: entry.id, revision: entry.revision, outcome, actualReturnUnits: null, reason: 'Fixture result' });
    assert.equal(settled.status, 200);
  }
  const response = await f.request('read', { filters: { outcome: 'settled', market: 'spread' } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.entries.map(e => e.outcome).sort(), ['loss', 'push', 'void', 'win']);
  assert.equal(result.summary.bets, 4);
  assert.equal((await (await f.request('read', { filters: { outcome: 'settled', market: 'total' } })).json()).entries.length, 0);
});
