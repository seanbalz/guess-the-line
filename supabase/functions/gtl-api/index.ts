import { createOddsProvider } from '../../../cloud/odds-provider.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../../../cloud/handler.mjs';

// Supabase provides these server-only variables. Never place the service key in Vite config.
// Keep the platform's verify_jwt=true in addition to the Auth server check in the handler.
const adapter = createSupabaseAdapter({
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
});

const oddsKey = Deno.env.get('THE_ODDS_API_KEY');
// Lazy provider creation keeps normal game routes available if setup is incomplete.
// D-28: the VAPID public key is public by design; the browser needs it to subscribe.
Deno.serve(createCloudHandler({ ...adapter, oddsProvider: oddsKey ? () => createOddsProvider({ apiKey: oddsKey }) : null, pushPublicKey: Deno.env.get('VAPID_PUBLIC_KEY') }));
