import { createWeekOpenAdapter, createWeekOpenHandler } from '../../../cloud/week-open.mjs';

// Separate machine endpoint (D-24): pg_cron dispatches it at Monday 00:00 Pacific.
// A short-lived per-run capability is verified by SQL, never logged or in Edge env.
const service = createWeekOpenAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createWeekOpenHandler({ service }));
