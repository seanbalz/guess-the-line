// NBA N2 (M-49) cloud boundary probes, source coverage only: mock denial, missing and granted responses, never the hosted
// project. Every gtl_nba_* table and RPC M-49 adds is probed signed out, and so is the gtl-nba-jobs worker. M-49 is hosted as
// 20261112055355 and gtl-nba-jobs is deployed as v1 since November 12, 2026 UTC (RELEASE_2026_11_12_NBA_N2_M49.md), so each must
// deny: a "does not exist" reply is an unexpected 404, with or without --strict.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { awaitingDeploy, checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';
import * as nbaJobs from '../scripts/boundary/nba-jobs.mjs';
import * as bets from '../scripts/boundary/bets.mjs';
import { APPLIED, NOT_HOSTED } from './migrations.mjs';

const options = { url: 'https://onmrgvcehkflfaizvedl.supabase.co', key: 'sb_publishable_nba_fixture', log() {} };
const MIGRATION = '20261112040000_gtl_nba_slate_lines.sql';
const denied = request => new Response(JSON.stringify({ code: request.headers['Accept-Profile'] ? 'PGRST106' : '42501' }),
  { status: request.headers['Accept-Profile'] ? 406 : 401 });
const resources = [
  ...nbaJobs.tables.map(table => [`table/${table}`, `/rest/v1/gtl_${table}?`, 'PGRST205']),
  ...nbaJobs.rpcChecks.map(([rpc]) => [`rpc/${rpc}`, `/rest/v1/rpc/${rpc}`, 'PGRST202']),
];

test('every table and service function M-49 creates is probed', () => {
  const sql = fs.readFileSync(`supabase/migrations/${MIGRATION}`, 'utf8');
  const created = [...sql.matchAll(/create table if not exists public\.gtl_([a-z_]+)/g)].map(m => m[1]).sort();
  assert.deepEqual([...nbaJobs.tables].sort(), created);
  const callable = [...sql.matchAll(/create or replace function public\.(gtl_[a-z_]+)\([^)]*\) returns (?!trigger)/g)].map(m => m[1]).sort();
  assert.deepEqual(nbaJobs.rpcChecks.map(([rpc]) => rpc).sort(), callable, 'trigger functions are never RPCs; every other function is probed');
  assert.match(nbaJobs.MIGRATION, /^20261112040000\b/);
});

test('M-49 is hosted, so none of its tables or RPCs awaits deploy', () => {
  assert.ok(APPLIED.includes(20261112040000) && !NOT_HOSTED.includes(20261112040000));
  assert.deepEqual({ ...nbaJobs.awaitingDeploy }, {});
  assert.equal(resources.length, 19, 'eight tables and eleven RPCs');
  for (const [key] of resources) assert.ok(!Object.hasOwn(awaitingDeploy, key), key);
});

for (const [key, path, code] of resources) test(`M-49 boundary ${key} distinguishes private, absent and accidentally granted`, async () => {
  assert.ok(!Object.hasOwn(awaitingDeploy, key), 'hosted M-49 has no absence exception');
  let seen = 0;
  const result = await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => {
    if (url.includes(path)) { seen++; assert.equal(request.headers.Authorization, undefined); }
    return denied(request);
  } });
  assert.equal(seen, 1); assert.deepEqual(result.awaiting, []);
  const missing = async (url, request) => (url.includes(path) ? new Response(JSON.stringify({ code }), { status: 404 }) : denied(request));
  await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: missing }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, strict: true, fetchImpl: missing }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.includes(path)
    ? new Response('[]', { status: 200 }) : denied(request)) }), /unexpected 200/);
});

test('the deployed gtl-nba-jobs worker is probed without and with an invalid machine token, naming no run; 404 or 200 fails', async () => {
  const missingId = '00000000-0000-0000-0000-000000000000';
  assert.deepEqual(bets.workerChecks.filter(([, worker]) => worker === 'gtl-nba-jobs'), [['scheduled nba jobs', 'gtl-nba-jobs', { runId: missingId }]]);
  const calls = [];
  const result = await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => {
    if (url.endsWith('/functions/v1/gtl-nba-jobs')) calls.push(request);
    return denied(request);
  } });
  assert.deepEqual(result.awaiting, []);
  assert.deepEqual(calls.map(request => [request.method, request.headers.Authorization ?? null, JSON.parse(request.body)]),
    [['POST', null, { runId: missingId }], ['POST', `Bearer ${'0'.repeat(64)}`, { runId: missingId }]]);
  for (const [status, label] of [[404, 'without machine token: unexpected 404'], [200, 'without machine token: unexpected 200'], [503, 'without machine token: unexpected 503']])
    await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.endsWith('/functions/v1/gtl-nba-jobs')
      ? new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status }) : denied(request)) }), new RegExp(`scheduled nba jobs ${label}`));
});

test('the probes are inert: no real run, claim, token, date or payload', async () => {
  const bodies = [], names = new Set(nbaJobs.rpcChecks.map(([rpc]) => rpc));
  await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => {
    if (names.has(new URL(url).pathname.split('/').pop()) && request.body) bodies.push(JSON.parse(request.body));
    return denied(request);
  } });
  assert.equal(bodies.length, nbaJobs.rpcChecks.length);
  const text = JSON.stringify(bodies);
  assert.doesNotMatch(text, /"p_token":"(?!0{64})/); assert.doesNotMatch(text, /NBA:balldontlie|"qualified":true/);
});
