// EPL delivery stage 4 (M-44, 20261110120000_gtl_epl_result_announcements.sql, hosted): Pick a Team result announcements.
// Service-only tables and job RPCs. Inert probes: a missing run/claim refuses before any read or write.
import { missingId } from './fixtures.mjs';
export const tables = Object.freeze(['epl_result_announcements', 'epl_result_deliveries', 'epl_final_result_reads']);
export const rpcChecks = Object.freeze([
  ['gtl_epl_results_state', { p_run: missingId, p_claim: missingId }],
  ['gtl_epl_reserve_final_result_read', { p_run: missingId, p_claim: missingId, p_season: 0, p_week: 0, p_now: null }],
  ['gtl_epl_record_result_announcement', { p_run: missingId, p_claim: missingId, p_season: 0, p_week: 0, p_now: null }],
]);
// M-44 (20261110120000) is hosted as 20261110203957 since November 10, 2026; the compatible gtl-epl-jobs worker was
// deployed from 1ba75282 first (RELEASE_2026_11_10_MIGRATIONS_M41_M47.md). The 'results' schedule row is still absent.
export const awaitingDeploy = Object.freeze({});
