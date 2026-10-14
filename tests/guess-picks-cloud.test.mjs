import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { COMMUNITY_METHODS, handleCommunity, providerCommunityError } from '../cloud/community.mjs';
import { assertNoLeak, pickSecrets } from './helpers/leak-scan.mjs';

// Redesign build plan stage 26 (M-08): POST /community/picks, everyone's Guess picks for a week and market, game by game. The
// SQL side, with the real gate on PGlite, is tests/guess-picks-sql.test.mjs; this file checks the route on its own: the fields
// it accepts, what it passes to the database, the second gate it applies to whatever comes back, the missing-function answer
// before "apply M-08" and the GTL_FEATURE_OFF off switch. Fixture ids and values only.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VIEWER = id(1), OTHER = id(2), THIRD = id(3);
const NOW = '2026-10-18T17:30:00.000Z';
const user = { id: VIEWER, is_anonymous: false };
const ROW = { removed: false, status: 'not_yet', lockedIn: false, late: null, eligible: null, hidden: false, pick: null, error: null, points: null, rank: null, tied: false, closest: false };

/** A well-formed reader answer: one game kicked off (open to all), one still hidden from the viewer. */
function reply() {
  return {
    viewer: VIEWER, season: 2026, week: 7, mode: 'guess_total', now: '2026-10-18T17:30:00+00:00', deadline: '2026-10-16T00:15:00+00:00',
    games: [
      { gameId: 'SEA-DEN', kickoff: '2026-10-18T17:00:00+00:00', started: true, open: true, rows: [
        { ...ROW, userId: OTHER, status: 'in', lockedIn: true, eligible: true, pick: 44.5, error: 2, points: 6, rank: 1, closest: true },
        { ...ROW, userId: VIEWER, status: 'late', lockedIn: true, eligible: true, late: { deadline: '2026-10-16T00:15:00Z', minutes: 12 }, pick: 38.5, error: 4, points: 2, rank: 2 },
        { ...ROW, userId: THIRD, status: 'sat_out' },
      ] },
      { gameId: 'KC-LV', kickoff: '2026-10-18T20:25:00+00:00', started: false, open: false, rows: [
        { ...ROW, userId: VIEWER, pick: 47.5 },
        { ...ROW, userId: OTHER, status: 'in', lockedIn: true, eligible: true, hidden: true },
        { ...ROW, userId: THIRD, status: 'sat_out' },
      ] },
    ],
  };
}

test('/community/picks: the viewer comes from sign-in, the clock is the handler\'s, and only the documented fields reach the database', async () => {
  const calls = [];
  const service = { rpc: async (name, args) => { calls.push([name, args]); return reply(); } };
  const invoke = body => handleCommunity({ route: '/community/picks', body, user, service, clock: () => Date.parse(NOW) });
  assert.deepEqual(COMMUNITY_METHODS['/community/picks'], ['POST']);
  await invoke({ mode: 'guess_total' });
  await invoke({ season: 2026, week: 7, mode: 'guess_spread', gameId: 'SEA-DEN', userId: OTHER });
  await invoke({ mode: 'guess_total', userId: VIEWER.toUpperCase() });
  assert.deepEqual(calls, [
    ['gtl_read_guess_picks', { p_user: VIEWER, p_season: null, p_week: null, p_mode: 'guess_total', p_game: null, p_target: null, p_now: NOW }],
    ['gtl_read_guess_picks', { p_user: VIEWER, p_season: 2026, p_week: 7, p_mode: 'guess_spread', p_game: 'SEA-DEN', p_target: OTHER, p_now: NOW }],
    ['gtl_read_guess_picks', { p_user: VIEWER, p_season: null, p_week: null, p_mode: 'guess_total', p_game: null, p_target: VIEWER.toUpperCase(), p_now: NOW }],
  ]);
  calls.length = 0;
  const refused = [
    {}, { mode: 'betting_challenge' }, { mode: 'spread' }, { mode: ['guess_total'] },
    { mode: 'guess_total', season: 2026 }, { mode: 'guess_total', week: 7 }, { mode: 'guess_total', season: '2026', week: 7 }, { mode: 'guess_total', season: 2026, week: 26 },
    { mode: 'guess_total', season: 1999, week: 7 }, { mode: 'guess_total', season: 2026, week: 0 }, { mode: 'guess_total', season: 2026, week: 7.5 },
    { mode: 'guess_total', gameId: 'sea-den' }, { mode: 'guess_total', gameId: 'SEA_DEN' }, { mode: 'guess_total', gameId: null }, { mode: 'guess_total', gameId: 7 },
    { mode: 'guess_total', userId: 'not-a-uuid' }, { mode: 'guess_total', userId: null }, { mode: 'guess_total', userId: 1 },
    ...['viewer', 'p_user', 'user', 'now', 'target', 'game', 'market'].map(field => ({ mode: 'guess_total', [field]: OTHER })),
  ];
  for (const body of refused) await assert.rejects(() => invoke(body), error => error.status === 400 && error.message === 'Check the post and try again.', JSON.stringify(body));
  await assert.rejects(() => invoke(null), error => error.status === 400);
  await assert.rejects(() => invoke([]), error => error.status === 400);
  assert.deepEqual(calls, [], 'refused requests never reach the database');
  for (const signedOut of [null, {}, { id: 'not-a-uuid' }, { ...user, is_anonymous: true }]) {
    await assert.rejects(() => handleCommunity({ route: '/community/picks', body: { mode: 'guess_total' }, user: signedOut, service }), error => error.status === 401);
  }
});

test('/community/picks passes a well-formed answer through unchanged, keyed as the reader keys it', async () => {
  const service = { rpc: async () => reply() };
  const result = await handleCommunity({ route: '/community/picks', body: { mode: 'guess_total' }, user, service, clock: () => Date.parse(NOW) });
  assert.deepEqual(result, reply());
});

test('the second gate: another member\'s number passes only when locked in and open, scores only from kickoff; the viewer\'s own always', async () => {
  const forged = reply();
  const [kicked, later] = forged.games;
  // What a wrong provider could send: a hidden pick, a pick on a game closed to the viewer, a draft's value and its ballot
  // details, scores before kickoff, unknown statuses, ids and keys, and a line.
  kicked.rows.push({ ...ROW, userId: id(4), status: 'not_yet', pick: 51.5, eligible: false, late: { minutes: 3 }, error: 1, points: 8, rank: 1, tied: true, closest: true });
  kicked.rows.push({ ...ROW, userId: id(5), status: 'in', lockedIn: true, hidden: true, pick: 53.5, error: 3, points: 4, rank: 3 });
  kicked.rows.push({ ...ROW, userId: id(6), status: 'peeked', pick: 55.5 }, { ...ROW, userId: 'sean', status: 'in', pick: 57.5 }, null, 'row');
  kicked.rows[0].reference = { value: 46.5 };
  kicked.rows[0].line = 46.5;
  later.rows[1] = { ...later.rows[1], hidden: false, pick: 59.5, error: 1, points: 8, rank: 1, closest: true };
  later.rows[0] = { ...later.rows[0], error: 1, points: 8, rank: 1, tied: true, closest: true };
  later.rows.push({ ...ROW, userId: id(7), status: 'late', lockedIn: true, late: { deadline: '2026-10-16T00:15:00Z', minutes: 30, note: 'never shown', userId: VIEWER }, pick: 61.5 });
  forged.games.push({ gameId: 'not a game', started: true, open: true, rows: [{ ...ROW, userId: OTHER, status: 'in', pick: 63.5 }] }, null);
  forged.lines = { 'SEA-DEN': 46.5 };
  const service = { rpc: async () => forged };
  const result = await handleCommunity({ route: '/community/picks', body: { mode: 'guess_total' }, user, service, clock: () => Date.parse(NOW) });

  assert.deepEqual(Object.keys(result).sort(), ['deadline', 'games', 'mode', 'now', 'season', 'viewer', 'week']);
  assert.deepEqual(result.games.map(g => g.gameId), ['SEA-DEN', 'KC-LV']);
  const [a, b] = result.games;
  assert.deepEqual(a.rows.map(r => r.userId), [OTHER, VIEWER, THIRD, id(4), id(5)], 'rows with an unknown status or a bad id are dropped');
  assert.deepEqual(a.rows[0], reply().games[0].rows[0], 'no extra key (a line, a reference) passes');
  assert.deepEqual(a.rows[3], { ...ROW, userId: id(4) }, 'a member without a locked-in guess carries no number, ballot detail or place');
  assert.deepEqual(a.rows[4], { ...ROW, userId: id(5), status: 'in', lockedIn: true, eligible: true, hidden: true }, 'a hidden guess carries no number');
  assert.deepEqual(b.rows[0], { ...ROW, userId: VIEWER, pick: 47.5 }, 'the viewer\'s own draft passes; no score before kickoff');
  assert.deepEqual(b.rows[1], { ...ROW, userId: OTHER, status: 'in', lockedIn: true, eligible: true, hidden: true }, 'a game closed to the viewer keeps every guess hidden');
  assert.deepEqual(b.rows[2], { ...ROW, userId: THIRD, status: 'sat_out' });
  assert.deepEqual(b.rows[3], { ...ROW, userId: id(7), status: 'late', lockedIn: true, eligible: true, hidden: true, late: { deadline: '2026-10-16T00:15:00Z', minutes: 30 } },
    'the Late marker keeps { deadline, minutes } only');
  const secrets = pickSecrets({ d: 51.5, e: 53.5, f: 55.5, g: 57.5, h: 59.5, i: 61.5, j: 63.5, line: 46.5 }, { market: 'total', owner: 'others' });
  assertNoLeak(result, { viewer: VIEWER, secrets }, '/community/picks');
  // Not vacuous: the forged answer itself carries them.
  assert.throws(() => assertNoLeak(forged, { viewer: VIEWER, secrets }, 'forged'), /forged/);
  // A reply that is not the reader's shape fails closed.
  for (const bad of [null, [], {}, { games: {} }]) {
    await assert.rejects(() => handleCommunity({ route: '/community/picks', body: { mode: 'guess_total' }, user, service: { rpc: async () => bad }, clock: () => Date.parse(NOW) }), /Invalid picks/);
  }
});

test('before "apply M-08" the route answers 503 "not available right now"; other community RPCs answer exactly as before', async () => {
  const off = providerCommunityError('GTL_FEATURE_OFF');
  assert.deepEqual([off.status, off.message], [503, 'This feature is not available right now.']);
  for (const code of ['GTL_COMMUNITY_MEMBER', 'GTL_COMMUNITY_INVALID']) assert.ok(providerCommunityError(code).status, `${code} is mapped before the SQL can raise it`);
  const answers = [];
  const { community } = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async () => answers.shift() });
  const missing = () => Response.json({ code: 'PGRST202', message: 'Could not find the function public.gtl_read_guess_picks in the schema cache' }, { status: 404 });
  answers.push(missing());
  await assert.rejects(() => community.rpc('gtl_read_guess_picks', {}), error => error.status === 503 && error.message === 'This feature is not available right now.');
  // Only the new reader reads a missing function as off; an older community RPC that went missing stays a generic failure.
  answers.push(missing());
  await assert.rejects(() => community.rpc('gtl_read_community', {}), error => !error.status && error.message === 'The community feed is unavailable.');
  answers.push(Response.json({ code: 'P0001', message: 'GTL_COMMUNITY_MEMBER' }, { status: 400 }));
  await assert.rejects(() => community.rpc('gtl_read_guess_picks', {}), error => error.status === 403);
  for (const answer of [Response.json({ code: 'PGRST202', message: 'detail' }, { status: 400 }), Response.json({ code: '42501', message: 'permission denied for function gtl_read_guess_picks' }, { status: 401 }), new Response('not json', { status: 500 })]) {
    answers.push(answer);
    await assert.rejects(() => community.rpc('gtl_read_guess_picks', {}), error => !error.status && error.message === 'The community feed is unavailable.');
  }
  // Through the handler, the 503 carries the mapped sentence and nothing from the provider.
  const app = createCloudHandler({ authenticate: async () => ({ ...user, emailConfirmed: true, email: 'luke@example.invalid' }), community: { rpc: async () => { throw providerCommunityError('GTL_FEATURE_OFF'); } } });
  const response = await app(new Request('https://app.invalid/gtl-api/community/picks', { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'guess_total' }) }));
  assert.deepEqual([response.status, await response.json()], [503, { error: 'This feature is not available right now.' }]);
});

test('the GTL_FEATURE_OFF off switch `picks` stops /community/picks before the database; every other community route keeps working', async () => {
  const calls = [];
  const handlerWith = featureOff => createCloudHandler({ authenticate: async () => ({ ...user, emailConfirmed: true, email: 'luke@example.invalid' }), featureOff,
    community: { rpc: async (name, args) => { calls.push(name); return name === 'gtl_read_guess_picks' ? reply() : { viewer: VIEWER, members: [], posts: [], due: [], submissions: [] }; } } });
  const request = (app, route, body) => app(new Request(`https://app.invalid/gtl-api/${route}`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  for (const value of [undefined, '', 'notes', 'pick', 'other,features']) {
    const response = await request(handlerWith(value), 'community/picks', { mode: 'guess_total' });
    assert.equal(response.status, 200, `GTL_FEATURE_OFF=${value} leaves everyone's picks on`);
  }
  for (const value of ['picks', ' Picks ', 'notes, picks']) {
    calls.length = 0;
    const app = handlerWith(value);
    const off = await request(app, 'community/picks', { mode: 'guess_total' });
    assert.deepEqual([off.status, await off.json()], [503, { error: 'This feature is not available right now.' }]);
    assert.deepEqual(calls, [], 'the reader is never called while off');
    assert.equal((await request(app, 'community/read', {})).status, 200, 'the feed stays on');
    assert.deepEqual(calls, ['gtl_read_community']);
  }
  // A bad body is still a 400 while off (the switch never hides a client error behind a 503).
  assert.equal((await request(handlerWith('picks'), 'community/picks', { mode: 'nope' })).status, 400);
});

test('the browser wrapper knows the route; no static asset carries a reader answer', () => {
  const api = fs.readFileSync(new URL('../web/src/api.js', import.meta.url), 'utf8');
  assert.match(api, /\['read', 'history', 'like', 'comment', 'member', 'publish-preview', 'publish', 'interest', 'sit-out', 'week-open', 'picks'\]\.includes\(action\)/);
  assert.doesNotMatch(api, /gtl_read_guess_picks/, 'the browser never names the service-only RPC');
});
