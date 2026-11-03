import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOUNDARY_AREAS, awaitingDeploy, checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';

// Redesign build plan, stage 4: the probe lists moved to scripts/boundary/{guess,lines,bets,league,me}.mjs.
// The fixture is every request the checker sent before the move (main a5a218d, October 14, 2026).
const before = JSON.parse(fs.readFileSync(new URL('./fixtures/boundary-probes-before-split.json', import.meta.url), 'utf8')).probes;
const options = { url: 'https://onmrgvcehkflfaizvedl.supabase.co', key: 'sb_publishable_boundary_fixture', log() {} };
const denied = (url, request) => {
  const schema = request.headers['Accept-Profile'];
  return new Response(JSON.stringify({ code: schema ? 'PGRST106' : '42501', message: 'Permission denied.' }), { status: schema ? 406 : 401 });
};
// The fixture's format: method, path and query, JSON body, Authorization (auth=) and Accept-Profile (profile=).
const describe = (url, request) => {
  const { pathname, search } = new URL(url);
  const auth = request.headers.Authorization, profile = request.headers['Accept-Profile'];
  return `${request.method || 'GET'} ${pathname}${search}${request.body ? ` ${request.body}` : ''}${auth ? ` auth=${auth}` : ''}${profile ? ` profile=${profile}` : ''}`;
};
async function sent() {
  const probes = [];
  const result = await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { probes.push(describe(url, request)); return denied(url, request); } });
  return { probes, result };
}
const areas = Object.entries(BOUNDARY_AREAS);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

test('the five area files are joined in a fixed order and each exports the same five lists', () => {
  assert.deepEqual(Object.keys(BOUNDARY_AREAS), ['guess', 'lines', 'bets', 'league', 'me']);
  for (const [name, area] of areas) {
    assert.deepEqual(Object.keys(area).sort(), ['apiChecks', 'awaitingDeploy', 'rpcChecks', 'tables', 'workerChecks'], name);
    for (const table of area.tables) assert.match(table, /^(?!gtl_)[a-z][a-z0-9_]*$/, `${name}: ${table} is listed without the gtl_ prefix`);
    for (const [rpc, body] of area.rpcChecks) { assert.match(rpc, /^gtl_[a-z0-9_]+$/, `${name}: ${rpc}`); assert.ok(record(body), `${name}: ${rpc} body`); }
    for (const [route, body] of area.apiChecks) { assert.match(route, /^[a-z][a-z0-9/-]*(?:\?[a-z]+=[\w-]+)?$/, `${name}: ${route}`); assert.ok(body === undefined || record(body), `${name}: ${route} body`); }
    for (const [label, worker, body] of area.workerChecks) { assert.match(label, /^scheduled [a-z ]+$/, `${name}: ${label}`); assert.match(worker, /^gtl-[a-z-]+$/, `${name}: ${worker}`); assert.ok(record(body), `${name}: ${worker} body`); }
  }
});

test('the joined lists send every probe from before the split exactly once, with the same request', async () => {
  const { probes, result } = await sent();
  assert.equal(before.length, 205);
  assert.equal(new Set(before).size, before.length);
  for (const probe of before) assert.equal(probes.filter(p => p === probe).length, 1, probe);
  assert.equal(new Set(probes).size, probes.length, 'no probe is sent twice');
  assert.deepEqual([result.checked, result.denied, result.awaiting], [probes.length, probes.length, []]);
});

test('no table, RPC, route or worker is listed by two areas', () => {
  const owners = new Map();
  const claim = (key, name) => { assert.ok(!owners.has(key), `${key} is listed by ${owners.get(key)} and ${name}`); owners.set(key, name); };
  for (const [name, area] of areas) {
    for (const table of area.tables) claim(`table ${table}`, name);
    for (const [rpc] of area.rpcChecks) claim(`rpc ${rpc}`, name);
    for (const [route, body] of area.apiChecks) claim(`${body ? 'POST' : 'GET'} ${route.split('?')[0]}`, name);
    for (const [, worker] of area.workerChecks) claim(`worker ${worker}`, name);
  }
});

test('awaitingDeploy is the union of the area files, and each entry is probed by its own area', () => {
  const joined = {};
  for (const [name, area] of areas) {
    for (const [key, until] of Object.entries(area.awaitingDeploy)) {
      assert.ok(!Object.hasOwn(joined, key), `${key} is awaiting deploy in two areas`);
      joined[key] = until;
      const probed = key.startsWith('table/') ? area.tables.some(table => `table/${table}` === key) : key.startsWith('rpc/')
        ? area.rpcChecks.some(([rpc]) => `rpc/${rpc}` === key)
        : area.apiChecks.some(([route]) => `gtl-api/${route.split('?')[0]}` === key);
      assert.ok(probed, `${name}: ${key} is awaiting deploy but not probed by ${name}`);
    }
  }
  assert.deepEqual({ ...awaitingDeploy }, joined);
  assert.ok(Object.isFrozen(awaitingDeploy));
});
