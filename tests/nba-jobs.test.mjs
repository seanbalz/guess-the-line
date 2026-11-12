// The gtl-nba-jobs worker (NBA build-out N2, cloud/nba-jobs.mjs) over a fake service and fake provider fetches. No network,
// no database: tests/nba-slate-lines-sql.test.mjs runs the same worker against the real SQL. Every line here is synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NBA_FAIL_REASONS, NBA_JOBS, NBA_JOBS_RPCS, NBA_LINES_COST, NBA_MONTHLY_CAP, NBA_PAUSE_BELOW, NBA_REFUSALS, NBA_SKIP_REASONS,
  createNbaJobsAdapter, createNbaJobsHandler, createNbaSources } from '../cloud/nba-jobs.mjs';
import { nbaOddsApiName } from '../shared/nba-teams.mjs';

const RUN = '11111111-1111-4111-8111-111111111111', CLAIM = '22222222-2222-4222-8222-222222222222', ATTEMPT = '33333333-3333-4333-8333-333333333333';
const LEASE = '44444444-4444-4444-8444-444444444444', CACHE_LEASE = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'a'.repeat(64), HOUR = 3_600_000;
const iso = ms => new Date(ms).toISOString();
const SQL = readFileSync(new URL('../supabase/migrations/20261112040000_gtl_nba_slate_lines.sql', import.meta.url), 'utf8');

/** Records every provider request the worker makes. Any request at all fails a "no network call" test. */
function network({ events = [], odds = [], fail = {} } = {}) {
  const requests = [];
  const reply = (data, last, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json',
    'x-requests-remaining': '400', 'x-requests-used': '100', 'x-requests-last': String(last) } });
  const fetchImpl = async url => {
    const u = new URL(url);
    requests.push(u);
    if (u.hostname === 'api.balldontlie.io') return fail.bdl ? new Response('{}', { status: 500 }) : Response.json({ data: [], meta: { next_cursor: null } });
    if (u.pathname.endsWith('/events')) return reply(events, 0);
    if (u.pathname.endsWith('/odds')) return fail.odds ? reply({ message: 'down' }, 0, 500) : reply(odds, fail.cost ?? 1);
    throw new Error(`unexpected ${u}`);
  };
  return { requests, fetchImpl };
}

/** A fake worker service: claims the run as `job`, answers each RPC from `answers` (a value or a function of the arguments). */
function fakeService({ job, replay = false, answers = {}, claimError = null }) {
  const calls = [];
  return {
    calls, names: () => calls.map(([name]) => name), args: name => calls.filter(([n]) => n === name).map(([, a]) => a),
    async rpc(name, args) {
      calls.push([name, args]);
      if (!NBA_JOBS_RPCS.includes(name)) throw new Error(`rpc not allowed: ${name}`);
      if (name === 'gtl_nba_claim_job') {
        if (claimError) throw Object.assign(new Error('x'), { code: claimError });
        return replay ? { replay: true, runId: RUN, job, status: 'succeeded', reason: null } : { replay: false, runId: RUN, claim: CLAIM, job, now: new Date().toISOString() };
      }
      if (name === 'gtl_nba_finish_job') return { runId: RUN, status: args.p_reason === null ? 'succeeded' : NBA_SKIP_REASONS.includes(args.p_reason) ? 'skipped' : 'failed', reason: args.p_reason };
      const answer = answers[name];
      if (answer instanceof Error) throw answer;
      return typeof answer === 'function' ? answer(args) : answer;
    },
  };
}

const request = (body = { runId: RUN }, token = TOKEN, init = {}) => new Request('https://x.supabase.co/functions/v1/gtl-nba-jobs', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body), ...init });

async function run({ job, service, net = network(), keys = {} }) {
  const sources = createNbaSources({ oddsApiKey: 'oddsApiKey' in keys ? keys.oddsApiKey : 'fixture-odds-key', ballDontLieKey: 'ballDontLieKey' in keys ? keys.ballDontLieKey : 'fixture-bdl-key', fetchImpl: net.fetchImpl });
  const response = await createNbaJobsHandler({ service, sources })(request());
  return { response, body: await response.json(), net, finish: service.args('gtl_nba_finish_job').at(-1) };
}

const GAME = { gameId: 'NBA:balldontlie:9', home: 'LAC', away: 'PHX', oddsEventId: 'evt9', commenceTime: iso(Date.now() + HOUR), lockAt: iso(Date.now() + HOUR) };
const due = { state: 'due', gameDate: '2026-11-12', attempt: 1, firstTipAt: GAME.lockAt, games: [GAME] };
const ready = { status: 'ready', attemptId: ATTEMPT, lease: LEASE, attempt: 1, gameDate: due.gameDate, remainingCredits: 400, reserveCredits: 100, games: [GAME] };
const providerEvent = () => ({ id: 'evt9', sport_key: 'basketball_nba', home_team: nbaOddsApiName('LAC'), away_team: nbaOddsApiName('PHX'), commence_time: GAME.commenceTime });
const pricedEvent = () => ({ ...providerEvent(), bookmakers: ['draftkings', 'fanduel', 'betmgm'].map((key, i) => ({ key, last_update: iso(Date.now() - 20_000), markets: [{ key: 'spreads', last_update: iso(Date.now() - 20_000),
  outcomes: [{ name: nbaOddsApiName('LAC'), point: -3.5 - i * 0.5, price: -110 }, { name: nbaOddsApiName('PHX'), point: 3.5 + i * 0.5, price: -110 }] }] })) });

test('the worker has two jobs, the approved limits and only its own RPCs; the dispatcher is never one of them', () => {
  assert.deepEqual(NBA_JOBS, ['slate', 'lines']);
  assert.deepEqual([NBA_MONTHLY_CAP, NBA_PAUSE_BELOW, NBA_LINES_COST], [31, 100, 1]);
  for (const name of ['gtl_nba_claim_job', 'gtl_nba_finish_job', 'gtl_nba_claim_games', 'gtl_nba_finish_games', 'gtl_nba_publish_slate', 'gtl_nba_lines_due', 'gtl_nba_begin_lines_read', 'gtl_nba_finish_lines_read'])
    assert.ok(NBA_JOBS_RPCS.includes(name), name);
  for (const name of ['gtl_dispatch_nba_jobs', 'gtl_nba_save_bet', 'gtl_nba_read_bets', 'gtl_nba_shadow_gate', 'gtl_begin_odds_collection']) assert.ok(!NBA_JOBS_RPCS.includes(name), name);
  assert.ok(NBA_SKIP_REASONS.every(r => !NBA_FAIL_REASONS.includes(r)));
  assert.ok(Object.values(NBA_REFUSALS).every(r => NBA_SKIP_REASONS.includes(r)), 'every refusal is a safe skip');
});

test('the skip and fail reasons are exactly the ones gtl_nba_finish_job accepts, and every SQL refusal maps to one', () => {
  const body = SQL.slice(SQL.indexOf('create or replace function public.gtl_nba_finish_job'));
  const list = label => [...new RegExp(`when p_reason in \\(([^)]*)\\) then '${label}'`).exec(body)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(list('skipped'), [...NBA_SKIP_REASONS]);
  assert.deepEqual(list('failed'), [...NBA_FAIL_REASONS]);
  const refusals = [.../refusal text check\(refusal in \(([^)]*)\)\)/.exec(SQL)[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(refusals.sort(), Object.keys(NBA_REFUSALS).sort());
});

test('the run capability is verified first: a bad method, token, query or body, or a refused claim, runs nothing', async () => {
  const net = network(), service = fakeService({ job: 'lines', answers: { gtl_nba_lines_due: due } });
  const handler = createNbaJobsHandler({ service, sources: createNbaSources({ oddsApiKey: 'fixture-odds-key', ballDontLieKey: 'k', fetchImpl: net.fetchImpl }) });
  assert.equal((await handler(new Request('https://x/', { method: 'GET' }))).status, 405);
  assert.equal((await handler(request({ runId: RUN }, 'not-a-token'))).status, 401);
  assert.equal((await handler(new Request('https://x/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status, 401);
  assert.equal((await handler(request({ runId: RUN, extra: 1 }))).status, 400);
  assert.equal((await handler(request({ runId: 'nope' }))).status, 400);
  assert.equal((await handler(new Request('https://x/?a=1', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } }))).status, 400);
  assert.deepEqual(service.names(), [], 'nothing reaches the database without a well-formed capability');
  const refused = fakeService({ job: 'lines', claimError: 'GTL_SCHEDULE_AUTH', answers: { gtl_nba_lines_due: due } });
  const denied = await run({ job: 'lines', service: refused, net });
  assert.equal(denied.response.status, 401);
  assert.deepEqual(refused.names(), ['gtl_nba_claim_job'], 'a refused capability stops before any job RPC');
  const replay = fakeService({ job: 'lines', replay: true, answers: { gtl_nba_lines_due: due } });
  const again = await run({ job: 'lines', service: replay, net });
  assert.deepEqual(again.body, { runId: RUN, job: 'lines', status: 'succeeded', reason: null });
  assert.deepEqual(replay.names(), ['gtl_nba_claim_job']);
  assert.equal(net.requests.length, 0, 'no provider request');
});

test('nothing due means no network call: no due day, a lost race, and every refusal stop before any provider request', async () => {
  const cases = [
    [{ gtl_nba_lines_due: null }, 'nothing_due', ['gtl_nba_claim_job', 'gtl_nba_lines_due', 'gtl_nba_finish_job']],
    [{ gtl_nba_lines_due: due, gtl_nba_begin_lines_read: { status: 'not_due' } }, 'nothing_due', ['gtl_nba_claim_job', 'gtl_nba_lines_due', 'gtl_nba_begin_lines_read', 'gtl_nba_finish_job']],
    // D-85 item 7: inside the hour before an NFL kickoff the run stops before it reserves anything.
    [{ gtl_nba_lines_due: { ...due, state: 'wait', nflClearAt: GAME.lockAt } }, 'nfl_window', ['gtl_nba_claim_job', 'gtl_nba_lines_due', 'gtl_nba_finish_job']],
    ...Object.entries(NBA_REFUSALS).map(([refusal, reason]) => [{ gtl_nba_lines_due: due, gtl_nba_begin_lines_read: { status: 'refused', reason: refusal, attempt: 1, gameDate: due.gameDate } }, reason,
      ['gtl_nba_claim_job', 'gtl_nba_lines_due', 'gtl_nba_begin_lines_read', 'gtl_nba_finish_job']]),
  ];
  for (const [answers, reason, names] of cases) {
    const net = network(), service = fakeService({ job: 'lines', answers });
    const out = await run({ job: 'lines', service, net });
    assert.equal(out.finish.p_reason, reason, JSON.stringify(answers.gtl_nba_begin_lines_read ?? null));
    assert.deepEqual(service.names(), names);
    assert.equal(net.requests.length, 0, `${reason}: no provider request`);
  }
  // Without an Odds API key nothing is reserved either.
  const service = fakeService({ job: 'lines', answers: { gtl_nba_lines_due: due, gtl_nba_begin_lines_read: ready } });
  const keyless = await run({ job: 'lines', service, keys: { oddsApiKey: undefined } });
  assert.equal(keyless.finish.p_reason, 'source_unavailable');
  assert.deepEqual(service.args('gtl_nba_begin_lines_read'), []);
  assert.equal(keyless.net.requests.length, 0);
});

test('a reserved lines read makes the one basketball_nba spreads request and finishes with the qualified line and the provider\'s quota', async () => {
  const net = network({ events: [providerEvent()], odds: [pricedEvent()] });
  const service = fakeService({ job: 'lines', answers: { gtl_nba_lines_due: due, gtl_nba_begin_lines_read: ready,
    gtl_nba_finish_lines_read: args => ({ status: 'finished', error: null, cost: 1, stored: args.p_lines.length, qualified: args.p_lines.filter(l => l.qualified).length }) } });
  const out = await run({ job: 'lines', service, net });
  assert.equal(out.finish.p_reason, null);
  assert.deepEqual(net.requests.map(u => u.pathname), ['/v4/sports/basketball_nba/events', '/v4/sports/basketball_nba/odds']);
  const odds = net.requests[1].searchParams;
  assert.deepEqual([odds.get('markets'), odds.get('regions'), odds.get('bookmakers'), odds.get('eventIds')], ['spreads', 'us', 'draftkings,fanduel,betmgm,betrivers', 'evt9']);
  const [finish] = service.args('gtl_nba_finish_lines_read');
  assert.deepEqual([finish.p_attempt, finish.p_lease, finish.p_error], [ATTEMPT, LEASE, null]);
  assert.deepEqual(finish.p_quota, { remaining: 400, used: 100, last: 1 });
  assert.equal(finish.p_lines.length, 1);
  assert.deepEqual([finish.p_lines[0].gameId, finish.p_lines[0].oddsEventId, finish.p_lines[0].qualified, finish.p_lines[0].line], ['NBA:balldontlie:9', 'evt9', true, -4]);
  assert.deepEqual(out.finish.p_detail, { gameDate: due.gameDate, attempt: 1, games: 1, stored: 1, qualified: 1, cost: 1, error: null, matched: 1 });
  assert.doesNotMatch(JSON.stringify(out.finish.p_detail), /-4|fixture-odds-key/, 'the run detail holds counts, never a line or a key');
});

test('a provider failure still finishes the read with its error and quota; a result SQL refuses is finished as invalid_result', async () => {
  const failing = network({ events: [providerEvent()], fail: { odds: true } });
  const service = fakeService({ job: 'lines', answers: { gtl_nba_lines_due: due, gtl_nba_begin_lines_read: ready,
    gtl_nba_finish_lines_read: args => ({ status: 'finished', error: args.p_error, cost: 0, stored: 0, qualified: 0 }) } });
  const out = await run({ job: 'lines', service, net: failing });
  assert.equal(out.finish.p_reason, 'provider_failed');
  const [finish] = service.args('gtl_nba_finish_lines_read');
  assert.equal(finish.p_error, 'ODDS_UNAVAILABLE'); assert.deepEqual(finish.p_lines, []);
  let first = true;
  const strict = fakeService({ job: 'lines', answers: { gtl_nba_lines_due: due, gtl_nba_begin_lines_read: ready,
    gtl_nba_finish_lines_read: () => { if (first) { first = false; throw Object.assign(new Error('x'), { code: 'GTL_NBA_INVALID' }); } return { status: 'finished', error: 'invalid_result', cost: 1, stored: 0, qualified: 0 }; } } });
  const refused = await run({ job: 'lines', service: strict, net: network({ events: [providerEvent()], odds: [pricedEvent()] }) });
  const finishes = strict.args('gtl_nba_finish_lines_read');
  assert.equal(finishes.length, 2);
  assert.deepEqual([finishes[1].p_error, finishes[1].p_lines], ['invalid_result', []], 'the lease and quota are still recorded');
  assert.equal(refused.finish.p_reason, 'provider_failed');
});

test('slate: a granted lease makes one BALLDONTLIE and one free /events request; a fresh cache makes no BALLDONTLIE request; a busy provider makes none', async () => {
  const leased = () => ({ games: null, observedAt: null, leaseToken: CACHE_LEASE, leasedAt: new Date().toISOString() });
  const publish = args => ({ games: args.p_games.length, inserted: args.p_games.length, updated: 0, linked: 0 });
  const granted = fakeService({ job: 'slate', answers: { gtl_nba_claim_games: leased, gtl_nba_finish_games: true, gtl_nba_publish_slate: publish } });
  const net = network();
  const out = await run({ job: 'slate', service: granted, net });
  assert.equal(out.finish.p_reason, null);
  assert.deepEqual(net.requests.map(u => `${u.hostname}${u.pathname}`), ['api.balldontlie.io/v1/games', 'api.the-odds-api.com/v4/sports/basketball_nba/events']);
  assert.equal(net.requests[0].searchParams.getAll('dates[]').length, 3, 'date - 1 to date + 1 in one request');
  assert.deepEqual(granted.args('gtl_nba_claim_games')[0].p_refresh, true);
  assert.deepEqual(granted.args('gtl_nba_finish_games')[0].p_token, CACHE_LEASE, 'the board cache gets the same observation');
  const [stored] = granted.args('gtl_nba_publish_slate');
  assert.deepEqual(Object.keys(stored.p_summary).sort(), ['events', 'eventsCost', 'eventsRead', 'linkedEvents', 'quota', 'unknownTeamEvents', 'unmatchedEvents']);
  assert.equal(stored.p_summary.eventsRead, true);

  const fresh = fakeService({ job: 'slate', answers: { gtl_nba_claim_games: { games: [], observedAt: new Date(Date.now() - 60_000).toISOString(), leaseToken: null, leasedAt: null }, gtl_nba_publish_slate: publish } });
  const cachedNet = network();
  const cached = await run({ job: 'slate', service: fresh, net: cachedNet });
  assert.equal(cached.finish.p_reason, null);
  assert.deepEqual(cachedNet.requests.map(u => u.hostname), ['api.the-odds-api.com'], 'the fresh range is reused');
  assert.equal(cached.finish.p_detail.requested, false);

  const busy = fakeService({ job: 'slate', answers: { gtl_nba_claim_games: { games: [], observedAt: new Date(Date.now() - 10 * 60_000).toISOString(), leaseToken: null, leasedAt: null } } });
  const busyNet = network();
  const blocked = await run({ job: 'slate', service: busy, net: busyNet });
  assert.equal(blocked.finish.p_reason, 'source_busy');
  assert.equal(busyNet.requests.length, 0, 'the cooldown or another lease holds: no request at all');
  assert.deepEqual(busy.args('gtl_nba_publish_slate'), []);

  const late = fakeService({ job: 'slate', answers: { gtl_nba_claim_games: { games: null, observedAt: null, leaseToken: CACHE_LEASE, leasedAt: new Date(Date.now() - 20_000).toISOString() }, gtl_nba_finish_games: false } });
  const lateNet = network();
  assert.equal((await run({ job: 'slate', service: late, net: lateNet })).finish.p_reason, 'source_busy');
  assert.equal(lateNet.requests.length, 0, 'a lease delivered too late is released unspent');
  assert.deepEqual(late.args('gtl_nba_finish_games')[0].p_games, null);
});

test('slate: a free /events read that reports a cost is recorded so SQL pauses NBA; a BALLDONTLIE failure publishes nothing', async () => {
  const leased = () => ({ games: null, observedAt: null, leaseToken: CACHE_LEASE, leasedAt: new Date().toISOString() });
  const costly = { requests: [], fetchImpl: async url => {
    const u = new URL(url); costly.requests.push(u);
    if (u.hostname === 'api.balldontlie.io') return Response.json({ data: [], meta: { next_cursor: null } });
    return new Response('[]', { headers: { 'content-type': 'application/json', 'x-requests-remaining': '399', 'x-requests-used': '101', 'x-requests-last': '1' } });
  } };
  const service = fakeService({ job: 'slate', answers: { gtl_nba_claim_games: leased, gtl_nba_finish_games: true, gtl_nba_publish_slate: { games: 0 } } });
  await run({ job: 'slate', service, net: costly });
  const [stored] = service.args('gtl_nba_publish_slate');
  assert.deepEqual([stored.p_summary.eventsRead, stored.p_summary.eventsCost, stored.p_summary.quota.last], [false, 1, 1]);

  const down = fakeService({ job: 'slate', answers: { gtl_nba_claim_games: leased, gtl_nba_finish_games: true } });
  const out = await run({ job: 'slate', service: down, net: network({ fail: { bdl: true } }) });
  assert.equal(out.finish.p_reason, 'source_unavailable');
  assert.deepEqual(down.args('gtl_nba_publish_slate'), []);
  assert.equal(down.args('gtl_nba_finish_games')[0].p_games, null, 'the lease is released and the cache kept');
});

test('the adapter calls only its own RPCs over https with the service role, and no provider error text escapes', async () => {
  assert.throws(() => createNbaJobsAdapter({ url: 'http://abc.supabase.co', serviceRoleKey: 'k' }), /Invalid NBA jobs configuration/);
  assert.throws(() => createNbaJobsAdapter({ url: 'https://abc.supabase.co/path', serviceRoleKey: 'k' }), /Invalid NBA jobs configuration/);
  const seen = [];
  const adapter = createNbaJobsAdapter({ url: 'https://abc.supabase.co', serviceRoleKey: 'service-fixture', fetchImpl: async (url, options) => {
    seen.push([String(url), options.headers.Authorization]);
    return new Response(JSON.stringify({ message: 'raw provider text' }), { status: 400 });
  } });
  await assert.rejects(adapter.rpc('gtl_dispatch_nba_jobs', {}), /Invalid NBA jobs operation/);
  await assert.rejects(adapter.rpc('gtl_nba_lines_due', {}), error => error.code === 'UNAVAILABLE' && !/raw provider/.test(error.message));
  assert.deepEqual(seen, [['https://abc.supabase.co/rest/v1/rpc/gtl_nba_lines_due', 'Bearer service-fixture']]);
});

test('the Deno entry wires the service role, the Odds API key and the BALLDONTLIE key, and nothing else', () => {
  const entry = readFileSync(new URL('../supabase/functions/gtl-nba-jobs/index.ts', import.meta.url), 'utf8');
  assert.match(entry, /from '\.\.\/\.\.\/\.\.\/cloud\/nba-jobs\.mjs'/);
  assert.deepEqual([...entry.matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map(m => m[1]).sort(), ['BALLDONTLIE_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'THE_ODDS_API_KEY']);
  assert.match(entry, /Deno\.serve\(createNbaJobsHandler\(/);
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config.split('[functions.gtl-nba-jobs]')[1]?.split(/^\[/m)[0] ?? '', /^verify_jwt = false$/m, 'the one-run capability is the credential');
});

test('the hand-run cron file is admin-only, creates both rows disabled, and never enables one', () => {
  const sql = readFileSync(new URL('../supabase/admin/nba_jobs_cron.sql', import.meta.url), 'utf8');
  assert.match(sql, /^-- ADMIN ONLY/);
  const code = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const job of NBA_JOBS) assert.match(code, new RegExp(`gtl_dispatch_nba_jobs\\('${job}'\\)`), job);
  assert.match(code, /insert into public\.gtl_nba_jobs_schedule\(job,enabled,endpoint\) values\s*\('slate',false,[^)]*\),\s*\('lines',false,[^)]*\)\s*on conflict \(job\) do nothing/);
  assert.doesNotMatch(code, /enabled\s*=\s*true/i, 'enabling stays a commented step');
  assert.doesNotMatch(code, /update public\.gtl_nba_budget/i);
  assert.match(code, /cron\.schedule\('gtl-nba-slate','0 16,17,22,23 \* \* \*'/, '9 AM and 3 PM Pacific in both offsets');
  assert.match(code, /cron\.schedule\('gtl-nba-lines','4-59\/5 \* \* \* \*'/);
});
