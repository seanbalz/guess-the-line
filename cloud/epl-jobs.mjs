// The gtl-epl-jobs worker (plan 2026-10-28-epl-pick-a-team.md, Task 5; spec 2026-10-28-epl-fantasy-and-moneyline-design.md
// sections 5 and 6). A machine-only endpoint that pg_cron dispatches once per job and five-minute slot
// (supabase/admin/epl_jobs_cron.sql) with a one-run capability verified in SQL (M-30 gtl_epl_claim_job), the gtl-week-open
// pattern. Each run does one job against the latest week (gtl_epl_weeks, newest season and week):
//   snapshot  saves Sleeper's season totals and lineups as before-mw<N>-kickoff in the half hour before the first kickoff and
//             as after-mw<N> once the week's window has ended (stats week N, projections week N+1).
//   fixtures  before the first kickoff, one 1-credit EPL h2h odds read: the events with commence_time in
//             [window_start, window_end) become the week's fixtures, their median prices are stored, and the first kickoff is
//             moved earlier (never later) to the earliest one. Refused when the shared budget would drop below 50 credits.
//   resolve   at or after the first kickoff, the deadline resolution (shared/epl-draft.mjs resolveDeadline) for every manager
//             without a pick; once the week is resolved a rerun writes nothing.
//   settle    when every drafted club's match is final or postponed (settleBonus ready; a 2-credit scores read once the
//             drafted matches can have finished, or earlier for a finished one about to leave the 3-day feed), writes the bonus and opens week N+1 in pickOrder from
//             weeklyScores(after-mw<N-1>, after-mw<N>) plus the bonus, window [window_end, window_end + 7 days).
//   nudge     pushes the manager on the clock once per turn (key season-week-ownerId-pickCount); a manager without an
//             active push subscription is skipped and not marked.
// Every write goes through the M-30 service RPCs. The run summary, the reply and the logs carry counts and fixed reasons only:
// never a key, URL, endpoint, provider text or another manager's pick.
import { readRunBody } from './odds-refresh.mjs';
import { importVapid, sendWebPush } from './web-push.mjs';
import { pacificClock } from './push-reminders.mjs';
import { fetchEplOdds, fetchEplScores, fetchSleeperSnapshot } from './epl-sources.mjs';
import { onTheClock, pickOrder, resolveDeadline, settleBonus } from '../shared/epl-draft.mjs';
import { managersFromSnapshot, weeklyScores } from '../shared/epl-sleeper.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

export const EPL_JOBS = Object.freeze(['snapshot', 'fixtures', 'resolve', 'settle', 'nudge']);
/** The only RPCs the worker may call: its run queue and reads (M-30, Task 5) and the M-30 jobs writers. */
export const EPL_JOBS_RPCS = Object.freeze(['gtl_epl_claim_job', 'gtl_epl_complete_job', 'gtl_epl_jobs_state', 'gtl_epl_read_snapshots',
  'gtl_epl_reserve_credits', 'gtl_epl_record_quota', 'gtl_epl_mark_nudge', 'gtl_epl_upsert_fixtures', 'gtl_epl_upsert_prices',
  'gtl_epl_resolve_week', 'gtl_epl_settle_week', 'gtl_epl_save_snapshot', 'gtl_epl_set_week_window']);
/** Kept in step with gtl_epl_complete_job (tests/epl-jobs-sql.test.mjs checks the SQL names every one). */
export const EPL_SKIP_REASONS = Object.freeze(['no_week', 'not_open', 'not_due', 'no_fixtures', 'already_resolved', 'not_resolved', 'nothing_due',
  'budget_guard', 'budget_unknown', 'results_pending', 'snapshot_pending', 'no_subscription', 'already_nudged']);
export const EPL_FAIL_REASONS = Object.freeze(['source_unavailable', 'write_failed', 'snapshot_missing', 'scores_incomplete', 'vapid_unavailable', 'send_failed', 'job_failed']);
/** The Odds API reserve every collector keeps (Global Constraints: never below reserveCredits=50). */
export const EPL_RESERVE_CREDITS = 50;
export const ODDS_COST = 1;
export const SCORES_COST = 2;
export const SNAPSHOT_LEAD_MS = 30 * 60_000;
/** A match is assumed over 150 minutes after kickoff; scores are normally not bought before every drafted match can be. */
export const RESULT_AFTER_MS = 150 * 60_000;
/** The scores read covers the last 3 days (daysFrom=3). A pending match that kicked off longer ago than this, less an hour of
 * margin, is outside the feed, so its result can never be bought: settle fails scores_incomplete without spending credits. */
export const SCORES_LOOKBACK_MS = 3 * 86_400_000 - 60 * 60_000;
/** A finished drafted match whose kickoff is within this long of leaving the lookback is bought now, before the rest of the week
 * is over (a Friday match in a Friday-to-Monday week). 25 hours covers two runs of the 12-hourly settle cron (09:41, 21:41). */
export const SCORES_BUY_AHEAD_MS = 25 * 60 * 60_000;
const WEEK_MS = 7 * 86_400_000;
const CODES = new Set(['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED', 'GTL_EPL_INVALID', 'GTL_EPL_NO_WEEK', 'GTL_EPL_NOT_RESOLVED',
  'GTL_EPL_CLUB_TAKEN', 'GTL_EPL_DRAFT_CLOSED']);
class EplJobsError extends Error { constructor(code) { super('Scheduled EPL jobs request failed.'); this.code = code; } }
class JobStop extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const stop = reason => { throw new JobStop(reason); };
const list = v => (Array.isArray(v) ? v : []);
const iso = ms => new Date(ms).toISOString();

export function createEplJobsAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid EPL jobs configuration.');
  return {
    async rpc(name, body) {
      if (!EPL_JOBS_RPCS.includes(name)) throw new Error('Invalid EPL jobs operation.');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        let code;
        try { code = (await response.json()).message; } catch { /* No raw provider error escapes. */ }
        throw new EplJobsError(CODES.has(code) ? code : 'UNAVAILABLE');
      }
      return response.json();
    },
  };
}

/** The worker's public sources. A missing Odds API key fails only the jobs that need it. */
export function createEplSources({ apiKey, fetchImpl = fetch, clock = Date.now } = {}) {
  return {
    sleeper: ({ label, statsWeek, projectionsWeek }) => fetchSleeperSnapshot({ fetchImpl, label, statsWeek, projectionsWeek, clock }),
    odds: () => fetchEplOdds({ apiKey, fetchImpl }),
    scores: ({ onQuota } = {}) => fetchEplScores({ apiKey, fetchImpl, daysFrom: 3, onQuota }),
  };
}

/** The push channel: `ready()` imports the VAPID keys once (throws when they are missing or invalid); `send` never throws. */
export function createEplPush({ vapid, fetchImpl = fetch } = {}) {
  let keys;
  return {
    async ready() { keys ??= await importVapid(vapid || {}); },
    async send({ subscription, payload, ttl, now }) { return sendWebPush({ subscription, payload, vapid: keys, ttl, fetchImpl, now }); },
  };
}

/** The snapshot labels a matchweek may be saved under: the worker's own `after-mw9` and an import's zero-padded `after-mw09`. */
export function snapshotLabels(kind, week) {
  const names = kind === 'after' ? [`after-mw${week}`, `after-mw${String(week).padStart(2, '0')}`] : [`before-mw${week}-kickoff`, `before-mw${String(week).padStart(2, '0')}-kickoff`];
  return [...new Set(names)];
}
const savedLabel = (state, kind, week) => snapshotLabels(kind, week).find(label => list(state.snapshots).includes(label)) ?? null;

/** The turn notification: the matchweek and its lock time only, never a club or another manager. */
export function nudgePayload({ season, week, firstKickoff }) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(new Date(firstKickoff));
  return {
    title: 'Guess The Line',
    body: `You're on the clock in Pick a Team, Matchweek ${week}. The draft locks ${day} ${pacificClock(firstKickoff)} PT.`,
    tag: `gtl-epl-turn-${season}-${week}`,
  };
}

// Each club's first match of the week (a double gameweek counts its first match only; spec 6.4), ignoring postponed ones for
// the playable list.
function firstMatches(fixtures) {
  const sorted = [...list(fixtures)].sort((a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime) || (a.eventId < b.eventId ? -1 : 1));
  const first = new Map();
  for (const f of sorted) for (const club of [f.home, f.away]) if (!first.has(club)) first.set(club, f);
  return first;
}
const playable = fixtures => [...new Set(list(fixtures).filter(f => f.status !== 'postponed').flatMap(f => [f.home, f.away]))];

/** Results by club for settleBonus: the club's first match of the week, as final, postponed or pending. */
export function weekResults(fixtures) {
  const results = {};
  for (const [club, f] of firstMatches(fixtures)) {
    if (f.status === 'postponed') { results[club] = { status: 'postponed' }; continue; }
    if (f.status !== 'final' || !Number.isInteger(f.homeGoals) || !Number.isInteger(f.awayGoals)) { results[club] = { status: 'pending' }; continue; }
    const home = f.home === club;
    results[club] = { status: 'final', goalsFor: home ? f.homeGoals : f.awayGoals, goalsAgainst: home ? f.awayGoals : f.homeGoals };
  }
  return results;
}

const fixtureRow = (week, f, overrides = {}) => ({ event_id: f.eventId, season: week.season, week: week.week, home: f.home, away: f.away,
  commence_time: f.commenceTime, status: f.status ?? 'scheduled', home_goals: f.homeGoals ?? null, away_goals: f.awayGoals ?? null, ...overrides });

/** Calls a provider; any failure is source_unavailable, after recording whatever quota the provider reported. */
async function provider(ctx, call) {
  try { return await call(); } catch (error) {
    if (error?.quota) await recordQuota(ctx, error.quota).catch(() => {});
    stop('source_unavailable');
  }
}
const write = async (ctx, name, args) => { try { return await ctx.service.rpc(name, args); } catch { stop('write_failed'); } };
const recordQuota = (ctx, quota) => ctx.service.rpc('gtl_epl_record_quota', { ...ctx.run, p_remaining: quota?.remaining ?? null, p_used: quota?.used ?? null, p_last: quota?.last ?? null });

/** Precheck on the state's budget, then the SQL reservation (which re-checks under a row lock). */
async function reserve(ctx, cost) {
  const budget = ctx.state.budget ?? {};
  if (!Number.isInteger(budget.remaining)) stop('budget_unknown');
  if (budget.paused || budget.remaining - cost < EPL_RESERVE_CREDITS) stop('budget_guard');
  const reply = await write(ctx, 'gtl_epl_reserve_credits', { ...ctx.run, p_cost: cost });
  if (reply?.ok !== true) stop('budget_guard');
}

const openWeek = ctx => {
  const { week } = ctx.state;
  if (!week) stop('no_week');
  if (week.status !== 'open') stop('not_open');
  return week;
};

async function snapshotJob(ctx) {
  const { week } = ctx.state;
  if (!week) stop('no_week');
  const n = week.week, kickoff = Date.parse(week.firstKickoff), due = [];
  if (week.status === 'open' && list(ctx.state.fixtures).length && ctx.now >= kickoff - SNAPSHOT_LEAD_MS && ctx.now < kickoff && !savedLabel(ctx.state, 'before', n))
    due.push({ label: snapshotLabels('before', n)[0], statsWeek: Math.max(1, n - 1), projectionsWeek: n });
  if (ctx.now >= Date.parse(week.windowEnd) && !savedLabel(ctx.state, 'after', n))
    due.push({ label: snapshotLabels('after', n)[0], statsWeek: n, projectionsWeek: Math.min(38, n + 1) });
  if (!due.length) stop('nothing_due');
  const saved = [];
  for (const args of due) {
    const snap = await provider(ctx, () => ctx.sources.sleeper(args));
    const ok = await write(ctx, 'gtl_epl_save_snapshot', { p_label: snap.label, p_captured_at: snap.capturedAt, p_week: n, p_sha256: snap.sha256, p_payload: snap.payload });
    saved.push({ label: snap.label, saved: ok === true });
  }
  return { saved };
}

async function fixturesJob(ctx) {
  const week = openWeek(ctx);
  const kickoff = Date.parse(week.firstKickoff), start = Date.parse(week.windowStart), end = Date.parse(week.windowEnd);
  if (ctx.now >= kickoff) stop('not_due');
  await reserve(ctx, ODDS_COST);
  const odds = await provider(ctx, () => ctx.sources.odds());
  await recordQuota(ctx, odds.quota).catch(() => {});
  const stored = new Map(list(ctx.state.fixtures).map(f => [f.eventId, f]));
  const inWindow = list(odds.events).filter(e => { const t = Date.parse(e.commenceTime); return t >= start && t < end; });
  // A week fixture the provider now lists outside the window has moved out of the matchweek: postponed (spec 6.4).
  const moved = list(odds.events).filter(e => stored.has(e.eventId) && !inWindow.includes(e) && stored.get(e.eventId).status !== 'final');
  const rows = [...inWindow.map(e => fixtureRow(week, { ...e, status: 'scheduled' })), ...moved.map(e => fixtureRow(week, { ...e, status: 'postponed' }))];
  if (rows.length) await write(ctx, 'gtl_epl_upsert_fixtures', { p_rows: rows });
  const observed = iso(ctx.now);
  const prices = inWindow.flatMap(e => [e.home, e.away].filter(club => Number.isInteger(e.h2h?.[club]))
    .map(club => ({ event_id: e.eventId, club, market: 'h2h', price: e.h2h[club], observed_at: observed })));
  if (prices.length) await write(ctx, 'gtl_epl_upsert_prices', { p_rows: prices });
  // The deadline only ever moves earlier, and only to a kickoff still ahead; the commissioner corrects anything else.
  const first = Math.min(...inWindow.map(e => Date.parse(e.commenceTime)));
  let deadlineMoved = false;
  if (Number.isFinite(first) && first < kickoff && first > ctx.now) {
    await write(ctx, 'gtl_epl_set_week_window', { p_season: week.season, p_week: week.week, p_window_start: week.windowStart, p_window_end: week.windowEnd, p_first_kickoff: iso(first) });
    deadlineMoved = true;
  }
  if (!inWindow.length) return { reason: 'no_fixtures', detail: { fixtures: 0, postponed: moved.length, unknown: odds.unknown ?? 0 } };
  return { fixtures: inWindow.length, postponed: moved.length, prices: prices.length, unknown: odds.unknown ?? 0, deadlineMoved, remaining: odds.quota?.remaining ?? null };
}

async function resolveJob(ctx) {
  const { week } = ctx.state;
  if (!week) stop('no_week');
  if (week.status !== 'open') stop('already_resolved');
  if (ctx.now < Date.parse(week.firstKickoff)) stop('not_due');
  const clubs = playable(ctx.state.fixtures);
  if (!clubs.length) stop('no_fixtures');
  const first = firstMatches(list(ctx.state.fixtures).filter(f => f.status !== 'postponed'));
  const price = (club, market) => {
    const f = first.get(club);
    const row = f && list(ctx.state.prices).find(p => p.eventId === f.eventId && p.club === club && p.market === market);
    return row && Number.isFinite(Number(row.price)) ? Number(row.price) : undefined;
  };
  // League position is not stored yet, so the last tiebreak is the club code (shared/epl-draft.mjs autoClub).
  const favorability = Object.fromEntries(clubs.map(club => [club, { twoWay: price(club, 'draw_no_bet'), threeWay: price(club, 'h2h') }]));
  const picks = list(ctx.state.picks).map(p => ({ managerId: p.ownerId, club: p.club }));
  const queues = Object.fromEntries(Object.entries(ctx.state.queues ?? {}).map(([owner, q]) => [owner, list(q)]));
  const rows = resolveDeadline({ order: week.pickOrder, picks, queues, clubs, favorability })
    .filter(r => r.source !== 'pick').map(r => ({ owner_id: r.managerId, club: r.club, source: r.source }));
  const result = await write(ctx, 'gtl_epl_resolve_week', { p_season: week.season, p_week: week.week, p_rows: rows });
  const count = source => rows.filter(r => r.source === source).length;
  return { added: Number(result?.added) || 0, queue: count('queue'), auto: count('auto'), none: count('none') };
}

async function settleJob(ctx) {
  const { week } = ctx.state;
  if (!week) stop('no_week');
  if (week.status === 'open') stop('not_resolved');
  if (week.status !== 'resolved') stop('nothing_due');
  const drafted = list(ctx.state.picks).filter(p => p.club).map(p => ({ managerId: p.ownerId, club: p.club }));
  let fixtures = list(ctx.state.fixtures), scored = 0;
  let bonus = settleBonus(drafted, weekResults(fixtures));
  if (!bonus.ready) {
    const results = weekResults(fixtures), first = firstMatches(fixtures);
    const waiting = [...new Set(drafted.filter(p => results[p.club]?.status === 'pending').map(p => first.get(p.club)))];
    const age = f => ctx.now - Date.parse(f.commenceTime);
    // Never buy for a match the 3-day scores feed no longer covers (an outage or budget_guard stretch past it would otherwise
    // buy 2 credits a run with no end): its result can never come back, so the run fails without spending credits.
    const outside = waiting.filter(f => age(f) > SCORES_LOOKBACK_MS);
    if (outside.length) return { reason: 'scores_incomplete', detail: { scored: 0, outsideFeed: outside.length } };
    // Buy once every pending drafted match can have finished, or earlier when a finished one is about to leave the feed
    // (fix round 2: a Friday match would otherwise be outside the feed by the time Monday's match is over).
    const ready = waiting.filter(f => age(f) >= RESULT_AFTER_MS);
    const expiring = new Set(ready.filter(f => age(f) > SCORES_LOOKBACK_MS - SCORES_BUY_AHEAD_MS).map(f => f.eventId));
    if (!ready.length || (ready.length < waiting.length && !expiring.size)) stop('results_pending');
    await reserve(ctx, SCORES_COST);
    let quota = null;
    const scores = await provider(ctx, () => ctx.sources.scores({ onQuota: q => { quota = q; } }));
    if (quota) await recordQuota(ctx, quota).catch(() => {});
    const byEvent = new Map(list(scores).map(s => [s.eventId, s]));
    const end = Date.parse(week.windowEnd);
    const waitingIds = new Set(waiting.map(f => f.eventId));
    const rows = [];
    fixtures = fixtures.map(f => {
      const s = byEvent.get(f.eventId);
      if (f.status !== 'scheduled') return f;
      let next = null;
      // A drafted match the feed no longer lists once the week is over, or once it is about to leave the feed (the provider
      // drops a postponed or abandoned match; the lookback check above keeps it inside the feed's range) is no result:
      // postponed, score 0 (spec 6.4).
      if (!s) next = waitingIds.has(f.eventId) && (ctx.now >= end || expiring.has(f.eventId)) ? { ...f, status: 'postponed' } : null;
      else if (s.completed) next = { ...f, status: 'final', homeGoals: s.homeGoals, awayGoals: s.awayGoals, commenceTime: s.commenceTime };
      else if (Date.parse(s.commenceTime) >= end) next = { ...f, status: 'postponed', commenceTime: s.commenceTime };
      if (!next) return f;
      rows.push(fixtureRow(week, next));
      return next;
    });
    if (rows.length) await write(ctx, 'gtl_epl_upsert_fixtures', { p_rows: rows });
    scored = rows.length;
    bonus = settleBonus(drafted, weekResults(fixtures));
    if (!bonus.ready) return { reason: 'results_pending', detail: { scored } };
  }
  const nextLabel = savedLabel(ctx.state, 'after', week.week);
  if (!nextLabel) return { reason: 'snapshot_pending', detail: { scored } };
  const prevLabel = savedLabel(ctx.state, 'after', week.week - 1);
  if (!prevLabel) stop('snapshot_missing');
  let snaps;
  try { snaps = await ctx.service.rpc('gtl_epl_read_snapshots', { ...ctx.run, p_labels: [prevLabel, nextLabel] }); } catch { stop('write_failed'); }
  if (!snaps?.[prevLabel] || !snaps?.[nextLabel]) stop('snapshot_missing');
  const weekly = weeklyScores(snaps[prevLabel], snaps[nextLabel]);
  const totals = new Map(managersFromSnapshot(snaps[nextLabel]).map(m => [m.ownerId, m.seasonTotal]));
  if (week.pickOrder.some(id => !weekly[id] || !totals.has(id))) stop('scores_incomplete');
  const clubOf = new Map(drafted.map(p => [p.managerId, p.club]));
  const awards = bonus.winners.map(id => ({ owner_id: id, points: bonus.awards[id], margin: bonus.awards[id] / 5, club: clubOf.get(id) }));
  const bonusTotals = ctx.state.bonusTotals ?? {};
  const order = pickOrder(week.pickOrder.map(id => ({ id, weekScore: weekly[id].for, weekBonus: bonus.awards[id] ?? 0,
    seasonTotal: totals.get(id) + (Number(bonusTotals[id]) || 0) + (bonus.awards[id] ?? 0) })));
  const windowEnd = Date.parse(week.windowEnd);
  // The next week's first kickoff is unknown until its fixtures are read; until then it is the window end (no pick can be
  // saved without fixtures), and the fixtures job moves it earlier to the real first kickoff.
  const next = week.week >= 38 ? null : { week: week.week + 1, window_start: iso(windowEnd), window_end: iso(windowEnd + WEEK_MS), first_kickoff: iso(windowEnd + WEEK_MS), pick_order: order };
  const result = await write(ctx, 'gtl_epl_settle_week', { p_season: week.season, p_week: week.week, p_awards: awards, p_next: next });
  return { scored, awarded: Number(result?.awarded) || 0, winners: bonus.winners.length, nextOpened: result?.nextOpened === true };
}

async function nudgeJob(ctx) {
  const week = openWeek(ctx);
  if (ctx.now >= Date.parse(week.firstKickoff)) stop('not_due');
  if (!list(ctx.state.fixtures).length) stop('no_fixtures');
  const picks = list(ctx.state.picks);
  const clock = onTheClock(week.pickOrder, picks.map(p => ({ managerId: p.ownerId, club: p.club })));
  if (!clock) stop('nothing_due');
  if (!list(ctx.state.managers).some(m => m.ownerId === clock && m.subscribed === true)) stop('no_subscription');
  try { await ctx.push.ready(); } catch { stop('vapid_unavailable'); }
  const marked = await write(ctx, 'gtl_epl_mark_nudge', { ...ctx.run, p_season: week.season, p_week: week.week, p_owner: clock, p_key: `${week.season}-${week.week}-${clock}-${picks.length}` });
  if (marked?.recorded !== true) stop('already_nudged');
  const payload = nudgePayload({ season: week.season, week: week.week, firstKickoff: week.firstKickoff });
  const ttl = (Date.parse(week.firstKickoff) - ctx.now) / 1000;
  let sent = 0, failed = 0;
  for (const subscription of list(marked.subscriptions)) {
    const { outcome } = await ctx.push.send({ subscription, payload, ttl, now: ctx.now });
    if (outcome === 'ok') sent++; else failed++;
  }
  if (!sent && failed) return { reason: 'send_failed', detail: { sent, failed } };
  return { sent, failed };
}

const JOBS = Object.freeze({ snapshot: snapshotJob, fixtures: fixturesJob, resolve: resolveJob, settle: settleJob, nudge: nudgeJob });

/** Runs one claimed job: `{reason, detail}`, where a null reason means the job did its work. Never throws. */
export async function runEplJob({ job, service, sources, push, now, run }) {
  const fn = JOBS[job];
  if (!fn) return { reason: 'job_failed', detail: {} };
  try {
    const state = await service.rpc('gtl_epl_jobs_state', run);
    const out = await fn({ service, sources, push, now, run, state: state ?? {} });
    if (out && Object.hasOwn(out, 'reason')) return { reason: out.reason, detail: out.detail ?? {} };
    return { reason: null, detail: out ?? {} };
  } catch (error) {
    return { reason: error instanceof JobStop ? error.reason : 'job_failed', detail: {} };
  }
}

const safe = (result, job) => ({ runId: result.runId, job: result.job ?? job, status: result.status, reason: result.reason ?? null });

export function createEplJobsHandler({ service, sources, push, clock = Date.now, bodyTimeoutMs = 3000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid EPL jobs request.' }, 400);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match) return json({ error: 'Unauthorized.' }, 401);
      const { runId } = await readRunBody(request, bodyTimeoutMs);
      const claim = await service.rpc('gtl_epl_claim_job', { p_token: match[1], p_run: runId });
      if (claim.replay) return json(safe(claim));
      const run = { p_run: runId, p_claim: claim.claim };
      const { reason, detail } = await runEplJob({ job: claim.job, service, sources, push, now: clock(), run });
      const result = await service.rpc('gtl_epl_complete_job', { ...run, p_reason: reason, p_detail: detail });
      console.info(`EPL ${claim.job}: ${result.status}${reason ? ` (${reason})` : ''}.`);
      return json(safe(result, claim.job));
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized.' }, 401);
      if (['INPUT', 'GTL_SCHEDULE_RUN'].includes(error?.code)) return json({ error: 'Invalid EPL jobs request.' }, 400);
      return json({ error: 'The scheduled EPL jobs service is temporarily unavailable.' }, 503);
    }
  };
}
