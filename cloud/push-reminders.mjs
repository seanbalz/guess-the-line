// D-28 deadline reminder worker. pg_cron dispatches it every 15 minutes inside the
// two hours before the open week's deadline (TNF kickoff, D-24) with a one-run
// capability checked in SQL, the D-24 gtl-week-open pattern. Each player whose
// Spread or Total ballot is neither submitted nor sat out (D-23) gets one push per
// mode at most; the payload names the week, the due time and the modes still open,
// never a pick, a line or another player (spoiler protection).
import { readRunBody } from './odds-refresh.mjs';
import { weekOpenAt } from '../shared/nfl-schedule.mjs';
import { importVapid, sendWebPush } from './web-push.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
export const REMINDER_LEAD_MS = 2 * 3_600_000;
export const REMINDER_MODES = ['guess_spread', 'guess_total'];
const MODE_LABEL = { guess_spread: 'Spread', guess_total: 'Total' };
const SCHEDULE_CODES = ['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED'];
const MAX_PLAYERS = 500;
class ReminderError extends Error { constructor(code) { super('Scheduled reminder request failed.'); this.code = code; } }
const list = value => (Array.isArray(value) ? value : []);

/**
 * Who gets a reminder now. `claim` is what gtl_claim_push_reminders returns: the
 * latest published week and the subscribed players' submitted, sat-out and
 * already-reminded modes. A reminder is due only between the week's open and its
 * deadline, within the last two hours, for a mode not submitted, not sat out and
 * not reminded before, to a player with at least one active subscription.
 */
export function planReminders(claim, now) {
  const week = claim?.week;
  if (!week || !Number.isInteger(week.season) || !Number.isInteger(week.week)) return { reason: 'no_week', due: [] };
  const deadline = Date.parse(week.deadline);
  if (!Number.isFinite(deadline)) return { reason: 'no_week', due: [] };
  const openAt = Date.parse(week.openAt || weekOpenAt(deadline));
  if (now < openAt) return { reason: 'not_open', due: [] };
  if (now >= deadline) return { reason: 'closed', due: [] };
  if (deadline - now > REMINDER_LEAD_MS) return { reason: 'not_due_yet', due: [] };
  const due = list(claim.players).slice(0, MAX_PLAYERS).map(player => {
    const done = new Set([...list(player.submitted), ...list(player.satOut), ...list(player.reminded)]);
    return { userId: player.userId, modes: REMINDER_MODES.filter(mode => !done.has(mode)), subscriptions: list(player.subscriptions) };
  }).filter(player => typeof player.userId === 'string' && player.modes.length && player.subscriptions.length);
  return { reason: due.length ? null : 'nothing_due', due, season: week.season, week: week.week, deadline: new Date(deadline).toISOString() };
}

/** "5:15 PM" in Pacific time, without the narrow no-break space newer ICU puts before PM. */
export function pacificClock(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

/** The whole notification. Week number, due time and mode names only. D-39: the text says "due", not "lock". */
export function reminderPayload({ season, week, deadline, modes }) {
  const names = REMINDER_MODES.filter(mode => modes.includes(mode)).map(mode => MODE_LABEL[mode]);
  if (!names.length) throw new Error('A reminder needs at least one mode.');
  return {
    title: 'Guess The Line',
    body: `Week ${week} picks are due ${pacificClock(deadline)} PT. ${names.join(' and ')} still open.`,
    tag: `gtl-deadline-${season}-${week}`,
  };
}

export function createPushReminderAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid reminder configuration.');
  return {
    async rpc(name, body) {
      if (!['gtl_claim_push_reminders', 'gtl_mark_push_reminder', 'gtl_record_push_delivery', 'gtl_complete_push_reminders'].includes(name)) throw new Error('Invalid reminder operation.');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        let code;
        try { code = (await response.json()).message; } catch { /* No raw provider error escapes. */ }
        throw new ReminderError(SCHEDULE_CODES.includes(code) ? code : 'UNAVAILABLE');
      }
      return response.json();
    },
  };
}

const safe = result => ({ runId: result.runId, status: result.status, reason: result.reason ?? null, sent: Number(result.sent) || 0, failed: Number(result.failed) || 0 });

/**
 * `vapid` holds the three Edge Function secrets read at run time. Missing or
 * invalid keys end the run as failed/vapid_unavailable before any send.
 */
export function createPushReminderHandler({ service, vapid, clock = Date.now, fetchImpl = fetch, bodyTimeoutMs = 3000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid reminder request.' }, 400);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match) return json({ error: 'Unauthorized.' }, 401);
      const { runId } = await readRunBody(request, bodyTimeoutMs);
      const job = await service.rpc('gtl_claim_push_reminders', { p_token: match[1], p_run: runId });
      if (job.replay) return json(safe(job));
      const finish = async (reason, sent = 0, failed = 0) => json(safe(await service.rpc('gtl_complete_push_reminders', { p_run: runId, p_claim: job.claim, p_reason: reason, p_sent: sent, p_failed: failed })));
      const now = clock(), plan = planReminders(job, now);
      if (plan.reason) return finish(plan.reason);
      let keys;
      try { keys = await importVapid(vapid || {}); } catch { return finish('vapid_unavailable'); }
      let sent = 0, failed = 0;
      for (const player of plan.due) {
        const marked = await service.rpc('gtl_mark_push_reminder', { p_run: runId, p_claim: job.claim, p_user: player.userId, p_season: plan.season, p_week: plan.week, p_modes: player.modes });
        const modes = list(marked?.modes).filter(mode => player.modes.includes(mode));
        if (!modes.length) continue;
        const payload = reminderPayload({ season: plan.season, week: plan.week, deadline: plan.deadline, modes });
        const ttl = (Date.parse(plan.deadline) - now) / 1000;
        const results = await Promise.all(player.subscriptions.map(async subscription => {
          const { outcome } = await sendWebPush({ subscription, payload, vapid: keys, ttl, fetchImpl, now });
          await service.rpc('gtl_record_push_delivery', { p_run: runId, p_claim: job.claim, p_endpoint: subscription.endpoint, p_outcome: outcome });
          return outcome;
        }));
        for (const outcome of results) outcome === 'ok' ? sent++ : failed++;
      }
      return finish(failed && !sent ? 'send_failed' : null, sent, failed);
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized.' }, 401);
      if (['INPUT', 'GTL_SCHEDULE_RUN'].includes(error?.code)) return json({ error: 'Invalid reminder request.' }, 400);
      return json({ error: 'The scheduled reminder service is temporarily unavailable.' }, 503);
    }
  };
}
