import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter, ROUTE_MODULES } from '../cloud/handler.mjs';
import { BOUNDARY_AREAS, awaitingDeploy, privateResponse } from '../scripts/check-cloud-boundary.mjs';
const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'synthetic@example.test', emailConfirmed: true };
const request = (route, body = {}, token = 'test') => new Request(`https://fixture.invalid/gtl-api${route}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const raw = { id: '00000000-0000-4000-8000-000000000010', season: '2026-27', eventDate: '2026-10-21', kind: 'single', label: 'Synthetic test',
  legs: [{ gameId: 'NBA:synthetic:1', matchup: 'AAA at BBB', market: 'moneyline', team: 'AAA' }], priceInput: { format: 'american', value: -120 }, stakeUnits: 1, outcome: 'pending' };

test('NBA routes require verified identity and bypass every NFL service', async () => {
  const calls = [];
  const handler = createCloudHandler({ authenticate: async token => token === 'test' ? USER : null,
    storage: { membership: () => assert.fail('NBA never reads NFL membership') },
    nba: { rpc: async (name, body) => { calls.push({ name, body }); return { tickets: [], nextCursor: null, summary: {} }; } } });
  assert.deepEqual(ROUTE_MODULES.nba, { '/nba/read': ['POST'], '/nba/save': ['POST'] });
  assert.equal((await handler(request('/nba/read', {}, 'bad'))).status, 401);
  assert.equal((await handler(request('/nba/read'))).status, 200);
  assert.deepEqual(calls[0], { name: 'gtl_nba_read_bets', body: { p_user_id: USER.id, p_filters: {}, p_cursor: null, p_ticket_id: null } });
  for (const body of [{ userId: USER.id }, { filters: { owner_id: USER.id } }, { cursor: { eventDate: 'bad', id: raw.id } }]) assert.equal((await handler(request('/nba/read', body))).status, 400);
  assert.equal(calls.length, 1);
});

test('NBA saves validate terms, use verified owner and project safe replies', async () => {
  const calls = [];
  const handler = createCloudHandler({ authenticate: async () => USER, nba: { rpc: async (name, body) => { calls.push({ name, body }); return { ticket: { ...body.p_ticket, revision: 1, updatedAt: '2026-10-21T00:00:00Z', audit: [], source_record: { private: true }, owner_id: USER.id } }; } } });
  const body = { operationId: '00000000-0000-4000-8000-000000000020', ticket: raw, expectedRevision: 0 };
  const response = await handler(request('/nba/save', body)); assert.equal(response.status, 200);
  const saved = await response.json(); assert.equal(saved.ticket.odds, -120); assert.ok(!JSON.stringify(saved).match(/source_record|owner_id/));
  assert.equal(calls[0].name, 'gtl_nba_save_bet'); assert.equal(calls[0].body.p_user_id, USER.id);
  for (const invalid of [{ ...body, userId: USER.id }, { ...body, expectedRevision: -1 }, { ...body, expectedRevision: 1 }, { ...body, ticket: { ...raw, stakeUnits: 0 } }]) assert.equal((await handler(request('/nba/save', invalid))).status, 400);
  assert.equal(calls.length, 1);
});

test('NBA adapter restricts RPC capabilities and maps only safe error codes', async () => {
  for (const [payload, status, expected] of [
    [{ message: 'GTL_NBA_CONFLICT' }, 400, 409], [{ message: 'GTL_NBA_INVALID' }, 400, 400],
    [{ code: 'PGRST202', message: 'provider secret' }, 404, 503], [{ message: 'provider secret' }, 500, 503],
  ]) {
    let calls = 0;
    const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'public', serviceRoleKey: 'secret', fetchImpl: async (_url, options) => { calls++; assert.equal(options.headers.Authorization, 'Bearer secret'); return Response.json(payload, { status }); } });
    assert.ok(adapter.nba, 'NBA service adapter exists');
    await assert.rejects(adapter.nba.rpc('gtl_save_ballot', {}), /Invalid operation/); assert.equal(calls, 0);
    const handler = createCloudHandler({ authenticate: async () => USER, nba: adapter.nba });
    const response = await handler(request('/nba/read')); assert.equal(response.status, expected); assert.ok(!JSON.stringify(await response.json()).includes('provider secret'));
  }
});

test('boundary inventory covers both private NBA RPCs/routes and detects source payload leaks', () => {
  const probes = BOUNDARY_AREAS.bets;
  for (const name of ['gtl_nba_read_bets', 'gtl_nba_save_bet']) {
    assert.ok(probes.rpcChecks.some(([rpc]) => rpc === name));
    assert.equal(awaitingDeploy[`rpc/${name}`], 'migration 20261021223000_gtl_nba_app_bets.sql');
  }
  for (const route of ['nba/read', 'nba/save']) {
    assert.ok(probes.apiChecks.some(([path]) => path === route));
    assert.equal(awaitingDeploy[`gtl-api/${route}`], `the gtl-api deploy with /${route}`);
  }
  for (const field of ['tickets', 'source_record', 'source_payload', 'before_terms']) assert.ok(privateResponse.test(JSON.stringify({ [field]: {} })), field);
});
