import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeaturesAdapter, createFeaturesHandler } from '../cloud/features-run.mjs';

// Redesign build plan stage 70: the gtl-league-features worker (cloud/features-run.mjs) with a fake service, so each contract
// is checked without a database or a network. Fixture ids only.
const RUN = '00000000-0000-4000-8000-0000000000aa', CLAIM = '00000000-0000-4000-8000-0000000000bb', SEAN = '00000000-0000-4000-8000-000000000003';
const TOKEN = 'a'.repeat(64);
const request = ({ token = TOKEN, body = { runId: RUN }, method = 'POST', url = 'https://x.supabase.co/functions/v1/gtl-league-features' } = {}) =>
  new Request(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
const INPUTS = { season: 2026, now: '2026-11-10T20:00:00.000Z', rosters: { community: [SEAN] }, weeks: [] };
function service(overrides = {}) {
  const calls = [];
  return { calls, rpc: async (name, args) => {
    calls.push([name, args]);
    if (overrides[name]) return overrides[name](args);
    if (name === 'gtl_claim_league_features') return { replay: false, runId: RUN, claim: CLAIM, actorId: SEAN, season: 2026, now: '2026-11-10T20:00:00.000Z' };
    if (name === 'gtl_read_feature_inputs') return INPUTS;
    if (name === 'gtl_record_feature_results') return { runId: RUN, season: 2026, earned: 0, replay: false };
    if (name === 'gtl_complete_league_features') return { runId: RUN, status: args.p_reason === null ? 'succeeded' : args.p_reason === 'no_season' ? 'skipped' : 'failed', reason: args.p_reason };
    throw new Error(`unexpected ${name}`);
  } };
}

test('a machine-only endpoint: POST, no query, a 64-hex one-run token and a { runId } body, or nothing is called', async () => {
  const s = service(), handler = createFeaturesHandler({ service: s });
  assert.equal((await handler(request({ method: 'GET' }))).status, 405);
  assert.equal((await handler(request({ url: 'https://x.supabase.co/functions/v1/gtl-league-features?run=1' }))).status, 400);
  assert.equal((await handler(request({ token: null }))).status, 401);
  assert.equal((await handler(request({ token: 'short' }))).status, 401);
  assert.equal((await handler(request({ body: { runId: RUN, extra: 1 } }))).status, 400);
  assert.equal(s.calls.length, 0);
});

test('a claimed run runs the commissioner\'s code as a scheduled run, under its own id, then completes', async () => {
  const s = service(), response = await createFeaturesHandler({ service: s })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { runId: RUN, status: 'succeeded', reason: null });
  assert.deepEqual(s.calls.map(c => c[0]), ['gtl_claim_league_features', 'gtl_read_feature_inputs', 'gtl_record_feature_results', 'gtl_complete_league_features']);
  assert.deepEqual(s.calls[0][1], { p_token: TOKEN, p_run: RUN });
  assert.deepEqual(s.calls[1][1], { p_season: 2026, p_now: '2026-11-10T20:00:00.000Z' }, 'the claim\'s database clock, never the worker\'s');
  assert.deepEqual({ ...s.calls[2][1], p_results: undefined }, { p_run: RUN, p_trigger: 'schedule', p_actor: SEAN, p_results: undefined });
  assert.deepEqual(s.calls[3][1], { p_run: RUN, p_claim: CLAIM, p_reason: null });
});

test('a replayed run returns its status and runs nothing; a refused token is 401', async () => {
  const replay = service({ gtl_claim_league_features: () => ({ replay: true, runId: RUN, status: 'succeeded', reason: null }) });
  const answer = await createFeaturesHandler({ service: replay })(request());
  assert.deepEqual([answer.status, await answer.json()], [200, { runId: RUN, status: 'succeeded' }]);
  assert.deepEqual(replay.calls.map(c => c[0]), ['gtl_claim_league_features']);
  const refused = service({ gtl_claim_league_features: () => { throw Object.assign(new Error('x'), { code: 'GTL_SCHEDULE_AUTH' }); } });
  assert.equal((await createFeaturesHandler({ service: refused })(request())).status, 401);
});

test('a failed read or record completes the run as features_failed (503); a season with no week completes as no_season', async () => {
  const broken = service({ gtl_read_feature_inputs: () => { throw new Error('down'); } });
  const failed = await createFeaturesHandler({ service: broken })(request());
  assert.deepEqual([failed.status, await failed.json()], [503, { runId: RUN, status: 'failed', reason: 'features_failed' }]);
  assert.deepEqual(broken.calls.at(-1), ['gtl_complete_league_features', { p_run: RUN, p_claim: CLAIM, p_reason: 'features_failed' }]);
  const empty = service({ gtl_read_feature_inputs: () => ({ season: null, weeks: [], rosters: { community: [] } }) });
  const skipped = await createFeaturesHandler({ service: empty })(request());
  assert.deepEqual([skipped.status, await skipped.json()], [200, { runId: RUN, status: 'skipped', reason: 'no_season' }]);
  assert.ok(!empty.calls.some(c => c[0] === 'gtl_record_feature_results'), 'nothing is recorded');
});

test('the worker\'s adapter calls only its four functions, with the service key, no redirects and no provider details', async () => {
  const seen = [];
  const adapter = createFeaturesAdapter({ url: 'https://x.supabase.co', serviceRoleKey: 'service-key', fetchImpl: async (url, init) => {
    seen.push([String(url), init]);
    return String(url).endsWith('gtl_claim_league_features') ? new Response(JSON.stringify({ message: 'GTL_SCHEDULE_AUTH', hint: 'secret' }), { status: 400 }) : Response.json({ ok: true });
  } });
  await assert.rejects(adapter.rpc('gtl_read_features', {}), /Invalid operation/, 'not the member reader');
  await assert.rejects(adapter.rpc('gtl_settle_virtual_units', {}), /Invalid operation/);
  await assert.rejects(adapter.rpc('gtl_claim_league_features', {}), error => error.code === 'GTL_SCHEDULE_AUTH' && !/secret/.test(error.message));
  assert.deepEqual(await adapter.rpc('gtl_read_feature_inputs', { p_season: 2026 }), { ok: true });
  assert.equal(seen.length, 2);
  for (const [, init] of seen) { assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer service-key'); }
});

test('contract: the Edge entry reads only the two Supabase variables, and the function skips the platform JWT check like the other workers', async () => {
  const { readFileSync } = await import('node:fs');
  const entry = readFileSync(new URL('../supabase/functions/gtl-league-features/index.ts', import.meta.url), 'utf8');
  assert.match(entry, /from '\.\.\/\.\.\/\.\.\/cloud\/features-run\.mjs'/);
  assert.deepEqual([...entry.matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map(m => m[1]).sort(), ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
  assert.match(entry, /Deno\.serve\(createFeaturesHandler\(\{ service \}\)\)/);
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config.split('[functions.gtl-league-features]')[1]?.split(/^\[/m)[0] ?? '', /^verify_jwt = false$/m);
  assert.match(config.split('[functions.gtl-api]')[1].split(/^\[/m)[0], /^verify_jwt = true$/m, 'gtl-api keeps JWT verification');
});
