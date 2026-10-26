// The scheduled features job (redesign build plan stage 70, M-26): the gtl-league-features Edge function. pg_cron's dispatcher
// (gtl_dispatch_league_features) queues one run per 15-minute slot and calls this machine-only endpoint with a single-use
// capability; the worker claims the run in SQL, runs exactly the commissioner's code (cloud/features.mjs runFeatures, trigger
// 'schedule', the schedule's authorizing commissioner as actor, the run's own id so a retry replays) and completes the run.
// It reads no provider and no network beyond this project's own PostgREST, and it writes only through gtl_record_feature_results.
// The schedule starts disabled; Sean enables it after a live dry run (supabase/admin/league_features_cron.sql).
import { readRunBody } from './odds-refresh.mjs';
import { runFeatures } from './features.mjs';

const NAMES = Object.freeze(['gtl_claim_league_features', 'gtl_complete_league_features', 'gtl_read_feature_inputs', 'gtl_record_feature_results']);
const SCHEDULE_CODES = Object.freeze(['GTL_SCHEDULE_AUTH', 'GTL_SCHEDULE_RUN', 'GTL_SCHEDULE_EXPIRED']);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** The worker's PostgREST caller: only its four service-only functions, a 10 s timeout, no redirects, no provider details. */
export function createFeaturesAdapter({ url, serviceRoleKey, fetchImpl = fetch }) {
  return {
    async rpc(name, body) {
      if (!NAMES.includes(name)) throw new Error('Invalid operation');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, url), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        let code; try { code = (await response.json()).message; } catch { /* Provider details stay private. */ }
        const error = new Error('Features operation unavailable');
        error.code = SCHEDULE_CODES.includes(code) ? code : 'UNAVAILABLE';
        throw error;
      }
      return response.json();
    },
  };
}

export function createFeaturesHandler({ service }) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (new URL(request.url).search) return json({ error: 'Invalid request' }, 400);
    const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
    if (!token) return json({ error: 'Unauthorized' }, 401);
    try {
      const { runId } = await readRunBody(request, 3000);
      const job = await service.rpc('gtl_claim_league_features', { p_token: token[1], p_run: runId });
      if (job.replay) return json({ runId, status: job.status });
      let reason = null;
      try {
        const summary = await runFeatures({ rpc: (name, args) => service.rpc(name, args), season: job.season, now: Date.parse(job.now), trigger: 'schedule', actor: job.actorId, runId: job.runId });
        if (summary?.skipped === 'no_season') reason = 'no_season';
      } catch { reason = 'features_failed'; }
      const result = await service.rpc('gtl_complete_league_features', { p_run: runId, p_claim: job.claim, p_reason: reason });
      return json({ runId, status: result.status, reason }, reason === 'features_failed' ? 503 : 200);
    } catch (error) {
      if (error?.code === 'GTL_SCHEDULE_AUTH') return json({ error: 'Unauthorized' }, 401);
      if (error?.code === 'INPUT') return json({ error: 'Invalid request' }, 400);
      return json({ error: 'Features job unavailable' }, 503);
    }
  };
}
