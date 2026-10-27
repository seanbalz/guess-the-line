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

test('awaiting-deploy probes pass only on the exact not-found answer, are reported, and fail under --strict', async t => {
  // The checker's awaiting path, exercised with an explicit pendingDeploy map for the M-10 Bets reader pieces, so it stays
  // covered whether or not any area file lists a piece today.
  const rpcs = ['gtl_bets_context', 'gtl_read_bets', 'gtl_read_bets_market'];
  const pendingDeploy = { ...Object.fromEntries(rpcs.map(rpc => [`rpc/${rpc}`, 'migration 20261015190820_gtl_bets_read.sql'])),
    'gtl-api/bets/read': 'the gtl-api deploy with /bets/read' };
  const check = opts => checkCloudBoundary({ ...options, pendingDeploy, ...opts });
  const betsRpc = url => rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const betsRoute = url => url.endsWith('/functions/v1/gtl-api/bets/read');
  const beforeDeploy = async (url, request) => (betsRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : betsRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('before the migration and the gtl-api deploy: passes, every other probe still runs and denies', async () => {
    const lines = [];
    const result = await check({ log: line => lines.push(line), fetchImpl: beforeDeploy });
    assert.equal(result.awaiting.length, 5, 'three RPCs, and the route signed out and with an invalid session');
    assert.equal(result.denied, result.checked - 5);
    assert.ok(lines.some(line => /^anonymous gtl_read_bets RPC: awaiting deploy \(404, not found\) until migration 20261015190820/.test(line)));
    assert.ok(lines.some(line => /^POST bets\/read with invalid session: awaiting deploy/.test(line)));
    assert.ok(lines.some(line => line.startsWith('POST virtual-units/settle with invalid session: denied (401)')), 'later probes are not skipped');
    assert.ok(lines.some(line => line.startsWith('anonymous vault schema: denied (406)')));
  });
  await t.test('--strict fails until they deny', async () => {
    await assert.rejects(() => check({ strict: true, fetchImpl: beforeDeploy }), /gtl_bets_context RPC: unexpected 404/);
  });
  await t.test('after the deploy they must deny like every other probe', async () => {
    const result = await check({ strict: true, fetchImpl: async (url, request) => denied(url, request) });
    assert.deepEqual([result.awaiting, result.denied], [[], result.checked]);
    await assert.rejects(() => check({ fetchImpl: async (url, request) => (betsRpc(url)
      ? new Response(JSON.stringify([]), { status: 200 }) : denied(url, request)) }), /gtl_bets_context RPC: unexpected 200/);
  });
  await t.test('any other 404 still fails, a not-found answer may carry no private material, and only the listed probes may be awaiting deploy', async () => {
    await assert.rejects(() => check({ fetchImpl: async (url, request) => (betsRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_bets_context RPC: unexpected 404/);
    await assert.rejects(() => check({ fetchImpl: async (url, request) => (betsRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.', picks: {} }), { status: 404 }) : denied(url, request)) }), /bets\/read without session: unexpected 404/);
    await assert.rejects(() => check({ fetchImpl: async (url, request) => (betsRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', stakeMinor: 500 }), { status: 404 }) : denied(url, request)) }), /private material in not-found response/);
    await assert.rejects(() => check({ fetchImpl: async (url, request) => (url.endsWith('/functions/v1/gtl-api/virtual-units/settle')
      ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request)) }), /virtual-units\/settle without session: unexpected 404/);
  });
});

test('M-25 game features: its five RPCs and two routes are probed with inert fixtures and stay awaiting deploy until "apply M-25"', async () => {
  // 20261026234000_gtl_league_features.sql (redesign stage 69) is written and not applied, and no gtl-api deploy has its routes.
  const rpcs = ['gtl_feature_results', 'gtl_read_feature_inputs', 'gtl_feature_post', 'gtl_record_feature_results', 'gtl_read_features'];
  const routes = ['league/features', 'league/features/run'];
  for (const rpc of rpcs) assert.match(awaitingDeploy[`rpc/${rpc}`] ?? '', /20261026234000_gtl_league_features\.sql/, rpc);
  for (const route of routes) assert.match(awaitingDeploy[`gtl-api/${route}`] ?? '', /gtl-api deploy/, route);
  const captured = [];
  const result = await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => {
    captured.push({ url, request });
    if (rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`))) return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 });
    if (routes.some(route => url.endsWith(`/functions/v1/gtl-api/${route}`))) return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 });
    return denied(url, request);
  } });
  assert.equal(result.awaiting.length, rpcs.length + routes.length * 2, 'every RPC, and each route signed out and with an invalid session');
  const missingId = '00000000-0000-0000-0000-000000000000';
  for (const rpc of rpcs) {
    const probe = captured.find(({ url }) => url.endsWith(`/rest/v1/rpc/${rpc}`));
    assert.ok(probe, rpc); assert.equal(probe.request.method, 'POST'); assert.equal(probe.request.headers.Authorization, undefined);
    const body = JSON.parse(probe.request.body);
    for (const key of ['p_user', 'p_actor', 'p_run']) if (Object.hasOwn(body, key)) assert.equal(body[key], missingId, `${rpc} ${key} names no real account`);
  }
  assert.deepEqual(JSON.parse(captured.find(({ url }) => url.endsWith('/rest/v1/rpc/gtl_record_feature_results')).request.body).p_results, {}, 'the writer probe carries no results');
  await assert.rejects(() => checkCloudBoundary({ ...options, strict: true, fetchImpl: async (url, request) => (rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`))
    ? new Response(JSON.stringify({ code: 'PGRST202' }), { status: 404 }) : denied(url, request)) }), /gtl_feature_results RPC: unexpected 404/, '--strict fails until they deny');
});

test('referee probes are hosted and deployed, so they are no longer awaiting and a not-found answer fails', async t => {
  // 20261012234500 is hosted as 20261013050416, and /officials/read and /officials/set ship in every gtl-api since v18.
  const rpcs = ['gtl_read_game_officials', 'gtl_set_game_official'], routes = ['officials/read', 'officials/set'];
  for (const rpc of rpcs) assert.ok(!Object.hasOwn(awaitingDeploy, `rpc/${rpc}`), rpc);
  for (const route of routes) assert.ok(!Object.hasOwn(awaitingDeploy, `gtl-api/${route}`), route);
  const officialsRpc = url => /\/rest\/v1\/rpc\/gtl_(read_game_officials|set_game_official)$/.test(url);
  const officialsRoute = url => /\/functions\/v1\/gtl-api\/officials\/(read|set)$/.test(url);
  await t.test('a missing function or route is an unexpected 404, not awaiting', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_game_officials RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request)) }), /officials\/read without session: unexpected 404/);
  });
  await t.test('they deny like every other probe, and any other answer fails', async () => {
    const after = await checkCloudBoundary({ ...options, fetchImpl: denied });
    assert.deepEqual([after.awaiting, after.denied], [[], after.checked]);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRpc(url)
      ? new Response(JSON.stringify([]), { status: 200 }) : denied(url, request)) }), /gtl_read_game_officials RPC: unexpected 200/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (officialsRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_game_officials RPC: unexpected 404/);
  });
});

test('D-34 kickoff wind probes are hosted and deployed, so they are no longer awaiting and a not-found answer fails', async t => {
  // 20261013060000 is hosted as 20261013072206, and /wind/read ships in every gtl-api since v18 (live check October 14, 2026).
  const rpcs = ['gtl_read_wind_forecasts', 'gtl_begin_wind_fetch', 'gtl_finish_wind_fetch'];
  for (const rpc of rpcs) assert.ok(!Object.hasOwn(awaitingDeploy, `rpc/${rpc}`), rpc);
  assert.ok(!Object.hasOwn(awaitingDeploy, 'gtl-api/wind/read'));
  const windRpc = url => rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const windRoute = url => url.endsWith('/functions/v1/gtl-api/wind/read');
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
  await t.test('a missing function or route is an unexpected 404, not awaiting', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_wind_forecasts RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRoute(url)
      ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request)) }), /wind\/read without session: unexpected 404/);
  });
  await t.test('they deny like every other probe, and any other answer fails', async () => {
    const after = await checkCloudBoundary({ ...options, fetchImpl: denied });
    assert.deepEqual([after.awaiting, after.denied], [[], after.checked]);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRpc(url) ? new Response('[]', { status: 200 }) : denied(url, request)) }), /gtl_read_wind_forecasts RPC: unexpected 200/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRoute(url) ? new Response(JSON.stringify({ games: {} }), { status: 200 }) : denied(url, request)) }), /wind\/read without session: unexpected 200/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRpc(url)
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_read_wind_forecasts RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (windRpc(url)
      ? new Response(JSON.stringify({ code: 'PGRST202', lease_token: 'x' }), { status: 404 }) : denied(url, request)) }), /unexpected 404/);
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

test('M-06 lines readers are hosted and fail closed on missing functions or routes', async t => {
  const rpcs = ['gtl_read_lines', 'gtl_read_game_lines', 'gtl_book_quotes_from_snapshot', 'gtl_kickoff_line'], routes = ['lines/read', 'lines/game'];
  for (const rpc of rpcs) assert.equal(awaitingDeploy[`rpc/${rpc}`], undefined, rpc);
  for (const route of routes) assert.equal(awaitingDeploy[`gtl-api/${route}`], undefined);
  const linesRpc = url => rpcs.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const linesRoute = url => /\/functions\/v1\/gtl-api\/lines\/(read|game)$/.test(url);
  const missing = async (url, request) => (linesRpc(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : linesRoute(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  await t.test('missing hosted functions fail the default check', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing }), /unexpected 404/);
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
      ? new Response(JSON.stringify({ code: 'PGRST202', kickoffLine: { value: -3 } }), { status: 404 }) : denied(url, request)) }), /unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (linesRoute(url)
      ? new Response(JSON.stringify({ error: 'Denied.', books: [] }), { status: 401 }) : denied(url, request)) }), /private material in denied response/);
  });
});

test('M-08 everyone\'s picks probes are hosted and fail closed on missing functions or routes', async t => {
  assert.equal(awaitingDeploy['rpc/gtl_read_guess_picks'], undefined);
  assert.equal(awaitingDeploy['gtl-api/community/picks'], undefined);
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
  await t.test('missing hosted functions fail the default check', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing }), /unexpected 404/);
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
      ? new Response(JSON.stringify({ code: 'PGRST202', picks: { 'AAA-BBB': -3.5 } }), { status: 404 }) : denied(url, request)) }), /unexpected 404/);
  });
});

test('M-03 skip and "See picks now" probes are hosted and fail closed on missing functions or routes', async t => {
  const rpcs = ['gtl_forfeit_markets', 'gtl_forfeit_guess_week', 'gtl_read_forfeit'];
  for (const rpc of rpcs) assert.equal(awaitingDeploy[`rpc/${rpc}`], undefined, rpc);
  assert.equal(awaitingDeploy['gtl-api/community/forfeit'], undefined);
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
  await t.test('missing hosted functions fail the default check', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: missing }), /unexpected 404/);
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
      ? new Response(JSON.stringify({ code: 'PGRST202', picks: { 'AAA-BBB': -3.5 } }), { status: 404 }) : denied(url, request)) }), /unexpected 404/);
  });
});

// The league feed (redesign stages 61 to 63, scripts/boundary/league.mjs): written, not applied or deployed.
const FEED_RPCS = ['gtl_feed_reactions', 'gtl_feed_post_visible', 'gtl_feed_reaction_summary', 'gtl_react_feed',
  'gtl_feed_league_access', 'gtl_feed_in_league', 'gtl_feed_embed', 'gtl_read_league_feed', 'gtl_read_post_comments', 'gtl_read_post_reactors', 'gtl_share_result',
  'gtl_kickoff_slots', 'gtl_write_kickoff_posts'];
const FEED_ROUTES = ['league/react', 'league/feed', 'league/comments', 'league/reactors', 'league/share-result'];
const FEED_PIECES = [...FEED_RPCS.map(rpc => `rpc/${rpc}`), ...FEED_ROUTES.map(route => `gtl-api/${route}`)];

test('the league feed pieces are awaiting deploy: a missing function or route answers awaiting, never denied, and --strict fails it', async () => {
  assert.deepEqual(Object.keys(awaitingDeploy).filter(key => FEED_PIECES.includes(key)).sort(), [...FEED_PIECES].sort());
  const captured = [];
  const missing = async (url, request) => {
    captured.push({ url, request });
    if (FEED_RPCS.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`))) return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 });
    if (FEED_ROUTES.some(route => url.endsWith(`/functions/v1/gtl-api/${route}`))) return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 });
    return denied(url, request);
  };
  const result = await checkCloudBoundary({ ...options, fetchImpl: missing });
  assert.equal(result.awaiting.length, FEED_RPCS.length + FEED_ROUTES.length * 2, 'each RPC once, each route signed out and with an invalid session');
  for (const { url, request } of captured.filter(({ url }) => FEED_RPCS.some(rpc => url.endsWith(`/rpc/${rpc}`)) || FEED_ROUTES.some(route => url.endsWith(`/gtl-api/${route}`)))) {
    if (url.includes('/rest/v1/rpc/')) assert.equal(request.headers.Authorization, undefined, url);
    assert.doesNotMatch(request.body, /0000-4000-8000/, 'no fixture or real member id is sent');
  }
  await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: missing, strict: true }), /unexpected 404/);
  const after = await checkCloudBoundary({ ...options, fetchImpl: denied });
  assert.deepEqual([after.awaiting.length, after.denied], [0, after.checked], 'once applied and deployed they deny like every other probe');
});

const P03_RPCS = ['gtl_dispatch_points_jobs', 'gtl_claim_points_jobs', 'gtl_complete_points_jobs', 'gtl_points_jobs_state'];
test('P-03 Points jobs probes: anonymous and inert, awaiting only on the exact not-found answer until the apply, then denied', async t => {
  const captured = [];
  await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => { captured.push({ url, request }); return denied(url, request); } });
  const bodies = Object.fromEntries(captured.filter(({ url }) => P03_RPCS.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`))).map(({ url, request }) => {
    assert.equal(request.headers.Authorization, undefined); return [url.split('/').at(-1), JSON.parse(request.body)];
  }));
  const missingId = '00000000-0000-0000-0000-000000000000';
  assert.deepEqual(bodies, { gtl_dispatch_points_jobs: {}, gtl_claim_points_jobs: { p_token: '0'.repeat(64), p_run: missingId },
    gtl_complete_points_jobs: { p_run: missingId, p_claim: missingId, p_reason: null, p_summary: null }, gtl_points_jobs_state: { p_season: 1999 } });
  // The tables and the worker are not probed until the apply and the deploy (no awaiting path exists for them).
  assert.equal(captured.some(({ url }) => /gtl_points_job_(schedule|runs)|gtl-points-jobs/.test(url)), false);
  const p03 = url => P03_RPCS.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`));
  const beforeApply = async (url, request) => (p03(url) ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 }) : denied(url, request));
  await t.test('before the apply: reported as awaiting, every other probe still denies', async () => {
    const result = await checkCloudBoundary({ ...options, fetchImpl: beforeApply });
    assert.deepEqual(result.awaiting.map(a => a.name).sort(), P03_RPCS.map(rpc => `anonymous ${rpc} RPC`).sort());
    assert.equal(result.denied, result.checked - 4);
  });
  await t.test('--strict fails until they deny; another 404 or a granted call fails the default check', async () => {
    await assert.rejects(() => checkCloudBoundary({ ...options, strict: true, fetchImpl: beforeApply }), /points_jobs.* RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.endsWith('/rest/v1/rpc/gtl_points_jobs_state')
      ? new Response(JSON.stringify({ code: '42883', message: 'Unavailable.' }), { status: 404 }) : denied(url, request)) }), /gtl_points_jobs_state RPC: unexpected 404/);
    await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (url.endsWith('/rest/v1/rpc/gtl_points_jobs_state')
      ? new Response(JSON.stringify({ code: 'P0001', message: 'GTL_POINTS_INVALID' }), { status: 400 }) : denied(url, request)) }), /gtl_points_jobs_state RPC: unexpected 400/);
  });
  await t.test('after the apply they deny like every other probe', async () => {
    const result = await checkCloudBoundary({ ...options, strict: true, fetchImpl: denied });
    assert.deepEqual([result.awaiting, result.denied], [[], result.checked]);
  });
});

test('only the registered rollout pieces are awaiting deploy, and every awaitingDeploy entry is a real probe', async () => {
  // Hosted and no longer awaiting: M-01 and M-09 (October 14, 2026); the D-48 recommendations writer and routes (October 15);
  // M-02, M-03, M-05, M-06 and M-08 (October 19); the referee and D-34 wind pieces (applied October 13, routes since gtl-api
  // v18 on October 14), /lines/research (v29, October 21) and /trends/week (v31, October 22), removed October 22.
  // M-10 Bets, D-53's comparison and account preferences, and the two private NBA migrations are hosted since October 22,
  // 2026, with /bets/read, /league/comparison, /me/preferences and the /nba routes deployed (RELEASE_2026_10_22_MIGRATIONS.md).
  // /fantasy/week (D-57) is deployed since gtl-api v35 (October 23, RELEASE_2026_10_23_FANTASY_TRACK1.md). Guess the Points
  // (D-56): P-01 and P-02 are hosted since October 23, 2026 and the /points/* routes ship in every gtl-api since v36
  // (RELEASE_2026_10_23_POINTS.md). Awaiting deploy: P-03's four functions (20261026120000_gtl_points_jobs.sql, written and not
  // applied) and M-12 (stage 42, written October 26): its three RPCs and two routes.
  const points = ['slot_points', 'kickoff_window', 'finalize_at', 'slate_problem', 'slot_outcomes', 'week_scores', 'revealed', 'write', 'save_draft',
    'lock_in', 'read', 'load_actuals', 'finalize', 'publish_slate'].map(name => `gtl_points_${name}`);
  const hosted = ['gtl_bets_context', 'gtl_read_bets', 'gtl_read_bets_market', 'gtl_read_score_comparison', 'gtl_read_account_preferences',
    'gtl_save_account_preferences', 'gtl_nba_read_bets', 'gtl_nba_save_bet', 'gtl_nba_claim_games', 'gtl_nba_finish_games', ...points];
  for (const rpc of hosted) assert.ok(!Object.hasOwn(awaitingDeploy, `rpc/${rpc}`), rpc);
  for (const route of ['bets/read', 'league/comparison', 'me/preferences', 'me/preferences/save', 'nba/read', 'nba/save', 'nba/games', 'fantasy/week',
    'points/read', 'points/draft', 'points/lock', 'points/slate']) assert.ok(!Object.hasOwn(awaitingDeploy, `gtl-api/${route}`), route);
  const m12 = ['gtl_bets_week_rows', 'gtl_read_bets_board', 'gtl_read_bets_season'];
  const m12Awaiting = { ...Object.fromEntries(m12.map(rpc => [`rpc/${rpc}`, 'migration 20261026233000_gtl_bets_boards.sql'])),
    'gtl-api/bets/board': 'the gtl-api deploy with /bets/board', 'gtl-api/bets/season': 'the gtl-api deploy with /bets/season' };
  // P-03 (Points jobs) and M-27 (Me › History, redesign stage 72) are merged or ready and not applied: their functions and
  // M-27's two routes are the only pieces awaiting deploy. Each apply record removes its own entries (Gate M step 8).
  // M-25 (redesign stage 69, 20261026234000_gtl_league_features.sql) is written and not applied too; its own test above checks its entries.
  const m25 = Object.fromEntries(Object.entries(awaitingDeploy).filter(([key, until]) => /20261026234000_gtl_league_features|\/league\/features/.test(until) || key.startsWith('gtl-api/league/features')));
  assert.deepEqual(Object.keys(m25).length, 7);
  const M27 = 'migration 20261026230000_gtl_me_history.sql';
  assert.deepEqual(Object.fromEntries(Object.entries(awaitingDeploy).filter(([key]) => !FEED_PIECES.includes(key) && !Object.hasOwn(m25, key))), {
    ...Object.fromEntries(P03_RPCS.map(rpc => [`rpc/${rpc}`, 'migration 20261026120000_gtl_points_jobs.sql'])),
    'rpc/gtl_me_slate': M27, 'rpc/gtl_me_results': M27, 'rpc/gtl_read_ballot_changes': M27, 'rpc/gtl_read_me_records': M27,
    'gtl-api/me/changes': 'the gtl-api deploy with /me/changes', 'gtl-api/me/records': 'the gtl-api deploy with /me/records', ...m12Awaiting,
    'rpc/gtl_export_me': 'migration 20261026231000_gtl_me_export.sql', 'gtl-api/me/export': 'the gtl-api deploy with /me/export',
  }, 'only P-03, M-27, M-28, M-12, M-25 and the league feed pieces are awaiting deploy');
  const result = await checkCloudBoundary({ ...options, fetchImpl: denied });
  assert.equal(result.awaiting.length, 0, 'every probe denies once hosted and deployed');
  // Before the applies and the deploy: each M-27 and M-28 function answers PGRST202 and each /me route "Not found."; all pass as
  // awaiting by default (each route signed out and with an invalid session) and fail under --strict.
  const m27 = async (url, request) => (/\/rest\/v1\/rpc\/gtl_(?:me_slate|me_results|read_ballot_changes|read_me_records|export_me)$/.test(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : /\/gtl-api\/me\/(?:changes|records|export)$/.test(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request));
  const before = await checkCloudBoundary({ ...options, fetchImpl: m27 });
  assert.equal(before.awaiting.length, 11, 'five RPCs and three routes, each route signed out and with an invalid session');
  await assert.rejects(() => checkCloudBoundary({ ...options, strict: true, fetchImpl: m27 }), /unexpected 404/);
  // The not-found answer may never carry a record: a History route's 404 with picks fails.
  await assert.rejects(() => checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (/\/gtl-api\/me\/changes$/.test(url)
    ? new Response(JSON.stringify({ error: 'Not found.', picks: { 'AAA-BBB': -3.5 } }), { status: 404 }) : denied(url, request)) }), /me\/changes without session: unexpected 404/);
  // Before the apply and deploy: each M-12 RPC once, each route signed out and with an invalid session.
  const beforeM12 = await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => (m12.some(rpc => url.endsWith(`/rest/v1/rpc/${rpc}`))
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 })
    : /\/gtl-api\/bets\/(board|season)$/.test(url) ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request)) });
  assert.equal(beforeM12.awaiting.length, m12.length + 2 * 2);
  assert.deepEqual(new Set(beforeM12.awaiting.map(a => a.until)), new Set(Object.values(m12Awaiting)), 'no M-12 awaitingDeploy entry is dead');
  // A missing Points function or route is now an unexpected 404, never awaiting.
  await assert.rejects(() => checkCloudBoundary({ ...options, log: () => {}, fetchImpl: async (url, request) => (/\/rest\/v1\/rpc\/gtl_points_read$/.test(url)
    ? new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function.' }), { status: 404 }) : denied(url, request)) }), /gtl_points_read RPC: unexpected 404/);
  await assert.rejects(() => checkCloudBoundary({ ...options, log: () => {}, fetchImpl: async (url, request) => (/\/gtl-api\/points\/read$/.test(url)
    ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request)) }), /points\/read without session: unexpected 404/);
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

test('weekly trends and research probes require authentication, and a missing route fails the default check', async () => {
  const captured = [];
  await checkCloudBoundary({ ...options, fetchImpl: async (url, request) => {
    if (url.endsWith('/functions/v1/gtl-api/trends/week')) captured.push(request);
    return denied(url, request);
  } });
  assert.equal(captured.length, 2);
  assert.deepEqual(captured.map(request => request.headers.Authorization), [undefined, 'Bearer invalid-test-token']);
  for (const request of captured) assert.deepEqual(JSON.parse(request.body), { season: 2026, week: 6 });
  // Deployed since gtl-api v31 (/trends/week) and v29 (/lines/research), so neither is awaiting deploy.
  for (const route of ['trends/week', 'lines/research']) {
    assert.ok(!Object.hasOwn(awaitingDeploy, `gtl-api/${route}`), route);
    const missing = async (url, request) => url.endsWith(`/functions/v1/gtl-api/${route}`)
      ? new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 }) : denied(url, request);
    await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: missing }), new RegExp(`POST ${route} without session: unexpected 404`));
  }
  await assert.rejects(checkCloudBoundary({ ...options, fetchImpl: async (url, request) =>
    url.endsWith('/functions/v1/gtl-api/trends/week')
      ? new Response(JSON.stringify({ games: [] }), { status: 200 }) : denied(url, request)
  }), /trends\/week.*unexpected 200/);
});
