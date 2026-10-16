import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { createEngine } from '../server/engine.mjs';
import { FEATURE_OFF } from '../cloud/optional-rpc.mjs';
import { LATE_WINDOWS, REVEAL_TIMES, TODAYS_RULES, parseLiveRules, readLiveRules } from '../cloud/live-rules.mjs';
import { emptySocialState } from '../shared/social-bets.mjs';

// Redesign build plan, stage 4: /community/read, /personal, /personal/read and /state (and the /ballot and /bet
// replies, which are the /state view) carry `rules`. The hosted project has no gtl_live_rules yet (M-01 creates it;
// tests/guess-reveal-per-game-sql.test.mjs reads it on PGlite), so every reply carries today's rules, and a missing
// RPC uses compatibility rules. Outages and malformed responses fail closed.
// Fictional fixtures only: no real player, pick or line.
const USER = '00000000-0000-4000-8000-00000000000a';
const LEAGUE = `g_${'a'.repeat(32)}`;
const NOW = Date.parse('2026-10-14T16:00:00Z');
const LIVE = { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff' };
const notFound = () => Response.json({ code: 'PGRST202', message: 'Could not find the function public.gtl_live_rules without parameters in the schema cache' }, { status: 404 });

const state = () => ({
  version: 1,
  league: { id: LEAGUE, name: 'Fixture league', season: 2026, week: 6, format: 'Duel', perGameLimit: 1, deadline: '2026-10-16T00:15:00.000Z', actualKickoff: null,
    scheduleSource: 'https://example.invalid/schedule', roster: [{ id: 'one', name: 'Fixture One', role: 'Commissioner' }, { id: 'two', name: 'Fixture Two', role: 'Player' }] },
  games: [{ id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos', kickoff: '2026-10-16T00:15:00.000Z' }],
  ballots: {}, bets: {}, results: {}, history: [], audit: [], archivedCount: 0, frozen: {},
});
const feed = { viewer: USER, admin: false, members: [{ id: USER, displayName: 'Fixture One' }], week: { season: 2026, week: 6, deadline: '2026-10-16T00:15:00Z', games: 1 },
  due: [{ mode: 'guess_spread', submitted: false, filled: 0, games: 1 }], submissions: [], posts: [] };

function app({ optionalRpc, initial = state() } = {}) {
  let saved = { state: initial, revision: 0 };
  const calls = [];
  const handler = createCloudHandler({
    clock: () => NOW, uuid: () => '00000000-0000-4000-8000-0000000000ff', leagueId: LEAGUE,
    authenticate: async () => ({ id: USER, is_anonymous: false, email: 'fixture-one@example.invalid', emailConfirmed: true }),
    storage: { membership: async () => ({ player_id: 'two', active: true, role: 'player' }) },
    weekly: {
      load: async () => ({ ...structuredClone(saved), leagueRevision: 0 }),
      async saveBallot(userId, leagueId, mode, revision, picks, submit) {
        if (revision !== saved.revision) return null;
        const engine = createEngine(saved.state, { clock: () => NOW, uuid: () => '00000000-0000-4000-8000-0000000000fe' });
        engine.saveBallot('two', mode, picks, submit);
        saved = { state: engine.snapshot(), revision: revision + 1 };
        return saved.revision;
      },
      async saveSelection(userId, leagueId, revision, selection) {
        if (revision !== saved.revision) return null;
        const engine = createEngine(saved.state, { clock: () => NOW, uuid: () => '00000000-0000-4000-8000-0000000000fd' });
        engine.saveBet('two', selection);
        saved = { state: engine.snapshot(), revision: revision + 1 };
        return saved.revision;
      },
    },
    community: { rpc: async name => { calls.push(['community', name]); return feed; } },
    personal: { rpc: async name => { calls.push(['personal', name]); return { scope: 'account_private', season: 2026, week: 6 }; } },
    social: { rpc: async (name, body) => {
      calls.push(['social', name, body]);
      assert.equal(name, 'gtl_read_social');
      return { season: initial.league.season, week: initial.league.week, profiles: [], following: [],
        availableWeeks: [{ season: initial.league.season, week: initial.league.week }],
        weeks: [{ season: initial.league.season, week: initial.league.week, games: initial.games, revision: 0, state: emptySocialState() }] };
    } },
    ...(optionalRpc ? { optionalRpc: async (name, body) => { calls.push(['optional', name, body]); return optionalRpc(name, body); } } : {}),
  });
  const send = async (path, { method = 'POST', body = method === 'POST' ? {} : undefined } = {}) => {
    const response = await handler(new Request(`https://fixture.invalid/functions/v1/gtl-api${path}`, {
      method, headers: { authorization: 'Bearer fixture-token', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { send, calls };
}
const routes = [
  ['/community/read', {}],
  ['/personal', { method: 'GET' }],
  ['/personal/read', { body: { season: 2026, week: 6 } }],
  ['/state', { method: 'GET' }],
  ['/ballot', { body: { revision: 0, picks: { 'SEA-DEN': -3 } } }],
];

test('today\'s rules: picks stay editable until the deadline, they close at the deadline, and the deadline opens the week', () => {
  assert.deepEqual(TODAYS_RULES, { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' });
  assert.ok(Object.isFrozen(TODAYS_RULES));
  assert.deepEqual(LATE_WINDOWS, ['deadline', 'kickoff']);
  assert.deepEqual(REVEAL_TIMES, ['deadline', 'kickoff']);
});

test('parseLiveRules passes only a well-formed answer and only the known keys', () => {
  assert.deepEqual(parseLiveRules({ sentFinal: true, lateWindow: 'kickoff', extra: 'dropped' }), LIVE);
  assert.deepEqual(parseLiveRules({ sentFinal: false, lateWindow: 'deadline' }), TODAYS_RULES);
  for (const raw of [null, [], 'rules', {}, { sentFinal: 'true', lateWindow: 'kickoff' }, { sentFinal: true }, { sentFinal: true, lateWindow: 'game' }, { sentFinal: 1, lateWindow: 'deadline' },
    { sentFinal: false, lateWindow: 'deadline', revealAt: 'game' }, { sentFinal: false, lateWindow: 'deadline', revealAt: 1 }]) {
    assert.throws(() => parseLiveRules(raw), /Invalid live rules/, JSON.stringify(raw));
  }
});

test('revealAt: the deadline opens the week until M-01 reports each game\'s kickoff; a kickoff late window always reveals at kickoff', () => {
  // M-02's planned answer without the key, and a SQL null: the deadline still opens the week (D-23).
  assert.deepEqual(parseLiveRules({ sentFinal: true, lateWindow: 'deadline' }), { sentFinal: true, lateWindow: 'deadline', revealAt: 'deadline' });
  assert.deepEqual(parseLiveRules({ sentFinal: false, lateWindow: 'deadline', revealAt: null }), TODAYS_RULES);
  // M-01 applied, nothing else yet: picks still close at the deadline, but each game opens at its kickoff.
  const m01 = { sentFinal: false, lateWindow: 'deadline', revealAt: 'kickoff' };
  assert.deepEqual(parseLiveRules(m01), m01);
  // M-07 is applied only after M-01: a kickoff late window never reveals at the deadline.
  assert.deepEqual(parseLiveRules({ sentFinal: true, lateWindow: 'kickoff' }), LIVE);
  assert.deepEqual(parseLiveRules({ sentFinal: true, lateWindow: 'kickoff', revealAt: 'deadline' }), LIVE);
});

test('readLiveRules uses legacy rules only for an explicitly missing or unconfigured RPC', async () => {
  for (const optionalRpc of [undefined, null, async () => FEATURE_OFF]) {
    const rules = await readLiveRules(optionalRpc);
    assert.deepEqual(rules, TODAYS_RULES);
    assert.ok(!Object.isFrozen(rules), 'each reply gets its own object');
  }
  const asked = [];
  assert.deepEqual(await readLiveRules(async (name, body) => { asked.push([name, body]); return LIVE; }), LIVE);
  assert.deepEqual(asked, [['gtl_live_rules', {}]], 'no player argument: the rules are the same for everyone');
});

test('the five views carry today\'s rules when no optional-RPC reader is configured', async () => {
  const { send, calls } = app();
  for (const [path, options] of routes) {
    const { status, body } = await send(path, options);
    assert.equal(status, 200, path);
    assert.deepEqual(body.rules, TODAYS_RULES, path);
  }
  assert.ok(!calls.some(([kind]) => kind === 'optional'));
});

test('an explicitly missing gtl_live_rules keeps compatibility with the legacy deployment', async () => {
  for (const optionalRpc of [async () => FEATURE_OFF]) {
    const baseline = app(), { send, calls } = app({ optionalRpc });
    for (const [path, options] of routes) {
      const [expected, actual] = [await baseline.send(path, options), await send(path, options)];
      assert.equal(actual.status, 200, path);
      assert.deepEqual(actual.body, expected.body, `${path}: the same reply as without the RPC`);
      assert.doesNotMatch(JSON.stringify(actual.body), /private failure/);
    }
    // /community/read also reads its `forfeit` (M-03, stage 19) through the same wrapper; tests/guess-forfeit-cloud.test.mjs covers it.
    assert.deepEqual(calls.filter(([kind, name]) => kind === 'optional' && name === 'gtl_live_rules').map(([, name, body]) => [name, body]), routes.map(() => ['gtl_live_rules', {}]), 'one read per view');
  }
});

test('once gtl_live_rules exists, its answer is what every view carries', async () => {
  const { send } = app({ optionalRpc: async () => LIVE });
  for (const [path, options] of routes) {
    const { status, body } = await send(path, options);
    assert.equal(status, 200, path);
    assert.deepEqual(body.rules, LIVE, path);
  }
});

test('/bet carries the rules too: its reply is the /state view for the Challenge', async () => {
  // Follow-up to the stage 4 review: /ballot and /bet share the return line, but only /ballot was tested.
  const sent = createEngine(state(), { clock: () => NOW, uuid: () => '00000000-0000-4000-8000-0000000000fc' });
  sent.saveBallot('two', 'guess_spread', { 'SEA-DEN': -3 }, true); // a Challenge pick needs the matching Spread ballot sent
  const bet = { revision: 0, gameId: 'SEA-DEN', market: 'spread', side: 'home', line: -3, odds: -110, source: 'Fixture book', quotedAt: new Date(NOW - 60_000).toISOString() };
  for (const [optionalRpc, expected] of [[undefined, TODAYS_RULES], [async () => FEATURE_OFF, TODAYS_RULES], [async () => LIVE, LIVE]]) {
    const { send, calls } = app({ optionalRpc, initial: sent.snapshot() });
    const { status, body } = await send('/bet', { body: bet });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.mode, 'betting_challenge');
    assert.deepEqual(body.rules, expected);
    assert.equal(calls.filter(([kind]) => kind === 'optional').length, optionalRpc ? 1 : 0, 'one rules read');
  }
});

test('routes that are not views carry no rules and make no rules read', async () => {
  const { send, calls } = app({ optionalRpc: async () => LIVE });
  const exported = await send('/export', { method: 'GET' });
  assert.equal(exported.status, 200); assert.equal(Object.hasOwn(exported.body, 'rules'), false);
  assert.equal(exported.body.socialBets.historyScope, 'all'); assert.deepEqual(exported.body.socialBets.entries, []);
  assert.equal(Object.hasOwn(exported.body.socialBets, 'rules'), false);
  assert.deepEqual(calls.filter(([kind]) => kind === 'social'), [['social', 'gtl_read_social', { p_user: USER, p_season: null, p_week: null, p_all: true }]]);
  const liked = await send('/community/like', { body: { postId: '00000000-0000-4000-8000-000000000009', like: true } });
  assert.equal(liked.status, 200); assert.equal(Object.hasOwn(liked.body, 'rules'), false);
  assert.equal(calls.filter(([kind]) => kind === 'optional').length, 0);
});

test('a rules outage closes saves while syntactically invalid requests remain invalid', async () => {
  const { send } = app({ optionalRpc: async () => { throw new Error('unavailable'); } });
  const stale = await send('/ballot', { body: { revision: 7, picks: { 'SEA-DEN': -3 } } });
  assert.equal(stale.status, 503); assert.equal(Object.hasOwn(stale.body, 'rules'), false);
  const invalid = await send('/ballot', { body: { revision: 0, extra: 1 } });
  assert.equal(invalid.status, 400); assert.equal(Object.hasOwn(invalid.body, 'rules'), false);
});

test('through the Supabase adapter: PostgREST PGRST202 for gtl_live_rules reads as today\'s rules', async () => {
  const requests = [];
  let live = null;
  const adapter = createSupabaseAdapter({ url: 'https://project.supabase.co', anonKey: 'public-test-key', serviceRoleKey: 'server-test-secret', fetchImpl: async (url, options) => {
    const { pathname } = new URL(url);
    requests.push({ pathname, options });
    if (pathname === '/auth/v1/user') return Response.json({ id: USER, role: 'authenticated', is_anonymous: false, email: 'fixture-one@example.invalid', email_confirmed_at: '2026-10-01T00:00:00Z' });
    if (pathname === '/rest/v1/rpc/gtl_read_community') return Response.json(feed);
    if (pathname === '/rest/v1/rpc/gtl_live_rules') return live ? Response.json(live) : notFound();
    return Response.json({ message: 'unexpected request' }, { status: 500 });
  } });
  const handler = createCloudHandler({ ...adapter, clock: () => NOW });
  const read = async () => {
    const response = await handler(new Request('https://fixture.invalid/functions/v1/gtl-api/community/read', { method: 'POST', headers: { authorization: 'Bearer fixture-token', 'content-type': 'application/json' }, body: '{}' }));
    return { status: response.status, body: await response.json() };
  };
  const off = await read();
  assert.equal(off.status, 200); assert.deepEqual(off.body.rules, TODAYS_RULES);
  const rulesCall = requests.find(({ pathname }) => pathname === '/rest/v1/rpc/gtl_live_rules');
  assert.equal(rulesCall.options.method, 'POST'); assert.equal(rulesCall.options.body, '{}');
  assert.equal(rulesCall.options.headers.Authorization, 'Bearer server-test-secret', 'service role only; the function is granted to service_role');
  assert.equal(rulesCall.options.redirect, 'error');
  live = LIVE;
  assert.deepEqual((await read()).body.rules, LIVE);
  assert.doesNotMatch(JSON.stringify(off.body), /server-test-secret|schema cache/);
});


test('a transient or malformed rules reply never reopens editing or reaches a ballot writer', async () => {
  for (const optionalRpc of [async () => { throw new Error('private rules failure'); }, async () => null, async () => ({ sentFinal: 'maybe', lateWindow: 'kickoff' })]) {
    await assert.rejects(readLiveRules(optionalRpc));
    const { send, calls } = app({ optionalRpc });
    for (const [path, options] of [...routes, ['/personal/ballot', { body: { lockIn: ['SEA-DEN'] } }]]) {
      const result = await send(path, options);
      assert.equal(result.status, 503, path);
      assert.equal(Object.hasOwn(result.body, 'rules'), false);
      assert.doesNotMatch(JSON.stringify(result.body), /private rules|sentFinal/);
    }
    assert.ok(!calls.some(([kind, name]) => kind === 'personal' && name === 'gtl_mutate_personal'));
  }
});

test('per-game scoring is an explicit capability and cannot exist with editable or deadline-only rules', async () => {
  const live = { ...LIVE, perGameScoring: true };
  assert.deepEqual(parseLiveRules(live), live);
  assert.throws(() => parseLiveRules({ ...live, sentFinal: false }));
  assert.throws(() => parseLiveRules({ ...live, lateWindow: 'deadline' }));
  assert.throws(() => parseLiveRules({ ...live, perGameScoring: 'true' }));
  const { send, calls } = app({ optionalRpc: async () => live });
  const result = await send('/personal/read', { body: { season: 2026, week: 6 } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.rules, live);
  assert.deepEqual(Object.keys(result.body.scoring), ['guess_spread', 'guess_total']);
  assert.equal(calls.filter(([kind, name]) => kind === 'personal' && name === 'gtl_guess_score_receipt').length, 2);
});
