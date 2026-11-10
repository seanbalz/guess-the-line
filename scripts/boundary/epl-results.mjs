// EPL delivery stage 4 (20261110120000_gtl_epl_result_announcements.sql, pending apply): Pick a Team result announcements.
// Service-only tables and job RPCs. Inert probes: a missing run/claim refuses before any read or write.
import { missingId } from './fixtures.mjs';
export const tables = Object.freeze(['epl_result_announcements', 'epl_result_deliveries', 'epl_final_result_reads']);
export const rpcChecks = Object.freeze([
  ['gtl_epl_results_state', { p_run: missingId, p_claim: missingId }],
  ['gtl_epl_reserve_final_result_read', { p_run: missingId, p_claim: missingId, p_season: 0, p_week: 0, p_now: null }],
  ['gtl_epl_record_result_announcement', { p_run: missingId, p_claim: missingId, p_season: 0, p_week: 0, p_now: null }],
]);
export const awaitingDeploy = Object.freeze(Object.fromEntries([
  ...tables.map(name => `table/${name}`), ...rpcChecks.map(([name]) => `rpc/${name}`),
].map(key => [key, '20261110120000 (EPL stage 4 result announcements apply / compatible worker deploy)'])));
