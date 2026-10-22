import { createOddsProvider } from '../../../cloud/odds-provider.mjs';
import { createCloudHandler, createSupabaseAdapter } from '../../../cloud/handler.mjs';
import loadResearchSnapshot from '../../../cloud/trends-research-snapshot.mjs';
import { createNbaGamesService } from '../../../cloud/nba-games.mjs';

// Supabase provides these server-only variables. Never place the service key in Vite config.
// Keep the platform's verify_jwt=true in addition to the Auth server check in the handler.
const adapter = createSupabaseAdapter({
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  reviewedResearchFeed: Deno.env.get('GTL_RESEARCH_REVIEWED_FEED'),
  researchSnapshotLoader: loadResearchSnapshot,
});

const oddsKey = Deno.env.get('THE_ODDS_API_KEY');
const nbaGames = createNbaGamesService({ apiKey: Deno.env.get('BALLDONTLIE_API_KEY'), cache: adapter.nbaGamesCache });
// Lazy provider creation keeps normal game routes available if setup is incomplete.
// D-28: the VAPID public key is public by design; the browser needs it to subscribe.
// GTL_FEATURE_OFF: comma-separated feature names whose writers refuse (Gate M off switches, cloud/feature-off.mjs).
Deno.serve(createCloudHandler({ ...adapter, nbaGames, oddsProvider: oddsKey ? () => createOddsProvider({ apiKey: oddsKey }) : null, pushPublicKey: Deno.env.get('VAPID_PUBLIC_KEY'), featureOff: Deno.env.get('GTL_FEATURE_OFF') }));
