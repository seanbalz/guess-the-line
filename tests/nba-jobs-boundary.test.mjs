// NBA N2 (M-49) cloud boundary probes, source coverage only: mock denial, missing and granted responses, never the hosted
// project. Every gtl_nba_* table and RPC M-49 adds is probed signed out; until M-49 is applied each may answer only the exact
// "does not exist" reply (reported as awaiting deploy), and from its apply record on it must deny.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { awaitingDeploy, checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';
import * as nbaJobs from '../scripts/boundary/nba-jobs.mjs';
import { NOT_HOSTED } from './migrations.mjs';

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

for (const [key, path, code] of resources) test(`M-49 boundary ${key} distinguishes private, absent and accidentally granted`, async () => {
  const pending = NOT_HOSTED.includes(20261112040000);
  assert.equal(Object.hasOwn(awaitingDeploy, key), pending);
  let seen = 0;
  const result = await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => {
    if (url.includes(path)) { seen++; assert.equal(request.headers.Authorization, undefined); }
    return denied(request);
  } });
  assert.equal(seen, 1); assert.deepEqual(result.awaiting, []);
  const missing = async (url, request) => (url.includes(path) ? new Response(JSON.stringify({ code }), { status: 404 }) : denied(request));
  if (pending) {
    const absent = await checkCloudBoundary({ ...options, fetchImpl: missing });
    assert.equal(absent.awaiting.length, 1); assert.equal(absent.denied, absent.checked - 1);
  } else await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: missing }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, strict: true, fetchImpl: missing }), /unexpected 404/);
  await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.includes(path)
    ? new Response('[]', { status: 200 }) : denied(request)) }), /unexpected 200/);
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
