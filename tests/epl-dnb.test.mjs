// EPL Guess the Line, plan 2026-10-28-epl-moneyline.md Task 0: the server-side draw-no-bet gate. fetchEplDrawNoBet reads
// The Odds API's event-level `draw_no_bet` market for named events (1 credit each); the gtl-epl-jobs `dnb-check` job reads at
// most 3 upcoming fixtures once a day and records, per event, the books present and both prices; dnbGateOpen is the exit
// rule (>= 2 of the checked events priced by >= 2 of the 3 books in a successful dnb-check of the week; once open it stays open). Fake fetch and a fake
// service only: nothing touches the network or a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EplSourceError, fetchEplDrawNoBet } from '../cloud/epl-sources.mjs';
import { DNB_CHECK_EVENTS, DNB_CHECK_FLOOR, EPL_JOBS, EPL_SKIP_REASONS, createEplJobsHandler, createEplSources, dnbGateOpen, runEplJob } from '../cloud/epl-jobs.mjs';

const KEY = 'test-odds-key-123';
const quotaHeaders = (remaining = 400, used = 100, last = 1) => ({ 'content-type': 'application/json', 'x-requests-remaining': String(remaining), 'x-requests-used': String(used), 'x-requests-last': String(last) });

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    const u = new URL(url);
    calls.push({ url: u, options });
    const route = routes.find(r => r.match(u));
    if (!route) return new Response('{"message":"Event not found"}', { status: 404, headers: quotaHeaders(390, 110, 0) });
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return new Response(body, { status: route.status ?? 200, headers: route.headers ?? quotaHeaders() });
  };
  return { impl, calls };
}

const market = (home, away, homePrice, awayPrice, extra = []) => ({ key: 'draw_no_bet', outcomes: [{ name: home, price: homePrice }, { name: away, price: awayPrice }, ...extra] });
const book = (key, markets) => ({ key, title: key, markets });
const event = (id, home, away, bookmakers, commence = '2026-10-31T15:00:00Z') => ({ id, sport_key: 'soccer_epl', commence_time: commence, home_team: home, away_team: away, bookmakers });
const pathFor = id => `/v4/sports/soccer_epl/events/${id}/odds`;

test('fetchEplDrawNoBet asks each event for draw_no_bet from the three books and keeps both prices per book', async () => {
  const { impl, calls } = fakeFetch([
    { match: u => u.pathname === pathFor('e1'), headers: quotaHeaders(399, 101, 1), body: event('e1', 'Arsenal', 'Chelsea', [
      book('draftkings', [market('Arsenal', 'Chelsea', -150, 120)]), book('fanduel', [market('Arsenal', 'Chelsea', -145, 118)]),
      book('pinnacle', [market('Arsenal', 'Chelsea', -140, 115)]),
    ]) },
    { match: u => u.pathname === pathFor('e2'), headers: quotaHeaders(398, 102, 1), body: event('e2', 'Manchester City', 'AFC Bournemouth', [
      book('betmgm', [market('Manchester City', 'AFC Bournemouth', -400, 300)]),
    ]) },
  ]);
  const result = await fetchEplDrawNoBet({ apiKey: KEY, fetchImpl: impl, eventIds: ['e1', 'e2'] });
  assert.equal(calls.length, 2);
  const params = calls[0].url.searchParams;
  assert.equal(calls[0].url.origin, 'https://api.the-odds-api.com');
  assert.equal(params.get('markets'), 'draw_no_bet');
  assert.equal(params.get('regions'), 'us');
  assert.equal(params.get('bookmakers'), 'draftkings,fanduel,betmgm');
  assert.equal(params.get('oddsFormat'), 'american');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(result.events, [
    { eventId: 'e1', available: true, home: 'ARS', away: 'CHE', commenceTime: '2026-10-31T15:00:00.000Z', books: { draftkings: { ARS: -150, CHE: 120 }, fanduel: { ARS: -145, CHE: 118 } }, rejected: 0 },
    { eventId: 'e2', available: true, home: 'MNC', away: 'BOU', commenceTime: '2026-10-31T15:00:00.000Z', books: { betmgm: { MNC: -400, BOU: 300 } }, rejected: 0 },
  ]);
  assert.deepEqual(result.quota, { remaining: 398, used: 102, last: 1 }, 'the newest quota the provider reported');
});

test('fetchEplDrawNoBet rejects a 3-way price under the draw_no_bet key and a price with |p| < 100 (Review Focus 5)', async () => {
  const { impl } = fakeFetch([{ match: u => u.pathname === pathFor('e1'), body: event('e1', 'Arsenal', 'Chelsea', [
    book('draftkings', [market('Arsenal', 'Chelsea', -150, 320, [{ name: 'Draw', price: 260 }])]),
    book('fanduel', [market('Arsenal', 'Chelsea', -150, 99)]),
    book('betmgm', [{ key: 'draw_no_bet', outcomes: [{ name: 'Arsenal', price: -150 }, { name: 'Draw', price: 120 }] }]),
  ]) }]);
  const { events } = await fetchEplDrawNoBet({ apiKey: KEY, fetchImpl: impl, eventIds: ['e1'] });
  assert.deepEqual(events[0].books, {});
  assert.equal(events[0].rejected, 3);
  assert.equal(events[0].available, true);
});

test('fetchEplDrawNoBet marks an event the provider cannot price as unavailable, and stops with a coded error on auth', async () => {
  const missing = fakeFetch([]);
  const { events, quota } = await fetchEplDrawNoBet({ apiKey: KEY, fetchImpl: missing.impl, eventIds: ['gone'] });
  assert.deepEqual(events, [{ eventId: 'gone', available: false, books: {}, rejected: 0 }]);
  assert.equal(quota.remaining, 390);
  const wrong = fakeFetch([{ match: () => true, body: event('other', 'Arsenal', 'Chelsea', []) }]);
  assert.equal((await fetchEplDrawNoBet({ apiKey: KEY, fetchImpl: wrong.impl, eventIds: ['e1'] })).events[0].available, false, 'a reply for another event is not this event');
  const denied = fakeFetch([{ match: () => true, status: 401, body: { message: `bad key ${KEY}` }, headers: quotaHeaders(10, 490, 0) }]);
  await assert.rejects(fetchEplDrawNoBet({ apiKey: KEY, fetchImpl: denied.impl, eventIds: ['e1', 'e2'] }), err => {
    assert.ok(err instanceof EplSourceError); assert.equal(err.code, 'EPL_SOURCE_AUTH'); assert.equal(err.quota.remaining, 10);
    assert.doesNotMatch(`${err.message} ${JSON.stringify(err)}`, new RegExp(KEY));
    return true;
  });
  assert.equal(denied.calls.length, 1, 'no further event is bought after the key is refused');
});

test('fetchEplDrawNoBet refuses a missing key and bad, duplicate or too many event ids before any request', async () => {
  const { impl, calls } = fakeFetch([]);
  for (const eventIds of [undefined, [], ['a/b'], ['e1', 'e1'], Array.from({ length: 21 }, (_, i) => `e${i}`)])
    await assert.rejects(fetchEplDrawNoBet({ apiKey: KEY, fetchImpl: impl, eventIds }), err => err.code === 'EPL_SOURCE_CONFIG');
  await assert.rejects(fetchEplDrawNoBet({ apiKey: '', fetchImpl: impl, eventIds: ['e1'] }), err => err.code === 'EPL_SOURCE_CONFIG');
  assert.equal(calls.length, 0);
});

test('createEplSources exposes drawNoBet with the worker key', async () => {
  const { impl, calls } = fakeFetch([]);
  await createEplSources({ apiKey: KEY, fetchImpl: impl }).drawNoBet({ eventIds: ['e1'] });
  assert.equal(calls[0].url.pathname, pathFor('e1'));
  assert.equal(calls[0].url.searchParams.get('apiKey'), KEY);
});

// ---- the dnb-check job ----
const RUN = '11111111-1111-4111-8111-111111111111', CLAIM = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-10-30T11:23:00Z');
const fixture = (eventId, home, away, commenceTime, status = 'scheduled') => ({ eventId, home, away, commenceTime, status, homeGoals: null, awayGoals: null });
const FIXTURES = [
  fixture('e4', 'ARS', 'EVE', '2026-11-01T14:00:00.000Z'), fixture('e1', 'MNC', 'BOU', '2026-10-31T12:30:00.000Z'),
  fixture('e0', 'LIV', 'AVL', '2026-10-30T10:00:00.000Z'), fixture('e2', 'TOT', 'CHE', '2026-10-31T15:00:00.000Z'),
  fixture('e9', 'BRE', 'FUL', '2026-10-31T14:00:00.000Z', 'postponed'), fixture('e3', 'NEW', 'CRY', '2026-10-31T17:30:00.000Z'),
];
const state = (overrides = {}) => ({ week: { season: 2026, week: 9, status: 'resolved', firstKickoff: '2026-10-30T10:00:00.000Z' }, fixtures: FIXTURES, budget: { remaining: 300, paused: false }, ...overrides });

function fakeService(s = state()) {
  const calls = [];
  return {
    calls, args: name => calls.filter(([n]) => n === name).map(([, a]) => a),
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'gtl_epl_jobs_state') return s;
      if (name === 'gtl_epl_reserve_credits') { if (s.budget.remaining - args.p_cost < 50) return { ok: false }; s.budget.remaining -= args.p_cost; return { ok: true, remaining: s.budget.remaining }; }
      if (name === 'gtl_epl_record_quota') return { remaining: args.p_remaining };
      if (name === 'gtl_epl_claim_job') return { replay: false, runId: RUN, claim: CLAIM, job: 'dnb-check' };
      if (name === 'gtl_epl_complete_job') return { runId: RUN, status: args.p_reason === null ? 'succeeded' : EPL_SKIP_REASONS.includes(args.p_reason) ? 'skipped' : 'failed', reason: args.p_reason };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}
const priced = (home, away, books) => Object.fromEntries(books.map(([key, h, a]) => [key, { [home]: h, [away]: a }]));
function fakeSources(reply) {
  const calls = [];
  return { calls, async drawNoBet(args) { calls.push(args); if (reply instanceof Error) throw reply; return typeof reply === 'function' ? reply(args) : reply; } };
}
const dnbReply = events => ({ quota: { remaining: 297, used: 203, last: 1 },
  events: events.map(e => ({ commenceTime: FIXTURES.find(f => f.eventId === e.eventId)?.commenceTime, ...e })) });
const job = (service, sources, now = NOW) => runEplJob({ job: 'dnb-check', service, sources, push: {}, now, run: { p_run: RUN, p_claim: CLAIM } });

test('dnb-check is a worker job with the gate constants of the plan', () => {
  assert.ok(EPL_JOBS.includes('dnb-check'));
  assert.equal(DNB_CHECK_EVENTS, 3);
  assert.equal(DNB_CHECK_FLOOR, 60);
});

test('dnb-check reads the next 3 scheduled fixtures, reserves one credit each, and records books and both prices per event', async () => {
  const service = fakeService();
  const sources = fakeSources(dnbReply([
    { eventId: 'e1', available: true, home: 'MNC', away: 'BOU', books: priced('MNC', 'BOU', [['draftkings', -400, 300], ['fanduel', -390, 290], ['betmgm', -410, 310]]), rejected: 0 },
    { eventId: 'e2', available: true, home: 'TOT', away: 'CHE', books: priced('TOT', 'CHE', [['draftkings', 105, -125], ['betmgm', 100, -120]]), rejected: 1 },
    { eventId: 'e3', available: true, home: 'NEW', away: 'CRY', books: priced('NEW', 'CRY', [['fanduel', -160, 130]]), rejected: 0 },
  ]));
  const out = await job(service, sources);
  assert.equal(out.reason, null);
  assert.deepEqual(sources.calls, [{ eventIds: ['e1', 'e2', 'e3'] }], 'kickoff order; past and postponed fixtures are skipped');
  assert.deepEqual(service.args('gtl_epl_reserve_credits').map(a => a.p_cost), [3]);
  assert.equal(service.args('gtl_epl_record_quota')[0].p_remaining, 297);
  assert.deepEqual(out.detail, {
    season: 2026, week: 9, dnbAvailable: true, checked: 3, priced: 2, remaining: 297,
    events: [
      { eventId: 'e1', books: { draftkings: { MNC: -400, BOU: 300 }, fanduel: { MNC: -390, BOU: 290 }, betmgm: { MNC: -410, BOU: 310 } } },
      { eventId: 'e2', books: { draftkings: { TOT: 105, CHE: -125 }, betmgm: { TOT: 100, CHE: -120 } } },
      { eventId: 'e3', books: { fanduel: { NEW: -160, CRY: 130 } } },
    ],
  });
  assert.ok(Buffer.byteLength(JSON.stringify(out.detail)) < 4096, 'within gtl_epl_complete_job detail limit');
  assert.equal(dnbGateOpen({ status: 'succeeded', reason: null, detail: out.detail }, { season: 2026, week: 9 }), true);
});

test('dnb-check succeeds with dnbAvailable false when fewer than 2 events have 2 books', async () => {
  const sources = fakeSources(dnbReply([
    { eventId: 'e1', available: true, home: 'MNC', away: 'BOU', books: priced('MNC', 'BOU', [['draftkings', -400, 300], ['fanduel', -390, 290]]), rejected: 0 },
    { eventId: 'e2', available: false, books: {}, rejected: 0 },
    // A reply whose clubs differ from the stored fixture is not that fixture's price.
    { eventId: 'e3', available: true, home: 'CRY', away: 'NEW', books: priced('CRY', 'NEW', [['fanduel', 130, -160], ['betmgm', 125, -150]]), rejected: 0 },
  ]));
  const out = await job(fakeService(), sources);
  assert.equal(out.reason, null);
  assert.equal(out.detail.dnbAvailable, false);
  assert.equal(out.detail.priced, 1);
  assert.deepEqual(out.detail.events.map(e => Object.keys(e.books).length), [2, 0, 0]);
  assert.equal(dnbGateOpen({ status: 'succeeded', reason: null, detail: out.detail }), false);
});

test('dnb-check refuses under 60 remaining credits, with no budget, or with nothing upcoming, and buys nothing', async () => {
  for (const [s, reason] of [
    [state({ budget: { remaining: 59, paused: false } }), 'budget_guard'],
    [state({ budget: { remaining: 100, paused: true } }), 'budget_guard'],
    [state({ budget: { remaining: null, paused: false } }), 'budget_unknown'],
    [state({ fixtures: [fixture('e0', 'LIV', 'AVL', '2026-10-30T10:00:00.000Z')] }), 'no_fixtures'],
    [state({ week: null }), 'no_week'],
  ]) {
    const service = fakeService(s), sources = fakeSources(dnbReply([]));
    const out = await job(service, sources);
    assert.equal(out.reason, reason);
    assert.equal(sources.calls.length, 0, reason);
    assert.equal(service.args('gtl_epl_reserve_credits').length, 0, reason);
  }
  // At 60 it runs (60 - 3 = 57 keeps the shared 50-credit reserve).
  const ok = await job(fakeService(state({ budget: { remaining: 60, paused: false } })), fakeSources(dnbReply([])));
  assert.equal(ok.reason, null);
});

test('dnb-check does not count a price for an event whose provider kickoff differs from the stored fixture', async () => {
  const sources = fakeSources(dnbReply([
    { eventId: 'e1', available: true, home: 'MNC', away: 'BOU', commenceTime: '2026-10-30T10:00:00.000Z',
      books: priced('MNC', 'BOU', [['draftkings', -400, 300], ['fanduel', -390, 290]]) },
    { eventId: 'e2', available: true, home: 'TOT', away: 'CHE', commenceTime: '2026-11-07T15:00:00.000Z',
      books: priced('TOT', 'CHE', [['draftkings', 105, -125], ['fanduel', 100, -120]]) },
  ]));
  const out = await job(fakeService(), sources);
  assert.equal(out.reason, null);
  assert.equal(out.detail.priced, 0);
  assert.equal(out.detail.dnbAvailable, false, 'past or rescheduled prices do not establish this week\'s gate');
});

test('dnb-check with one fixture left buys nothing and skips as not_due, so it writes no gate verdict', async () => {
  // The Monday 11:23 UTC run of a Friday-to-Monday round: only Monday's match is still ahead.
  const MONDAY = Date.parse('2026-11-02T11:23:00Z');
  const s = state({ fixtures: [...FIXTURES, fixture('e5', 'WHU', 'BHA', '2026-11-02T20:00:00.000Z')] });
  const service = fakeService(s), sources = fakeSources(dnbReply([]));
  const out = await job(service, sources, MONDAY);
  assert.equal(out.reason, 'not_due');
  assert.ok(EPL_SKIP_REASONS.includes('not_due'));
  assert.equal(sources.calls.length, 0);
  assert.equal(service.args('gtl_epl_reserve_credits').length, 0);
});

test('dnbGateOpen over the run history: once a week has opened it stays open through later skips and late-week checks', () => {
  const two = { draftkings: { A: -110, B: -110 }, fanduel: { A: -105, B: -115 } };
  const opened = { status: 'succeeded', reason: null, finished_at: '2026-10-30T11:23:05Z',
    detail: { season: 2026, week: 9, dnbAvailable: true, events: [{ eventId: 'e1', books: two }, { eventId: 'e2', books: two }] } };
  const lateFalse = { status: 'succeeded', reason: null, finished_at: '2026-11-02T11:23:05Z',
    detail: { season: 2026, week: 9, dnbAvailable: false, events: [{ eventId: 'e5', books: two }] } };
  const skipped = { status: 'skipped', reason: 'budget_guard', finished_at: '2026-11-01T11:23:05Z', detail: {} };
  const otherWeek = { status: 'succeeded', reason: null, finished_at: '2026-10-23T11:23:05Z',
    detail: { season: 2026, week: 8, dnbAvailable: true, events: opened.detail.events } };
  const week9 = { season: 2026, week: 9 };
  assert.equal(dnbGateOpen([lateFalse, skipped, opened], week9), true, 'newest first');
  assert.equal(dnbGateOpen([opened, skipped, lateFalse], week9), true, 'any order');
  assert.equal(dnbGateOpen([skipped, lateFalse], week9), false, 'never opened');
  assert.equal(dnbGateOpen([otherWeek, skipped], week9), false, 'another week does not open this one');
  assert.equal(dnbGateOpen([], week9), false);
  assert.equal(dnbGateOpen([opened], { season: 2026, week: 10 }), false);
});

test('dnb-check fails as source_unavailable when the provider stops, recording its quota', async () => {
  const error = Object.assign(new Error('down'), { quota: { remaining: 280, used: 220, last: 0 } });
  const service = fakeService();
  const out = await job(service, fakeSources(error));
  assert.equal(out.reason, 'source_unavailable');
  assert.equal(service.args('gtl_epl_record_quota')[0].p_remaining, 280);
  assert.equal(dnbGateOpen({ status: 'failed', reason: 'source_unavailable', detail: {} }), false);
});

test('dnb-check through the handler: a claimed run completes with the detail', async () => {
  const service = fakeService();
  const handler = createEplJobsHandler({ service, sources: fakeSources(dnbReply([])), push: {}, clock: () => NOW });
  const response = await handler(new Request('https://x.supabase.co/functions/v1/gtl-epl-jobs', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${'a'.repeat(64)}` }, body: JSON.stringify({ runId: RUN }) }));
  assert.equal((await response.json()).status, 'succeeded');
  const complete = service.args('gtl_epl_complete_job')[0];
  assert.equal(complete.p_reason, null);
  assert.equal(complete.p_detail.dnbAvailable, false);
});

test('dnbGateOpen: a successful check of that week, with >= 2 events priced by >= 2 books, opens Guess the Line', () => {
  const two = { draftkings: { A: -110, B: -110 }, fanduel: { A: -105, B: -115 } };
  const detail = { season: 2026, week: 9, dnbAvailable: true, events: [{ eventId: 'e1', books: two }, { eventId: 'e2', books: two }, { eventId: 'e3', books: {} }] };
  const ok = { status: 'succeeded', reason: null, detail };
  assert.equal(dnbGateOpen(ok), true);
  assert.equal(dnbGateOpen(ok, { season: 2026, week: 9 }), true);
  assert.equal(dnbGateOpen(ok, { season: 2026, week: 10 }), false, 'a check of another week does not open this one');
  assert.equal(dnbGateOpen(null), false);
  assert.equal(dnbGateOpen({ ...ok, status: 'skipped', reason: 'budget_guard' }), false);
  assert.equal(dnbGateOpen({ ...ok, detail: { ...detail, dnbAvailable: false } }), false);
  assert.equal(dnbGateOpen({ ...ok, detail: { ...detail, events: detail.events.slice(1) } }), false, 'the flag is not trusted over the recorded books');
  assert.equal(dnbGateOpen({ ...ok, detail: { ...detail, events: [detail.events[0], detail.events[0]] } }), false, 'two rows of one event do not qualify as two events');
  assert.equal(dnbGateOpen({ ...ok, detail: { ...detail, events: [{ books: two }, { books: two }] } }), false, 'unnamed events cannot open the gate');
  assert.equal(dnbGateOpen({ ...ok, detail: { ...detail, events: [{ eventId: 'e1', books: two }, { eventId: 'e2', books: { draftkings: two.draftkings, pinnacle: two.fanduel } }] } }), false, 'only the three books count');
});

test('the cron file adds the dnb-check row disabled and dispatches it once a day', () => {
  const sql = readFileSync(new URL('../supabase/admin/epl_jobs_cron.sql', import.meta.url), 'utf8');
  const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.match(code, /insert into public\.gtl_epl_jobs_schedule\(job,enabled,endpoint\) values\s*\('dnb-check',false,[^;]*on conflict\s*\(job\)\s*do nothing/is);
  const [, schedule] = /cron\.schedule\('gtl-epl-dnb-check','([^']+)'/.exec(code) ?? [];
  assert.match(schedule ?? '', /^\d{1,2} \d{1,2} \* \* \*$/, 'one fixed minute and hour: once a day');
  assert.doesNotMatch(code, /enabled\s*=\s*true/i);
});
