// EPL delivery stage 4 (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 6): Pick a Team results from verified finals,
// the shared/epl-results.mjs rules, the gtl-epl-jobs 'results' job over a fake service, and the /epl/draft/read results
// field. No network, no database (tests/epl-results-sql.test.mjs runs the SQL on PGlite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickATeamResults, resultsPayload, scoreLine, firstMatchByClub } from '../shared/epl-results.mjs';
import { settleBonus } from '../shared/epl-draft.mjs';
import { EPL_JOBS, EPL_JOBS_RPCS, EPL_RESULTS_RPCS, FINAL_READ_OFFSETS_MIN, nextFinalReadAt, runEplJob, weekResults } from '../cloud/epl-jobs.mjs';
import { handleEpl } from '../cloud/epl.mjs';

const NEMO = '865667912365666304', CULLEN = '1259267898757611520', ADAM = '719745569895018496', SEAN = '473955676301815808';
const EVAN = '719658248843632640', MARK = '1257180071064510465';
const RUN = { p_run: '11111111-1111-4111-8111-111111111111', p_claim: '22222222-2222-4222-8222-222222222222' };
const START = '2026-11-06T00:00:00.000Z', END = '2026-11-11T00:00:00.000Z';
const SAT = '2026-11-07T15:00:00.000Z', SUN = '2026-11-08T14:00:00.000Z', MON = '2026-11-09T20:00:00.000Z';
const fx = (eventId, home, away, commenceTime, status = 'scheduled', homeGoals = null, awayGoals = null) => ({ eventId, home, away, commenceTime, status, homeGoals, awayGoals });
const final = (eventId, home, away, commenceTime, h, a) => fx(eventId, home, away, commenceTime, 'final', h, a);
const PICKS = [[NEMO, 'MNC'], [CULLEN, 'AVL'], [ADAM, 'LIV'], [SEAN, 'TOT'], [EVAN, 'ARS'], [MARK, 'BRE']].map(([ownerId, club]) => ({ ownerId, club }));
const FINALS = [final('e1', 'MNC', 'BOU', SAT, 3, 0), final('e2', 'AVL', 'LIV', SAT, 1, 1), final('e3', 'TOT', 'CHE', SUN, 2, 1),
  final('e4', 'ARS', 'EVE', SUN, 0, 1), final('e5', 'BRE', 'FUL', MON, 4, 2)];
const names = { managerName: id => ({ [NEMO]: 'Nemo', [SEAN]: 'Sean', [MARK]: 'Mark', [EVAN]: 'Evan' })[id] ?? id, clubName: c => ({ MNC: 'Manchester City', BOU: 'Bournemouth', TOT: 'Tottenham Hotspur', CHE: 'Chelsea', BRE: 'Brentford', FUL: 'Fulham' })[c] ?? c };

test('results are final only once every fixture is a whole-goal final or postponed; the widest margin wins', () => {
  const r = pickATeamResults({ season: 2026, week: 11, picks: PICKS, fixtures: FINALS });
  assert.equal(r.status, 'final');
  assert.deepEqual(r.matches, { total: 5, final: 5, postponed: 0, pending: 0 });
  assert.deepEqual(r.winners, [{ ownerId: NEMO, club: 'MNC', opponent: 'BOU', home: true, goalsFor: 3, goalsAgainst: 0, margin: 3, bonus: 15 }]);
  // The same award settleBonus already stores for settlement.
  const bonus = settleBonus(PICKS.map(p => ({ managerId: p.ownerId, club: p.club })), weekResults(FINALS));
  assert.deepEqual(bonus.winners, [NEMO]); assert.equal(bonus.awards[NEMO], 15);
  assert.equal(scoreLine(r.winners[0], names.clubName), '3-0 vs Bournemouth');
});

test('a scheduled match, a final without goals or an undrafted unfinished match keeps the week visibly pending', () => {
  const late = FINALS.map(f => (f.eventId === 'e5' ? fx('e5', 'BRE', 'FUL', MON) : f));
  assert.deepEqual(pickATeamResults({ season: 2026, week: 11, picks: PICKS, fixtures: late }),
    { season: 2026, week: 11, status: 'pending', matches: { total: 5, final: 4, postponed: 0, pending: 1 }, winners: [] });
  // A "final" the feed reported without whole goals is not verified.
  const noGoals = FINALS.map(f => (f.eventId === 'e1' ? { ...f, homeGoals: null } : f));
  assert.equal(pickATeamResults({ picks: PICKS, fixtures: noGoals }).status, 'pending');
  // All of the week's results: an undrafted club's unfinished match still holds the announcement.
  const extra = [...FINALS, fx('e9', 'SUN', 'LEE', MON)];
  assert.equal(pickATeamResults({ picks: PICKS, fixtures: extra }).status, 'pending');
  // No fixtures yet: nothing to announce.
  assert.equal(pickATeamResults({ picks: PICKS, fixtures: [] }), null);
});

test('ties: goals scored then conceded break a shared margin; a full tie shares the full award', () => {
  // MNC 3-0 and BRE 4-1 share margin 3: BRE scored more, so Mark alone wins.
  const scored = FINALS.map(f => (f.eventId === 'e5' ? final('e5', 'BRE', 'FUL', MON, 4, 1) : f));
  assert.deepEqual(pickATeamResults({ picks: PICKS, fixtures: scored }).winners.map(w => [w.ownerId, w.bonus]), [[MARK, 15]]);
  // MNC 3-0 and BRE 3-0: identical, both receive the full 15.
  const shared = FINALS.map(f => (f.eventId === 'e5' ? final('e5', 'BRE', 'FUL', MON, 3, 0) : f));
  const r = pickATeamResults({ picks: PICKS, fixtures: shared });
  assert.deepEqual(r.winners.map(w => [w.ownerId, w.club, w.margin, w.bonus]).sort(), [[MARK, 'BRE', 3, 15], [NEMO, 'MNC', 3, 15]].sort());
  const payload = resultsPayload({ season: 2026, week: 11, winners: r.winners }, names);
  assert.match(payload.body, /share the bonus\. Won by 3, \+15 each\./);
  assert.ok(payload.body.length <= 160);
});

test('no winner: draws, losses and postponements earn nothing, and the week is still announced', () => {
  const none = [final('e1', 'MNC', 'BOU', SAT, 0, 0), final('e2', 'AVL', 'LIV', SAT, 1, 1), final('e3', 'TOT', 'CHE', SUN, 0, 2),
    final('e4', 'ARS', 'EVE', SUN, 0, 1), fx('e5', 'BRE', 'FUL', MON, 'postponed')];
  const r = pickATeamResults({ season: 2026, week: 11, picks: PICKS, fixtures: none });
  assert.equal(r.status, 'final'); assert.deepEqual(r.winners, []);
  assert.deepEqual(r.matches, { total: 5, final: 4, postponed: 1, pending: 0 });
  assert.equal(resultsPayload(r, names).body, 'Pick a Team MW11 results are final: no drafted club won, so no bonus this week.');
});

test('postponed: an explicitly postponed drafted match scores zero; a double gameweek counts the first match only', () => {
  const postponed = FINALS.map(f => (f.eventId === 'e1' ? fx('e1', 'MNC', 'BOU', SAT, 'postponed') : f));
  assert.deepEqual(pickATeamResults({ picks: PICKS, fixtures: postponed }).winners.map(w => w.ownerId), [MARK]);
  const double = [...FINALS, final('e8', 'TOT', 'NFO', MON, 6, 0)];
  assert.equal(firstMatchByClub(double).get('TOT').eventId, 'e3');
  assert.deepEqual(pickATeamResults({ picks: PICKS, fixtures: double }).winners.map(w => w.ownerId), [NEMO]);
});

test('the single-winner push names the manager, club, result, margin and bonus within the service worker limits', () => {
  const r = pickATeamResults({ season: 2026, week: 11, picks: PICKS, fixtures: FINALS });
  const p = resultsPayload(r, names);
  assert.deepEqual(p, { title: 'Guess The Line', tag: 'gtl-epl-results-2026-11',
    body: 'Pick a Team MW11: Nemo wins with Manchester City, 3-0 vs Bournemouth. Won by 3, +15 bonus.' });
  const many = Array.from({ length: 8 }, (_, i) => ({ ownerId: `${i}`.repeat(18), club: 'NFO', margin: 1, bonus: 5 }));
  const long = resultsPayload({ season: 2026, week: 11, winners: many }, { managerName: id => `Manager-${id}`, clubName: () => 'Nottingham Forest' });
  assert.ok(long.body.length <= 160); assert.match(long.body, /8 managers share the bonus/);
});

// ---- the gtl-epl-jobs 'results' job ----

const WEEK = { season: 2026, week: 11, windowStart: START, windowEnd: END, firstKickoff: SAT, status: 'resolved' };
const SUBS = [{ endpoint: 'https://web.push.apple.com/a', p256dh: 'B'.padEnd(87, 'x'), auth: 'y'.repeat(22) }, { endpoint: 'https://web.push.apple.com/b', p256dh: 'B'.padEnd(87, 'x'), auth: 'z'.repeat(22) }];

/** A fake service holding the durable rows the SQL keeps: fixtures, announcement, delivery claims and final reads. */
function world({ fixtures = FINALS, budget = { remaining: 300, paused: false }, week = WEEK, reads = [], subscriptions = SUBS } = {}) {
  const db = { fixtures: fixtures.map(f => ({ ...f })), announcement: null, deliveries: new Set(), reads: [...reads], budget: { ...budget }, upserts: [] };
  const calls = [];
  const service = {
    db, calls,
    async rpc(name, args) {
      calls.push(name);
      assert.ok(EPL_JOBS_RPCS.includes(name), name);
      switch (name) {
        case 'gtl_epl_jobs_state': return { week: { ...week, status: 'open', week: week.week + 1 }, budget: db.budget };
        case 'gtl_epl_results_state': return { week, picks: PICKS, fixtures: db.fixtures.map(f => ({ ...f })), announcement: db.announcement, reads: db.reads, budget: db.budget };
        case 'gtl_epl_reserve_final_result_read': {
          const due = nextFinalReadAt(db.fixtures, db.reads);
          if (due === null) return { ok: false, reason: 'limit' };
          if (Date.parse(args.p_now) < due) return { ok: false, reason: 'not_due' };
          if (db.budget.remaining - 2 < 50) return { ok: false, reason: 'budget_guard' };
          db.budget.remaining -= 2; db.reads.push({ attempt: db.reads.length + 1, reservedAt: args.p_now });
          return { ok: true, attempt: db.reads.length };
        }
        case 'gtl_epl_upsert_fixtures':
          for (const row of args.p_rows) {
            db.upserts.push(row);
            const f = db.fixtures.find(x => x.eventId === row.event_id);
            Object.assign(f, { status: row.status, homeGoals: row.home_goals, awayGoals: row.away_goals, commenceTime: row.commence_time });
          }
          return args.p_rows.length;
        case 'gtl_epl_record_quota': return {};
        case 'gtl_epl_record_result_announcement': {
          const r = pickATeamResults({ season: args.p_season, week: args.p_week, picks: PICKS, fixtures: db.fixtures });
          if (r?.status !== 'final') return { recorded: false, reason: 'pending', subscriptions: [] };
          if (db.announcement) return { recorded: false, reason: 'announced', subscriptions: [] };
          db.announcement = { announcedAt: args.p_now };
          const fresh = subscriptions.filter(s => !db.deliveries.has(s.endpoint));
          for (const s of fresh) db.deliveries.add(s.endpoint);
          return { recorded: true, notify: true, winners: r.winners, members: fresh.length, subscriptions: fresh };
        }
        default: throw new Error(`unhandled ${name}`);
      }
    },
  };
  return service;
}
function pushChannel({ ready = true, outcome = 'ok' } = {}) {
  const sent = [];
  return { sent, async ready() { if (!ready) throw new Error('no keys'); }, async send(args) { sent.push(args); return { outcome }; } };
}
function scoresSource(scores) {
  const calls = [];
  return { calls, async scores({ onQuota } = {}) { calls.push('scores'); onQuota?.({ remaining: 290, used: 210, last: 2 }); return { scores, unmapped: [] }; } };
}
const job = (service, { push = pushChannel(), sources = scoresSource([]), now }) => runEplJob({ job: 'results', service, sources, push, now: Date.parse(now), run: RUN });

test('the results job is registered with only its own admitted RPCs', () => {
  assert.ok(EPL_JOBS.includes('results'));
  for (const name of EPL_RESULTS_RPCS) assert.ok(EPL_JOBS_RPCS.includes(name), name);
  assert.deepEqual(FINAL_READ_OFFSETS_MIN, [150, 200, 300, 720]);
});

test('verified finals announce once and notify each opted-in member once; a retry, replay or overlap sends nothing more', async () => {
  const service = world(), push = pushChannel();
  const first = await job(service, { push, now: '2026-11-09T23:00:00Z' });
  assert.equal(first.reason, null);
  assert.deepEqual(first.detail, { season: 2026, week: 11, scored: 0, winners: 1, notify: true, members: 2, sent: 2, failed: 0 });
  assert.equal(push.sent.length, 2);
  assert.equal(push.sent[0].payload.tag, 'gtl-epl-results-2026-11');
  assert.match(push.sent[0].payload.body, /Nemo wins with Manchester City, 3-0 vs Bournemouth\. Won by 3, \+15 bonus\./);
  assert.ok(!service.calls.includes('gtl_epl_reserve_final_result_read'), 'already verified: no provider read');
  for (let i = 0; i < 3; i++) {
    const again = await job(service, { push, now: '2026-11-09T23:15:00Z' });
    assert.equal(again.reason, 'nothing_due');
  }
  assert.equal(push.sent.length, 2, 'no duplicate announcement');
  // Even a run that skipped the state check (an overlapping run that read before the record) cannot claim it again.
  const overlap = await service.rpc('gtl_epl_record_result_announcement', { ...RUN, p_season: 2026, p_week: 11, p_now: '2026-11-09T23:16:00Z' });
  assert.deepEqual(overlap, { recorded: false, reason: 'announced', subscriptions: [] });
});

test('a missing VAPID key leaves the announcement unrecorded so the next run still notifies; a failed send is not retried', async () => {
  const service = world();
  assert.equal((await job(service, { push: pushChannel({ ready: false }), now: '2026-11-09T23:00:00Z' })).reason, 'vapid_unavailable');
  assert.equal(service.db.announcement, null);
  const failing = pushChannel({ outcome: 'gone' });
  const failed = await job(service, { push: failing, now: '2026-11-09T23:15:00Z' });
  assert.equal(failed.reason, 'send_failed'); assert.equal(failing.sent.length, 2);
  const retry = pushChannel();
  assert.equal((await job(service, { push: retry, now: '2026-11-09T23:30:00Z' })).reason, 'nothing_due');
  assert.equal(retry.sent.length, 0, 'deliveries were claimed before sending: at most once');
});

test('final-match collection: no read before 150 minutes after the last pending kickoff, then bounded attempts', async () => {
  const pending = FINALS.map(f => (f.eventId === 'e5' ? fx('e5', 'BRE', 'FUL', MON) : f));
  const service = world({ fixtures: pending }), push = pushChannel();
  const early = await job(service, { push, sources: scoresSource([]), now: '2026-11-09T22:00:00Z' });
  assert.equal(early.reason, 'results_pending');
  assert.equal(early.detail.nextReadAt, '2026-11-09T22:30:00.000Z');
  assert.ok(!service.calls.includes('gtl_epl_reserve_final_result_read'));
  // Attempt 1 at +150: the feed has not marked it completed, so nothing is guessed from the clock.
  const live = { eventId: 'e5', home: 'BRE', away: 'FUL', commenceTime: MON, completed: false, homeGoals: 4, awayGoals: 2 };
  const one = await job(service, { push, sources: scoresSource([live]), now: '2026-11-09T22:30:00Z' });
  assert.equal(one.reason, 'results_pending'); assert.equal(one.detail.attempt, 1);
  assert.equal(service.db.fixtures.find(f => f.eventId === 'e5').status, 'scheduled');
  // Before attempt 2's offset (+200 minutes) nothing is bought.
  assert.equal((await job(service, { push, now: '2026-11-09T23:00:00Z' })).detail.nextReadAt, '2026-11-09T23:20:00.000Z');
  // Attempt 2: completed with whole goals, stored, verified, announced in the same run.
  const done = { ...live, completed: true };
  const two = await job(service, { push, sources: scoresSource([done]), now: '2026-11-09T23:20:00Z' });
  assert.equal(two.reason, null); assert.equal(two.detail.scored, 1); assert.equal(two.detail.winners, 1);
  assert.equal(service.db.reads.length, 2); assert.equal(service.db.budget.remaining, 296);
  assert.deepEqual(service.db.upserts.map(r => [r.event_id, r.status, r.home_goals, r.away_goals]), [['e5', 'final', 4, 2]]);
  assert.equal(push.sent.length, 2);
});

test('a missing feed row or an empty reply never finalizes; after four reads the week stays visibly pending', async () => {
  const pending = FINALS.map(f => (f.eventId === 'e5' ? fx('e5', 'BRE', 'FUL', MON) : f));
  const service = world({ fixtures: pending }), push = pushChannel();
  const times = FINAL_READ_OFFSETS_MIN.map(m => new Date(Date.parse(MON) + m * 60_000).toISOString());
  const other = { eventId: 'e4', home: 'ARS', away: 'EVE', commenceTime: SUN, completed: true, homeGoals: 0, awayGoals: 1 };
  for (const [i, now] of times.entries()) {
    const out = await job(service, { push, sources: scoresSource(i % 2 ? [] : [other]), now });
    assert.equal(out.reason, 'results_pending', now); assert.equal(out.detail.attempt, i + 1);
  }
  const capped = await job(service, { push, now: '2026-11-11T12:00:00Z' });
  assert.equal(capped.reason, 'results_pending'); assert.equal(capped.detail.capped, true);
  assert.equal(service.db.reads.length, 4, 'at most four reads (8 credits) a matchweek');
  assert.equal(service.db.fixtures.find(f => f.eventId === 'e5').status, 'scheduled');
  assert.equal(service.db.announcement, null); assert.equal(push.sent.length, 0);
  // Past the 3-day scores feed, it waits for the commissioner instead of buying.
  const outside = await job(service, { push, now: '2026-11-13T12:00:00Z' });
  assert.equal(outside.reason, 'needs_review'); assert.equal(outside.detail.outsideFeed, 1);
});

test('the shared reserve: no read when it would leave fewer than 50 credits, and an unknown budget buys nothing', async () => {
  const pending = FINALS.map(f => (f.eventId === 'e5' ? fx('e5', 'BRE', 'FUL', MON) : f));
  const now = '2026-11-09T22:30:00Z';
  assert.equal((await job(world({ fixtures: pending, budget: { remaining: 51, paused: false } }), { now })).reason, 'budget_guard');
  assert.equal((await job(world({ fixtures: pending, budget: { remaining: null, paused: false } }), { now })).reason, 'budget_unknown');
  assert.equal((await job(world({ fixtures: pending, budget: { remaining: 300, paused: true } }), { now })).reason, 'budget_guard');
});

test('a feed listing outside the week window is positive postponement evidence and completes the week', async () => {
  const pending = FINALS.map(f => (f.eventId === 'e5' ? fx('e5', 'BRE', 'FUL', MON) : f));
  const service = world({ fixtures: pending });
  const moved = { eventId: 'e5', home: 'BRE', away: 'FUL', commenceTime: '2026-12-02T20:00:00Z', completed: false };
  const out = await job(service, { sources: scoresSource([moved]), now: '2026-11-09T22:30:00Z' });
  assert.equal(out.reason, null);
  assert.equal(service.db.fixtures.find(f => f.eventId === 'e5').status, 'postponed');
  assert.equal(service.db.announcement !== null, true);
});

test('no results week, an existing announcement or no fixtures are safe no-ops', async () => {
  const none = world(); none.rpc = (orig => async (name, args) => (name === 'gtl_epl_results_state' ? { week: null } : orig(name, args)))(none.rpc.bind(none));
  assert.equal((await job(none, { now: '2026-11-09T23:00:00Z' })).reason, 'no_week');
  const empty = world({ fixtures: [] });
  assert.equal((await job(empty, { now: '2026-11-09T23:00:00Z' })).reason, 'no_fixtures');
  const off = world(); off.rpc = (orig => async (name, args) => { if (name === 'gtl_epl_results_state') { const e = new Error('x'); e.code = 'GTL_EPL_RESULTS_OFF'; throw e; } return orig(name, args); })(off.rpc.bind(off));
  assert.equal((await job(off, { now: '2026-11-09T23:00:00Z' })).reason, 'not_open');
});

// ---- /epl/draft/read ----

function weekState(week, status, { picks = PICKS, fixtures = FINALS } = {}) {
  return { season: 2026, week, weekRow: { windowStart: START, windowEnd: END, firstKickoff: SAT, pickOrder: PICKS.map(p => p.ownerId), status, seeded: false },
    picks: picks.map(p => ({ ...p, source: 'pick', pickedAt: START, final: true })), fixtures, bonus: [] };
}
function apiService(states) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'gtl_epl_member') return NEMO;
      if (name === 'gtl_epl_week_state') return states[args.p_week] ?? null;
      if (name === 'gtl_epl_standings_provenance') return null;
      throw new Error(`unhandled ${name}`);
    },
    async latestWeek() { return { season: 2026, week: Math.max(...Object.keys(states).map(Number)) }; },
    async readQueue() { return []; },
    async unclaimedManagers() { return []; },
  };
}
const read = service => handleEpl({ route: '/epl/draft/read', body: {}, user: { id: '00000000-0000-4000-8000-000000000001' }, service, clock: () => Date.parse('2026-11-10T00:00:00Z') });

test('draft/read shows last matchweek\'s results while the next draft is open, before any snapshot or settlement', async () => {
  const service = apiService({ 11: weekState(11, 'resolved'), 12: weekState(12, 'open', { picks: [], fixtures: [fx('n1', 'MNC', 'ARS', '2026-11-21T12:30:00Z')] }) });
  const reply = await read(service);
  assert.equal(reply.week, 12);
  assert.deepEqual(reply.results, { season: 2026, week: 11, status: 'final', review: false, matches: { total: 5, final: 5, postponed: 0, pending: 0 },
    winners: [{ ownerId: NEMO, name: 'Nemo', club: 'MNC', clubName: 'Manchester City', opponent: 'BOU', opponentName: 'Bournemouth', home: true, goalsFor: 3, goalsAgainst: 0, margin: 3, bonus: 15 }] });
});

test('draft/read: a resolved latest week with an unfinished match is pending; an open week one has no results', async () => {
  const pending = FINALS.map(f => (f.eventId === 'e5' ? fx('e5', 'BRE', 'FUL', MON) : f));
  const reply = await read(apiService({ 11: weekState(11, 'needs_review', { fixtures: pending }) }));
  assert.equal(reply.results.status, 'pending'); assert.equal(reply.results.review, true);
  assert.deepEqual(reply.results.matches, { total: 5, final: 4, postponed: 0, pending: 1 }); assert.deepEqual(reply.results.winners, []);
  const first = await read(apiService({ 1: weekState(1, 'open') }));
  assert.equal(first.results, null);
  const twoOpen = await read(apiService({ 10: weekState(10, 'open'), 11: weekState(11, 'open') }));
  assert.equal(twoOpen.results, null);
});
