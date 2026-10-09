// D-24 automatic week opening. A machine-only endpoint dispatched by pg_cron at
// Monday 00:00 America/Los_Angeles: it claims a one-run capability in SQL, finds
// the NFL week whose first game is the next one after now, builds the slate from
// the public nflverse schedule and publishes it through the same gtl_publish_week
// RPC the commissioner's manual Publish Week uses. A republish is a no-op.
import { readRunBody } from './odds-refresh.mjs';
import { NFLVERSE_SCHEDULE_URL, buildSlate, nextWeek, weekOpenAt } from '../shared/nfl-schedule.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const SCHEDULE_CODES = ['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED'];
const PUBLISH_REASONS = { GTL_SLATE_CONFLICT: 'slate_conflict', GTL_COMMUNITY_FORBIDDEN: 'commissioner_unavailable', GTL_COMMUNITY_INVALID: 'publish_failed' };
class WeekOpenError extends Error { constructor(code) { super('Scheduled week open request failed.'); this.code = code; } }
const safe = result => ({ runId: result.runId, status: result.status, reason: result.reason ?? null });

export function createWeekOpenAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password || !serviceRoleKey) throw new Error('Invalid week open configuration.');
  return {
    async schedule() {
      const response = await fetchImpl(NFLVERSE_SCHEDULE_URL, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Public schedule unavailable.');
      return response.text();
    },
    async rpc(name, body) {
      if (!['gtl_claim_week_open', 'gtl_complete_week_open', 'gtl_publish_week'].includes(name)) throw new Error('Invalid week open operation.');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        let code;
        try { code = (await response.json()).message; } catch { /* No raw provider error escapes. */ }
        throw new WeekOpenError(SCHEDULE_CODES.includes(code) || Object.hasOwn(PUBLISH_REASONS, code) ? code : 'UNAVAILABLE');
      }
      return response.json();
    },
  };
}

/**
 * Decides what one run should do: the target is the week whose deadline (first
 * kickoff) is next after `now`; it is published only once its Monday 00:00 PT
 * open has arrived, so an off-slot dispatch (the other DST cron, a manual dry
 * run) is a safe no-op instead of an early publish.
 */
export function planWeekOpen(csvText, season, now) {
  const target = nextWeek(csvText, season, now);
  if (!target) return { reason: 'no_upcoming_week' };
  const opensAt = weekOpenAt(target.deadline);
  if (now < Date.parse(opensAt)) return { reason: 'not_open_yet', week: target.week, opensAt };
  return { reason: null, week: target.week, opensAt, slate: buildSlate(csvText, season, target.week) };
}

export function createWeekOpenHandler({ service, clock = Date.now, bodyTimeoutMs = 3000 }) {
  return async request => {
    try {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (new URL(request.url).search) return json({ error: 'Invalid week open request.' }, 400);
      const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
      if (!match) return json({ error: 'Unauthorized.' }, 401);
      const { runId } = await readRunBody(request, bodyTimeoutMs);
      const job = await service.rpc('gtl_claim_week_open', { p_token: match[1], p_run: runId });
      if (job.replay) return json(safe(job));
      let reason = null, published = null;
      let csv;
      try { csv = await service.schedule(); } catch { reason = 'schedule_unavailable'; }
      if (!reason) {
        let plan;
        try { plan = planWeekOpen(csv, job.season, clock()); } catch { reason = 'schedule_unavailable'; }
        if (plan) reason = plan.reason;
        if (plan && !plan.reason) {
          try {
            const { slate } = plan;
            const result = await service.rpc('gtl_publish_week', { p_user: job.actorId, p_season: slate.season, p_week: slate.week,
              p_games: slate.games.map(({ neutral, ...game }) => game), p_deadline: slate.deadline, p_source: slate.source });
            if (result?.published === true) published = { season: slate.season, week: slate.week }; else reason = 'already_published';
          } catch (error) { reason = PUBLISH_REASONS[error?.code] || 'publish_failed'; }
        }
      }
      const result = await service.rpc('gtl_complete_week_open', { p_run: runId, p_claim: job.claim, p_reason: reason });
      return json({ ...safe(result), ...(published || {}) });
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized.' }, 401);
      if (['INPUT', 'GTL_SCHEDULE_RUN'].includes(error?.code)) return json({ error: 'Invalid week open request.' }, 400);
      return json({ error: 'The scheduled week open service is temporarily unavailable.' }, 503);
    }
  };
}
