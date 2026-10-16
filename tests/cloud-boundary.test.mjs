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

test('D-34 kickoff wind probes awaiting deploy pass only on the exact not-found answer, are reported, and fail under --strict', async t => {
  const rpcs = ['gtl_read_wind_forecasts', 'gtl_begin_wind_fetch', 'gtl_finish_wind_fetch'];
  for (const rpc of rpcs) assert.equal(awaitingDeploy[`rpc/${rpc}`], 'migration 20261013060000_gtl_wind_forecasts.sql', rpc);
  assert.equal(awaitingDeploy['gtl-api/wind/read'], 'the gtl-api deploy with /wind/read');
  const windRpc = url => rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const windRoute = url => url.endsWith('/functions/v1/gtl-api/wind/read');
  const beforeDeploy = async (url, request) => (windRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : windRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('the probes use inert fixtures and no credentials', async () => {
    const captured = [];
    await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push({ url, request }); return denied(url, request); } });
    const bodies = Object.fromEntries(rpcs.map(rpc => [rpc, JSON.parse(captured.find(({ url }) => url.endsWith(`/rest/v1/rpc/${rpc}`)).request.body)]));
    assert.deepEqual(bodies.gtl_begin_wind_fetch.p_games, []);
    assert.deepEqual([bodies.gtl_finish_wind_fetch.p_status, bodies.gtl_finish_wind_fetch.p_rows], ['failed', null]);
    assert.equal(bodies.gtl_read_wind_forecasts.p_user, '00000000-0000-0000-0000-000000000000');
    const routes = captured.filter(({ url }) => windRoute(url));
    assert.deepEqual(routes.map(({ request }) => request.headers.Authorization), [undefined, 'Bearer invalid-test-token']);
    for (const { request } of [...routes, ...captured.filter(({ url }) => windRpc(url))]) assert.ok(!/service|secret/i.test(JSON.stringify(request.headers)));
  });
  await t.test('before the migration and the gtl-api deploy: five probes await deploy, every other probe still denies', async () => {
    const lines = [];
    const result = await checkCloudBoundary({ ...options, log: line => lines.push(line), fetchImpl: beforeDeploy });
    assert.equal(result.awaiting.length, 5, 'three RPCs and the route signed out and with an invalid session');
    assert.equal(result.denied, result.checked - 5);
    assert.ok(lines.some(line => /^anonymous gtl_begin_wind_fetch RPC: awaiting deploy \(404, not found\) until migration 20261013060000/.test(line)));
    assert.ok(lines.some(line => /^POST wind\/read with invalid session: awaiting deploy/.test(line)));
    assert.ok(lines.some(line => line.startsWith('anonymous vault schema: denied (406)')));
  });
  await t.test('--strict fails until they deny; afterwards they must deny like every other probe', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, strict: true, fetchImpl: beforeDeploy }), /gtl_read_wind_forecasts RPC: unexpected 404/);
    const after = await checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => denied(url, request) });
    assert.deepEqual([after.awaiting, after.denied], [[], after.checked]);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRpc(url) ? new Response('[]', { status: 200 }) : denied(url, request)) }), /gtl_read_wind_forecasts RPC: unexpected 200/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRoute(url) ? new Response(JSON.stringify({ games: {} }), { status: 200 }) : denied(url, request)) }), /wind\/read without session: unexpected 200/);
  });
  await t.test('any other answer still fails, and a not-found answer may carry no private material', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_wind_forecasts RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.', forecasts: [] }), { status: 404 }) : denied(url, request)) }), /wind\/read without session: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', lease_token: 'x' }), { status: 404 }) : denied(url, request)) }), /private material in not-found response/);
  });
});

test('M-09 private notes probes: hosted and deployed since October 14, 2026, so they are no longer awaiting and a not-found answer fails', async t => {
  const rpcs = ['gtl_read_game_notes', 'gtl_set_game_note'], routes = ['personal/notes', 'personal/note'];
  for (const rpc of rpcs) assert.ok(!Object.hasOwn(awaitingDeploy, `rpc/${rpc}`), rpc);
  for (const route of routes) assert.ok(!Object.hasOwn(awaitingDeploy, `gtl-api/${route}`), route);
  const notesRpc = url => rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const notesRoute = url => /\/functions\/v1\/gtl-api\/personal\/notes?$/.test(url);
  const missing = async (url, request) => (notesRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : notesRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('a missing function is an unexpected 404, not awaiting', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing }), /gtl_read_game_notes RPC: unexpected 404/);
  });
  await t.test('once applied and deployed they deny like every other probe', async () => {
    const after = await checkCloudBoundary({ ...options, fetchImpl: denied });
    assert.deepEqual([after.awaiting, after.denied], [[], after.checked]);
  });
  await t.test('any other 404, or a not-found answer carrying notes, still fails', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (notesRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_game_notes RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (notesRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.', notes: [] }), { status: 404 }) : denied(url, request)) }), /personal\/notes without session: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (notesRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', notes: [{ note: 'x' }] }), { status: 404 }) : denied(url, request)) }), /unexpected 404|private material in not-found response/);
  });
});

test('M-06 lines readers awaiting deploy pass only on the exact not-found answer, are reported, and fail under --strict', async t => {
  const rpcs = ['gtl_read_lines', 'gtl_read_game_lines', 'gtl_book_quotes_from_snapshot', 'gtl_kickoff_line'], routes = ['lines/read', 'lines/game'];
  for (const rpc of rpcs) assert.equal(awaitingDeploy[`rpc/${rpc}`], 'migration 20261015010000_gtl_lines_read.sql', rpc);
  for (const route of routes) assert.equal(awaitingDeploy[`gtl-api/${route}`], `the gtl-api deploy with /${route}`);
  const linesRpc = url => rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const linesRoute = url => /\/functions\/v1\/gtl-api\/lines\/(read|game)$/.test(url);
  const missing = async (url, request) => (linesRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : linesRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('before the apply and deploy: reported as awaiting, never as denied', async () => {
    const lines = [];
    const result = await checkCloudBoundary({ ...options, fetchImpl: missing, log: line => lines.push(line) });
    assert.equal(result.awaiting.length, rpcs.length + routes.length * 2, 'four RPCs once; each route signed out and with an invalid session');
    assert.ok(lines.some(line => /^anonymous gtl_read_lines RPC: awaiting deploy \(404, not found\) until migration 20261015010000/.test(line)));
    assert.ok(lines.some(line => /^POST lines\/game with invalid session: awaiting deploy/.test(line)));
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing, strict: true }), /gtl_read_lines RPC: unexpected 404/);
  });
  await t.test('once applied and deployed they deny like every other probe', async () => {
    const after = await checkCloudBoundary({ ...options, fetchImpl: denied });
    assert.deepEqual([after.awaiting, after.denied], [[], after.checked]);
  });
  await t.test('any other 404, or a not-found answer carrying a line, still fails', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (linesRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_lines RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (linesRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.', games: [] }), { status: 404 }) : denied(url, request)) }), /lines\/read without session: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (linesRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', kickoffLine: { value: -3 } }), { status: 404 }) : denied(url, request)) }), /private material in not-found response/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (linesRoute(url)
      ? new Response(JSON.stringify({ error: 'Denied.', books: [] }), { status: 401 }) : denied(url, request)) }), /private material in denied response/);
  });
});

test('M-08 everyone\'s picks probes awaiting deploy pass only on the exact not-found answer, are reported, and fail under --strict', async t => {
  assert.equal(awaitingDeploy['rpc/gtl_read_guess_picks'], 'migration 20261015020000_gtl_guess_picks_reader.sql');
  assert.equal(awaitingDeploy['gtl-api/community/picks'], 'the gtl-api deploy with /community/picks');
  const picksRpc = url => url.endsWith('/rest/v1/rpc/gtl_read_guess_picks');
  const picksRoute = url => url.endsWith('/functions/v1/gtl-api/community/picks');
  const missing = async (url, request) => (picksRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : picksRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('the probes are anonymous and inert: no session, no real member, no game or target', async () => {
    const captured = [];
    await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push({ url, request }); return denied(url, request); } });
    const rpc = captured.filter(({ url }) => picksRpc(url));
    assert.equal(rpc.length, 1);
    assert.equal(rpc[0].request.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(rpc[0].request.body), { p_user: '00000000-0000-0000-0000-000000000000', p_season: 2026, p_week: 5, p_mode: 'guess_spread', p_game: null, p_target: null, p_now: null });
    const routes = captured.filter(({ url }) => picksRoute(url));
    assert.deepEqual(routes.map(({ request }) => [request.method, request.headers.Authorization, JSON.parse(request.body)]),
      [['POST', undefined, { mode: 'guess_spread' }], ['POST', 'Bearer invalid-test-token', { mode: 'guess_spread' }]]);
  });
  await t.test('before the apply and deploy: reported as awaiting, never as denied', async () => {
    const lines = [];
    const result = await checkCloudBoundary({ ...options, fetchImpl: missing, log: line => lines.push(line) });
    assert.equal(result.awaiting.length, 1 + 2, 'the RPC once; the route signed out and with an invalid session');
    assert.ok(lines.some(line => /^anonymous gtl_read_guess_picks RPC: awaiting deploy \(404, not found\) until migration 20261015020000/.test(line)));
    assert.ok(lines.some(line => /^POST community\/picks with invalid session: awaiting deploy/.test(line)));
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing, strict: true }), /gtl_read_guess_picks RPC: unexpected 404/);
  });
  await t.test('once applied and deployed they deny like every other probe', async () => {
    const after = await checkCloudBoundary({ ...options, fetchImpl: denied });
    assert.deepEqual([after.awaiting, after.denied], [[], after.checked]);
  });
  await t.test('any other 404, or a not-found answer carrying picks, still fails', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (picksRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_guess_picks RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (picksRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.', picks: {} }), { status: 404 }) : denied(url, request)) }), /community\/picks without session: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (picksRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', picks: { 'AAA-BBB': -3.5 } }), { status: 404 }) : denied(url, request)) }), /private material in not-found response/);
  });
});

test('M-03 skip and "See picks now" probes awaiting deploy pass only on the exact not-found answer, are reported, and fail under --strict', async t => {
  const rpcs = ['gtl_forfeit_markets', 'gtl_forfeit_guess_week', 'gtl_read_forfeit'];
  for (const rpc of rpcs) assert.equal(awaitingDeploy[`rpc/${rpc}`], 'migration 20261015040000_gtl_guess_week_forfeit.sql', rpc);
  assert.equal(awaitingDeploy['gtl-api/community/forfeit'], 'the gtl-api deploy with /community/forfeit');
  const forfeitRpc = url => rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const forfeitRoute = url => url.endsWith('/functions/v1/gtl-api/community/forfeit');
  const missing = async (url, request) => (forfeitRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : forfeitRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('the probes are anonymous and inert: no session, no real member, a reason the writer refuses', async () => {
    const captured = [];
    await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push({ url, request }); return denied(url, request); } });
    const calls = Object.fromEntries(rpcs.map(rpc => [rpc, captured.filter(({ url }) => url.endsWith(`/rest/v1/rpc/${rpc}`))]));
    for (const rpc of rpcs) {
      assert.equal(calls[rpc].length, 1, rpc);
      assert.equal(calls[rpc][0].request.headers.Authorization, undefined, rpc);
      assert.equal(JSON.parse(calls[rpc][0].request.body).p_user, '00000000-0000-0000-0000-000000000000', rpc);
    }
    assert.equal(JSON.parse(calls.gtl_forfeit_guess_week[0].request.body).p_reason, 'boundary-check', 'not skip or reveal: the writer refuses it even if a grant were wrong');
    const routes = captured.filter(({ url }) => forfeitRoute(url));
    assert.deepEqual(routes.map(({ request }) => [request.method, request.headers.Authorization, JSON.parse(request.body)]),
      [['POST', undefined, { season: 2026, week: 5, reason: 'skip' }], ['POST', 'Bearer invalid-test-token', { season: 2026, week: 5, reason: 'skip' }]]);
  });
  await t.test('before the apply and deploy: reported as awaiting, never as denied', async () => {
    const lines = [];
    const result = await checkCloudBoundary({ ...options, fetchImpl: missing, log: line => lines.push(line) });
    assert.equal(result.awaiting.length, rpcs.length + 2, 'each RPC once; the route signed out and with an invalid session');
    assert.ok(lines.some(line => /^anonymous gtl_forfeit_guess_week RPC: awaiting deploy \(404, not found\) until migration 20261015040000/.test(line)));
    assert.ok(lines.some(line => /^POST community\/forfeit with invalid session: awaiting deploy/.test(line)));
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing, strict: true }), /gtl_forfeit_markets RPC: unexpected 404/);
  });
  await t.test('once applied and deployed they deny like every other probe', async () => {
    const after = await checkCloudBoundary({ ...options, fetchImpl: denied });
    assert.deepEqual([after.awaiting, after.denied], [[], after.checked]);
  });
  await t.test('any other 404, or a not-found answer carrying picks, still fails', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.endsWith('/rest/v1/rpc/gtl_read_forfeit')
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_forfeit RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (forfeitRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.', reason: 'skip' }), { status: 404 }) : denied(url, request)) }), /community\/forfeit without session: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.endsWith('/rest/v1/rpc/gtl_forfeit_guess_week')
      ? new Response(JSON.stringify({ code: 'PGRST202', picks: { 'AAA-BBB': -3.5 } }), { status: 404 }) : denied(url, request)) }), /private material in not-found response/);
  });
});

test('only the registered rollout pieces are awaiting deploy, and every awaitingDeploy entry is a real probe', async () => {
  const referees = ['gtl_read_game_officials', 'gtl_set_game_official'];
  const winds = ['gtl_read_wind_forecasts', 'gtl_begin_wind_fetch', 'gtl_finish_wind_fetch'];
  // M-01's gate and live-rules are hosted since October 14, 2026 and no longer awaiting.
  // M-05 (stage 22): service-only helper, awaiting its hosted apply.
  const monday = ['gtl_odds_carryover_slate'];
  // M-09 notes are hosted since October 14, 2026 and no longer awaiting.
  // M-06 (stage 23): the lines readers and their two helpers, service-only, awaiting the apply; the two routes, the gtl-api deploy.
  const lines = ['gtl_read_lines', 'gtl_read_game_lines', 'gtl_book_quotes_from_snapshot', 'gtl_kickoff_line'];
  // M-08 (stage 26): the everyone's picks reader and its route.
  const picks = ['gtl_read_guess_picks'];
  // M-02 (stage 18): the service-only lock-in helper, awaiting the apply.
  const lockIn = ['gtl_ballot_locked_in', 'gtl_ballot_has_locked', 'gtl_guess_game_open', 'gtl_guess_late', 'gtl_prepare_guess_ballot', 'gtl_resolution_before_kickoff', 'gtl_valid_pending_resolution', 'gtl_guess_score_receipt'];
  // M-03 (stage 19): the forfeit writer, its reader and their market helper; the route, the gtl-api deploy.
  const forfeit = ['gtl_forfeit_markets', 'gtl_forfeit_guess_week', 'gtl_read_forfeit'];
  // D-48 recommendations writer and routes are hosted since October 15, 2026.
  assert.deepEqual(Object.keys(awaitingDeploy).sort(), ['gtl-api/officials/read', 'gtl-api/officials/set', 'gtl-api/wind/read', 'gtl-api/lines/read', 'gtl-api/lines/game', 'gtl-api/community/picks', 'gtl-api/community/forfeit', ...[...referees, ...winds, ...monday, ...lines, ...picks, ...lockIn, ...forfeit].map(rpc => `rpc/${rpc}`)].sort(), 'nothing else is awaiting deploy');
  assert.equal(awaitingDeploy['rpc/gtl_ballot_locked_in'], 'migration 20261015030000_gtl_sent_picks_final.sql');
  for (const rpc of referees) assert.equal(awaitingDeploy[`rpc/${rpc}`], 'migration 20261012234500_gtl_game_officials.sql', rpc);
  for (const route of ['officials/read', 'officials/set']) assert.equal(awaitingDeploy[`gtl-api/${route}`], `the gtl-api deploy with /${route}`);
  assert.equal(awaitingDeploy['rpc/gtl_odds_carryover_slate'], 'migration 20261014221500_gtl_odds_open_weeks.sql');
  const missing = async (url, request) => ([...referees, ...winds, ...monday, ...lines, ...picks, ...lockIn, ...forfeit].some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`))
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : /\/functions\/v1\/gtl-api\/(officials\/(read|set)|wind\/read|lines\/(read|game)|community\/(picks|forfeit))$/.test(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  const result = await checkCloudBoundary({ ...options, fetchImpl: missing });
  assert.equal(result.awaiting.length, referees.length + winds.length + monday.length + lines.length + picks.length + lockIn.length + forfeit.length + 7 * 2, 'each RPC once; each route signed out and with an invalid session');
  assert.deepEqual(new Set(result.awaiting.map(a => a.until)), new Set(Object.values(awaitingDeploy)), 'no awaitingDeploy entry is dead');
});

test('Community history and D-27 line-at-guess probes stay fail-closed: not applied or not deployed fails the default check', async t => {
  const notApplied = {
    '20261012223000_gtl_community_history.sql': ['gtl_read_community_history', 'gtl_history_reference', 'gtl_pick_points'],
    '20261012230000_gtl_submit_with_line_at_guess.sql': ['gtl_line_from_snapshot', 'gtl_pending_reference', 'gtl_reference_at_save', 'gtl_resolve_pending_reference', 'gtl_resolve_pending_references', 'gtl_odds_schedule_slate'],
  };
  const captured = [];
  await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push(url); return denied(url, request); } });
  for (const [file, rpcs] of Object.entries(notApplied)) for (const rpc of rpcs) await t.test(`${rpc} (${file})`, async () => {
    assert.equal(captured.filter(url => url.endsWith(`/rest/v1/rpc/${rpc}`)).length, 1, 'probed once');
    assert.ok(!Object.hasOwn(awaitingDeploy, `rpc/${rpc}`));
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.endsWith(`/rest/v1/rpc/${rpc}`)
      ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 }) : denied(url, request) }), new RegExp(`${rpc} RPC: unexpected 404`));
  });
  await t.test('/community/history route', async () => {
    assert.equal(captured.filter(url => url.endsWith('/functions/v1/gtl-api/community/history')).length, 2, 'signed out and with an invalid session');
    assert.ok(!Object.hasOwn(awaitingDeploy, 'gtl-api/community/history'));
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => url.endsWith('/functions/v1/gtl-api/community/history')
      ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request) }), /POST community\/history without session: unexpected 404/);
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
