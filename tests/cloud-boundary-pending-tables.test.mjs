// Pure transport fixtures. These overrides do not alter the actual deployed/pending configuration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';
const target = '/rest/v1/gtl_profiles?';
const options = { url: 'https://onmrgvcehkflfaizvedl.supabase.co', key: 'sb_publishable_fixture', log() {} };
const denied = request => new Response(JSON.stringify({ code: request.headers['Accept-Profile'] ? 'PGRST106' : '42501' }),
  { status: request.headers['Accept-Profile'] ? 406 : 401 });
const fetchWith = (status, body) => async (url, request) => url.includes(target) ? new Response(JSON.stringify(body), { status }) : denied(request);
const pendingDeploy = { 'table/profiles': 'migration fixture_not_applied.sql' };

test('only an explicitly pending table with exact 404/PGRST205 is awaiting; strict mode still requires denial', async () => {
  const result = await checkCloudBoundary({ ...options, pendingDeploy, fetchImpl: fetchWith(404, { code: 'PGRST205' }) });
  assert.equal(result.awaiting.length, 1); assert.equal(result.denied, result.checked - 1);
  assert.equal(result.awaiting[0].until, pendingDeploy['table/profiles']);
  await assert.rejects(checkCloudBoundary({ ...options, strict: true, pendingDeploy, fetchImpl: fetchWith(404, { code: 'PGRST205' }) }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, pendingDeploy: {}, fetchImpl: fetchWith(404, { code: 'PGRST205' }) }), /unexpected 404/);
});

test('missing is not granted or denied; wrong codes and private payloads cannot pass the pending-table path', async () => {
  for (const [status, body, expected] of [[200, [], /unexpected 200/], [404, { code: 'PGRST202' }, /unexpected 404/],
    [404, { code: 'PGRST205', picks: [] }, /private material/], [401, { code: 'PGRST205' }, /permission denial/]]) {
    await assert.rejects(checkCloudBoundary({ ...options, pendingDeploy, fetchImpl: fetchWith(status, body) }), expected);
  }
  const result = await checkCloudBoundary({ ...options, strict: true, pendingDeploy, fetchImpl: fetchWith(403, { code: '42501' }) });
  assert.deepEqual(result.awaiting, []); assert.equal(result.denied, result.checked);
});
