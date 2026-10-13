import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seed } from '../server/store.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { BENCHMARK_LEAGUE, providerBenchmarkError } from '../cloud/benchmark.mjs';
let PGlite;
try { ({ PGlite } = await import('../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip. */ }
const skip = PGlite ? false : 'Optional local PGlite absent; no hosted database tests.';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const player = n => `u_${id(n).replaceAll('-', '')}`;
const policyId = 'd09-2026-w05-sean-steven-spread';
const source = 'https://www.nfl.com/games/example/play-by-play';
const iso = stamp => new Date(stamp).toISOString();
const migrations = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql'].map(f => fs.readFileSync(`supabase/migrations/${f}`, 'utf8'));
function payload(games, captured, values = [-3, -3.5, -4]) {
  return { provider: 'the-odds-api', sport: 'americanfootball_nfl', fetchedAt: iso(captured), games: games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: { spread: { quotes: ['draftkings', 'fanduel', 'betmgm'].map((book, k) => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market: 'spread', value: values[k],
      timeBasis: 'provider_market_last_update', collectedAt: iso(captured), providerObservedAt: iso(captured - 30_000),
      outcomes: { home: { line: values[k], odds: -110 }, away: { line: -values[k], odds: -110 } },
    })) }, total: { quotes: [{ privateOtherMode: 999 }] } },
  })) };
}
async function fixture(t) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(migrations[0]);
  const now = Date.now(), actual = iso(now - 10_000), original = seed();
  original.league.deadline = iso(now + 60_000);
  original.games.forEach((g, i) => { g.kickoff = iso(now + 60_000 + i * 3600_000); });
  await db.query("insert into public.gtl_leagues(id,state) values('sean-troy-luke',$1)", [original]);
  await db.query('insert into auth.users values($1),($2),($3)', [id(1), id(2), id(3)]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,'sean-troy-luke','sean','commissioner')", [id(1)]);
  await db.exec(migrations[1]);
  const duel = structuredClone(original);
  duel.league = { ...duel.league, id: BENCHMARK_LEAGUE, name: 'Fixture Duel', format: 'Duel', roster: [{ id: player(1), name: 'Fixture one' }, { id: player(2), name: 'Fixture two' }] };
  duel.ballots = {}; duel.bets = {}; duel.audit = []; duel.history = [];
  await db.query("insert into public.gtl_leagues(id,state,created_by,format,max_members) values($1,$2,$3,'duel',2)", [BENCHMARK_LEAGUE, duel, id(1)]);
  await db.query("insert into public.gtl_memberships(user_id,league_id,player_id,role) values($1,$2,$3,'commissioner'),($4,$2,$5,'player')", [id(1), BENCHMARK_LEAGUE, player(1), id(2), player(2)]);
  for (const sql of migrations.slice(2)) await db.exec(sql);
  const as = (role, sql, args = []) => db.transaction(async tx => { await tx.exec(`set local role ${role}`); return tx.query(sql, args); });
  const rpc = async (name, args) => (await as('service_role', `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) value`, args)).rows[0].value;
  const signature = (await db.query('select signature from public.gtl_weekly_slates')).rows[0].signature;
  const activate = () => db.query('insert into public.gtl_benchmark_policies(id,league_id,season,week,mode,slate_signature,created_by,decision_text) values($1,$2,2026,5,$3,$4,$5,$6)', [policyId, BENCHMARK_LEAGUE, 'guess_spread', signature, id(1), 'Fixture explicit D-09 approval']);
  const saveSnapshot = async (n, data) => {
    await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)", [id(n), id(1), id(n + 1000), signature]);
    await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)', [id(n), signature, data, data.fetchedAt]);
  };
  const read = (n = 1, league = BENCHMARK_LEAGUE) => rpc('gtl_read_scoring_benchmark', [id(n), league]);
  const freeze = (request = id(500), time = actual, url = source, n = 1, league = BENCHMARK_LEAGUE) => rpc('gtl_freeze_benchmark', [id(n), league, request, time, url]);
  return { db, as, rpc, now, actual, original, duel, signature, activate, saveSnapshot, read, freeze };
}

test('D09 SQL protects an explicit scoped policy and immutable freeze, preserving all entries', { skip }, async t => {
  const f = await fixture(t);
  const before = (await f.db.query('select id,state,revision from public.gtl_leagues order by id')).rows;
  const canonical = (await f.db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows;
  await t.test('installation grants no policy, browser DML/EXECUTE is denied, service cannot activate or rewrite', async () => {
    assert.equal(await f.read(), null);
    for (const table of ['gtl_benchmark_policies', 'gtl_frozen_benchmarks']) {
      assert.equal((await f.db.query('select relrowsecurity from pg_class where oid=$1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) for (const sql of [`select * from public.${table}`, `delete from public.${table}`, `insert into public.${table} default values`, `update public.${table} set ${table === 'gtl_benchmark_policies' ? 'decision_text=decision_text' : 'benchmark=benchmark'}`]) await assert.rejects(() => f.as(role, sql), /permission denied/);
    }
    for (const signature of ['gtl_benchmark_immutable()', 'gtl_benchmark_candidate(jsonb,jsonb,timestamptz)', 'gtl_read_scoring_benchmark(uuid,text)', 'gtl_freeze_benchmark(uuid,text,uuid,timestamptz,text)']) for (const role of ['anon', 'authenticated']) assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) ok', [role, `public.${signature}`, 'EXECUTE'])).rows[0].ok, false);
    await assert.rejects(() => f.as('service_role', 'insert into public.gtl_benchmark_policies default values'), /permission denied/);
    await f.activate();
    assert.equal((await f.read()).status, 'unavailable');
    for (const table of ['gtl_benchmark_policies', 'gtl_frozen_benchmarks']) await assert.rejects(() => f.as('service_role', `delete from public.${table}`), /permission denied/);
    await assert.rejects(() => f.db.exec("update public.gtl_benchmark_policies set decision_text='replacement'"), /GTL_BENCHMARK_IMMUTABLE/);
    await assert.rejects(() => f.db.exec('delete from public.gtl_benchmark_policies'), /GTL_BENCHMARK_IMMUTABLE/);
  });
  await t.test('fixed commissioner and target membership required; unrelated group has no policy', async () => {
    await assert.rejects(() => f.freeze(id(501), f.actual, source, 2), /GTL_ODDS_FORBIDDEN/);
    await assert.rejects(() => f.freeze(id(501), f.actual, source, 1, 'sean-troy-luke'), /GTL_BENCHMARK_SCOPE/);
    await assert.rejects(() => f.read(3), /GTL_FORBIDDEN/);
    assert.equal(await f.read(1, 'sean-troy-luke'), null);
    await f.db.query('update public.gtl_memberships set active=false where user_id=$1 and league_id=$2', [id(1), BENCHMARK_LEAGUE]);
    await assert.rejects(() => f.freeze(), /GTL_FORBIDDEN/);
    await f.db.query('update public.gtl_memberships set active=true where user_id=$1 and league_id=$2', [id(1), BENCHMARK_LEAGUE]);
  });
  await t.test('source and explicit actual time must be valid; schedule is never substituted', async () => {
    for (const actual of [null, iso(f.now + 3600_000), iso(f.now - 3600_000), iso(f.now - 86400_000), 'infinity']) await assert.rejects(() => f.freeze(id(502), actual), /GTL_BENCHMARK_INPUT/);
    for (const url of [null, 'http://nfl.com/', 'https://x@y.com/', 'https://nfl.com/#fragment', 'https://nfl.com/ x']) await assert.rejects(() => f.freeze(id(502), f.actual, url), /GTL_BENCHMARK_INPUT/);
    await assert.rejects(() => f.freeze(), /GTL_BENCHMARK_MISSING/);
  });
  await t.test('last complete snapshot wins over newer incomplete snapshots across all retained history', async () => {
    await f.saveSnapshot(10, payload(f.duel.games, f.now - 12 * 60_000));
    const stale = await f.read(); assert.equal(stale.status, 'provisional'); assert.equal(stale.stale, true);
    await assert.rejects(() => f.freeze(), /GTL_BENCHMARK_MISSING/);
    await f.saveSnapshot(11, payload(f.duel.games, f.now - 60_000));
    for (let n = 0; n < 21; n++) {
      const partial = payload(f.duel.games, f.now - 40_000 + n * 1000); partial.games[0].markets.spread.quotes.pop();
      await f.saveSnapshot(20 + n, partial);
    }
    const current = await f.read(2); assert.equal(current.status, 'provisional'); assert.equal(current.stale, false);
    assert.equal(Date.parse(current.capturedAt), f.now - 60_000); assert.equal(Object.keys(current.games).length, 15);
    assert.equal(current.games['TB-DAL'].value, -3.5);
    assert.equal(JSON.stringify(current).includes('privateOtherMode'), false); assert.equal(JSON.stringify(current).includes('outcomes'), false);
  });
  await t.test('actual freeze is one immutable record and exact retry only; no entry or legacy JSON changes', async () => {
    const first = await f.freeze(); assert.equal(first.replayed, false); assert.equal(first.gameCount, 15); assert.equal(first.games, undefined);
    const retry = await f.freeze(); assert.equal(retry.replayed, true); assert.equal(retry.requestId, first.requestId);
    for (const args of [[id(503)], [id(500), iso(f.now - 11_000)], [id(500), f.actual, 'https://www.nfl.com/other']]) await assert.rejects(() => f.freeze(...args), /GTL_BENCHMARK_FROZEN/);
    const frozen = await f.read(2); assert.equal(frozen.status, 'frozen'); assert.equal(frozen.sourceUrl, source); assert.equal(frozen.stale, false);
    assert.equal((await f.db.query('select snapshot_id from public.gtl_frozen_benchmarks')).rows[0].snapshot_id, id(11));
    await assert.rejects(() => f.db.exec("update public.gtl_frozen_benchmarks set source_url='https://www.nfl.com/changed'"), /GTL_BENCHMARK_IMMUTABLE/);
    await assert.rejects(() => f.db.exec('delete from public.gtl_frozen_benchmarks'), /GTL_BENCHMARK_IMMUTABLE/);
    assert.deepEqual((await f.db.query('select id,state,revision from public.gtl_leagues order by id')).rows, before);
    assert.deepEqual((await f.db.query('select * from public.gtl_weekly_ballots order by user_id,mode')).rows, canonical);
    assert.equal(canonical.find(x => x.mode === 'guess_spread').ballot.picks['TB-DAL'], -9.5);
  });
});

test('D09 candidate rejects malformed, mismatched, incomplete and post-start quotes', { skip }, async t => {
  const f = await fixture(t), valid = payload(f.duel.games, f.now - 60_000);
  const candidate = data => f.rpc('gtl_benchmark_candidate', [data, f.duel.games, f.actual]);
  assert.equal(Object.keys((await candidate(valid)).games).length, 15);
  const changes = [
    p => p.games.pop(), p => p.games.push(p.games[0]), p => p.games[0].gameId = p.games[1].gameId,
    p => p.games[0].home = 'Wrong home', p => p.games[0].kickoff = iso(f.now + 1),
    p => p.games[0].matchStatus = 'missing', p => p.games[0].markets.spread.quotes.pop(),
    p => p.games[0].markets.spread.quotes[1].book = 'draftkings', p => p.games[0].markets.spread.quotes[1].book = 'otherbook',
    p => p.games[0].markets.spread.quotes[0].value = null, p => p.games[0].markets.spread.quotes[0].value = '-3',
    p => p.games[0].markets.spread.quotes[0].value = 0.25,
    p => p.games[0].markets.spread.quotes[0].outcomes.away.line = -3,
    p => p.games[0].markets.spread.quotes[0].providerObservedAt = f.actual,
    p => p.games[0].markets.spread.quotes[0].providerObservedAt = iso(Date.parse(f.actual) - 300_001),
    p => p.games[0].markets.spread.quotes[0].collectedAt = f.actual,
    p => p.games[0].markets.spread.quotes[0].timeBasis = 'bookmaker_last_update',
    p => p.games[0].markets.spread.quotes[0].providerEventId = 'other',
    p => p.fetchedAt = f.actual, p => p.fetchedAt = 'not a timestamp',
  ];
  for (const mutate of changes) { const invalid = structuredClone(valid); mutate(invalid); assert.equal(await candidate(invalid), null, String(mutate)); }
  assert.equal(await candidate(payload(f.duel.games, f.now - 60_000, [-3, -3.5, 2.5])), null, 'two of three is below85%');
  assert.ok(await candidate(payload(f.duel.games, f.now - 60_000, [-3, -3.5, 2])), 'all three within five is accepted');
});

function httpFixture({ commissioner = true, frozen = {}, failure = null } = {}) {
  let calls = 0;
  const handler = createCloudHandler({ authenticate: async () => ({ id: id(1), email: 'fixture@example.test', emailConfirmed: true }),
    storage: { membership: async () => ({ active: true, player_id: commissioner ? 'sean' : 'troy', role: commissioner ? 'commissioner' : 'player' }) },
    odds: { freezeBenchmark: async (...args) => { calls++; if (failure) throw failure; return { policyId, requestId: args[2], actualKickoff: args[3], sourceURL: args[4], gameCount: 15, ...frozen }; } } });
  const body = { requestId: id(1), actualKickoff: '2026-10-09T00:15:00Z', sourceURL: source };
  return { calls: () => calls, async request(overrides = {}, query = `?league=${BENCHMARK_LEAGUE}`, token = true) {
    const response = await handler(new Request(`https://api.test/gtl-api/benchmark/freeze${query}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer valid' } : {}) }, body: JSON.stringify({ ...body, ...overrides }) }));
    return { status: response.status, data: await response.json() };
  } };
}
test('freeze HTTP authenticates commissioner, strictly scopes request, and returns no quote payload', async () => {
  const denied = httpFixture({ commissioner: false }); assert.equal((await denied.request()).status, 403); assert.equal(denied.calls(), 0);
  const app = httpFixture({ frozen: { games: { secret: 7 }, benchmark: { private: 'payload' } } });
  assert.equal((await app.request({}, undefined, false)).status, 401);
  assert.equal((await app.request({}, '?league=sean-troy-luke')).status, 403);
  assert.equal((await app.request({}, `?league=${BENCHMARK_LEAGUE}&mode=guess_total`)).status, 400);
  for (const body of [{ player: 'sean' }, { actualKickoff: null }, { actualKickoff: '2026-10-09T00:15' }, { sourceURL: 'https://user:password@nfl.com/' }, { sourceURL: 'https://nfl.com/#fragment' }, { requestId: 'invalid' }]) assert.equal((await app.request(body)).status, 400);
  assert.equal(app.calls(), 0);
  const result = await app.request(); assert.equal(result.status, 200); assert.equal(result.data.gameCount, 15); assert.equal(result.data.games, undefined); assert.equal(result.data.benchmark, undefined);
  assert.equal((await httpFixture({ failure: providerBenchmarkError('GTL_BENCHMARK_MISSING') }).request()).status, 409);
  const safe = await httpFixture({ failure: new Error('https://internal?secret=private') }).request(); assert.equal(safe.status, 503); assert.equal(JSON.stringify(safe).includes('private'), false);
});

test('native benchmark adapter uses server-only RPC identity and sanitized errors', async () => {
  const calls = [];
  const adapter = createSupabaseAdapter({ url: 'https://project.example/', anonKey: 'public', serviceRoleKey: 'private', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body), headers: options.headers });
    return new Response(JSON.stringify({ message: 'GTL_BENCHMARK_FROZEN' }), { status: 400 });
  } });
  await assert.rejects(() => adapter.odds.freezeBenchmark(id(1), BENCHMARK_LEAGUE, id(2), '2026-10-09T00:15:00Z', source), /permanently frozen/);
  assert.deepEqual(calls[0].body, { p_user: id(1), p_league: BENCHMARK_LEAGUE, p_request: id(2), p_actual: '2026-10-09T00:15:00Z', p_source: source });
  assert.ok(calls[0].url.endsWith('/rest/v1/rpc/gtl_freeze_benchmark'));
  await assert.rejects(() => adapter.odds.scoringBenchmark(id(1), BENCHMARK_LEAGUE), /Scoring benchmark unavailable/);
});

test('submission scoring ignores legacy benchmark overlays and keeps missing references unscored', async () => {
  const stamp = Date.parse('2026-10-08T20:00:00Z');
  let state = seed(), revision = 0, reads = 0, unavailable = false;
  state.league.id = BENCHMARK_LEAGUE; state.history = [];
  const normalized = { policyId, leagueId: BENCHMARK_LEAGUE, season: 2026, week: 5, mode: 'guess_spread', status: 'provisional',
    source: 'fixture', sourceUrl: null, capturedAt: iso(stamp - 30_000), quotedAt: iso(stamp - 60_000), actualKickoff: null, stale: false,
    games: Object.fromEntries(state.games.map(g => [g.id, { value: -3.5, oldestObservedAt: iso(stamp - 60_000), newestObservedAt: iso(stamp - 60_000) }])) };
  const app = createCloudHandler({ clock: () => stamp,
    authenticate: async () => ({ id: id(1), email: 'fixture@example.test', emailConfirmed: true }),
    storage: { membership: async () => ({ player_id: 'sean', active: true }) },
    weekly: { load: async () => ({ state: structuredClone(state), revision, leagueRevision: 7 }),
      saveBallot: async (_u, _l, mode, expected, picks, submit) => { assert.equal(expected, revision); state.ballots.sean[mode] = { picks, submittedAt: submit ? iso(stamp) : null }; return ++revision; } },
    odds: { marketSnapshot: async () => null, scoringBenchmark: async () => { reads++; if (unavailable) throw new Error('secret=hidden'); return normalized; } },
  });
  const request = async (mode = 'guess_spread', body) => {
    const response = await app(new Request(`https://api.test/gtl-api/${body ? 'ballot' : 'state'}?league=${BENCHMARK_LEAGUE}&mode=${mode}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: response.status, data: await response.json() };
  };
  const spread = await request(); assert.equal(spread.data.scoringBenchmark, undefined); assert.equal(spread.data.games[0].market, null); assert.equal(reads, 0);
  for (const mode of ['guess_total', 'betting_challenge']) { const result = await request(mode); assert.equal(result.data.scoringBenchmark, undefined); }
  assert.equal(reads, 0);
  state.ballots.sean.guess_spread = { picks: {}, submittedAt: null };
  assert.equal((await request()).data.scoringBenchmark, undefined); assert.equal(reads, 0);
  const picks = Object.fromEntries(state.games.map(g => [g.id, -3.5]));
  const submitted = await request('guess_spread', { revision, picks, submit: true });
  // The legacy benchmark is not an eligible submission-time source, and since October 12, 2026 a missing
  // market-refresh service never refuses the save: the atomic commit owns the reference. The benchmark is never read.
  assert.equal(submitted.status, 200); assert.equal(state.ballots.sean.guess_spread.submittedAt, iso(stamp));
  assert.equal(submitted.data.scoringBenchmark, undefined); assert.equal(reads, 0); assert.equal(revision, 1);
  assert.equal(JSON.stringify(submitted.data).includes('hidden'), false);
});
