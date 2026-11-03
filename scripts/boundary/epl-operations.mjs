// M-35 pending resources belong to Guess's area. Inert probes never name an actual claim or admitted schedule.
import { missingId } from './fixtures.mjs';
export const tables=Object.freeze(['epl_order_corrections','epl_result_reads','epl_capture_intervals']);
export const rpcChecks=Object.freeze([
  ['gtl_epl_reserve_result_read',{p_run:missingId,p_claim:missingId,p_season:0,p_week:0,p_now:null}],
  ['gtl_epl_apply_recheck_orders',{p_run:missingId,p_claim:missingId,p_now:null}],
  ['gtl_epl_order_correction_state',{p_season:0}],
  ['gtl_epl_capture_interval',{p_run:missingId,p_claim:missingId,p_season:0,p_week:0}],
  ['gtl_epl_attest_capture_interval',{p_by:missingId,p_season:0,p_week:0,p_next_week:0,p_next_kickoff:null,p_verified_at:null,p_schedule_sha256:null,p_reference:null,p_coverage_complete:false}],
]);
export const awaitingDeploy=Object.freeze(Object.fromEntries([
  ...tables.map(name=>`table/${name}`),...rpcChecks.map(([name])=>`rpc/${name}`),
].map(key=>[key,'20261029162144 (M-35 apply; verified interval/operator recovery prerequisite)'])));
