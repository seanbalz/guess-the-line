import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createEngine } from '../server/engine.mjs';
import { seed } from '../server/store.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { emptySocialState } from '../shared/social-bets.mjs';

const NOW = Date.parse('2026-10-08T16:00:00Z');
const USERS = { sean: '00000000-0000-4000-8000-000000000001', troy: '00000000-0000-4000-8000-000000000002', luke: '00000000-0000-4000-8000-000000000003' };
const URL_BASE = 'https://test.invalid/functions/v1/gtl-api';
const bet = { gameId: 'TB-DAL', market: 'spread', side: 'home', line: -3, odds: -110, source: 'Test fixture, not current odds', quotedAt: '2026-10-08T15:59:00Z' };
const fill = (state, value) => Object.fromEntries(state.games.map(game => [game.id, value]));

function setup({ clock = () => NOW, initial = seed(), memberOverride, authenticateOverride, casOverride, loadOverride } = {}) {
  let saved = { state: structuredClone(initial), revision: 0 }, serial = 0;
  const calls = { auth: 0, member: 0, load: 0, cas: 0 };
  const handler = createCloudHandler({ clock, uuid: () => `audit-${++serial}`,
    social: { rpc: async () => ({ season: initial.league.season, week: initial.league.week, profiles: [], following: [],
      availableWeeks: [{ season: initial.league.season, week: initial.league.week }], weeks: [{ season: initial.league.season, week: initial.league.week, games: initial.games, revision: 0, state: emptySocialState() }] }) },
    // This identity/revision suite assumes a successful trusted source check.
    // Actual stale-source failure and SQL atomicity have dedicated suites.
    odds: { rpc: async name => { assert.equal(name, 'gtl_preflight_submission'); return { requiresReferences: true, ready: true }; } },
    async authenticate(token) {
      calls.auth++;
      if (authenticateOverride) return authenticateOverride(token);
      return USERS[token] ? { id: USERS[token], is_anonymous: false, email: `${token}@example.invalid`, emailConfirmed: true, user_metadata: { player_id: 'sean' } } : null;
    },
    weekly: {
      async load(userId, leagueId) {
        calls.load++; assert.equal(leagueId, 'sean-troy-luke');
        return loadOverride ? loadOverride() : { ...structuredClone(saved), leagueRevision: 0 };
      },
      async saveBallot(userId, leagueId, mode, revision, picks, submit) {
        calls.cas++;
        if (casOverride) return casOverride(revision, saved.state);
        if (revision !== saved.revision) return null;
        const engine = createEngine(saved.state, { clock, uuid: () => `audit-${++serial}` });
        engine.saveBallot(Object.keys(USERS).find(key => USERS[key] === userId), mode, picks, submit);
        saved = { state: engine.snapshot(), revision: revision + 1 };
        return saved.revision;
      },
      async saveSelection(userId, leagueId, revision, selection) {
        calls.cas++;
        if (casOverride) return casOverride(revision, saved.state);
        if (revision !== saved.revision) return null;
        const engine = createEngine(saved.state, { clock, uuid: () => `audit-${++serial}` });
        engine.saveBet(Object.keys(USERS).find(key => USERS[key] === userId), selection);
        saved = { state: engine.snapshot(), revision: revision + 1 };
        return saved.revision;
      },
    },
    storage: {
      async membership(userId, leagueId) {
        calls.member++;
        assert.equal(leagueId, 'sean-troy-luke');
        if (memberOverride) return memberOverride(userId);
        return { player_id: Object.keys(USERS).find(key => USERS[key] === userId), active: true, role: 'player' };
      },
      async load(leagueId) { calls.load++; assert.equal(leagueId, 'sean-troy-luke'); return loadOverride ? loadOverride() : structuredClone(saved); },
      async compareAndSwap(leagueId, revision, state) {
        calls.cas++; assert.equal(leagueId, 'sean-troy-luke');
        if (casOverride) return casOverride(revision, state);
        if (revision !== saved.revision) return null;
        saved = { state: structuredClone(state), revision: revision + 1 };
        return { revision: saved.revision };
      },
    },
  });
  async function request(path = '/state', { token = 'troy', method = 'GET', body, headers = {}, raw } = {}) {
    const response = await handler(new Request(URL_BASE + path, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    }));
    return { response, data: response.status === 204 ? null : await response.json() };
  }
  return { handler, request, calls, saved: () => structuredClone(saved) };
}

test('cloud requires verified nonanonymous identity before any private storage read', async () => {
  for (const token of [null, 'invalid-jwt']) {
    const app = setup();
    assert.equal((await app.request('/state', { token })).response.status, 401);
    assert.equal(app.calls.member, 0); assert.equal(app.calls.load, 0); assert.equal(app.calls.cas, 0);
  }
  for (const identity of [{ id: USERS.sean, is_anonymous: true }, { id: 'not-a-user-id' }, null]) {
    const app = setup({ authenticateOverride: () => identity });
    assert.equal((await app.request()).response.status, 401);
    assert.equal(app.calls.member, 0); assert.equal(app.calls.load, 0);
  }
});

test('cloud denies nonmembers and disabled memberships before league reads', async () => {
  for (const membership of [null, { active: false, player_id: 'sean' }, { active: true }]) {
    const app = setup({ memberOverride: () => membership });
    assert.equal((await app.request()).response.status, 403);
    assert.equal(app.calls.load, 0); assert.equal(app.calls.cas, 0);
  }
  const badRoster = setup({ memberOverride: () => ({ active: true, player_id: 'intruder' }) });
  assert.equal((await badRoster.request()).response.status, 403);
});

test('unconfirmed mapped accounts cannot read or mutate game data', async () => {
  const app = setup({ authenticateOverride: () => ({ id: USERS.sean, email: 'sean@example.invalid', emailConfirmed: false }) });
  for (const path of ['/state', '/export']) assert.equal((await app.request(path)).response.status, 403);
  assert.equal((await app.request('/ballot', { method: 'POST', body: { revision: 0, picks: {} } })).response.status, 403);
  assert.equal((await app.request('/bet', { method: 'POST', body: { ...bet, revision: 0 } })).response.status, 403);
  assert.equal(app.calls.member, 0); assert.equal(app.calls.load, 0); assert.equal(app.calls.cas, 0);
});

test('cloud rejects player, league, duplicate mode, and body identity overrides', async () => {
  const app = setup();
  for (const path of ['/state?player=sean', '/state?playerId=sean', '/state?league=other', '/export?player=sean', '/state?mode=guess_total&mode=guess_spread']) {
    assert.equal((await app.request(path)).response.status, 400);
  }
  for (const field of ['player', 'playerId', 'user_id', 'leagueId', '__proto__']) {
    const raw = `{"revision":0,"picks":{},"${field}":"sean"}`;
    assert.equal((await app.request('/ballot?mode=guess_total', { method: 'POST', raw })).response.status, 400);
  }
  assert.equal(app.calls.load, 0); assert.equal(app.calls.cas, 0);
});

test('cloud derives identity from membership and hides each unsubmitted mode', async () => {
  const app = setup();
  for (const mode of ['guess_spread', 'guess_total', 'betting_challenge']) {
    const { response, data } = await app.request(`/state?mode=${mode}`);
    assert.equal(response.status, 200); assert.equal(data.playerId, 'troy');
    assert.equal(data.localOnly, false); assert.equal(data.revision, 0);
    assert.equal(data.snapshot, null); assert.equal(data.score, null); assert.deepEqual(data.history, []);
    assert(data.games.every(game => game.market === null && game.previousMarket === null && game.points === null && game.opponents.length === 0));
    assert(data.standings.every(player => player.points === null));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const totals = await app.request('/state?mode=guess_total', { token: 'sean' });
  assert.equal(totals.data.revealed, false); assert.equal(totals.data.score, null);
  assert(totals.data.games.every(game => game.market === null && game.opponents.length === 0));
});

test('cloud export returns only the signed-in player data', async () => {
  const app = setup();
  const own = await app.request('/export', { token: 'sean' });
  assert.equal(own.data.ballots.guess_spread.picks['TB-DAL'], -9.5);
  const other = await app.request('/export');
  assert.deepEqual(other.data.ballots, {}); assert.deepEqual(other.data.bets, {}); assert.deepEqual(other.data.audit, []);
  assert.equal(other.data.revision, 0); assert.equal(other.data.localOnly, false);
  assert.equal(JSON.stringify(other.data).includes('-9.5'), false);
});

test('cloud saves a total independently, then rejects the stale device revision', async () => {
  const app = setup();
  const before = app.saved();
  const { response, data } = await app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks: { 'TB-DAL': 44.5 } } });
  assert.equal(response.status, 200); assert.equal(data.revision, 1); assert.equal(data.revealed, false);
  assert.equal(data.games[0].prediction, 44.5); assert.equal(data.games[0].market, null);
  const stale = await app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks: { 'TB-DAL': 46 } } });
  assert.equal(stale.response.status, 409); assert.equal(app.calls.cas, 1);
  assert.equal(app.saved().state.ballots.troy.guess_total.picks['TB-DAL'], 44.5);
  assert.deepEqual(app.saved().state.ballots.sean, before.state.ballots.sean);
  assert.deepEqual(app.saved().state.history, before.state.history);
});

test('cloud concurrently saving devices cannot silently overwrite one another', async () => {
  const app = setup();
  const results = await Promise.all([44.5, 46].map(value => app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks: { 'TB-DAL': value } } })));
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 409]);
  assert.equal(app.saved().revision, 1); assert.equal(app.saved().state.audit.length, 1);
  const winner = results.find(result => result.response.status === 200);
  assert.equal(app.saved().state.ballots.troy.guess_total.picks['TB-DAL'], winner.data.games[0].prediction);
});

test('cloud invalid and incomplete ballots fail without persisting or revealing', async () => {
  const app = setup(); const before = app.saved();
  for (const body of [
    { revision: 0, picks: { 'TB-DAL': 44.5 }, submit: true },
    { revision: 0, picks: { 'TB-DAL': 44.5, 'PHI-JAX': -1 } },
    { revision: 0, picks: { 'TB-DAL': 44.2 } },
    { revision: 0, picks: { unknown: 44 } },
    { revision: 0, picks: {}, submit: 'true' },
    { picks: {} }, { revision: -1, picks: {} }, { revision: '0', picks: {} },
  ]) assert.equal((await app.request('/ballot?mode=guess_total', { method: 'POST', body })).response.status, 400);
  assert.equal(app.calls.cas, 0); assert.deepEqual(app.saved(), before);
});

test('cloud returns safe validation errors for malformed markets, quotes, and prediction values', async () => {
  const app = setup();
  for (const patch of [
    { market: 'moneyline' }, { side: 'over' }, { line: 101 }, { line: '3' },
    { odds: -99 }, { source: '' }, { quotedAt: '2026-10-08T16:01:00Z' },
    { gameId: 'unknown' },
  ]) {
    const result = await app.request('/bet', { token: 'sean', method: 'POST', body: { ...bet, ...patch, revision: 0 } });
    assert.equal(result.response.status, 400, JSON.stringify(patch));
    assert.equal(result.data.error.includes('temporarily unavailable'), false);
  }
  for (const [mode, value] of [['guess_spread', 101], ['guess_total', 201], ['guess_total', null]]) {
    const result = await app.request(`/ballot?mode=${mode}`, { method: 'POST', body: { revision: 0, picks: { 'TB-DAL': value } } });
    assert.equal(result.response.status, 400);
  }
  assert.equal((await app.request('/ballot?mode=betting_challenge', { method: 'POST', body: { revision: 0, picks: {} } })).response.status, 400);
  assert.equal(app.calls.cas, 0);
});

test('cloud full total submission reveals no spread market and retains separate standings', async () => {
  const app = setup();
  const result = await app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks: fill(app.saved().state, 44.5), submit: true } });
  assert.equal(result.response.status, 200); assert.equal(result.data.revealed, true); assert.equal(result.data.score, null);
  const spread = await app.request('/state');
  assert.equal(spread.data.revealed, false); assert.equal(spread.data.snapshot, null); assert.equal(spread.data.score, null);
});

test('cloud allows audited submitted edits before deadline independently for both modes', async () => {
  for (const practice of [false, true]) for (const mode of ['guess_spread', 'guess_total']) {
    const initial = seed(); initial.league.practice = practice;
    const app = setup({ initial }), picks = fill(initial, mode === 'guess_total' ? 44.5 : -3);
    const submitted = await app.request(`/ballot?mode=${mode}`, { method: 'POST', body: { revision: 0, picks, submit: true } });
    assert.equal(submitted.response.status, 200); assert.equal(submitted.data.locked, false);
    assert.equal(submitted.data.lockReason, null); assert.equal(submitted.data.revealed, true);
    const edited = await app.request(`/ballot?mode=${mode}`, { method: 'POST', body: { revision: 1, picks: { ...picks, 'TB-DAL': 1 } } });
    assert.equal(edited.response.status, 200); assert.equal(edited.data.revealed, true);
    assert.equal(edited.data.submittedAt, submitted.data.submittedAt);
    assert.equal(edited.data.scoringPolicy, 'submission-time'); assert.equal(edited.data.score, null);
    const before = app.saved();
    const incomplete = await app.request(`/ballot?mode=${mode}`, { method: 'POST', body: { revision: 2, picks: {} } });
    assert.equal(incomplete.response.status, 400); assert.match(incomplete.data.error, /Complete all/);
    assert.deepEqual(app.saved(), before);
    const otherMode = mode === 'guess_spread' ? 'guess_total' : 'guess_spread';
    const independent = await app.request(`/ballot?mode=${otherMode}`, { method: 'POST', body: { revision: 2, picks: { 'TB-DAL': 0 } } });
    assert.equal(independent.response.status, 200); assert.equal(independent.data.locked, false); assert.equal(independent.data.revealed, false);
  }
});

test('a draft racing submission cannot erase a submitted ballot even after refreshing revision', async () => {
  const app = setup(), picks = fill(app.saved().state, 44.5);
  const results = await Promise.all([
    app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks, submit: true } }),
    app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks: { 'TB-DAL': 40 } } }),
  ]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 409]);
  // The authoritative source check can let the draft win this first race.
  // Retry the full submission against that revision before checking that a
  // subsequently refreshed partial draft cannot erase a submitted ballot.
  if (results[0].response.status === 409) {
    const submitted = await app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: app.saved().revision, picks, submit: true } });
    assert.equal(submitted.response.status, 200);
  }
  const before = app.saved();
  const refreshed = await app.request('/state?mode=guess_total');
  assert.equal(refreshed.data.lockReason, null);
  const retry = await app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: refreshed.data.revision, picks: { 'TB-DAL': 40 } } });
  assert.equal(retry.response.status, 400); assert.match(retry.data.error, /Complete all/);
  assert.deepEqual(app.saved(), before); assert.equal(before.state.audit.length, before.revision);
});

test('cloud enforces deadline at the exact instant and preserves saved predictions', async () => {
  const app = setup({ clock: () => Date.parse('2026-10-09T00:15:00Z') }); const before = app.saved();
  const result = await app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks: {} } });
  assert.equal(result.response.status, 400); assert.match(result.data.error, /deadline/);
  assert.equal(app.calls.cas, 0); assert.deepEqual(app.saved(), before);
  assert.equal((await app.request('/state')).data.locked, true);
});

test('cloud keeps bet quotes immutable and never changes source prediction files', async () => {
  const files = ['data/picks/2026-week-05.json', ...fs.readdirSync('data/snapshots').filter(file => file.endsWith('.json') && file !== 'latest.json').map(file => `data/snapshots/${file}`)];
  const hash = () => files.map(file => createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  const originalHashes = hash(), app = setup(), originalState = app.saved();
  const saved = await app.request('/bet', { token: 'sean', method: 'POST', body: { ...bet, revision: 0 } });
  assert.equal(saved.response.status, 200); assert.equal(saved.data.games[0].bet.line, -3);
  const duplicate = await app.request('/bet', { token: 'sean', method: 'POST', body: { ...bet, revision: 1, line: -4 } });
  assert.equal(duplicate.response.status, 400); assert.match(duplicate.data.error, /immutable/);
  const denied = await app.request('/bet', { method: 'POST', body: { ...bet, revision: 1 } });
  assert.equal(denied.response.status, 400); assert.match(denied.data.error, /ballot/);
  assert.equal(app.saved().revision, 1); assert.equal(app.saved().state.bets.sean['TB-DAL'].line, -3);
  assert.deepEqual(app.saved().state.ballots, originalState.state.ballots); assert.deepEqual(hash(), originalHashes);
});

test('cloud refuses selections at scheduled game kickoff even with a valid earlier quote', async () => {
  const app = setup({ clock: () => Date.parse('2026-10-09T00:15:00Z') });
  const result = await app.request('/bet', { token: 'sean', method: 'POST', body: { ...bet, quotedAt: '2026-10-09T00:14:00Z', revision: 0 } });
  assert.equal(result.response.status, 400); assert.match(result.data.error, /closed after scheduled kickoff/);
  assert.equal(app.calls.cas, 0); assert.deepEqual(app.saved().state.bets, {});
});

test('cloud returns no provider URLs, secrets, or state in unexpected failures', async () => {
  const secret = 'https://private-provider.invalid/?service_role=SECRET&private_pick=-9.5';
  for (const options of [
    { authenticateOverride: () => { throw new Error(secret); } },
    { memberOverride: () => { throw new Error(secret); } },
    { loadOverride: () => { throw new Error(secret); } },
    { casOverride: () => { throw new Error(secret); } },
  ]) {
    const app = setup(options);
    const result = await app.request('/ballot?mode=guess_total', { method: 'POST', body: { revision: 0, picks: {} } });
    assert.equal(result.response.status, 503); assert.deepEqual(result.data, { error: 'The saved data service is temporarily unavailable. Please try again.' });
  }
});

test('cloud limits routes, methods, request fields, and actual JSON bytes', async () => {
  const app = setup();
  for (const path of ['/data/picks/2026-week-05.json', '/unknown', '/state/']) assert.equal((await app.request(path)).response.status, 404);
  assert.equal((await app.request('/state', { method: 'POST' })).response.status, 405);
  assert.equal((await app.request('/ballot')).response.status, 405);
  assert.equal((await app.request('/state?mode=unknown')).response.status, 400);
  for (const raw of ['[1]', 'null', '{broken']) assert.equal((await app.request('/ballot', { method: 'POST', raw })).response.status, 400);
  assert.equal((await app.request('/ballot', { method: 'POST', raw: '{}', headers: { 'Content-Type': 'text/plain' } })).response.status, 415);
  assert.equal((await app.request('/ballot', { method: 'POST', raw: JSON.stringify({ padding: 'x'.repeat(32769) }) })).response.status, 413);
  assert.equal(app.calls.cas, 0);
});

test('CORS preflight exposes no data and cannot bypass bearer authentication', async () => {
  const app = setup();
  const preflight = await app.request('/state', { method: 'OPTIONS', token: null, headers: { Origin: 'https://frontend.invalid', 'Access-Control-Request-Headers': 'authorization,apikey' } });
  assert.equal(preflight.response.status, 204); assert.equal(preflight.response.headers.get('access-control-allow-origin'), '*');
  assert.equal(preflight.response.headers.has('access-control-allow-credentials'), false);
  // Browsers may reuse a preflight for two hours (Chromium's cap), so each read is one round trip, not two.
  assert.equal(preflight.response.headers.get('access-control-max-age'), '7200');
  assert.equal(app.calls.auth, 0); assert.equal(app.calls.load, 0);
  assert.equal((await app.request('/state', { token: null, headers: { Origin: 'https://frontend.invalid', Cookie: 'player=sean' } })).response.status, 401);
});

test('Supabase adapter verifies Auth identity then uses scoped service REST requests and CAS', async () => {
  const requests = [], responses = [
    { id: USERS.troy, role: 'authenticated', is_anonymous: false, email: 'Troy@Example.invalid', email_confirmed_at: '2026-10-08T15:00:00Z', user_metadata: { player_id: 'sean', email: 'spoof@example.invalid' } },
    [{ player_id: 'troy', active: true, role: 'player' }],
    [{ state: { private: true }, revision: 4 }], [{ revision: 5 }], [],
  ];
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', clock: () => NOW,
    async fetchImpl(url, options) { requests.push({ url: new URL(url), options }); return Response.json(responses.shift()); },
  });
  assert.deepEqual(await adapter.authenticate('user-test-token'), { id: USERS.troy, is_anonymous: false, email: 'troy@example.invalid', emailConfirmed: true });
  await adapter.storage.membership(USERS.troy, 'sean-troy-luke');
  await adapter.storage.load('sean-troy-luke');
  assert.deepEqual(await adapter.storage.compareAndSwap('sean-troy-luke', 4, { private: true }), { revision: 5 });
  assert.equal(await adapter.storage.compareAndSwap('sean-troy-luke', 4, { private: false }), null);
  assert.equal(requests[0].url.pathname, '/auth/v1/user');
  assert.deepEqual(requests[0].options.headers, { apikey: 'public-test-key', Authorization: 'Bearer user-test-token' });
  assert.equal(requests[1].url.searchParams.get('user_id'), `eq.${USERS.troy}`);
  assert.equal(requests[1].url.searchParams.get('league_id'), 'eq.sean-troy-luke');
  assert.equal(requests[1].url.searchParams.get('active'), 'eq.true');
  assert.equal(requests[2].url.searchParams.get('id'), 'eq.sean-troy-luke');
  const cas = requests[3];
  assert.equal(cas.options.method, 'PATCH'); assert.equal(cas.url.searchParams.get('revision'), 'eq.4');
  assert.equal(cas.url.searchParams.get('id'), 'eq.sean-troy-luke');
  assert.equal(cas.options.headers.Authorization, 'Bearer server-test-secret');
  assert.equal(cas.options.headers.Prefer, 'return=representation');
  assert.deepEqual(JSON.parse(cas.options.body), { state: { private: true }, revision: 5, updated_at: new Date(NOW).toISOString() });
  assert(requests.every(request => request.options.redirect === 'error' && request.options.signal instanceof AbortSignal));
});

test('Supabase adapter rejects anonymous accounts, provider failures, and ambiguous membership rows', async () => {
  const make = response => createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async () => response });
  assert.equal(await make(Response.json({ id: USERS.troy, role: 'authenticated', is_anonymous: true })).authenticate('token'), null);
  assert.equal(await make(Response.json({ message: 'invalid token' }, { status: 401 })).authenticate('token'), null);
  assert.equal(await make(Response.json({ id: USERS.troy, role: 'service_role' })).authenticate('token'), null);
  await assert.rejects(() => make(Response.json({ secret: 'never surfaced' }, { status: 500 })).authenticate('token'), /Authentication service unavailable/);
  await assert.rejects(() => make(Response.json([{}, {}])).storage.membership(USERS.troy, 'sean-troy-luke'), /Invalid storage response/);
  await assert.rejects(() => make(Response.json({ secret: 'never surfaced' }, { status: 403 })).storage.load('sean-troy-luke'), /Storage request failed/);
});

test('native weekly adapter uses verified actor arguments and safe service-only transactional RPCs', async()=>{
  const requests=[], replies=[{state:{private:true},revision:4,leagueRevision:9},5,6,{message:'GTL_WEEKLY_CONFLICT'},{message:'database SECRET private_pick=-9.5'}];
  const adapter=createSupabaseAdapter({url:'https://project.supabase.co',anonKey:'public-test-key',serviceRoleKey:'server-test-secret',
    fetchImpl:async(url,options)=>{ requests.push({url:new URL(url),options});const reply=replies.shift(); return Response.json(reply,{status:reply.message?400:200}); },
  });
  await adapter.weekly.load(USERS.sean,'sean-troy-luke');
  assert.equal(await adapter.weekly.saveBallot(USERS.sean,'sean-troy-luke','guess_total',4,{'TB-DAL':44.5},false),5);
  assert.equal(await adapter.weekly.saveSelection(USERS.sean,'sean-troy-luke',5,bet),6);
  await assert.rejects(()=>adapter.weekly.saveSelection(USERS.sean,'sean-troy-luke',5,bet),error=>error.status===409);
  await assert.rejects(()=>adapter.weekly.load(USERS.sean,'sean-troy-luke'),/Weekly storage request failed/);
  assert.deepEqual(requests.slice(0,3).map(r=>r.url.pathname),['/rest/v1/rpc/gtl_read_weekly_state','/rest/v1/rpc/gtl_save_weekly_ballot','/rest/v1/rpc/gtl_save_weekly_selection']);
  assert.deepEqual(JSON.parse(requests[1].options.body),{p_user:USERS.sean,p_league:'sean-troy-luke',p_mode:'guess_total',p_revision:4,p_picks:{'TB-DAL':44.5},p_submit:false});
  assert.deepEqual(JSON.parse(requests[2].options.body),{p_user:USERS.sean,p_league:'sean-troy-luke',p_revision:5,p_selection:bet});
  assert(requests.every(r=>r.options.method==='POST'&&r.options.headers.Authorization==='Bearer server-test-secret'&&r.options.redirect==='error'));
});
