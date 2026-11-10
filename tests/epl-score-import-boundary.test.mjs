// M-43 (20261110110000_gtl_epl_score_import.sql) source coverage only: its four tables, three RPCs and two commissioner
// routes are probed signed out with inert fixtures. Mock denial/missing/granted responses are not hosted privacy verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingDeploy, checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';
import { tables, rpcChecks, apiChecks } from '../scripts/boundary/epl-score-import.mjs';
import { missingId } from '../scripts/boundary/fixtures.mjs';
import { NOT_HOSTED } from './migrations.mjs';

const VERSION = 20261110110000;
const options = { url: 'https://onmrgvcehkflfaizvedl.supabase.co', key: 'sb_publishable_score_import_fixture', log() {} };
const resources = [
  ...['score_imports', 'score_import_rows', 'score_import_sources', 'score_import_openings']
    .map(name => ({ key: `table/epl_${name}`, path: `/rest/v1/gtl_epl_${name}?`, missing: { code: 'PGRST205' }, count: 1 })),
  ...['score_import_head', 'import_weekly_scores', 'score_import_state']
    .map(name => ({ key: `rpc/gtl_epl_${name}`, path: `/rest/v1/rpc/gtl_epl_${name}`, missing: { code: 'PGRST202' }, count: 1 })),
  ...['read', 'import'].map(name => ({ key: `gtl-api/epl/admin/scores/${name}`, path: `/functions/v1/gtl-api/epl/admin/scores/${name}`, missing: { error: 'Not found.' }, count: 2 })),
];
const denied = (url, request) => {
  const schema = request.headers['Accept-Profile'];
  return new Response(JSON.stringify(schema ? { code: 'PGRST106' } : url.includes('/functions/v1/') ? { error: 'Unauthorized.' } : { code: '42501' }),
    { status: schema ? 406 : 401 });
};

test('M-43 lists exactly its four tables, three RPCs and two routes, awaiting its apply while it is not hosted', () => {
  assert.deepEqual([...tables].sort(), ['epl_score_import_openings', 'epl_score_import_rows', 'epl_score_import_sources', 'epl_score_imports']);
  assert.deepEqual(rpcChecks.map(([name]) => name).sort(), ['gtl_epl_import_weekly_scores', 'gtl_epl_score_import_head', 'gtl_epl_score_import_state']);
  assert.deepEqual(apiChecks.map(([route]) => route), ['epl/admin/scores/read', 'epl/admin/scores/import']);
  const pending = NOT_HOSTED.includes(VERSION);
  for (const { key } of resources) {
    assert.equal(Object.hasOwn(awaitingDeploy, key), pending, key);
    if (pending) assert.match(awaitingDeploy[key], /^20261110110000 \(EPL stage 3 score import/);
  }
});

test('M-43 probes are inert: no real commissioner, attestation, image hash, score or order', () => {
  const [, writer] = rpcChecks.find(([name]) => name === 'gtl_epl_import_weekly_scores');
  assert.equal(writer.p_by, missingId); assert.equal(writer.p_bonus_included, false);
  assert.deepEqual([writer.p_sources, writer.p_scores, writer.p_expected_order], [[], [], []]);
  assert.equal(rpcChecks.find(([name]) => name === 'gtl_epl_score_import_state')[1].p_by, missingId);
  const [, body] = apiChecks.find(([route]) => route === 'epl/admin/scores/import');
  assert.equal(body.bonusIncluded, false); assert.deepEqual([body.sources, body.scores, body.expectedOrder], [[], [], []]);
});

for (const { key, path, missing, count } of resources) test(`M-43 boundary ${key}: denial required; only pending absence is allowed`, async () => {
  const pending = NOT_HOSTED.includes(VERSION);
  const calls = [];
  const result = await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => {
    if (url.includes(path)) calls.push(request);
    return denied(url, request);
  } });
  assert.equal(calls.length, count); assert.deepEqual(result.awaiting, []);
  if (key.startsWith('gtl-api/')) assert.deepEqual(calls.map(request => request.headers.Authorization), [undefined, 'Bearer invalid-test-token']);
  else assert.ok(calls.every(request => request.headers.Authorization === undefined));
  const absent = async (url, request) => url.includes(path) ? new Response(JSON.stringify(missing), { status: 404 }) : denied(url, request);
  if (pending) {
    const reply = await checkCloudBoundary({ ...options, fetchImpl: absent });
    assert.equal(reply.awaiting.length, count); assert.equal(reply.denied, reply.checked - count);
  } else await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: absent }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, strict: true, fetchImpl: absent }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.includes(path)
    ? new Response('[]', { status: 200 }) : denied(url, request) }), /unexpected 200/);
});
