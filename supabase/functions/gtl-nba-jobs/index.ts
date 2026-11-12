import { createNbaJobsAdapter, createNbaJobsHandler, createNbaSources } from '../../../cloud/nba-jobs.mjs';

// NBA build-out N2 (docs/superpowers/specs/2026-11-10-nba-buildout-design.md): the machine-only slate and lines worker. pg_cron
// dispatches one run per due job (supabase/admin/nba_jobs_cron.sql); a short-lived per-run capability is verified by SQL
// (gtl_nba_claim_job), never logged or kept in the Edge environment. The Odds API and BALLDONTLIE keys are read from Edge
// Function secrets at run time; they are never logged or returned.
const service = createNbaJobsAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
const sources = createNbaSources({ oddsApiKey: Deno.env.get('THE_ODDS_API_KEY'), ballDontLieKey: Deno.env.get('BALLDONTLIE_API_KEY') });
Deno.serve(createNbaJobsHandler({ service, sources }));
