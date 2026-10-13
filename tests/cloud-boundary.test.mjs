import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingDeploy, checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';

const options = { url: 'https://onmrgvcehkflfaizvedl.supabase.co', key: 'sb_publishable_boundary_fixture', log() {} };
function denied(url, request) {
  const schema = request.headers['Accept-Profile'];
  return new Response(JSON.stringify({ code: schema ? 'PGRST106' : '42501', message: 'Permission denied.' }), { status: schema ? 406 : 401 });
}

test('boundary probes reviewed results without credentials, real actors or valid write payloads', async () => {
  const captured = [];
  await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push({ url, request }); return denied(url, request); } });
  for (const name of ['result_review_lock', 'reviewed_result_events']) {
    assert.ok(captured.some(({ url, request }) => url.includes(`/rest/v1/gtl_${name}?`) && !request.method && !request.headers.Authorization));
  }
  const scoringHelper = captured.find(({ url }) => url.endsWith('/rest/v1/rpc/gtl_submission_reference'));
  assert.ok(scoringHelper); assert.equal(scoringHelper.request.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(scoringHelper.request.body), { p_payload: {}, p_game: {}, p_market: 'spread', p_saved: null });
  for (const name of ['gtl_review_final_result', 'gtl_read_reviewed_results']) {
    const probe = captured.find(({ url }) => url.endsWith(`/rest/v1/rpc/${name}`));
    assert.ok(probe); assert.equal(probe.request.method, 'POST'); assert.equal(probe.request.headers.Authorization, undefined);
    const body = JSON.parse(probe.request.body);
    assert.equal(body.p_user, '00000000-0000-0000-0000-000000000000');
    if (name === 'gtl_review_final_result') assert.deepEqual(body.p_body, {});
    else assert.equal(body.p_league, `g_${'0'.repeat(32)}`);
  }
  const routes = captured.filter(({ url }) => url.endsWith('/functions/v1/gtl-api/results/review'));
  assert.equal(routes.length, 2);
  assert.deepEqual(routes.map(({ request }) => request.headers.Authorization), [undefined, 'Bearer invalid-test-token']);
  for (const { request } of routes) { assert.equal(request.method, 'POST'); assert.deepEqual(JSON.parse(request.body), {}); }
});

test('missing reviewed-results RPC does not pass as a permission denial', async () => {
  await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.endsWith('/rest/v1/rpc/gtl_review_final_result')
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Function unavailable.' }), { status: 404 }) : denied(url, request) }), /gtl_review_final_result RPC: unexpected 404/);
});

test('denied reviewed-results response cannot expose correction ledger contents', async () => {
  await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.includes('/rest/v1/gtl_reviewed_result_events?')
    ? new Response(JSON.stringify({ code: '42501', previous_result: { home: 27, away: 24 } }), { status: 401 }) : denied(url, request) }), /private material in denied response/);
});

test('boundary inventories the private submission intent table and callable helpers using inert fixtures', async () => {
  const captured = [];
  await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push({ url, request }); return denied(url, request); } });
  const table = captured.find(({ url }) => url.includes('/rest/v1/gtl_submission_odds_intents?'));
  assert.ok(table); assert.equal(table.request.method, undefined); assert.equal(table.request.headers.Authorization, undefined);
  const missingId = '00000000-0000-0000-0000-000000000000';
  const helpers = {
    gtl_submission_intent_context: { p_user: missingId, p_intent: {} },
    gtl_preflight_submission: { p_user: missingId, p_intent: {} },
    gtl_begin_submission_odds_collection: { p_user: missingId, p_request: missingId, p_intent: {}, p_operation: 'preflight' },
    gtl_finish_submission_odds_collection: { p_user: missingId, p_request: missingId, p_lease: missingId, p_payload: null, p_quota: {}, p_error: null },
  };
  for (const [name, body] of Object.entries(helpers)) {
    const matches = captured.filter(({ url }) => url.endsWith(`/rest/v1/rpc/${name}`));
    assert.equal(matches.length, 1);
    const { request } = matches[0];
    assert.equal(request.method, 'POST'); assert.equal(request.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(request.body), body);
  }
  // The trigger function's SQL grants are tested in fresh-submission-sql.test.mjs.
  assert.ok(!captured.some(({ url }) => url.endsWith('/rest/v1/rpc/gtl_guard_fresh_submission')));
});

test('missing submission table or helper cannot pass as a permission denial', async t => {
  const routes = [
    '/rest/v1/gtl_submission_odds_intents?',
    ...['gtl_submission_intent_context', 'gtl_preflight_submission', 'gtl_begin_submission_odds_collection', 'gtl_finish_submission_odds_collection'].map(name => `/rest/v1/rpc/${name}`),
  ];
  for (const route of routes) await t.test(route, async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.includes(route)
      ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Unavailable.' }), { status: 404 }) : denied(url, request) }), /unexpected 404/);
  });
});

test('denied submission responses cannot expose intent, picks or scoring evidence', async t => {
  for (const field of ['intent', 'picks', 'scoringReferences', 'quotes', 'changedGameIds']) await t.test(field, async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.endsWith('/rest/v1/rpc/gtl_preflight_submission')
      ? new Response(JSON.stringify({ code: '42501', [field]: {} }), { status: 401 }) : denied(url, request) }), /private material in denied response/);
  });
});

test('referee probes awaiting deploy pass only on the exact not-found answer, are reported, and fail under --strict', async t => {
  const officialsRpc = url => /\/rest\/v1\/rpc\/gtl_(read_game_officials|set_game_official)$/.test(url);
  const officialsRoute = url => /\/functions\/v1\/gtl-api\/officials\/(read|set)$/.test(url);
  const beforeDeploy = async (url, request) => (officialsRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : officialsRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('before the migration and the gtl-api deploy: passes, every other probe still runs and denies', async () => {
    const lines = [];
    const result = await checkCloudBoundary({ ...options, log: line => lines.push(line), fetchImpl: beforeDeploy });
    assert.equal(result.awaiting.length, 6, 'two RPCs and two routes, each route signed out and with an invalid session');
    assert.equal(result.denied, result.checked - 6);
    assert.ok(lines.some(line => /^anonymous gtl_read_game_officials RPC: awaiting deploy \(404, not found\) until migration 20261012234500/.test(line)));
    assert.ok(lines.some(line => line.startsWith('POST virtual-units/settle with invalid session: denied (401)')), 'later probes are not skipped');
    assert.ok(lines.some(line => line.startsWith('anonymous vault schema: denied (406)')));
  });
  await t.test('--strict fails until they deny', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, strict: true, fetchImpl: beforeDeploy }), /gtl_read_game_officials RPC: unexpected 404/);
  });
  await t.test('after the deploy they must deny like every other probe', async () => {
    const result = await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => denied(url, request) });
    assert.deepEqual(result.awaiting, []);
    assert.equal(result.denied, result.checked);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRpc(url)
      ? new Response(JSON.stringify([]), { status: 200 }) : denied(url, request)) }), /gtl_read_game_officials RPC: unexpected 200/);
  });
  await t.test('any other 404 still fails, and only the listed probes may be awaiting deploy', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_game_officials RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.', picks: {} }), { status: 404 }) : denied(url, request)) }), /officials\/read without session: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', picks: {} }), { status: 404 }) : denied(url, request)) }), /private material in not-found response/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.endsWith('/functions/v1/gtl-api/virtual-units/settle')
      ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request)) }), /virtual-units\/settle without session: unexpected 404/);
  });
});

test('every not-yet-applied migration and undeployed route is awaiting deploy, and every awaitingDeploy entry is a real probe', async () => {
  const pending = {
    '20261012223000_gtl_community_history.sql': ['gtl_read_community_history', 'gtl_history_reference', 'gtl_pick_points'],
    '20261012230000_gtl_submit_with_line_at_guess.sql': ['gtl_line_from_snapshot', 'gtl_pending_reference', 'gtl_reference_at_save', 'gtl_resolve_pending_reference', 'gtl_resolve_pending_references', 'gtl_odds_schedule_slate'],
    '20261012234500_gtl_game_officials.sql': ['gtl_read_game_officials', 'gtl_set_game_official'],
  };
  for (const [file, rpcs] of Object.entries(pending)) for (const rpc of rpcs) assert.equal(awaitingDeploy[`rpc/${rpc}`], `migration ${file}`, rpc);
  for (const route of ['community/history', 'officials/read', 'officials/set']) assert.match(awaitingDeploy[`gtl-api/${route}`], new RegExp(`gtl-api deploy with /${route}$`));
  const rpcNames = Object.values(pending).flat();
  assert.equal(Object.keys(awaitingDeploy).length, rpcNames.length + 3, 'nothing else is awaiting deploy');
  const missing = async (url, request) => (rpcNames.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`))
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : /\/functions\/v1\/gtl-api\/(community\/history|officials\/(read|set))$/.test(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  const lines = [];
  const result = await checkCloudBoundary({ ...options, log: line => lines.push(line), fetchImpl: missing });
  assert.equal(result.awaiting.length, rpcNames.length + 3 * 2, 'each RPC once; each route signed out and with an invalid session');
  assert.deepEqual(new Set(result.awaiting.map(a => a.until)), new Set(Object.values(awaitingDeploy)), 'no awaitingDeploy entry is dead');
  assert.ok(lines.some(line => /^anonymous gtl_reference_at_save RPC: awaiting deploy \(404, not found\) until migration 20261012230000/.test(line)));
  assert.ok(lines.some(line => /^POST community\/history without session: awaiting deploy \(404, not found\) until the gtl-api deploy with \/community\/history$/.test(line)));
  await assert.rejects(() => checkCloudBoundary({ ...options, strict: true, fetchImpl: missing }), /unexpected 404/);
});
