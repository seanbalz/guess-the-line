import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCloudBoundary } from '../scripts/check-cloud-boundary.mjs';

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

test('D-28 push tables, RPCs, API routes and the reminder worker are probed anonymously', async () => {
  const captured = [];
  await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push({ url, request }); return denied(url, request); } });
  for (const table of ['push_subscriptions', 'push_reminders_sent', 'push_reminder_schedule', 'push_reminder_runs']) {
    assert.ok(captured.some(({ url, request }) => url.includes(`/rest/v1/gtl_${table}?`) && !request.method && !request.headers.Authorization), table);
  }
  for (const rpc of ['gtl_push_subscribe', 'gtl_push_unsubscribe', 'gtl_push_status', 'gtl_dispatch_push_reminders', 'gtl_claim_push_reminders', 'gtl_mark_push_reminder', 'gtl_record_push_delivery', 'gtl_complete_push_reminders']) {
    const probe = captured.find(({ url }) => url.endsWith(`/rest/v1/rpc/${rpc}`));
    assert.ok(probe, rpc); assert.equal(probe.request.headers.Authorization, undefined);
  }
  for (const route of ['push/status', 'push/subscribe', 'push/unsubscribe']) {
    assert.deepEqual(captured.filter(({ url }) => url.endsWith(`/functions/v1/gtl-api/${route}`)).map(({ request }) => request.headers.Authorization), [undefined, 'Bearer invalid-test-token'], route);
  }
  assert.deepEqual(captured.filter(({ url }) => url.endsWith('/functions/v1/gtl-push-reminders')).map(({ request }) => request.headers.Authorization), [undefined, `Bearer ${'0'.repeat(64)}`]);
});
