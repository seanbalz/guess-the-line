// M-36 source coverage only. Mock denial/missing/granted responses are not hosted privacy verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingDeploy, checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';
import { NOT_HOSTED } from './migrations.mjs';
const options = { url: 'https://onmrgvcehkflfaizvedl.supabase.co', key: 'sb_publishable_moneyline_fixture', log() {} };
const resources = [
  ['table/epl_moneyline_attempts','/rest/v1/gtl_epl_moneyline_attempts?','PGRST205'],
  ['table/epl_moneyline_collections','/rest/v1/gtl_epl_moneyline_collections?','PGRST205'],
  ...['moneyline_gate','begin_moneyline_read','moneyline_due','finish_moneyline_read','save_guess_current','moneyline_save_ready']
    .map(name=>[`rpc/gtl_epl_${name}`,`/rest/v1/rpc/gtl_epl_${name}`,'PGRST202']),
];
const denied = request => new Response(JSON.stringify({ code: request.headers['Accept-Profile'] ? 'PGRST106' : '42501' }),
  { status: request.headers['Accept-Profile'] ? 406 : 401 });

for (const [key, path, code] of resources) test(`M-36 boundary ${key} distinguishes private, absent and accidentally granted`, async () => {
  const pending = NOT_HOSTED.includes(20261029165947);
  assert.equal(Object.hasOwn(awaitingDeploy, key), pending);
  let seen = 0;
  const result = await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => {
    if (url.includes(path)) { seen++; assert.equal(request.headers.Authorization, undefined); }
    return denied(request);
  } });
  assert.equal(seen, 1); assert.deepEqual(result.awaiting, []);
  const missing = async (url, request) => url.includes(path) ? new Response(JSON.stringify({ code }), { status: 404 }) : denied(request);
  if (pending) {
    const absent = await checkCloudBoundary({ ...options, fetchImpl: missing });
    assert.equal(absent.awaiting.length, 1); assert.equal(absent.denied, absent.checked - 1);
  } else await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: missing }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, strict: true, fetchImpl: missing }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.includes(path)
    ? new Response('[]', { status: 200 }) : denied(request) }), /unexpected 200/);
});
