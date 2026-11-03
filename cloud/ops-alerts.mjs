// Item 22 ops alerts (docs/OPS_ALERTS.md, M-38): the gtl-ops-alerts Edge worker. Every 15 minutes pg_cron's dispatcher
// (gtl_dispatch_ops_alerts) opens and clears incidents and, only when an alert or a recovery is owed and the sean-troy-luke
// commissioner has a device, queues one run with a single-use capability and calls this machine-only endpoint, the D-28
// push reminder pattern (cloud/push-reminders.mjs). The worker claims the run in SQL, sends each owed push to the
// commissioner's devices, records every delivery, marks a push sent only once a device accepted it (a push no device
// accepted stays owed, and the next run retries it) and completes the run. The text names a job family, a week number and
// Pacific times only: never a player, a pick, a line, a guess or a score.
import { readRunBody } from './odds-refresh.mjs';
import { pacificClock } from './push-reminders.mjs';
import { importVapid, sendWebPush } from './web-push.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const NAMES = Object.freeze(['gtl_claim_ops_alerts', 'gtl_mark_ops_notification', 'gtl_record_ops_delivery', 'gtl_complete_ops_alerts']);
const SCHEDULE_CODES = Object.freeze(['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED']);
// Four hours: the most cloud/web-push.mjs allows for any push. An alert still owed after that is pushed again by a later run.
export const OPS_ALERT_TTL_S = 4 * 3600;
// The claim's own limit (oldest first); anything past it stays owed for the next run.
const MAX_NOTIFICATIONS = 20;
const PACIFIC = 'America/Los_Angeles';
class OpsAlertError extends Error { constructor(code) { super('Scheduled ops alert request failed.'); this.code = code; } }
const list = value => (Array.isArray(value) ? value : []);
const instantOf = value => (value instanceof Date ? value.getTime() : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN);
const pacificDay = instant => new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, year: 'numeric', month: 'numeric', day: 'numeric' }).format(instant);

/** "2:35 PM PT" when `at` falls on the same Pacific calendar day as `now`, otherwise "Mon 2:35 PM PT". */
export function pacificWhen(at, now) {
  const instant = instantOf(at), today = instantOf(now);
  if (!Number.isFinite(instant) || !Number.isFinite(today)) throw new Error('An ops alert needs a time.');
  const clock = `${pacificClock(instant)} PT`;
  if (pacificDay(instant) === pacificDay(today)) return clock;
  return `${new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, weekday: 'short' }).format(instant)} ${clock}`;
}

const FAMILY_NAMES = Object.freeze({ results: 'the results refresh', odds: 'the odds refresh', points: 'the Points jobs', week_open: 'the week-open job',
  features: 'the league features job', push: 'the reminder job' });
/** The job family as the alert names it. The EPL job pattern is M-38's family check. Anything else throws: no made-up name. */
export function familyName(family) {
  if (typeof family !== 'string') throw new Error('Unknown job family.');
  if (Object.hasOwn(FAMILY_NAMES, family)) return FAMILY_NAMES[family];
  const epl = /^epl:([a-z-]{1,20})$/.exec(family);
  if (epl) return `the EPL ${epl[1]} job`;
  throw new Error('Unknown job family.');
}

const weekOf = note => { if (!Number.isInteger(note.week) || note.week < 1 || note.week > 18) throw new Error('An ops alert needs its week.'); return note.week; };
// The push text (plan.md, "Push text"): the opened alert and its recovery for each kind. `when` formats the incident's time.
const TEXT = Object.freeze({
  failed: { opened: (n, when) => `${familyName(n.family)} failed at ${when()}.`, cleared: n => `${familyName(n.family)} is working again.` },
  quiet: { opened: (n, when) => `${familyName(n.family)} has not run since ${when()}.`, cleared: n => `${familyName(n.family)} is running again.` },
  'points-open': { opened: (n, when) => `Points Week ${weekOf(n)} is not open. It was due ${when()}.`, cleared: n => `Points Week ${weekOf(n)} is open now.` },
  'points-final': { opened: (n, when) => `Points Week ${weekOf(n)} is not FINAL. It was due ${when()}.`, cleared: n => `Points Week ${weekOf(n)} is FINAL now.` },
  'week-open': { opened: (n, when) => `Week ${weekOf(n)} Spread and Total is not open. It was due ${when()}.`, cleared: n => `Week ${weekOf(n)} Spread and Total is open now.` },
  test: { opened: () => 'Test alert: this phone gets GTL ops alerts.', cleared: () => 'Test alert cleared.' },
});

/**
 * The whole notification for one owed alert or recovery. The tag is the same for both phases, so a recovery replaces its
 * alert on the lock screen. An unknown kind, phase or family, a missing week or time, or a key that is not the kind's throws.
 */
export function opsAlertPayload(notification, now) {
  const note = notification && typeof notification === 'object' ? notification : {};
  const text = typeof note.kind === 'string' && Object.hasOwn(TEXT, note.kind) ? TEXT[note.kind] : null;
  if (!text || (note.phase !== 'opened' && note.phase !== 'cleared') || typeof note.key !== 'string' || !note.key.startsWith(`${note.kind}:`)) throw new Error('Unknown ops alert.');
  const body = text[note.phase](note, () => pacificWhen(note.at, now));
  return { title: note.phase === 'opened' ? 'GTL ops alert' : 'GTL ops alert cleared', body: body[0].toUpperCase() + body.slice(1), tag: `gtl-ops-${note.key}` };
}

/** The worker's PostgREST caller: only its four service-only functions, a 10 s timeout, no redirects, no provider details. */
export function createOpsAlertAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid ops alert configuration.');
  return {
    async rpc(name, body) {
      if (!NAMES.includes(name)) throw new Error('Invalid ops alert operation.');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        let code;
        try { code = (await response.json()).message; } catch { /* No raw provider error escapes. */ }
        throw new OpsAlertError(SCHEDULE_CODES.includes(code) ? code : 'UNAVAILABLE');
      }
      return response.json();
    },
  };
}

const safe = result => ({ runId: result.runId, status: result.status, reason: result.reason ?? null, sent: Number(result.sent) || 0, failed: Number(result.failed) || 0 });

/**
 * `vapid` holds the three Edge Function secrets read at run time (the gtl-push-reminders ones). Missing or invalid keys end
 * the run as failed/vapid_unavailable before any send or mark. The day in the text is judged on the claim's database clock.
 * A device that fails or is gone gets nothing more this run: a dead device is retired by gtl_record_ops_delivery, and a
 * refusing or timing-out one (10 s per send) is retried by the next run rather than up to 20 times in this one.
 */
export function createOpsAlertHandler({ service, vapid, clock = Date.now, fetchImpl = fetch, bodyTimeoutMs = 3000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid ops alert request.' }, 400);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match) return json({ error: 'Unauthorized.' }, 401);
      const { runId } = await readRunBody(request, bodyTimeoutMs);
      const job = await service.rpc('gtl_claim_ops_alerts', { p_token: match[1], p_run: runId });
      if (job.replay) return json(safe(job));
      // Always `return await finish(...)`: a refused completion must reach the error mapping below, not escape as a rejection.
      const finish = async (reason, sent = 0, failed = 0) => json(safe(await service.rpc('gtl_complete_ops_alerts', { p_run: runId, p_claim: job.claim, p_reason: reason, p_sent: sent, p_failed: failed })));
      // M-38's claim skips these itself; the same reasons here if a claim ever arrives empty.
      const notes = list(job.notifications).slice(0, MAX_NOTIFICATIONS);
      let devices = list(job.subscriptions);
      if (!notes.length) return await finish('nothing_owed');
      if (!devices.length) return await finish('no_subscriptions');
      let keys;
      try { keys = await importVapid(vapid || {}); } catch { return await finish('vapid_unavailable'); }
      const sentAt = clock(), claimedAt = instantOf(job.now), now = Number.isFinite(claimedAt) ? claimedAt : sentAt;
      let sent = 0, failed = 0;
      for (const note of notes) {
        if (!devices.length) break;
        let payload;
        try {
          if (!Number.isSafeInteger(note?.incidentId)) throw new Error('An ops alert needs its incident.');
          payload = opsAlertPayload(note, now);
        } catch {
          // One failed alert, never a crash or a guessed text; the others still go out.
          failed++;
          console.warn('Ops alert skipped: no push text for this alert.');
          continue;
        }
        const outcomes = await Promise.all(devices.map(async subscription => {
          const { outcome } = await sendWebPush({ subscription, payload, vapid: keys, ttl: OPS_ALERT_TTL_S, fetchImpl, now: sentAt });
          await service.rpc('gtl_record_ops_delivery', { p_run: runId, p_claim: job.claim, p_endpoint: subscription.endpoint, p_outcome: outcome });
          return outcome;
        }));
        for (const outcome of outcomes) outcome === 'ok' ? sent++ : failed++;
        devices = devices.filter((_, i) => outcomes[i] === 'ok');
        // Only a push a device accepted is recorded as sent; otherwise it stays owed.
        if (outcomes.includes('ok')) await service.rpc('gtl_mark_ops_notification', { p_run: runId, p_claim: job.claim, p_incident: note.incidentId, p_phase: note.phase });
      }
      console.info(`Ops alerts: ${sent} sent, ${failed} failed.`);
      return await finish(sent || !failed ? null : 'send_failed', sent, failed);
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized.' }, 401);
      if (['INPUT', 'GTL_SCHEDULE_RUN'].includes(error?.code)) return json({ error: 'Invalid ops alert request.' }, 400);
      return json({ error: 'The scheduled ops alert service is temporarily unavailable.' }, 503);
    }
  };
}
