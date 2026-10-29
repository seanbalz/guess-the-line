import { createEplJobsAdapter, createEplJobsHandler, createEplPush, createEplSources } from '../../../cloud/epl-jobs.mjs';

// Separate machine endpoint (plan 2026-10-28-epl-pick-a-team.md, Task 5): pg_cron dispatches one run per job and
// five-minute slot (supabase/admin/epl_jobs_cron.sql). A short-lived per-run capability is verified by SQL
// (gtl_epl_claim_job), never logged or kept in the Edge environment. The Odds API key and the VAPID secrets are read from
// Edge Function secrets at run time; they are never logged or returned.
const service = createEplJobsAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
const sources = createEplSources({ apiKey: Deno.env.get('THE_ODDS_API_KEY') });
const push = createEplPush({ vapid: {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY'), privateKey: Deno.env.get('VAPID_PRIVATE_KEY'), subject: Deno.env.get('VAPID_SUBJECT'),
} });
Deno.serve(createEplJobsHandler({ service, sources, push }));
