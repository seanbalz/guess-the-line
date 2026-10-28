// The gtl-epl-jobs worker (plan 2026-10-28-epl-pick-a-team.md, Task 5): one claimed run per job (snapshot, fixtures, resolve,
// settle, nudge) over a fake service, fake sources and a fake push channel. No network, no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EPL_JOBS, EPL_JOBS_RPCS, EPL_RESERVE_CREDITS, EPL_SKIP_REASONS, EPL_FAIL_REASONS, createEplJobsAdapter, createEplJobsHandler, nudgePayload, snapshotLabels } from '../cloud/epl-jobs.mjs';

const NEMO = '865667912365666304', CULLEN = '1259267898757611520', ADAM = '719745569895018496', SEAN = '473955676301815808';
const EVAN = '719658248843632640', MARK = '1257180071064510465', STEVEN = '702644837370929152', DARIN = '1395236217460633600';
const ORDER = [NEMO, CULLEN, ADAM, SEAN, EVAN, MARK, STEVEN, DARIN];
const RUN = '11111111-1111-4111-8111-111111111111', CLAIM = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'a'.repeat(64);
const KICKOFF = '2026-10-31T12:30:00.000Z', START = '2026-10-30T00:00:00.000Z', END = '2026-11-04T00:00:00.000Z';
const at = iso => () => Date.parse(iso);

const fixture = (eventId, home, away, commenceTime = KICKOFF, extra = {}) => ({ eventId, home, away, commenceTime, status: 'scheduled', homeGoals: null, awayGoals: null, ...extra });
const FIXTURES = [
  fixture('e1', 'MNC', 'BOU'), fixture('e2', 'AVL', 'LIV', '2026-10-31T15:00:00.000Z'), fixture('e3', 'TOT', 'CHE', '2026-10-31T15:00:00.000Z'),
  fixture('e4', 'ARS', 'EVE', '2026-11-01T14:00:00.000Z'), fixture('e5', 'BRE', 'FUL', '2026-11-01T14:00:00.000Z'), fixture('e6', 'NEW', 'CRY', '2026-11-01T16:30:00.000Z'),
  fixture('e7', 'MUN', 'NFO', '2026-11-02T20:00:00.000Z'), fixture('e8', 'SUN', 'LEE', '2026-11-02T20:00:00.000Z'),
];
const SEVEN = [[NEMO, 'MNC'], [CULLEN, 'AVL'], [ADAM, 'LIV'], [SEAN, 'TOT'], [EVAN, 'ARS'], [MARK, 'BRE'], [STEVEN, 'NEW']]
  .map(([ownerId, club], i) => ({ ownerId, club, source: 'seeded', final: i < 6 }));

function baseState(overrides = {}) {
  return {
    week: { season: 2026, week: 9, windowStart: START, windowEnd: END, firstKickoff: KICKOFF, pickOrder: ORDER, status: 'open' },
    picks: SEVEN, queues: {}, fixtures: FIXTURES, prices: [], snapshots: ['after-mw08'], bonusTotals: {},
    managers: ORDER.map(ownerId => ({ ownerId, name: ownerId, subscribed: ownerId === DARIN })),
    budget: { remaining: 400, paused: false },
    ...overrides,
  };
}

/** A fake worker service: claims the run as `job`, serves `state`, records every RPC. */
function fakeService({ job, state = baseState(), snapshots = {}, replay = false, errors = {} }) {
  const calls = [];
  const nudged = new Set();
  const service = {
    calls, state,
    names: () => calls.map(([name]) => name),
    args: name => calls.filter(([n]) => n === name).map(([, a]) => a),
    async rpc(name, args) {
      calls.push([name, args]);
      if (!EPL_JOBS_RPCS.includes(name)) throw new Error(`rpc not allowed: ${name}`);
      if (Object.hasOwn(errors, name)) { const e = new Error('x'); e.code = errors[name]; throw e; }
      switch (name) {
        case 'gtl_epl_claim_job': return replay ? { replay: true, runId: RUN, job, status: 'succeeded', reason: null } : { replay: false, runId: RUN, claim: CLAIM, job, now: new Date().toISOString() };
        case 'gtl_epl_complete_job': {
          const status = args.p_reason === null ? 'succeeded' : EPL_SKIP_REASONS.includes(args.p_reason) ? 'skipped' : 'failed';
          return { runId: RUN, status, reason: args.p_reason };
        }
        case 'gtl_epl_jobs_state': return service.state;
        case 'gtl_epl_reserve_credits': {
          const b = service.state.budget;
          if (b.remaining === null || b.paused || b.remaining - args.p_cost < 50) return { ok: false, remaining: b.remaining };
          b.remaining -= args.p_cost; return { ok: true, remaining: b.remaining };
        }
        case 'gtl_epl_record_quota': {
          if (args.p_remaining !== null) service.state.budget.remaining = Math.min(service.state.budget.remaining ?? Infinity, args.p_remaining);
          return { remaining: service.state.budget.remaining };
        }
        case 'gtl_epl_read_snapshots': return Object.fromEntries(args.p_labels.filter(l => snapshots[l]).map(l => [l, snapshots[l]]));
        case 'gtl_epl_mark_nudge': {
          if (nudged.has(args.p_key)) return { recorded: false, subscriptions: [] };
          nudged.add(args.p_key);
          return { recorded: true, subscriptions: [{ endpoint: 'https://web.push.apple.com/abc', p256dh: 'B'.padEnd(87, 'x'), auth: 'y'.repeat(22) }] };
        }
        case 'gtl_epl_resolve_week': {
          const added = args.p_rows.filter(r => !service.state.picks.some(p => p.ownerId === r.owner_id));
          service.state = { ...service.state, week: { ...service.state.week, status: 'resolved' },
            picks: [...service.state.picks.map(p => ({ ...p, final: true })), ...added.map(r => ({ ownerId: r.owner_id, club: r.club, source: r.source, final: true }))] };
          return { season: args.p_season, week: args.p_week, added: added.length, status: 'resolved' };
        }
        case 'gtl_epl_settle_week': return { season: args.p_season, week: args.p_week, awarded: args.p_awards.length, nextOpened: !!args.p_next };
        case 'gtl_epl_upsert_fixtures': case 'gtl_epl_upsert_prices': return args.p_rows.length;
        case 'gtl_epl_save_snapshot': return true;
        case 'gtl_epl_set_week_window': return { season: args.p_season, week: args.p_week, windowStart: args.p_window_start, windowEnd: args.p_window_end, firstKickoff: args.p_first_kickoff };
        default: throw new Error(`unhandled ${name}`);
      }
    },
  };
  return service;
}

function fakeSources({ events = [], scores = [], quota = { remaining: 399, used: 101, last: 1 }, scoresQuota = { remaining: 397, used: 103, last: 2 }, fail = {} } = {}) {
  const calls = [];
  return {
    calls,
    async sleeper(args) { calls.push(['sleeper', args]); if (fail.sleeper) throw new Error('down'); return { capturedAt: '2026-11-04T00:05:00Z', label: args.label, sha256: { rosters: 'c'.repeat(64) }, payload: { label: args.label, rosters: [] } }; },
    async odds() { calls.push(['odds']); if (fail.odds) { const e = new Error('down'); e.quota = quota; throw e; } return { events, quota, unknown: 0 }; },
    async scores({ onQuota } = {}) { calls.push(['scores']); onQuota?.(scoresQuota); return scores; },
  };
}

function fakePush({ ready = true } = {}) {
  const sent = [];
  return { sent, async ready() { if (!ready) throw new Error('no keys'); }, async send(args) { sent.push(args); return { outcome: 'ok' }; } };
}

const request = (body = { runId: RUN }, token = TOKEN) => new Request('https://x.supabase.co/functions/v1/gtl-epl-jobs', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

async function run({ job, state, snapshots, sources = fakeSources(), push = fakePush(), clock, service } = {}) {
  service ??= fakeService({ job, state, snapshots });
  const handler = createEplJobsHandler({ service, sources, push, clock });
  const response = await handler(request());
  return { service, sources, push, response, body: await response.json(), complete: service.args('gtl_epl_complete_job').at(-1) };
}

test('the worker lists its five jobs and only its own RPCs', () => {
  assert.deepEqual(EPL_JOBS, ['snapshot', 'fixtures', 'resolve', 'settle', 'nudge']);
  assert.equal(EPL_RESERVE_CREDITS, 50);
  for (const name of ['gtl_epl_claim_job', 'gtl_epl_complete_job', 'gtl_epl_jobs_state', 'gtl_epl_resolve_week', 'gtl_epl_settle_week', 'gtl_epl_upsert_fixtures', 'gtl_epl_upsert_prices', 'gtl_epl_save_snapshot'])
    assert.ok(EPL_JOBS_RPCS.includes(name), name);
  for (const name of ['gtl_epl_save_pick', 'gtl_epl_link_manager', 'gtl_epl_seed_week', 'gtl_epl_dispatch_jobs']) assert.ok(!EPL_JOBS_RPCS.includes(name), name);
  assert.ok(EPL_SKIP_REASONS.every(r => !EPL_FAIL_REASONS.includes(r)));
});

test('the request must be POST, carry a 64-hex capability and exactly { runId }', async () => {
  const service = fakeService({ job: 'resolve' });
  const handler = createEplJobsHandler({ service, sources: fakeSources(), push: fakePush(), clock: at('2026-10-31T13:00:00Z') });
  assert.equal((await handler(new Request('https://x/', { method: 'GET' }))).status, 405);
  assert.equal((await handler(request({ runId: RUN }, 'nope'))).status, 401);
  assert.equal((await handler(request({ runId: RUN, extra: 1 }))).status, 400);
  assert.equal((await handler(new Request('https://x/?a=1', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } }))).status, 400);
  assert.deepEqual(service.calls, [], 'nothing is claimed before the request checks pass');
  const authFail = fakeService({ job: 'resolve', errors: { gtl_epl_claim_job: 'GTL_SCHEDULE_AUTH' } });
  assert.equal((await createEplJobsHandler({ service: authFail, sources: fakeSources(), push: fakePush() })(request())).status, 401);
  assert.deepEqual(authFail.calls[0], ['gtl_epl_claim_job', { p_token: TOKEN, p_run: RUN }]);
});

test('a replayed run returns its recorded status and runs nothing', async () => {
  const service = fakeService({ job: 'resolve', replay: true });
  const { body } = await run({ service, clock: at('2026-10-31T13:00:00Z') });
  assert.deepEqual(body, { runId: RUN, job: 'resolve', status: 'succeeded', reason: null });
  assert.deepEqual(service.names(), ['gtl_epl_claim_job']);
});

test('fixtures: skipped when the shared quota would drop below the 50-credit reserve, without calling the provider', async () => {
  const state = baseState({ budget: { remaining: 50, paused: false } });
  const { body, sources, service } = await run({ job: 'fixtures', state, clock: at('2026-10-30T06:00:00Z') });
  assert.equal(body.status, 'skipped'); assert.equal(body.reason, 'budget_guard');
  assert.deepEqual(sources.calls, []);
  assert.ok(!service.names().includes('gtl_epl_reserve_credits'), 'the precheck already refuses');
  const unknown = await run({ job: 'fixtures', state: baseState({ budget: { remaining: null, paused: false } }), clock: at('2026-10-30T06:00:00Z') });
  assert.equal(unknown.body.reason, 'budget_unknown'); assert.deepEqual(unknown.sources.calls, []);
});

test('fixtures: a fetch that leaves x-requests-remaining at 50 makes the next run skip', async () => {
  const events = [{ eventId: 'o1', home: 'TOT', away: 'CHE', commenceTime: '2026-10-31T12:30:00.000Z', h2h: { TOT: -120, CHE: 300 } }];
  const service = fakeService({ job: 'fixtures', state: baseState({ budget: { remaining: 60, paused: false } }) });
  const sources = fakeSources({ events, quota: { remaining: 50, used: 450, last: 1 } });
  const first = await run({ job: 'fixtures', service, sources, clock: at('2026-10-30T06:00:00Z') });
  assert.equal(first.body.status, 'succeeded');
  assert.deepEqual(service.args('gtl_epl_reserve_credits'), [{ p_run: RUN, p_claim: CLAIM, p_cost: 1 }]);
  assert.deepEqual(service.args('gtl_epl_record_quota'), [{ p_run: RUN, p_claim: CLAIM, p_remaining: 50, p_used: 450, p_last: 1 }]);
  const second = await run({ job: 'fixtures', service, sources, clock: at('2026-10-30T18:00:00Z') });
  assert.equal(second.body.reason, 'budget_guard');
  assert.equal(sources.calls.filter(([n]) => n === 'odds').length, 1, 'only the first run reached the provider');
});

test('fixtures: stores the window events and their median h2h prices as club codes, and moves the deadline only earlier', async () => {
  const events = [
    { eventId: 'o1', home: 'TOT', away: 'CHE', commenceTime: '2026-10-31T11:00:00.000Z', h2h: { TOT: -120, CHE: 300 } },
    { eventId: 'o2', home: 'ARS', away: 'EVE', commenceTime: '2026-11-01T14:00:00.000Z', h2h: { ARS: -250 } },
    { eventId: 'o3', home: 'LIV', away: 'MUN', commenceTime: '2026-11-07T15:00:00.000Z', h2h: { LIV: -150, MUN: 380 } },
  ];
  const { body, service } = await run({ job: 'fixtures', state: baseState({ fixtures: [] }), sources: fakeSources({ events }), clock: at('2026-10-30T06:00:00Z') });
  assert.equal(body.status, 'succeeded');
  const [rows] = service.args('gtl_epl_upsert_fixtures').map(a => a.p_rows);
  assert.deepEqual(rows, [
    { event_id: 'o1', season: 2026, week: 9, home: 'TOT', away: 'CHE', commence_time: '2026-10-31T11:00:00.000Z', status: 'scheduled', home_goals: null, away_goals: null },
    { event_id: 'o2', season: 2026, week: 9, home: 'ARS', away: 'EVE', commence_time: '2026-11-01T14:00:00.000Z', status: 'scheduled', home_goals: null, away_goals: null },
  ], 'only events with commence_time in [window_start, window_end)');
  const [prices] = service.args('gtl_epl_upsert_prices').map(a => a.p_rows);
  assert.deepEqual(prices.map(p => [p.event_id, p.club, p.market, p.price]), [['o1', 'TOT', 'h2h', -120], ['o1', 'CHE', 'h2h', 300], ['o2', 'ARS', 'h2h', -250]]);
  assert.ok(prices.every(p => p.observed_at === '2026-10-30T06:00:00.000Z'));
  assert.deepEqual(service.args('gtl_epl_set_week_window'), [{ p_season: 2026, p_week: 9, p_window_start: START, p_window_end: END, p_first_kickoff: '2026-10-31T11:00:00.000Z' }],
    'the first kickoff moves to the earliest window event (earlier than stored, still ahead)');
  const later = await run({ job: 'fixtures', state: baseState({ fixtures: [] }), sources: fakeSources({ events: [{ ...events[1] }] }), clock: at('2026-10-30T06:00:00Z') });
  assert.deepEqual(later.service.args('gtl_epl_set_week_window'), [], 'a later first event never extends the deadline');
});

test('fixtures: a stored week event the provider now lists outside the window is marked postponed', async () => {
  const events = [{ eventId: 'e8', home: 'SUN', away: 'LEE', commenceTime: '2026-12-02T20:00:00.000Z', h2h: { SUN: 150 } }];
  const { service } = await run({ job: 'fixtures', sources: fakeSources({ events }), clock: at('2026-10-30T06:00:00Z') });
  const [rows] = service.args('gtl_epl_upsert_fixtures').map(a => a.p_rows);
  assert.deepEqual(rows, [{ event_id: 'e8', season: 2026, week: 9, home: 'SUN', away: 'LEE', commence_time: '2026-12-02T20:00:00.000Z', status: 'postponed', home_goals: null, away_goals: null }]);
});

test('fixtures: does nothing after the first kickoff or for a closed week', async () => {
  const after = await run({ job: 'fixtures', clock: at('2026-10-31T12:30:00Z') });
  assert.equal(after.body.reason, 'not_due'); assert.deepEqual(after.sources.calls, []);
  const closed = await run({ job: 'fixtures', state: baseState({ week: { ...baseState().week, status: 'resolved' } }), clock: at('2026-10-30T06:00:00Z') });
  assert.equal(closed.body.reason, 'not_open');
  const none = await run({ job: 'fixtures', state: baseState({ week: null }), clock: at('2026-10-30T06:00:00Z') });
  assert.equal(none.body.reason, 'no_week');
});

test('resolve: waits for the first kickoff, then fills in queue, auto and none picks once; a rerun writes nothing (Review Focus 3)', async () => {
  const before = await run({ job: 'resolve', clock: at('2026-10-31T12:29:59Z') });
  assert.equal(before.body.reason, 'not_due');
  assert.ok(!before.service.names().includes('gtl_epl_resolve_week'));

  const state = baseState({ picks: SEVEN.slice(0, 5), queues: { [MARK]: ['MNC', 'BRE'] },
    prices: [{ eventId: 'e6', club: 'NEW', market: 'h2h', price: -200 }, { eventId: 'e7', club: 'MUN', market: 'h2h', price: -180 }, { eventId: 'e6', club: 'CRY', market: 'draw_no_bet', price: -105 }] });
  // Evan (5th) picked; Mark (6th) is on the clock with a queue: MNC is taken, so BRE. Steven has no queue -> the shortest 2-way
  // price (CRY draw_no_bet -105) beats every 3-way price. Darin -> the shortest remaining 3-way price (NEW -200).
  const service = fakeService({ job: 'resolve', state });
  const first = await run({ job: 'resolve', service, clock: at('2026-10-31T12:30:00Z') });
  assert.equal(first.body.status, 'succeeded');
  const expected = [{ owner_id: MARK, club: 'BRE', source: 'queue' }, { owner_id: STEVEN, club: 'CRY', source: 'auto' }, { owner_id: DARIN, club: 'NEW', source: 'auto' }];
  assert.deepEqual(service.args('gtl_epl_resolve_week'), [{ p_season: 2026, p_week: 9, p_rows: expected }]);
  const finalPicks = JSON.stringify(service.state.picks);
  const second = await run({ job: 'resolve', service, clock: at('2026-10-31T12:35:00Z') });
  assert.equal(second.body.status, 'skipped'); assert.equal(second.body.reason, 'already_resolved');
  assert.equal(service.args('gtl_epl_resolve_week').length, 1, 'the second run writes nothing');
  assert.equal(JSON.stringify(service.state.picks), finalPicks, 'same rows');
});

test('resolve: the manager on the clock without a queue gets no pick', async () => {
  const { service } = await run({ job: 'resolve', clock: at('2026-10-31T13:00:00Z') });
  assert.deepEqual(service.args('gtl_epl_resolve_week')[0].p_rows, [{ owner_id: DARIN, club: null, source: 'none' }]);
});

const EIGHT = [...SEVEN.map(p => ({ ...p, final: true })), { ownerId: DARIN, club: 'SUN', source: 'pick', final: true }];
const settled = (fixtures, overrides = {}) => baseState({ week: { ...baseState().week, status: 'resolved' }, picks: EIGHT, fixtures, snapshots: ['after-mw08', 'after-mw9'], ...overrides });
const finalFix = (f, homeGoals, awayGoals) => ({ ...f, status: 'final', homeGoals, awayGoals });
const roster = (ownerId, fpts, against) => ({ owner_id: ownerId, roster_id: ORDER.indexOf(ownerId) + 1, settings: { fpts: Math.floor(fpts), fpts_decimal: Math.round((fpts % 1) * 100), fpts_against: Math.floor(against), fpts_against_decimal: Math.round((against % 1) * 100), wins: 0, losses: 0 } });
const PREV = Object.fromEntries(ORDER.map((id, i) => [id, 500 + i * 10]));
const WEEK_POINTS = { [NEMO]: 60, [CULLEN]: 70, [ADAM]: 55, [SEAN]: 80, [EVAN]: 65, [MARK]: 50, [STEVEN]: 75, [DARIN]: 90 };
const snap = points => ({ capturedAt: '2026-11-04T00:05:00Z', week: 9, users: [], rosters: ORDER.map(id => roster(id, PREV[id] + points[id], 400)) });
const SNAPS = { 'after-mw08': snap(Object.fromEntries(ORDER.map(id => [id, 0]))), 'after-mw9': snap(WEEK_POINTS) };

test('settle: a drafted club still playing means no bonus and no next week (Review Focus 5)', async () => {
  const fixtures = FIXTURES.map((f, i) => (i === 7 ? f : finalFix(f, 2, 0)));
  const { body, service, sources } = await run({ job: 'settle', state: settled(fixtures), snapshots: SNAPS, clock: at('2026-11-02T21:00:00Z') });
  assert.equal(body.status, 'skipped'); assert.equal(body.reason, 'results_pending');
  assert.ok(!service.names().includes('gtl_epl_settle_week'));
  assert.deepEqual(sources.calls, [], 'scores are not fetched before the last drafted match can have finished');
});

test('settle: fetches scores once the drafted matches are over, writes them, and still waits when one is unfinished', async () => {
  const fixtures = FIXTURES.map((f, i) => (i === 7 ? f : finalFix(f, 2, 0)));
  const scores = [{ eventId: 'e8', completed: false, home: 'SUN', away: 'LEE', homeGoals: null, awayGoals: null, commenceTime: '2026-11-02T20:00:00.000Z' }];
  const { body, service, sources } = await run({ job: 'settle', state: settled(fixtures), snapshots: SNAPS, sources: fakeSources({ scores }), clock: at('2026-11-03T09:00:00Z') });
  assert.equal(body.reason, 'results_pending');
  assert.deepEqual(sources.calls.map(([n]) => n), ['scores']);
  assert.deepEqual(service.args('gtl_epl_reserve_credits'), [{ p_run: RUN, p_claim: CLAIM, p_cost: 2 }]);
  assert.deepEqual(service.args('gtl_epl_record_quota')[0], { p_run: RUN, p_claim: CLAIM, p_remaining: 397, p_used: 103, p_last: 2 });
  assert.ok(!service.names().includes('gtl_epl_settle_week'));
});

test('settle: every drafted result in -> bonus rows to the widest margin and the next week in pick order', async () => {
  const fixtures = FIXTURES.map(f => finalFix(f, 1, 0));
  fixtures[2] = finalFix(FIXTURES[2], 4, 1); // TOT 4-1 CHE: Sean's club, margin 3
  fixtures[3] = finalFix(FIXTURES[3], 3, 0); // ARS 3-0 EVE: Evan's club, margin 3, fewer goals for -> loses the tiebreak
  const { body, service } = await run({ job: 'settle', state: settled(fixtures, { bonusTotals: { [ADAM]: 10 } }), snapshots: SNAPS, clock: at('2026-11-04T01:00:00Z') });
  assert.equal(body.status, 'succeeded');
  assert.deepEqual(service.args('gtl_epl_read_snapshots'), [{ p_run: RUN, p_claim: CLAIM, p_labels: ['after-mw08', 'after-mw9'] }]);
  const [settle] = service.args('gtl_epl_settle_week');
  assert.equal(settle.p_season, 2026); assert.equal(settle.p_week, 9);
  assert.deepEqual(settle.p_awards, [{ owner_id: SEAN, points: 15, margin: 3, club: 'TOT' }]);
  // Week score + bonus: Mark 50, Adam 55, Nemo 60, Evan 65, Cullen 70, Steven 75, Darin 90, Sean 80+15=95.
  assert.deepEqual(settle.p_next, { week: 10, window_start: END, window_end: '2026-11-11T00:00:00.000Z', first_kickoff: '2026-11-11T00:00:00.000Z',
    pick_order: [MARK, ADAM, NEMO, EVAN, CULLEN, STEVEN, DARIN, SEAN] });
});

test('settle: waits for the after-matchweek snapshot and fails without the previous one', async () => {
  const fixtures = FIXTURES.map(f => finalFix(f, 1, 0));
  const waiting = await run({ job: 'settle', state: settled(fixtures, { snapshots: ['after-mw08'] }), snapshots: SNAPS, clock: at('2026-11-04T01:00:00Z') });
  assert.equal(waiting.body.reason, 'snapshot_pending');
  const missing = await run({ job: 'settle', state: settled(fixtures, { snapshots: ['after-mw9'] }), snapshots: SNAPS, clock: at('2026-11-04T01:00:00Z') });
  assert.equal(missing.body.status, 'failed'); assert.equal(missing.body.reason, 'snapshot_missing');
  assert.ok(![...waiting.service.names(), ...missing.service.names()].includes('gtl_epl_settle_week'));
  const open = await run({ job: 'settle', state: baseState(), snapshots: SNAPS, clock: at('2026-11-04T01:00:00Z') });
  assert.equal(open.body.reason, 'not_resolved');
});

test('settle: a postponed drafted club scores 0 and does not hold up the bonus', async () => {
  const fixtures = FIXTURES.map(f => finalFix(f, 0, 0));
  fixtures[7] = { ...FIXTURES[7], status: 'postponed' };
  fixtures[0] = finalFix(FIXTURES[0], 2, 0);
  const { service } = await run({ job: 'settle', state: settled(fixtures), snapshots: SNAPS, clock: at('2026-11-04T01:00:00Z') });
  assert.deepEqual(service.args('gtl_epl_settle_week')[0].p_awards, [{ owner_id: NEMO, points: 10, margin: 2, club: 'MNC' }]);
});

test('snapshot: saves before-mw<N>-kickoff in the half hour before the first kickoff and after-mw<N> after the window', async () => {
  assert.deepEqual(snapshotLabels('after', 9), ['after-mw9', 'after-mw09']);
  const early = await run({ job: 'snapshot', clock: at('2026-10-31T11:00:00Z') });
  assert.equal(early.body.reason, 'nothing_due'); assert.deepEqual(early.sources.calls, []);
  const due = await run({ job: 'snapshot', clock: at('2026-10-31T12:10:00Z') });
  assert.equal(due.body.status, 'succeeded');
  assert.deepEqual(due.sources.calls, [['sleeper', { label: 'before-mw9-kickoff', statsWeek: 8, projectionsWeek: 9 }]]);
  assert.deepEqual(due.service.args('gtl_epl_save_snapshot'), [{ p_label: 'before-mw9-kickoff', p_captured_at: '2026-11-04T00:05:00Z', p_week: 9, p_sha256: { rosters: 'c'.repeat(64) }, p_payload: { label: 'before-mw9-kickoff', rosters: [] } }]);
  const saved = await run({ job: 'snapshot', state: baseState({ snapshots: ['after-mw08', 'before-mw9-kickoff'] }), clock: at('2026-10-31T12:20:00Z') });
  assert.equal(saved.body.reason, 'nothing_due');
  const after = await run({ job: 'snapshot', state: baseState({ week: { ...baseState().week, status: 'resolved' } }), clock: at('2026-11-04T00:00:00Z') });
  assert.deepEqual(after.sources.calls, [['sleeper', { label: 'after-mw9', statsWeek: 9, projectionsWeek: 10 }]]);
  const padded = await run({ job: 'snapshot', state: baseState({ snapshots: ['after-mw09'], week: { ...baseState().week, status: 'resolved' } }), clock: at('2026-11-04T00:00:00Z') });
  assert.equal(padded.body.reason, 'nothing_due', 'a zero-padded import counts as the same snapshot');
  const down = await run({ job: 'snapshot', sources: fakeSources({ fail: { sleeper: true } }), clock: at('2026-10-31T12:10:00Z') });
  assert.equal(down.body.status, 'failed'); assert.equal(down.body.reason, 'source_unavailable');
});

test('nudge: pushes the manager on the clock once per turn (key season-week-ownerId-pickCount)', async () => {
  const service = fakeService({ job: 'nudge' });
  const push = fakePush();
  const first = await run({ job: 'nudge', service, push, clock: at('2026-10-30T18:00:00Z') });
  assert.equal(first.body.status, 'succeeded');
  assert.deepEqual(service.args('gtl_epl_mark_nudge'), [{ p_run: RUN, p_claim: CLAIM, p_season: 2026, p_week: 9, p_owner: DARIN, p_key: `2026-9-${DARIN}-7` }]);
  assert.equal(push.sent.length, 1);
  assert.deepEqual(push.sent[0].payload, nudgePayload({ season: 2026, week: 9, firstKickoff: KICKOFF }));
  assert.match(push.sent[0].payload.body, /Matchweek 9/);
  assert.match(push.sent[0].payload.body, /locks Sat 5:30 AM PT\.$/);
  assert.ok(push.sent[0].payload.body.length <= 160 && push.sent[0].payload.tag.length <= 64, 'within web/public/sw.js limits');
  assert.doesNotMatch(JSON.stringify(push.sent[0].payload), /MNC|AVL|Liverpool|Nemo/, 'no other pick or manager in the push');
  const second = await run({ job: 'nudge', service, push, clock: at('2026-10-30T18:05:00Z') });
  assert.equal(second.body.reason, 'already_nudged');
  assert.equal(push.sent.length, 1, 'one push per turn');
});

test('nudge: skips a manager with no push subscription, a finished draft, and a missing VAPID key before marking', async () => {
  const state = baseState({ managers: ORDER.map(ownerId => ({ ownerId, name: ownerId, subscribed: false })) });
  const none = await run({ job: 'nudge', state, clock: at('2026-10-30T18:00:00Z') });
  assert.equal(none.body.reason, 'no_subscription');
  assert.ok(!none.service.names().includes('gtl_epl_mark_nudge'), 'not marked, so a later subscription still gets this turn');
  const done = await run({ job: 'nudge', state: baseState({ picks: EIGHT }), clock: at('2026-10-30T18:00:00Z') });
  assert.equal(done.body.reason, 'nothing_due');
  const late = await run({ job: 'nudge', clock: at('2026-10-31T12:30:00Z') });
  assert.equal(late.body.reason, 'not_due');
  const keys = await run({ job: 'nudge', push: fakePush({ ready: false }), clock: at('2026-10-30T18:00:00Z') });
  assert.equal(keys.body.status, 'failed'); assert.equal(keys.body.reason, 'vapid_unavailable');
  assert.ok(!keys.service.names().includes('gtl_epl_mark_nudge'));
});

test('a provider or write failure completes the run as failed with a fixed reason, never the error text', async () => {
  const odds = await run({ job: 'fixtures', sources: fakeSources({ fail: { odds: true } }), clock: at('2026-10-30T06:00:00Z') });
  assert.equal(odds.body.reason, 'source_unavailable');
  assert.ok(odds.service.names().includes('gtl_epl_record_quota'), 'the quota a failed call reported is still recorded');
  const write = fakeService({ job: 'resolve', errors: { gtl_epl_resolve_week: 'UNAVAILABLE' } });
  const failed = await run({ job: 'resolve', service: write, clock: at('2026-10-31T13:00:00Z') });
  assert.equal(failed.body.status, 'failed'); assert.equal(failed.body.reason, 'write_failed');
  assert.deepEqual(Object.keys(failed.complete).sort(), ['p_claim', 'p_detail', 'p_reason', 'p_run']);
});

test('the adapter calls only the listed RPCs over PostgREST and maps errors to fixed codes', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push([String(url), options]);
    if (String(url).endsWith('gtl_epl_claim_job')) return new Response(JSON.stringify({ message: 'GTL_SCHEDULE_AUTH' }), { status: 400 });
    if (String(url).endsWith('gtl_epl_resolve_week')) return new Response(JSON.stringify({ message: 'secret detail' }), { status: 500 });
    return new Response('{"ok":true}', { status: 200 });
  };
  const adapter = createEplJobsAdapter({ url: 'https://abc.supabase.co', serviceRoleKey: 'service-key', fetchImpl });
  await assert.rejects(adapter.rpc('gtl_epl_save_pick', {}), /Invalid/);
  await assert.rejects(adapter.rpc('gtl_epl_claim_job', {}), err => err.code === 'GTL_SCHEDULE_AUTH');
  await assert.rejects(adapter.rpc('gtl_epl_resolve_week', {}), err => err.code === 'UNAVAILABLE' && !err.message.includes('secret'));
  assert.deepEqual(await adapter.rpc('gtl_epl_jobs_state', { p_run: RUN, p_claim: CLAIM }), { ok: true });
  assert.equal(seen.at(-1)[0], 'https://abc.supabase.co/rest/v1/rpc/gtl_epl_jobs_state');
  assert.equal(seen.at(-1)[1].redirect, 'error');
  assert.throws(() => createEplJobsAdapter({ url: 'http://abc.supabase.co', serviceRoleKey: 'k' }), /Invalid/);
});

test('the Deno entry wires the odds key, the VAPID secrets and the service role, and nothing else', () => {
  const entry = readFileSync(new URL('../supabase/functions/gtl-epl-jobs/index.ts', import.meta.url), 'utf8');
  assert.match(entry, /from '\.\.\/\.\.\/\.\.\/cloud\/epl-jobs\.mjs'/);
  const envs = [...entry.matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map(m => m[1]).sort();
  assert.deepEqual(envs, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'THE_ODDS_API_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_SUBJECT']);
  assert.match(entry, /Deno\.serve\(createEplJobsHandler\(/);
});

test('the hand-registered cron file is admin-only, registers every job disabled and never enables one', () => {
  const sql = readFileSync(new URL('../supabase/admin/epl_jobs_cron.sql', import.meta.url), 'utf8');
  assert.match(sql, /^-- ADMIN ONLY/);
  const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  for (const job of EPL_JOBS) assert.match(code, new RegExp(`gtl_epl_dispatch_jobs\\('${job}'\\)`), job);
  assert.match(code, /insert into public\.gtl_epl_jobs_schedule[^;]*false[^;]*on conflict\s*\(job\)\s*do nothing/is);
  assert.doesNotMatch(code, /enabled\s*=\s*true/i, 'enabling stays commented');
});
