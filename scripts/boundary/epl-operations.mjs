// M-35 (20261029162144, hosted) resources belong to Guess's area. Inert probes never name an actual claim or admitted schedule.
import { missingId } from './fixtures.mjs';
export const tables=Object.freeze(['epl_order_corrections','epl_result_reads','epl_capture_intervals']);
export const rpcChecks=Object.freeze([
  ['gtl_epl_reserve_result_read',{p_run:missingId,p_claim:missingId,p_season:0,p_week:0,p_now:null}],
  ['gtl_epl_apply_recheck_orders',{p_run:missingId,p_claim:missingId,p_now:null}],
  ['gtl_epl_order_correction_state',{p_season:0}],
  ['gtl_epl_capture_interval',{p_run:missingId,p_claim:missingId,p_season:0,p_week:0}],
  ['gtl_epl_attest_capture_interval',{p_by:missingId,p_season:0,p_week:0,p_next_week:0,p_next_kickoff:null,p_verified_at:null,p_schedule_sha256:null,p_reference:null,p_coverage_complete:false}],
]);
// M-35 (20261029162144) is hosted as 20261111171357 since November 11, 2026, after the gtl-api v55 / Pages release from
// 5105abed (RELEASE_2026_11_11_STAT_CORRECTIONS_M33_M35.md): its tables and RPCs left this list and must deny.
export const awaitingDeploy=Object.freeze({});
