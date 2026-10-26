import { createPointsJobsAdapter, createPointsJobsHandler, createPointsSources } from '../../../cloud/points-jobs.mjs';

// Separate machine endpoint (D-56 P-03): pg_cron dispatches it daily and at Tuesday and Thursday noon Pacific
// (supabase/admin/points_jobs_cron.sql) to draft and publish the Points slate, load nflverse actuals and finalize.
// A short-lived per-run capability is verified by SQL, never logged or in Edge env.
const service = createPointsJobsAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createPointsJobsHandler({ service, sources: createPointsSources() }));
