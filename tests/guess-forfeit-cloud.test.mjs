import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { COMMUNITY_METHODS, handleCommunity, parseForfeit, providerCommunityError, readForfeit, withForfeit } from '../cloud/community.mjs';
import { FEATURE_OFF } from '../cloud/optional-rpc.mjs';
import { assertNoLeak, pickSecrets } from './helpers/leak-scan.mjs';

// Redesign build plan stage 19 (M-03): POST /community/forfeit ("Skip this week's Guess the Line" and "See picks now") and the
// `forfeit` field /community/read reads through the optional-RPC wrapper. The SQL side, on PGlite with the real gate, is
// tests/guess-forfeit-sql.test.mjs; this file checks the route and the field on their own: the fields the route accepts, what
// it passes to the database, the answers it lets through, the error codes mapped before the SQL can raise them, the missing-
// function answer before "apply M-03", and the GTL_FEATURE_OFF off switch. Fixture ids and values only.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VIEWER = id(1);
const NOW = '2026-10-16T01:30:00.000Z';
const user = { id: VIEWER, is_anonymous: false };
const STORED = { season: 2026, week: 7, reason: 'reveal', modes: ['guess_total'], createdAt: '2026-10-16T01:30:00+00:00' };
const READ = {
  season: 2026, week: 7, closesAt: '2026-10-20T00:15:00+00:00', open: true, forfeit: null,
  markets: [{ mode: 'guess_spread', status: 'submitted', lockedIn: 3, games: 3 }, { mode: 'guess_total', status: 'open', lockedIn: 1, games: 3 }],
};
const FEED = { viewer: VIEWER, admin: false, members: [{ id: VIEWER, displayName: 'Fixture One' }], week: { season: 2026, week: 7, deadline: '2026-10-16T00:15:00Z', games: 3 },
  optOuts: [], due: [{ mode: 'guess_spread', submitted: true, satOut: false, filled: 3, games: 3 }, { mode: 'guess_total', submitted: false, satOut: false, filled: 0, games: 3 }],
  submissions: [], standings: [], posts: [] };
const request = (app, route, body) => app(new Request(`https://app.invalid/gtl-api/${route}`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const authenticate = async () => ({ ...user, emailConfirmed: true, email: 'fixture-one@example.invalid' });

test('/community/forfeit: the player comes from sign-in, the time from the handler, and only season, week and reason reach the database', async () => {
  const calls = [];
  const service = { rpc: async (name, args) => { calls.push([name, args]); return { ...STORED, season: args.p_season, week: args.p_week, reason: args.p_reason, replayed: false }; } };
  const invoke = body => handleCommunity({ route: '/community/forfeit', body, user, service, clock: () => Date.parse(NOW) });
  assert.deepEqual(COMMUNITY_METHODS['/community/forfeit'], ['POST']);
  assert.deepEqual(await invoke({ season: 2026, week: 7, reason: 'skip' }), { season: 2026, week: 7, reason: 'skip', modes: ['guess_total'], createdAt: STORED.createdAt, replayed: false });
  await invoke({ season: 2026, week: 6, reason: 'reveal' });
  assert.deepEqual(calls, [
    ['gtl_forfeit_guess_week', { p_user: VIEWER, p_season: 2026, p_week: 7, p_reason: 'skip', p_now: NOW }],
    ['gtl_forfeit_guess_week', { p_user: VIEWER, p_season: 2026, p_week: 6, p_reason: 'reveal', p_now: NOW }],
  ]);
  calls.length = 0;
  const refused = [
    {}, { season: 2026, week: 7 }, { season: 2026, reason: 'skip' }, { week: 7, reason: 'skip' },
    { season: 2026, week: 7, reason: 'Skip' }, { season: 2026, week: 7, reason: 'sit_out' }, { season: 2026, week: 7, reason: 'see' }, { season: 2026, week: 7, reason: null }, { season: 2026, week: 7, reason: ['skip'] },
    { season: '2026', week: 7, reason: 'skip' }, { season: 2026, week: '7', reason: 'skip' }, { season: 2026, week: 7.5, reason: 'skip' }, { season: 1999, week: 7, reason: 'skip' },
    { season: 2201, week: 7, reason: 'skip' }, { season: 2026, week: 0, reason: 'skip' }, { season: 2026, week: 26, reason: 'skip' },
    // The database picks the markets and the time; the viewer is the signed-in player. None of these may be sent.
    ...['mode', 'modes', 'gameId', 'userId', 'p_user', 'viewer', 'now', 'createdAt', 'requestId'].map(field => ({ season: 2026, week: 7, reason: 'skip', [field]: field === 'modes' ? ['guess_total'] : 'guess_total' })),
  ];
  for (const body of refused) await assert.rejects(() => invoke(body), error => error.status === 400 && error.message === 'Check the post and try again.', JSON.stringify(body));
  for (const body of [null, [], 'skip']) await assert.rejects(() => invoke(body), error => error.status === 400, JSON.stringify(body));
  assert.deepEqual(calls, [], 'refused requests never reach the database');
  for (const signedOut of [null, {}, { id: 'not-a-uuid' }, { ...user, is_anonymous: true }]) {
    await assert.rejects(() => handleCommunity({ route: '/community/forfeit', body: { season: 2026, week: 7, reason: 'skip' }, user: signedOut, service }), error => error.status === 401);
  }
});

test('/community/forfeit passes only the known keys of a well-formed answer; anything else fails closed', async () => {
  const invoke = answer => handleCommunity({ route: '/community/forfeit', body: { season: 2026, week: 7, reason: 'reveal' }, user, clock: () => Date.parse(NOW), service: { rpc: async () => answer } });
  // A replay answers the stored forfeit, whose reason may differ from this request's.
  assert.deepEqual(await invoke({ ...STORED, reason: 'skip', modes: ['guess_spread', 'guess_total'], replayed: true }),
    { season: 2026, week: 7, reason: 'skip', modes: ['guess_spread', 'guess_total'], createdAt: STORED.createdAt, replayed: true });
  // Extra keys never pass (a pick, a line, another player); modes come back in mode order.
  const forged = { ...STORED, modes: ['guess_total', 'guess_spread'], replayed: false, picks: { 'SEA-DEN': 44.5 }, line: 46.5, userId: id(2), note: 'kept 44.5' };
  const passed = await invoke(forged);
  assert.deepEqual(passed, { season: 2026, week: 7, reason: 'reveal', modes: ['guess_spread', 'guess_total'], createdAt: STORED.createdAt, replayed: false });
  assertNoLeak(passed, { viewer: VIEWER, secrets: pickSecrets({ a: 44.5, b: 46.5 }, { market: 'total', owner: 'others' }) }, '/community/forfeit');
  assert.throws(() => assertNoLeak(forged, { viewer: VIEWER, secrets: pickSecrets({ a: 44.5 }, { market: 'total', owner: 'others' }) }, 'forged'), /forged/, 'not vacuous');
  for (const bad of [null, [], {}, { ...STORED }, { ...STORED, replayed: 'no' }, { ...STORED, season: 2025, replayed: false }, { ...STORED, week: 8, replayed: false },
    { ...STORED, reason: 'sit_out', replayed: false }, { ...STORED, modes: [], replayed: false }, { ...STORED, modes: ['betting_challenge'], replayed: false },
    { ...STORED, modes: ['guess_total', 'guess_total'], replayed: false }, { ...STORED, modes: 'guess_total', replayed: false }, { ...STORED, createdAt: 'yesterday', replayed: false },
    // A number is never a time here, even one Date.parse would read as a year (a pick or a line must never pass as one).
    { ...STORED, createdAt: 44.5, replayed: false }, { ...STORED, createdAt: 2026, replayed: false }]) {
    await assert.rejects(() => invoke(bad), error => !error.status && /Invalid forfeit/.test(error.message), JSON.stringify(bad));
  }
});

test('every error the SQL can raise is mapped before it can raise it; through the handler only the mapped sentence goes out', async () => {
  const mapped = {
    GTL_FORFEIT_CLOSED: [409, 'Every game that week has kicked off, so its picks and lines are already open. Nothing was changed.'],
    GTL_FORFEIT_NOTHING: [409, 'Your Spread and Total for that week are already submitted or sat out. Nothing was changed.'],
    GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
    GTL_COMMUNITY_INVALID: [400, 'Check the post and try again.'],
    GTL_FEATURE_OFF: [503, 'This feature is not available right now.'],
  };
  for (const [code, [status, message]] of Object.entries(mapped)) {
    const error = providerCommunityError(code);
    assert.deepEqual([error.status, error.message], [status, message], code);
    const app = createCloudHandler({ authenticate, community: { rpc: async () => { throw providerCommunityError(code); } } });
    const response = await request(app, 'community/forfeit', { season: 2026, week: 7, reason: 'skip' });
    assert.deepEqual([response.status, await response.json()], [status, { error: message }], code);
  }
  // Every code the migration raises is one of these.
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261015040000_gtl_guess_week_forfeit.sql', import.meta.url), 'utf8');
  const raised = [...new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map(m => m[1]))].sort();
  assert.deepEqual(raised, ['GTL_COMMUNITY_INVALID', 'GTL_COMMUNITY_MEMBER', 'GTL_FORFEIT_CLOSED', 'GTL_FORFEIT_NOTHING']);
  for (const code of raised) assert.ok(mapped[code], code);
  // An unknown answer stays the generic 503, with nothing from the provider.
  const app = createCloudHandler({ authenticate, community: { rpc: async () => { throw providerCommunityError('GTL_PRIVATE_DETAIL 44.5'); } } });
  const response = await request(app, 'community/forfeit', { season: 2026, week: 7, reason: 'skip' });
  assert.deepEqual([response.status, await response.json()], [503, { error: 'The saved data service is temporarily unavailable. Please try again.' }]);
});

test('before "apply M-03" the writer answers 503 "not available right now"; other community RPCs answer exactly as before', async () => {
  const answers = [];
  const { community } = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async () => answers.shift() });
  const missing = name => Response.json({ code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` }, { status: 404 });
  answers.push(missing('gtl_forfeit_guess_week'));
  await assert.rejects(() => community.rpc('gtl_forfeit_guess_week', {}), error => error.status === 503 && error.message === 'This feature is not available right now.');
  // M-08's reader keeps its own answer; an older community RPC that went missing stays a generic failure.
  answers.push(missing('gtl_read_guess_picks'));
  await assert.rejects(() => community.rpc('gtl_read_guess_picks', {}), error => error.status === 503);
  for (const name of ['gtl_sit_out_week', 'gtl_read_community']) {
    answers.push(missing(name));
    await assert.rejects(() => community.rpc(name, {}), error => !error.status && error.message === 'The community feed is unavailable.', name);
  }
  for (const code of ['GTL_FORFEIT_CLOSED', 'GTL_FORFEIT_NOTHING']) {
    answers.push(Response.json({ code: 'P0001', message: code }, { status: 400 }));
    await assert.rejects(() => community.rpc('gtl_forfeit_guess_week', {}), error => error.status === 409, code);
  }
  for (const answer of [Response.json({ code: 'PGRST202', message: 'detail' }, { status: 400 }), Response.json({ code: '42501', message: 'permission denied for function gtl_forfeit_guess_week' }, { status: 401 }), new Response('not json', { status: 500 })]) {
    answers.push(answer);
    await assert.rejects(() => community.rpc('gtl_forfeit_guess_week', {}), error => !error.status && error.message === 'The community feed is unavailable.');
  }
});

test('the GTL_FEATURE_OFF off switch `forfeit` stops the writer before the database; the read and every other route keep working', async () => {
  const calls = [];
  const handlerWith = featureOff => createCloudHandler({ authenticate, featureOff, clock: () => Date.parse(NOW),
    optionalRpc: async name => { calls.push(['optional', name]); return name === 'gtl_read_forfeit' ? { ...READ, open: false, forfeit: { reason: 'skip', modes: ['guess_total'], createdAt: STORED.createdAt } } : FEATURE_OFF; },
    community: { rpc: async (name, args) => { calls.push([name]); return name === 'gtl_forfeit_guess_week' ? { ...STORED, replayed: false }
      : name === 'gtl_sit_out_week' ? { season: args.p_season, week: args.p_week, mode: args.p_mode, satOut: true, replayed: false } : FEED; } } });
  for (const value of [undefined, '', 'picks', 'forfeits', 'skip', 'reveal']) {
    const response = await request(handlerWith(value), 'community/forfeit', { season: 2026, week: 7, reason: 'skip' });
    assert.equal(response.status, 200, `GTL_FEATURE_OFF=${value} leaves the forfeit on`);
  }
  for (const value of ['forfeit', ' Forfeit ', 'picks, forfeit']) {
    calls.length = 0;
    const app = handlerWith(value);
    const off = await request(app, 'community/forfeit', { season: 2026, week: 7, reason: 'reveal' });
    assert.deepEqual([off.status, await off.json()], [503, { error: 'This feature is not available right now.' }]);
    assert.deepEqual(calls, [], 'the writer is never called while off');
    const read = await request(app, 'community/read', {});
    assert.equal(read.status, 200, 'the feed stays on');
    assert.deepEqual((await read.json()).forfeit.forfeit, { reason: 'skip', modes: ['guess_total'], createdAt: STORED.createdAt }, 'a stored forfeit still reads');
    assert.equal((await request(app, 'community/sit-out', { season: 2026, week: 7, mode: 'guess_total' })).status, 200, 'the old sit-out keeps working');
  }
  // A bad body is still a 400 while off (the switch never hides a client error behind a 503).
  assert.equal((await request(handlerWith('forfeit'), 'community/forfeit', { season: 2026, week: 7, reason: 'nope' })).status, 400);
});

test('while the off switch names `forfeit`, /community/read says no forfeit is possible now (open false) and keeps the rest of the field', async () => {
  const handlerWith = featureOff => createCloudHandler({ authenticate, featureOff, clock: () => Date.parse(NOW),
    optionalRpc: async name => (name === 'gtl_read_forfeit' ? structuredClone(READ) : FEATURE_OFF), community: { rpc: async () => structuredClone(FEED) } });
  const read = async featureOff => {
    const response = await request(handlerWith(featureOff), 'community/read', {});
    assert.equal(response.status, 200, `GTL_FEATURE_OFF=${featureOff}: the feed stays on`);
    return response.json();
  };
  assert.equal(READ.open, true, 'the fixture is a week where the database says a forfeit is still possible');
  const on = await read(undefined);
  assert.deepEqual(on.forfeit, READ);
  for (const value of ['', 'picks', 'forfeits', 'lock-in', 'skip']) assert.deepEqual((await read(value)).forfeit, READ, `GTL_FEATURE_OFF=${value} leaves open as read`);
  for (const value of ['forfeit', ' Forfeit ', 'picks, forfeit']) {
    const off = await read(value);
    // The ForfeitDialog would offer a button that can only meet the writer's 503; everything else in the field is as read.
    assert.deepEqual(off.forfeit, { ...READ, open: false }, `GTL_FEATURE_OFF=${value}`);
    assert.deepEqual({ ...off, forfeit: null }, { ...on, forfeit: null }, `GTL_FEATURE_OFF=${value}: the rest of the reply is unchanged`);
  }
  // A stored forfeit reads the same either way, and withForfeit adds no field it would not add with the switch off.
  const stored = { ...READ, open: false, forfeit: { reason: 'skip', modes: ['guess_total'], createdAt: STORED.createdAt } };
  assert.deepEqual(await withForfeit(Promise.resolve(FEED), Promise.resolve(stored), { writerOff: true }), { ...FEED, forfeit: stored });
  assert.deepEqual(await withForfeit(Promise.resolve(FEED), Promise.resolve(READ), { writerOff: true }), { ...FEED, forfeit: { ...READ, open: false } });
  assert.deepEqual(await withForfeit(Promise.resolve(FEED), Promise.resolve(null), { writerOff: true }), FEED);
  assert.deepEqual(await withForfeit(Promise.resolve(FEED), Promise.resolve({ ...READ, week: 8 }), { writerOff: true }), FEED);
});

test('parseForfeit passes a well-formed read with its known keys only, and throws on anything else', () => {
  assert.deepEqual(parseForfeit(READ), READ);
  const stored = { ...READ, open: false, forfeit: { reason: 'reveal', modes: ['guess_total'], createdAt: STORED.createdAt },
    markets: [{ mode: 'guess_total', status: 'sat_out', lockedIn: 1, games: 3, picks: { 'SEA-DEN': 44.5 } }, { mode: 'guess_spread', status: 'submitted', lockedIn: 3, games: 3 }] };
  assert.deepEqual(parseForfeit({ ...stored, viewer: VIEWER, picks: { 'SEA-DEN': 44.5 }, forfeit: { ...stored.forfeit, userId: id(2), line: 46.5 } }),
    { ...stored, markets: [{ mode: 'guess_spread', status: 'submitted', lockedIn: 3, games: 3 }, { mode: 'guess_total', status: 'sat_out', lockedIn: 1, games: 3 }] }, 'only known keys, markets in mode order');
  assert.deepEqual(parseForfeit({ ...READ, closesAt: null, open: false }), { ...READ, closesAt: null, open: false });
  // `open` is never true once a forfeit exists or when nothing is left to sit out, whatever the provider said.
  assert.equal(parseForfeit({ ...stored, open: true }).open, false);
  assert.equal(parseForfeit({ ...READ, markets: [{ mode: 'guess_spread', status: 'submitted', lockedIn: 3, games: 3 }, { mode: 'guess_total', status: 'sat_out', lockedIn: 0, games: 3 }] }).open, false);
  for (const bad of [null, [], {}, { ...READ, season: '2026' }, { ...READ, week: null }, { ...READ, open: 'yes' }, { ...READ, markets: {} },
    { ...READ, markets: READ.markets.slice(1) }, { ...READ, markets: [...READ.markets, READ.markets[0]] }, { ...READ, markets: [READ.markets[0], { mode: 'guess_total', status: 'draft', lockedIn: 0, games: 3 }] },
    // lockedIn and games are counts, and no more games are locked in than the week has.
    ...[{ lockedIn: undefined }, { games: undefined }, { lockedIn: -1 }, { lockedIn: 1.5 }, { lockedIn: '1' }, { games: 65 }, { lockedIn: 4, games: 3 }, { games: null }]
      .map(change => ({ ...READ, markets: [READ.markets[0], { ...READ.markets[1], ...change }] })),
    { ...READ, closesAt: 'soon' }, { ...READ, closesAt: undefined }, { ...READ, closesAt: 44.5 }, { ...READ, closesAt: 2026 }, { ...READ, forfeit: undefined }, { ...READ, forfeit: { reason: 'skip', modes: [], createdAt: STORED.createdAt } },
    { ...READ, forfeit: { reason: 'peek', modes: ['guess_total'], createdAt: STORED.createdAt } }]) {
    assert.throws(() => parseForfeit(bad), /Invalid forfeit/, JSON.stringify(bad));
  }
});

test('/community/read carries `forfeit` only when gtl_read_forfeit answers well-formed for the week the feed shows; otherwise the reply is unchanged', async () => {
  const app = optionalRpc => {
    const calls = [];
    const handler = createCloudHandler({ authenticate, clock: () => Date.parse(NOW), community: { rpc: async (name, args) => { calls.push(['community', name, args]); return structuredClone(FEED); } },
      ...(optionalRpc ? { optionalRpc: async (name, body) => { calls.push(['optional', name, body]); return optionalRpc(name, body); } } : {}) });
    return { read: async () => { const response = await request(handler, 'community/read', {}); return { status: response.status, body: await response.json() }; }, calls };
  };
  const baseline = await app().read();
  assert.equal(baseline.status, 200);
  assert.equal(Object.hasOwn(baseline.body, 'forfeit'), false, 'no optional-RPC reader configured: no field');
  const answers = {
    missing: async () => FEATURE_OFF,
    failing: async () => { throw new Error('GTL private failure 44.5'); },
    malformed: async name => (name === 'gtl_read_forfeit' ? { ...READ, markets: [] } : FEATURE_OFF),
    'another week': async name => (name === 'gtl_read_forfeit' ? { ...READ, week: 8 } : FEATURE_OFF),
    'another season': async name => (name === 'gtl_read_forfeit' ? { ...READ, season: 2027 } : FEATURE_OFF),
  };
  for (const [label, optionalRpc] of Object.entries(answers)) {
    const { read, calls } = app(optionalRpc);
    const reply = await read();
    assert.deepEqual(reply, baseline, `${label}: exactly the reply without the field`);
    // The read goes alongside the feed, for the viewer, the newest week, and the same instant the feed was read at.
    const feedCall = calls.find(([kind, name]) => kind === 'community' && name === 'gtl_read_community');
    assert.deepEqual(calls.filter(([kind, name]) => kind === 'optional' && name === 'gtl_read_forfeit').map(([, , body]) => body),
      [{ p_user: VIEWER, p_season: null, p_week: null, p_now: feedCall[2].p_now }], label);
    assert.equal(feedCall[2].p_now, NOW);
  }
  const { read } = app(async name => (name === 'gtl_read_forfeit' ? { ...READ, viewer: VIEWER, extra: 'dropped' } : FEATURE_OFF));
  const reply = await read();
  assert.deepEqual(reply, { status: 200, body: { ...baseline.body, forfeit: READ } });
  // Not the viewer's to see without a week: no field when the feed has no published week.
  const empty = createCloudHandler({ authenticate, clock: () => Date.parse(NOW), community: { rpc: async () => ({ ...FEED, week: null, due: [] }) }, optionalRpc: async () => ({ ...READ }) });
  const noWeek = await request(empty, 'community/read', {});
  assert.equal(Object.hasOwn(await noWeek.json(), 'forfeit'), false);
  // A refused read is refused exactly as before.
  const refused = await request(createCloudHandler({ authenticate, community: { rpc: async () => FEED }, optionalRpc: async () => READ }), 'community/read', { extra: 1 });
  assert.deepEqual([refused.status, await refused.json()], [400, { error: 'Check the post and try again.' }]);
});

test('readForfeit and withForfeit never reject and never invent a field', async () => {
  assert.equal(await readForfeit(undefined, VIEWER, Date.parse(NOW)), null);
  assert.equal(await readForfeit(async () => { throw new Error('down'); }, VIEWER, Date.parse(NOW)), null);
  assert.equal(await readForfeit(async () => FEATURE_OFF, VIEWER, Date.parse(NOW)), null);
  assert.deepEqual(await readForfeit(async () => READ, VIEWER, Date.parse(NOW)), READ);
  assert.deepEqual(await withForfeit(Promise.resolve(FEED), Promise.resolve(null)), FEED);
  assert.deepEqual(await withForfeit(Promise.resolve(FEED), Promise.resolve(READ)), { ...FEED, forfeit: READ });
  await assert.rejects(() => withForfeit(Promise.reject(new Error('feed failed')), Promise.resolve(READ)), /feed failed/, 'the feed\'s own failure is the route\'s');
});

test('through the Supabase adapter: PGRST202 for gtl_read_forfeit leaves /community/read as today; once applied it carries the field', async () => {
  let applied = false;
  const requests = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async (url, options) => {
    const { pathname } = new URL(url);
    requests.push({ pathname, options });
    if (pathname === '/auth/v1/user') return Response.json({ id: VIEWER, role: 'authenticated', is_anonymous: false, email: 'fixture-one@example.invalid', email_confirmed_at: '2026-10-01T00:00:00Z' });
    if (pathname === '/rest/v1/rpc/gtl_read_community') return Response.json(FEED);
    if (pathname === '/rest/v1/rpc/gtl_read_forfeit' && applied) return Response.json(READ);
    return Response.json({ code: 'PGRST202', message: `Could not find the function public.${pathname.split('/').pop()} in the schema cache` }, { status: 404 });
  } });
  const handler = createCloudHandler({ ...adapter, clock: () => Date.parse(NOW) });
  const read = async () => { const response = await request(handler, 'community/read', {}); return { status: response.status, body: await response.json() }; };
  const before = await read();
  assert.equal(before.status, 200);
  assert.equal(Object.hasOwn(before.body, 'forfeit'), false);
  assert.doesNotMatch(JSON.stringify(before.body), /schema cache|server-test-secret/);
  const call = requests.find(({ pathname }) => pathname === '/rest/v1/rpc/gtl_read_forfeit');
  assert.deepEqual(JSON.parse(call.options.body), { p_user: VIEWER, p_season: null, p_week: null, p_now: NOW });
  assert.equal(call.options.headers.Authorization, 'Bearer server-test-secret', 'service role only; the function is granted to service_role');
  applied = true;
  assert.deepEqual((await read()).body.forfeit, READ);
});

test('the browser wrapper knows the route; it never names a service-only RPC', () => {
  const api = fs.readFileSync(new URL('../web/src/api.js', import.meta.url), 'utf8');
  assert.match(api, /\['read', 'history', 'like', 'comment', 'member', 'publish-preview', 'publish', 'interest', 'sit-out', 'week-open', 'picks', 'forfeit'\]\.includes\(action\)/);
  assert.doesNotMatch(api, /gtl_forfeit_guess_week|gtl_read_forfeit|gtl_forfeit_markets/);
});
