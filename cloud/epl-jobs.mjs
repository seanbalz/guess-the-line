// The gtl-epl-jobs worker (plan 2026-10-28-epl-pick-a-team.md, Task 5; spec 2026-10-28-epl-fantasy-and-moneyline-design.md
// sections 5 and 6). A machine-only endpoint that pg_cron dispatches once per job and five-minute slot
// (supabase/admin/epl_jobs_cron.sql) with a one-run capability verified in SQL (M-30 gtl_epl_claim_job), the gtl-week-open
// pattern. Each run does one job against the latest week (gtl_epl_weeks, newest season and week):
//   snapshot  saves Sleeper's season totals and lineups as before-mw<N>-kickoff in the half hour before the first kickoff and
//             as after-mw<N> after Monday/verified midweek eligibility, all known results and an explicit next-round
//             interval bound (legacy window-end path before M-35); stats week N/projections N+1, only while Sleeper's
//             state is on week N+1 (still on N: wait; past N+1: scores_incomplete, nothing saved); and, when neither is due,
//             daily-<YYYY-MM-DD> once a UTC day (stats and projections week N) for Research -> Fantasy.
//   fixtures  before the first kickoff, one 1-credit EPL h2h odds read: the events with commence_time in
//             [window_start, window_end) become the week's fixtures, their median prices are stored, and the first kickoff is
//             moved earlier (never later) to the earliest one. A gap of more than 36 hours between kickoffs ends the round:
//             the window then ends 24 hours after the round's last kickoff, so a midweek round never merges with the weekend
//             round (roundEnd). A stored postponement stays while the feed lists the same kickoff. Refused when the shared
//             budget would drop below 50 credits.
//   resolve   at or after the first kickoff, the deadline resolution (shared/epl-draft.mjs resolveDeadline) for every manager
//             without a pick; once the week is resolved a rerun writes nothing.
//   settle    when every drafted club's match is final or postponed (settleBonus ready; a 2-credit scores read once the
//             drafted matches can have finished, or earlier for a finished one about to leave the 3-day feed), writes the bonus and opens week N+1 in pickOrder from
//             weeklyScores(after-mw<N-1>, after-mw<N>) plus the bonus, window [window_end, window_end + 7 days).
//             A match becomes postponed only on positive evidence (a feed lists it with a kickoff outside the week window) or
//             the commissioner's epl/admin/fixture; never because a feed stopped listing it. The commissioner can also record
//             a played match's final score there (status 'final'), so a needs_review week is never zeroed. An empty scores reply changes
//             nothing. A drafted match still unresolved once the feed can no longer report it stays scheduled and the week
//             becomes needs_review (gtl_epl_flag_week_review) until the commissioner rules, without buying again.
//   nudge     pushes the manager on the clock once per turn (key season-week-ownerId-pickCount); a manager without an
//             active push subscription is skipped and not marked.
//   dnb-check the Guess the Line gate (plan 2026-10-28-epl-moneyline.md, Task 0), dispatched once a day: the draw-no-bet
//             market (1 credit per event) for at most 3 of the week's scheduled fixtures still ahead, only with at least 60
//             credits left. The run's detail records each event's books and both prices and the dnbAvailable flag; a
//             successful check that passes opens Guess the Line for its week, and the week stays open (dnbGateOpen). With
//             fewer than 2 fixtures ahead it skips as not_due without buying or writing a verdict.
//   standings separate optional free collection: absent/disabled until M-34 and explicit enablement; one complete dated
//             Wikimedia community table per UTC day before the draft deadline. Resolution only reads persisted evidence.
// Every write goes through service RPCs. The private dnb-check run detail includes book prices as gate evidence;
// HTTP replies and logs carry counts and fixed reasons only, never a key, URL, provider text or another manager's pick.
import { readRunBody } from './odds-refresh.mjs';
import { importVapid, sendWebPush } from './web-push.mjs';
import { pacificClock } from './push-reminders.mjs';
import { fetchEplDrawNoBet, fetchEplOdds, fetchEplScores, fetchSleeperSnapshot } from './epl-sources.mjs';
import { onTheClock, pickOrder, resolveDeadline, settleBonus } from '../shared/epl-draft.mjs';
import { managersFromSnapshot, weeklyScores } from '../shared/epl-sleeper.mjs';
import { completeEplTotals, eplFinalCaptureDueAt, eplRecheckDueAt, verifiedEplResults } from '../shared/epl-corrections.mjs';
import { eplStandingsPositions } from '../shared/epl-standings.mjs';
import { fetchWikimediaEplStandings } from './epl-standings.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

export const EPL_JOBS = Object.freeze(['snapshot', 'fixtures', 'resolve', 'settle', 'nudge', 'dnb-check', 'standings']);
/** The admitted job RPCs. No ordinary player/commissioner pick, linking or seed writer is admitted. */
export const EPL_JOBS_RPCS = Object.freeze(['gtl_epl_claim_job', 'gtl_epl_complete_job', 'gtl_epl_jobs_state', 'gtl_epl_read_snapshots',
  'gtl_epl_reserve_credits', 'gtl_epl_record_quota', 'gtl_epl_mark_nudge', 'gtl_epl_upsert_fixtures', 'gtl_epl_upsert_prices',
  'gtl_epl_resolve_week', 'gtl_epl_settle_week', 'gtl_epl_save_snapshot', 'gtl_epl_set_week_window', 'gtl_epl_flag_week_review',
  'gtl_epl_recheck_state', 'gtl_epl_record_recheck', 'gtl_epl_apply_recheck_orders', 'gtl_epl_reserve_result_read', 'gtl_epl_capture_interval', 'gtl_epl_order_correction_state',
  'gtl_epl_standings_state', 'gtl_epl_save_standings', 'gtl_epl_resolve_with_standings']);
const OPTIONAL_EPL_RPCS = Object.freeze({ gtl_epl_recheck_state: 'GTL_EPL_RECHECK_OFF',
  gtl_epl_apply_recheck_orders: 'GTL_EPL_ORDER_UPDATE_OFF', gtl_epl_reserve_result_read: 'GTL_EPL_RESULT_READ_OFF',
  gtl_epl_capture_interval: 'GTL_EPL_CAPTURE_INTERVAL_OFF', gtl_epl_order_correction_state: 'GTL_EPL_ORDER_STATE_OFF',
  gtl_epl_standings_state: 'GTL_EPL_STANDINGS_OFF' });
/** Kept in step with gtl_epl_complete_job (tests/epl-jobs-sql.test.mjs checks the SQL names every one). */
export const EPL_SKIP_REASONS = Object.freeze(['no_week', 'not_open', 'not_due', 'no_fixtures', 'already_resolved', 'not_resolved', 'nothing_due',
  'budget_guard', 'budget_unknown', 'results_pending', 'snapshot_pending', 'no_subscription', 'already_nudged', 'needs_review']);
export const EPL_FAIL_REASONS = Object.freeze(['source_unavailable', 'write_failed', 'snapshot_missing', 'scores_incomplete', 'vapid_unavailable', 'send_failed', 'job_failed']);
/** The Odds API reserve every collector keeps (Global Constraints: never below reserveCredits=50). */
export const EPL_RESERVE_CREDITS = 50;
export const ODDS_COST = 1;
export const SCORES_COST = 2;
export const SNAPSHOT_LEAD_MS = 30 * 60_000;
/** The draw-no-bet gate (moneyline plan, Task 0): at most 3 events a check, only with at least 60 credits left; Guess the Line
 * opens when at least 2 of them are priced by at least 2 of the 3 books. */
export const DNB_CHECK_EVENTS = 3;
export const DNB_CHECK_FLOOR = 60;
export const DNB_MIN_EVENTS = 2;
export const DNB_MIN_BOOKS = 2;
const DNB_BOOKS = Object.freeze(['draftkings', 'fanduel', 'betmgm']);
/** A match is assumed over 150 minutes after kickoff; scores are normally not bought before every drafted match can be. */
export const RESULT_AFTER_MS = 150 * 60_000;
/** The scores read covers the last 3 days (daysFrom=3). A pending match that kicked off longer ago than this, less an hour of
 * margin, is outside the feed, so its result can never be bought: the week goes to needs_review without spending credits. */
export const SCORES_LOOKBACK_MS = 3 * 86_400_000 - 60 * 60_000;
/** A finished drafted match whose kickoff is within this long of leaving the lookback is bought now, before the rest of the week
 * is over (a Friday match in a Friday-to-Monday week). 25 hours covers two runs of the 12-hourly settle cron (09:41, 21:41). */
export const SCORES_BUY_AHEAD_MS = 25 * 60 * 60_000;
const WEEK_MS = 7 * 86_400_000;
/** A gap of more than 36 hours between kickoffs ends a round: a weekend round's widest gap (Sunday 16:30 to Monday 20:00) is
 * 27.5 hours, while a midweek round is followed by about 2.5 days before the weekend (final review; spec 6.4). */
export const ROUND_GAP_MS = 36 * 60 * 60_000;
/** A split week ends this long after its round's last kickoff, so the after-mw<N> snapshot and the next draft come before the
 * next round (which, by ROUND_GAP_MS, starts more than 12 hours later). */
export const ROUND_END_AFTER_MS = 24 * 60 * 60_000;
const CODES = new Set(['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED', 'GTL_EPL_INVALID', 'GTL_EPL_NO_WEEK', 'GTL_EPL_NOT_RESOLVED',
  'GTL_EPL_CLUB_TAKEN', 'GTL_EPL_DRAFT_CLOSED', 'GTL_EPL_STANDINGS_INVALID', 'GTL_EPL_STANDINGS_CONFLICT']);
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
        let data;
        try { data = await response.json(); } catch { /* No raw provider error escapes. */ }
        // Gate M deploys compatible source before SQL. Only this exact missing entry point is optional; permissions,
        // transport failures and missing functions inside an installed RPC still fail the run.
        const optional = OPTIONAL_EPL_RPCS[name];
        const absentEntry = data?.code === 'PGRST202' || (data?.code === '42883'
          && new RegExp(`^function (?:public\\.)?${name}\\s*\\(`, 'i').test(data?.message ?? ''));
        if (optional && response.status === 404 && absentEntry) throw new EplJobsError(optional);
        throw new EplJobsError(CODES.has(data?.message) ? data.message : 'UNAVAILABLE');
      }
      return response.json();
    },
  };
}

/** The worker's public sources. A missing Odds API key fails only the jobs that need it. */
export function createEplSources({ apiKey, fetchImpl = fetch, clock = Date.now } = {}) {
  return {
    sleeper: ({ label, statsWeek, projectionsWeek }) => fetchSleeperSnapshot({ fetchImpl, label, statsWeek, projectionsWeek, clock, enrichDirectory: /^daily-\d{4}-\d{2}-\d{2}$/.test(label) }),
    odds: () => fetchEplOdds({ apiKey, fetchImpl }),
    scores: ({ onQuota } = {}) => fetchEplScores({ apiKey, fetchImpl, daysFrom: 3, onQuota }),
    drawNoBet: ({ eventIds }) => fetchEplDrawNoBet({ apiKey, fetchImpl, eventIds }),
    standings: ({ season, completedRound }) => fetchWikimediaEplStandings({ season, completedRound, fetchImpl, clock }),
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
/** The daily snapshot label for a time: daily-<YYYY-MM-DD> (UTC). */
export const dailyLabel = ms => `daily-${new Date(ms).toISOString().slice(0, 10)}`;
const savedLabel = (state, kind, week) => [...(kind === 'after' ? [`after-mw${week}-recheck`] : []), ...snapshotLabels(kind, week)]
  .find(label => list(state.snapshots).includes(label)) ?? null;

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
  const applyOrders = async () => {
    try { return { orderUpdateReady: true, ...await ctx.service.rpc('gtl_epl_apply_recheck_orders', { ...ctx.run, p_now: iso(ctx.clock()) }) }; }
    catch (error) { if (error?.code !== 'GTL_EPL_ORDER_UPDATE_OFF') throw error; return { orderUpdateReady: false }; }
  };
  let order = await applyOrders();
  const orderDetail = () => ({ orderUpdateReady: order.orderUpdateReady, ordersApplied: order.applied ?? 0, ordersPreserved: order.preserved ?? 0, ordersPending: order.pending ?? 0 });
  let correction = null;
  let recheckReady = true;
  try { correction = await ctx.service.rpc('gtl_epl_recheck_state', { ...ctx.run, p_now: iso(ctx.now) }); }
  catch (error) { if (error?.code !== 'GTL_EPL_RECHECK_OFF') throw error; recheckReady = false; }
  const correctionDueAt = eplRecheckDueAt(correction ?? {});
  const recheckDue = correctionDueAt !== null && ctx.now >= correctionDueAt;
  const n = week.week, kickoff = Date.parse(week.firstKickoff), due = [];
  let finalWait = null, captureInterval = null;
  if (week.status === 'open' && list(ctx.state.fixtures).length && ctx.now >= kickoff - SNAPSHOT_LEAD_MS && ctx.now < kickoff && !savedLabel(ctx.state, 'before', n))
    due.push({ label: snapshotLabels('before', n)[0], statsWeek: Math.max(1, n - 1), projectionsWeek: n });
  const finalDueAt = eplFinalCaptureDueAt(week, list(ctx.state.fixtures));
  if (finalDueAt !== null && ctx.now >= finalDueAt && !savedLabel(ctx.state, 'after', n)) {
    captureInterval = await readCaptureInterval(ctx, week.season, n);
    if (!captureInterval.supported && ctx.now >= Date.parse(week.windowEnd)) {
      captureInterval.legacy = true;
      due.push({ label: snapshotLabels('after', n)[0], statsWeek: n, projectionsWeek: Math.min(38, n + 1) });
    }
    else if (!captureInterval.ready) finalWait = { reason: 'snapshot_pending', detail: { captureIntervalReady: false } };
    else if (ctx.now >= captureInterval.expires) finalWait = { reason: 'scores_incomplete', detail: { captureIntervalReady: true, captureExpired: true } };
    else {
      let refreshed;
      try { refreshed = await refreshWeekResults(ctx, list(ctx.state.fixtures)); }
      catch (error) { if (!(error instanceof JobStop)) throw error; refreshed = { reason: error.reason, detail: {} }; }
      if (refreshed.reason) finalWait = refreshed;
      else due.push({ label: snapshotLabels('after', n)[0], statsWeek: n, projectionsWeek: Math.min(38, n + 1) });
    }
  }
  // The fantasy view's daily capture (plan 2026-10-28-epl-fantasy.md, Task 2): the latest totals, lineups and this week's
  // projections, once a UTC day, only when no other capture is due (that one is the day's capture).
  const daily = dailyLabel(ctx.now);
  if (!due.length && !list(ctx.state.snapshots).includes(daily)) due.push({ label: daily, statsWeek: n, projectionsWeek: n });
  if (!due.length && !recheckDue && !finalWait) return { reason: 'nothing_due', detail: { recheckReady, ...orderDetail() } };
  const saved = [];
  let pending = false;
  for (const args of due) {
    const snap = await provider(ctx, () => ctx.sources.sleeper(args));
    // after-mw<N> must be taken while Sleeper is on week N+1 (spec 6.4: the matchweek is Sleeper's week). Still on N: Sleeper
    // has not rolled over, so wait for the next run. Past N+1: two Sleeper weeks fell in one app week, and the weekly scores
    // would span both, so nothing is saved and the commissioner supplies after-mw<N> (epl/admin/snapshot) (final review).
    const sleeperWeek = snap?.payload?.state?.week;
    if (args.label.startsWith('after-') && n < 38) {
      const contaminated = !captureInterval?.legacy && (!captureInterval?.ready || !Number.isFinite(Date.parse(snap.capturedAt))
        || Date.parse(snap.capturedAt) >= captureInterval.expires || ctx.clock() >= captureInterval.expires);
      // A rejected final is not a daily capture. Retain its failure reason while allowing the independent daily refresh.
      if (contaminated || !Number.isInteger(sleeperWeek) || sleeperWeek < 1 || sleeperWeek > 38
        || String(snap?.payload?.state?.season) !== String(week.season) || sleeperWeek > n + 1
        || !completeEplTotals(snap.payload, week.pickOrder)) {
        finalWait = { reason: 'scores_incomplete', detail: { captureIntervalReady: captureInterval?.ready === true } };
        pending = true; continue;
      }
      if (sleeperWeek < n + 1) { pending = true; continue; }
    }
    const ok = await write(ctx, 'gtl_epl_save_snapshot', { p_label: snap.label, p_captured_at: snap.capturedAt, p_week: n, p_sha256: snap.sha256, p_payload: snap.payload });
    saved.push({ label: snap.label, saved: ok === true });
  }
  // A pending final is not a daily capture. Preserve its independent once-per-UTC-day refresh and directory enrichment.
  if (pending && !saved.length && !list(ctx.state.snapshots).includes(daily)) {
    const snap = await provider(ctx, () => ctx.sources.sleeper({ label: daily, statsWeek: n, projectionsWeek: n }));
    const ok = await write(ctx, 'gtl_epl_save_snapshot', { p_label: daily, p_captured_at: snap.capturedAt, p_week: n, p_sha256: snap.sha256, p_payload: snap.payload });
    saved.push({ label: daily, saved: ok === true });
  }
  if (recheckDue) {
    const interval = await readCaptureInterval(ctx, correction.season, correction.week);
    if (!interval.ready && interval.supported) return { reason: 'snapshot_pending', detail: { saved: saved.length, recheckReady, captureIntervalReady: false, ...orderDetail() } };
    if (interval.ready && ctx.now >= interval.expires) return { reason: 'scores_incomplete', detail: { saved: saved.length, captureExpired: true, ...orderDetail() } };
    const args = { label: `after-mw${correction.week}-recheck`, statsWeek: correction.week, projectionsWeek: correction.week + 1 };
    const snap = await provider(ctx, () => ctx.sources.sleeper(args));
    const state = snap?.payload?.state;
    if (interval.ready && (!Number.isFinite(Date.parse(snap.capturedAt)) || Date.parse(snap.capturedAt) >= interval.expires || ctx.clock() >= interval.expires)) stop('scores_incomplete');
    if (!Number.isInteger(state?.week) || state.week < 1 || state.week > 38 || state.week > correction.week + 1
      || String(state.season) !== String(correction.season)) stop('scores_incomplete');
    if (snap.payload.state.week < correction.week + 1) return { reason: 'snapshot_pending', detail: { saved: saved.length, rechecked: 0 } };
    const result = await write(ctx, 'gtl_epl_record_recheck', { ...ctx.run, p_season: correction.season, p_week: correction.week,
      p_captured_at: snap.capturedAt, p_sha256: snap.sha256, p_payload: snap.payload });
    let needsReview = result?.status === 'needs_review';
    if (result?.scoresChanged && order.orderUpdateReady) {
      const updated = await applyOrders();
      needsReview = !updated.orderUpdateReady || updated.preserved > 0 || updated.pending > 0 || !(updated.applied > 0 || updated.sameOrder > 0);
      order = { ...updated, applied: (order.applied ?? 0) + (updated.applied ?? 0), preserved: (order.preserved ?? 0) + (updated.preserved ?? 0) };
    }
    const detail = { saved: saved.length, recheckReady, captureIntervalReady: interval.ready, rechecked: result?.recorded === true ? 1 : 0, scoresChanged: result?.scoresChanged === true, ...orderDetail() };
    return needsReview ? { reason: 'needs_review', detail } : detail;
  }
  if (finalWait) return { reason: finalWait.reason, detail: { ...finalWait.detail, saved: saved.length, recheckReady, ...orderDetail() } };
  if (pending) return { reason: 'snapshot_pending', detail: { saved: saved.length, recheckReady, ...orderDetail() } };
  return { saved, recheckReady, ...(captureInterval ? { captureIntervalReady: captureInterval.ready, legacyFinalCapture: captureInterval.legacy === true } : {}), ...orderDetail() };
}

async function readCaptureInterval(ctx, season, week) {
  let interval;
  try { interval = await ctx.service.rpc('gtl_epl_capture_interval', { ...ctx.run, p_season: season, p_week: week }); }
  catch (error) { if (error?.code !== 'GTL_EPL_CAPTURE_INTERVAL_OFF') throw error; return { ready: false, supported: false }; }
  if (!interval) return { ready: false, supported: true };
  const expires = Date.parse(interval.nextKickoff), verified = Date.parse(interval.verifiedAt);
  if (interval.source !== 'commissioner_verified_schedule' || !/^[a-f0-9]{64}$/.test(interval.scheduleSha256 ?? '')
    || !Number.isFinite(expires) || !Number.isFinite(verified) || verified > ctx.now || verified >= expires) stop('scores_incomplete');
  return { ready: true, supported: true, expires };
}

async function fixturesJob(ctx) {
  const week = openWeek(ctx);
  const kickoff = Date.parse(week.firstKickoff), start = Date.parse(week.windowStart), windowEnd = Date.parse(week.windowEnd);
  if (ctx.now >= kickoff) stop('not_due');
  await reserve(ctx, ODDS_COST);
  const odds = await provider(ctx, () => ctx.sources.odds());
  await recordQuota(ctx, odds.quota).catch(() => {});
  const stored = new Map(list(ctx.state.fixtures).map(f => [f.eventId, f]));
  const within = (e, until) => { const t = Date.parse(e.commenceTime); return t >= start && t < until; };
  // The fixed 7-day window can hold a midweek round and the weekend round after it; the week is the first round only, so it
  // ends ROUND_END_AFTER_MS after the last kickoff before the first gap of more than ROUND_GAP_MS (final review). The split is
  // skipped when a fixture already stored for the week (or listed for it) lies past the cut: the commissioner corrects that
  // week with epl/admin/week, and nothing stored is postponed by the split.
  const end = roundEnd(list(odds.events).filter(e => within(e, windowEnd)), windowEnd, ctx.now, stored);
  const inWindow = list(odds.events).filter(e => within(e, end));
  // A week fixture the provider now lists outside the window has moved out of the matchweek: postponed (spec 6.4).
  const moved = list(odds.events).filter(e => stored.has(e.eventId) && !inWindow.includes(e) && stored.get(e.eventId).status !== 'final');
  // A stored postponement (the commissioner's, or an earlier move) stays while the feed lists the same kickoff; a changed
  // kickoff inside the window is a reschedule (final review). gtl_epl_upsert_fixtures enforces the same rule.
  const kept = e => stored.get(e.eventId)?.status === 'postponed' && Date.parse(stored.get(e.eventId).commenceTime) === Date.parse(e.commenceTime);
  const rows = [...inWindow.map(e => fixtureRow(week, { ...e, status: kept(e) ? 'postponed' : 'scheduled' })), ...moved.map(e => fixtureRow(week, { ...e, status: 'postponed' }))];
  if (rows.length) await write(ctx, 'gtl_epl_upsert_fixtures', { p_rows: rows });
  const observed = iso(ctx.now);
  const prices = inWindow.flatMap(e => [e.home, e.away].filter(club => Number.isInteger(e.h2h?.[club]))
    .map(club => ({ event_id: e.eventId, club, market: 'h2h', price: e.h2h[club], observed_at: observed })));
  if (prices.length) await write(ctx, 'gtl_epl_upsert_prices', { p_rows: prices });
  // The deadline only ever moves earlier, and only to a kickoff still ahead; the commissioner corrects anything else.
  const first = Math.min(...inWindow.map(e => Date.parse(e.commenceTime)));
  const deadlineMoved = Number.isFinite(first) && first < kickoff && first > ctx.now;
  const windowSplit = end < windowEnd;
  if (deadlineMoved || windowSplit) {
    await write(ctx, 'gtl_epl_set_week_window', { p_season: week.season, p_week: week.week, p_window_start: week.windowStart, p_window_end: iso(end),
      p_first_kickoff: deadlineMoved ? iso(first) : week.firstKickoff });
  }
  if (!inWindow.length) return { reason: 'no_fixtures', detail: { fixtures: 0, postponed: moved.length, unknown: odds.unknown ?? 0 } };
  return { fixtures: inWindow.length, postponed: moved.length, prices: prices.length, unknown: odds.unknown ?? 0, deadlineMoved, windowSplit, remaining: odds.quota?.remaining ?? null };
}

/** The week's end: windowEnd, or ROUND_END_AFTER_MS after the round's last kickoff when a gap of more than ROUND_GAP_MS follows
 * it inside the window, the cut is still ahead, and no fixture stored or listed for the week lies past the cut. */
export function roundEnd(events, windowEnd, now, stored = new Map()) {
  const times = events.map(e => Date.parse(e.commenceTime)).sort((a, b) => a - b);
  let cut = null;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > ROUND_GAP_MS) { cut = times[i - 1] + ROUND_END_AFTER_MS; break; }
  if (cut === null || cut >= windowEnd || cut <= now) return windowEnd;
  const past = t => Number.isFinite(t) && t >= cut;
  if ([...stored.values()].some(f => past(Date.parse(f.commenceTime))) || events.some(e => stored.has(e.eventId) && past(Date.parse(e.commenceTime)))) return windowEnd;
  return cut;
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
  // Resolve queues and uniquely decisive prices without requiring an unrelated standings read at all.
  const favorability = Object.fromEntries(clubs.map(club => [club, { twoWay: price(club, 'draw_no_bet'), threeWay: price(club, 'h2h') }]));
  const picks = list(ctx.state.picks).map(p => ({ managerId: p.ownerId, club: p.club }));
  const queues = Object.fromEntries(Object.entries(ctx.state.queues ?? {}).map(([owner, q]) => [owner, list(q)]));
  let resolved, standings = null;
  try { resolved = resolveDeadline({ order: week.pickOrder, picks, queues, clubs, favorability, requirePosition: true }); }
  catch (error) {
    if (error?.message !== 'EPL_STANDINGS_REQUIRED') throw error;
    let state;
    try { state = await ctx.service.rpc('gtl_epl_standings_state', { ...ctx.run, p_season: week.season, p_week: week.week, p_now: iso(ctx.clock()) }); }
    catch (e) { if (e?.code === 'GTL_EPL_STANDINGS_OFF') stop('needs_review'); throw e; }
    const checked = eplStandingsPositions(state?.snapshot?.record, { season: week.season, completedRound: week.week - 1, now: ctx.clock() });
    if (checked.status !== 'ready' || !state?.snapshot?.id) stop('needs_review');
    standings = state.snapshot;
    for (const club of clubs) favorability[club].position = checked.positions[club];
    resolved = resolveDeadline({ order: week.pickOrder, picks, queues, clubs, favorability, requirePosition: true });
  }
  const rows = resolved.filter(r => r.source !== 'pick').map(r => ({ owner_id: r.managerId, club: r.club, source: r.source }));
  let result;
  if (standings) {
    try { result = await ctx.service.rpc('gtl_epl_resolve_with_standings', { ...ctx.run, p_season: week.season, p_week: week.week, p_rows: rows,
      p_standings: standings.id, p_now: iso(ctx.clock()) }); }
    catch (error) { if (['GTL_EPL_STANDINGS_INVALID', 'GTL_EPL_STANDINGS_CONFLICT'].includes(error?.code)) stop('needs_review'); stop('write_failed'); }
  } else result = await write(ctx, 'gtl_epl_resolve_week', { p_season: week.season, p_week: week.week, p_rows: rows });
  const count = source => rows.filter(r => r.source === source).length;
  return { added: Number(result?.added) || 0, queue: count('queue'), auto: count('auto'), none: count('none'), ...(standings ? { standings: 'wikimedia-community' } : {}) };
}

async function standingsJob(ctx) {
  const week = openWeek(ctx);
  if (week.week <= 1 || ctx.now >= Date.parse(week.firstKickoff)) stop('not_due');
  let state;
  try { state = await ctx.service.rpc('gtl_epl_standings_state', { ...ctx.run, p_season: week.season, p_week: week.week, p_now: iso(ctx.clock()) }); }
  catch (error) { if (error?.code === 'GTL_EPL_STANDINGS_OFF') stop('not_open'); throw error; }
  if (state?.enabled !== true) stop('not_open');
  const cached = state.snapshot?.record;
  if (eplStandingsPositions(cached, { season: week.season, completedRound: week.week - 1, now: ctx.clock() }).status === 'ready'
    && cached.capturedAt.slice(0, 10) === iso(ctx.now).slice(0, 10)) stop('nothing_due');
  const reply = await provider(ctx, () => ctx.sources.standings({ season: week.season, completedRound: week.week - 1 }));
  if (reply?.status !== 'ready' || eplStandingsPositions(reply.data, { season: week.season, completedRound: week.week - 1, now: ctx.clock() }).status !== 'ready') stop('source_unavailable');
  const saved = await write(ctx, 'gtl_epl_save_standings', { ...ctx.run, p_season: week.season, p_week: week.week, p_record: reply.data, p_now: iso(ctx.clock()) });
  return { saved: saved?.saved === true, completedRound: week.week - 1, source: 'wikimedia-community' };
}

async function refreshWeekResults(ctx, fixtures, { legacy = false } = {}) {
  const { week } = ctx.state;
  let modern = true;
  if (legacy) {
    try { await ctx.service.rpc('gtl_epl_order_correction_state', { p_season: week.season }); }
    catch (error) { if (error?.code !== 'GTL_EPL_ORDER_STATE_OFF') throw error; modern = false; }
  }
  const first = firstMatches(fixtures);
  const required = modern ? fixtures : [...new Set(list(ctx.state.picks).filter(p => p.club).map(p => first.get(p.club)).filter(Boolean))];
  const requiredIds = new Set(required.map(f => f.eventId));
  if ((!required.length && !modern) || verifiedEplResults(required)) return { fixtures, scored: 0 };
  if (!fixtures.length) return { fixtures, reason: 'no_fixtures', detail: { scored: 0 } };
  const waiting = required.filter(f => f.status === 'scheduled');
  if (waiting.length) {
    const age = f => ctx.now - Date.parse(f.commenceTime);
    // A required match the 3-day scores feed no longer covers can never be read again: it stays scheduled and the week waits
    // for the commissioner (needs_review), never postponed by absence and never bought for again (security review, pre-T8).
    const outside = waiting.filter(f => age(f) > SCORES_LOOKBACK_MS);
    if (outside.length) {
      if (week.status === 'resolved') await write(ctx, 'gtl_epl_flag_week_review', { p_season: week.season, p_week: week.week });
      return { reason: 'needs_review', detail: { outsideFeed: outside.length } };
    }
    // Buy once every pending drafted match can have finished, or earlier when a finished one is about to leave the feed
    // (fix round 2: a Friday match would otherwise be outside the feed by the time Monday's match is over).
    const ready = waiting.filter(f => age(f) >= RESULT_AFTER_MS);
    const expiring = ready.filter(f => age(f) > SCORES_LOOKBACK_MS - SCORES_BUY_AHEAD_MS);
    if (!ready.length || (ready.length < waiting.length && !expiring.length)) stop('results_pending');
    const budget = ctx.state.budget ?? {};
    if (!Number.isInteger(budget.remaining)) stop('budget_unknown');
    if (budget.paused || budget.remaining - SCORES_COST < EPL_RESERVE_CREDITS) stop('budget_guard');
    let reservation;
    try { reservation = await ctx.service.rpc('gtl_epl_reserve_result_read', { ...ctx.run, p_season: week.season, p_week: week.week, p_now: iso(ctx.now) }); }
    catch (error) {
      if (error?.code !== 'GTL_EPL_RESULT_READ_OFF') throw error;
      if (modern) return { fixtures, reason: 'results_pending', detail: { scored: 0, resultReadReady: false } };
      await reserve(ctx, SCORES_COST); reservation = { ok: true, legacy: true };
    }
    if (reservation?.ok !== true) {
      if (['budget_guard', 'budget_unknown'].includes(reservation?.reason)) stop(reservation.reason);
      return { fixtures, reason: 'results_pending', detail: { scored: 0, resultReadReady: true, cooldown: reservation?.reason === 'cooldown', capped: reservation?.reason === 'limit' } };
    }
    let quota = null;
    const reply = await provider(ctx, () => ctx.sources.scores({ onQuota: q => { quota = q; } }));
    if (quota) await recordQuota(ctx, quota).catch(() => {});
    const scores = list(reply?.scores), unmapped = new Set(list(reply?.unmapped));
    // An empty reply (an outage the provider answered with []) is no evidence of anything: nothing changes.
    if (!scores.length) return { reason: 'results_pending', detail: { scored: 0, ...(unmapped.size ? { unmapped: unmapped.size } : { empty: true }) } };
    const byEvent = new Map(scores.map(s => [s.eventId, s]));
    const start = Date.parse(week.windowStart), end = Date.parse(week.windowEnd);
    const rows = [];
    fixtures = fixtures.map(f => {
      const s = byEvent.get(f.eventId);
      // Absent from the feed (dropped, or listed under a team name we do not map): no evidence, the fixture is unchanged.
      if (f.status !== 'scheduled' || !s || s.home !== f.home || s.away !== f.away) return f;
      let next = null;
      // Positive evidence: the feed lists the match with a kickoff outside the week window, so it has moved out (spec 6.4).
      const t = Date.parse(s.commenceTime);
      if (!Number.isFinite(t)) return f;
      if (t >= end || t < start) next = { ...f, status: 'postponed', commenceTime: s.commenceTime };
      else if (s.completed && Number.isInteger(s.homeGoals) && s.homeGoals >= 0 && Number.isInteger(s.awayGoals) && s.awayGoals >= 0)
        next = { ...f, status: 'final', homeGoals: s.homeGoals, awayGoals: s.awayGoals, commenceTime: s.commenceTime };
      if (!next) return f;
      rows.push(fixtureRow(week, next));
      return next;
    });
    if (rows.length) await write(ctx, 'gtl_epl_upsert_fixtures', { p_rows: rows });
    if (!verifiedEplResults(fixtures.filter(f => requiredIds.has(f.eventId)))) return { fixtures, reason: 'results_pending', detail: { scored: rows.length, ...(unmapped.size ? { unmapped: unmapped.size } : {}) } };
    return { fixtures, scored: rows.length };
  }
  if (week.status === 'resolved') await write(ctx, 'gtl_epl_flag_week_review', { p_season: week.season, p_week: week.week });
  return { fixtures, reason: 'needs_review', detail: { invalidResults: true } };
}

async function settleJob(ctx) {
  const { week } = ctx.state;
  if (!week) stop('no_week');
  if (week.status === 'open') stop('not_resolved');
  if (week.status !== 'resolved' && week.status !== 'needs_review') stop('nothing_due');
  const drafted = list(ctx.state.picks).filter(p => p.club).map(p => ({ managerId: p.ownerId, club: p.club }));
  const refreshed = await refreshWeekResults(ctx, list(ctx.state.fixtures), { legacy: true });
  if (refreshed.reason) return refreshed;
  const { fixtures, scored } = refreshed;
  const bonus = settleBonus(drafted, weekResults(fixtures));
  if (!bonus.ready) return { reason: 'results_pending', detail: { scored } };
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

/** The books of one recorded event that priced both clubs: only DraftKings, FanDuel and BetMGM, two American prices each. */
const pricedBooks = books => DNB_BOOKS.filter(key => {
  const prices = books && typeof books === 'object' ? books[key] : null;
  const values = prices && typeof prices === 'object' ? Object.values(prices) : [];
  return values.length === 2 && values.every(p => Number.isInteger(p) && Math.abs(p) >= 100);
});
const dnbPriced = events => new Set(list(events).filter(e => typeof e?.eventId === 'string' && e.eventId.length > 0
  && pricedBooks(e.books).length >= DNB_MIN_BOOKS).map(e => e.eventId)).size;

async function dnbCheckJob(ctx) {
  const { week } = ctx.state;
  if (!week) stop('no_week');
  const upcoming = list(ctx.state.fixtures).filter(f => f.status === 'scheduled' && Date.parse(f.commenceTime) > ctx.now)
    .sort((a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime) || (a.eventId < b.eventId ? -1 : 1)).slice(0, DNB_CHECK_EVENTS);
  if (!upcoming.length) stop('no_fixtures');
  // With fewer fixtures ahead than the gate needs, a check could only say "closed": it buys nothing and writes no verdict,
  // so a week that opened earlier stays open through its last match (the Monday run of a Friday-to-Monday round).
  if (upcoming.length < DNB_MIN_EVENTS) stop('not_due');
  const budget = ctx.state.budget ?? {};
  if (!Number.isInteger(budget.remaining)) stop('budget_unknown');
  if (budget.paused || budget.remaining < DNB_CHECK_FLOOR) stop('budget_guard');
  await reserve(ctx, upcoming.length);
  const reply = await provider(ctx, () => ctx.sources.drawNoBet({ eventIds: upcoming.map(f => f.eventId) }));
  if (reply?.quota) await recordQuota(ctx, reply.quota).catch(() => {});
  const byEvent = new Map(list(reply?.events).map(e => [e.eventId, e]));
  // A reply counts for a fixture only when it names the same two clubs; the books are kept exactly as priced.
  const events = upcoming.map(f => {
    const e = byEvent.get(f.eventId);
    const same = e?.available === true && e.home === f.home && e.away === f.away
      && Date.parse(e.commenceTime) === Date.parse(f.commenceTime);
    return { eventId: f.eventId, books: same ? Object.fromEntries(pricedBooks(e.books).map(key => [key, { [f.home]: e.books[key][f.home], [f.away]: e.books[key][f.away] }])) : {} };
  });
  const priced = dnbPriced(events);
  return { season: week.season, week: week.week, dnbAvailable: priced >= DNB_MIN_EVENTS, checked: events.length, priced,
    remaining: reply?.quota?.remaining ?? null, events };
}

/** The exit rule (moneyline plan, Task 0): Guess the Line is offered for a week once a successful dnb-check of that week
 * recorded at least 2 events priced by at least 2 of the 3 books (the flag alone is not trusted). Pass the week's dnb-check
 * run history (any order) or a single run; skipped and failed runs and checks of other weeks are ignored, so once a week has
 * opened, a later skip (budget_guard, no_fixtures, not_due) or a late-week check with fewer matches left never closes it.
 * With `{season, week}`, only checks of that week count. */
export function dnbGateOpen(runs, { season, week } = {}) {
  return (Array.isArray(runs) ? runs : [runs]).some(run => dnbRunOpens(run, season, week));
}
function dnbRunOpens(run, season, week) {
  if (!run || run.status !== 'succeeded' || run.reason != null) return false;
  const detail = run.detail ?? {};
  if (detail.dnbAvailable !== true) return false;
  if (season !== undefined && detail.season !== season) return false;
  if (week !== undefined && detail.week !== week) return false;
  return dnbPriced(detail.events) >= DNB_MIN_EVENTS;
}

const JOBS = Object.freeze({ snapshot: snapshotJob, fixtures: fixturesJob, resolve: resolveJob, settle: settleJob, nudge: nudgeJob, 'dnb-check': dnbCheckJob, standings: standingsJob });

/** Runs one claimed job: `{reason, detail}`, where a null reason means the job did its work. Never throws. */
export async function runEplJob({ job, service, sources, push, now, clock = () => now, run }) {
  const fn = JOBS[job];
  if (!fn) return { reason: 'job_failed', detail: {} };
  try {
    const state = await service.rpc('gtl_epl_jobs_state', run);
    const out = await fn({ service, sources, push, now, clock, run, state: state ?? {} });
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
      const { reason, detail } = await runEplJob({ job: claim.job, service, sources, push, now: clock(), clock, run });
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
