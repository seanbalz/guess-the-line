// EPL delivery stage 3 (M-43, 20261110110000_gtl_epl_score_import.sql, hosted): the commissioner's reviewed Sleeper
// screenshot weekly-score import. Four service-only tables, three service-only RPCs and the two commissioner routes.
// Inert probes: p_by is the reserved missing id (the writer and the reader refuse a non-commissioner before any read or
// write), the attestation is false and no image hash, score or order is supplied. Signed-out route probes prove only
// authentication protection.
import { missingId } from './fixtures.mjs';
export const tables = Object.freeze(['epl_score_imports', 'epl_score_import_rows', 'epl_score_import_sources', 'epl_score_import_openings']);
export const rpcChecks = Object.freeze([
  ['gtl_epl_score_import_head', { p_season: 0, p_week: 0 }],
  ['gtl_epl_import_weekly_scores', { p_by: missingId, p_season: 0, p_week: 0, p_extracted_week: null, p_week_corrected: false,
    p_sources: [], p_scores: [], p_expected_order: [], p_bonus_included: false, p_correction: false, p_awards: [] }],
  ['gtl_epl_score_import_state', { p_by: missingId, p_season: 0, p_week: 0 }],
]);
export const apiChecks = Object.freeze([
  ['epl/admin/scores/read', {}],
  ['epl/admin/scores/import', { season: 0, week: 0, sources: [], scores: [], expectedOrder: [], bonusIncluded: false }],
]);
// M-43 (20261110110000) is hosted as 20261110203856 since November 10, 2026 and both routes ship in gtl-api from
// 1ba75282 (RELEASE_2026_11_10_MIGRATIONS_M41_M47.md), so every entry left this list.
export const awaitingDeploy = Object.freeze({});
