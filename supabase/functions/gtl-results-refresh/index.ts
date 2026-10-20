import { createResultsAdapter, createResultsHandler } from '../../../cloud/results-refresh.mjs';
const service=createResultsAdapter({url:Deno.env.get('SUPABASE_URL'),serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')});
Deno.serve(createResultsHandler({service}));
