import { createFeaturesAdapter, createFeaturesHandler } from '../../../cloud/features-run.mjs';

// Separate machine endpoint (redesign stage 70, M-26): pg_cron's dispatcher calls it every 15 minutes once Sean enables the
// schedule. A short-lived per-run capability is verified by SQL, never logged or kept in the Edge environment.
const service = createFeaturesAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createFeaturesHandler({ service }));
