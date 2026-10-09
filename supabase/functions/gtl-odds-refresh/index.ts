import { createOddsProvider } from '../../../cloud/odds-provider.mjs';
import { createScheduledRefreshAdapter, createScheduledRefreshHandler } from '../../../cloud/odds-refresh.mjs';

// Separate machine endpoint; existing gtl-api still requires platform JWT + Auth.
// A short-lived per-run capability is verified by SQL, never logged or in Edge env.
const service = createScheduledRefreshAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
const key = Deno.env.get('THE_ODDS_API_KEY');
Deno.serve(createScheduledRefreshHandler({ service, provider: key ? () => createOddsProvider({ apiKey: key }) : null }));
