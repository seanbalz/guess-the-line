// Boundary readiness uses fake HTTP replies only. No live table/RPC, provider or hosted migration is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingDeploy, checkCloudBoundary, privateResponse } from '../scripts/check-cloud-boundary.mjs';
import { NOT_HOSTED, APPLIED } from './migrations.mjs';

const options = { url: 'https://onmrgvcehkflfaizvedl.supabase.co', key: 'sb_publishable_boundary_fixture', log() {} };
const reply = (status, body) => new Response(JSON.stringify(body), { status });
const denied = (url, request) => request.headers['Accept-Profile']
  ? reply(406, { code: 'PGRST106' }) : reply(401, { code: '42501' });
const resources = [
  { key: 'table/epl_stat_rechecks', path: '/rest/v1/gtl_epl_stat_rechecks?', missing: { code: 'PGRST205' }, count: 1 },
  ...['recheck_due_at', 'recheck_state', 'record_recheck'].map(name => ({ key: `rpc/gtl_epl_${name}`, path: `/rest/v1/rpc/gtl_epl_${name}`, missing: { code: 'PGRST202' }, count: 1 })),
  { key: 'gtl-api/epl/admin/corrections/read', path: '/functions/v1/gtl-api/epl/admin/corrections/read', missing: { error: 'Not found.' }, count: 2 },
];

test('M33 schema, applied M32 and deployed API routes all have mandatory boundaries', () => {
  // M-33 is hosted as 20261111171228 since November 11, 2026 (RELEASE_2026_11_11_STAT_CORRECTIONS_M33_M35.md): no absence
  // exception remains for its table or RPCs.
  assert.ok(APPLIED.includes(20261029151727));
  assert.ok(!NOT_HOSTED.includes(20261029151727));
  assert.ok(APPLIED.includes(20261029150000));
  assert.ok(!NOT_HOSTED.includes(20261029150000));
  for (const resource of resources) assert.equal(awaitingDeploy[resource.key], undefined, resource.key);
  for (const rpc of ['moneyline_distance', 'guess_json', 'save_guess', 'resolve_pending_references', 'guess_board', 'guess_leaderboard'])
    assert.equal(awaitingDeploy[`rpc/gtl_epl_${rpc}`], undefined, 'applied M32 absence cannot be excused');
});

for (const resource of resources) test(`${resource.key}: denial required; absence of the hosted schema or deployed route fails`, async () => {
  const calls = [];
  await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => {
    if (url.includes(resource.path)) calls.push(request);
    return denied(url, request);
  } });
  assert.equal(calls.length, resource.count);
  if (resource.key.startsWith('gtl-api/')) {
    assert.deepEqual(calls.map(request => request.headers.Authorization), [undefined, 'Bearer invalid-test-token']);
    assert.ok(calls.every(request => request.method === 'POST' && request.body === '{}'));
  } else assert.ok(calls.every(request => request.headers.Authorization === undefined));
  const missing = (url, request) => url.includes(resource.path) ? reply(404, resource.missing) : denied(url, request);
  // Hosted M-33 and the deployed route: a missing table, RPC or route is an unexpected 404 with or without --strict.
  await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing }), /unexpected 404/);
  await assert.rejects(() => checkCloudBoundary({ ...options, strict: true, fetchImpl: missing }), /unexpected 404/);
  for (const status of [200, 400]) await assert.rejects(() => checkCloudBoundary({ ...options,
    fetchImpl: (url, request) => url.includes(resource.path) ? reply(status, {}) : denied(url, request),
  }), new RegExp(`unexpected ${status}`));
  await assert.rejects(() => checkCloudBoundary({ ...options,
    fetchImpl: (url, request) => url.includes(resource.path) ? reply(404, { code: 'UNRELATED', error: 'Other failure' }) : denied(url, request),
  }), /unexpected 404/);
});

test('inert M33 writer probes cannot name a real actor, valid week, capture or payload', async () => {
  let body;
  await checkCloudBoundary({ ...options, fetchImpl: (url, request) => {
    if (url.endsWith('/rest/v1/rpc/gtl_epl_record_recheck')) body = JSON.parse(request.body);
    return denied(url, request);
  } });
  assert.equal(body.p_week, 0); assert.equal(body.p_season, 0); assert.equal(body.p_captured_at, null); assert.equal(body.p_payload, null);
  assert.equal(body.p_run, body.p_claim, 'both are the reserved missing fixture identity, never a real capability');
});

test('commissioner correction denials and pending-table replies cannot carry review or raw roster evidence', async () => {
  for (const field of ['reviews', 'rosters', 'rosterHash', 'nextPickCount', 'changes', 'original_snapshot_id', 'recheck_snapshot_id', 'fpts', 'fpts_against', 'pointsChange', 'againstChange'])
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: (url, request) => url.includes('/functions/v1/gtl-api/epl/admin/corrections/read')
      ? reply(401, { error: 'Unauthorized.', [field]: [] }) : denied(url, request),
    }), /private material in denied response/);
  // M-33 is hosted, so a missing table is an unexpected 404; the awaiting path's not-found privacy check is still exercised
  // with an explicit pendingDeploy fixture (the checker's own option for that path).
  const rosterNotFound = (url, request) => url.includes('/rest/v1/gtl_epl_stat_rechecks?')
    ? reply(404, { code: 'PGRST205', rosters: [] }) : denied(url, request);
  await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: rosterNotFound }), /unexpected 404/);
  await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: rosterNotFound,
    pendingDeploy: { 'table/epl_stat_rechecks': 'migration fixture_not_applied.sql' },
  }), /private material in not-found response/);
});

// Public provider license attribution uses a string, while correction evidence is structured.
test('public change attribution passes while correction changes arrays and objects remain private', () => {
  assert.doesNotMatch(JSON.stringify({ attribution: { changes: 'Kickoff-hour values selected by GTL' } }), privateResponse);
  for (const changes of [[], {}, [{ pointsChange: 4 }]])
    assert.match(JSON.stringify({ changes }), privateResponse);
});
