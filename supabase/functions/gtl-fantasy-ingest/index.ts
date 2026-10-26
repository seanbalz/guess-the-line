import { createFantasyFeedAdapter, createFantasyFeedIngestHandler } from '../../../cloud/fantasy-feed-ingest.mjs';
import { parseFeatureOff } from '../../../cloud/feature-off.mjs';

// Separate machine endpoint (D-59): Sean's fantasy exporter uploads feed JSON into the private fantasy-feed bucket.
// Its own upload secret replaces the platform JWT check only here; the service key stays inside this function.
const service = createFantasyFeedAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createFantasyFeedIngestHandler({ service, secret: Deno.env.get('GTL_FANTASY_FEED_UPLOAD_SECRET'), featureOff: parseFeatureOff(Deno.env.get('GTL_FEATURE_OFF')) }));
