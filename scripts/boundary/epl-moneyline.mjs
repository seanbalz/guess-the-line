// M-36 applied private collection boundary, plus the EPL three-way moneyline pieces (M-42, 20261110100000, hosted).
// Inert fixtures only; no live run/user/lease/market is supplied.
import { missingId } from './fixtures.mjs';
const threeWayTables=['epl_three_way_collections'];
const threeWayRpcs=[
  ['gtl_epl_three_way_ready',{}],
  ['gtl_epl_save_market_guess_current',{p_user:missingId,p_event_id:'boundary-missing-event',p_market:'three_way',p_outcome:'draw',p_price:250,p_lock:false,p_now:null}],
  ['gtl_epl_guess_board_markets',{p_user:missingId,p_season:2000,p_week:38}],
  ['gtl_epl_bet_recommendations',{p_user:missingId,p_season:2000,p_week:38}],
  ['gtl_epl_begin_moneyline_markets',{p_event_id:'boundary-missing-event',p_user:missingId,p_run:null,p_claim:null,p_now:null}],
  ['gtl_epl_finish_moneyline_markets',{p_lease:missingId,p_token:missingId,p_event:null,p_three_way:null,p_quota:null,p_error:null,p_now:null}],
];
export const tables=Object.freeze(['epl_moneyline_attempts','epl_moneyline_collections',...threeWayTables]);
export const rpcChecks=Object.freeze([
  ['gtl_epl_moneyline_save_ready',{}],
  ['gtl_epl_save_guess_current',{p_user:missingId,p_event_id:'boundary-missing-event',p_club:'ARS',p_price:-120,p_lock:true,p_now:null}],
  ['gtl_epl_moneyline_gate',{p_season:2000,p_week:38}],
  ['gtl_epl_begin_moneyline_read',{p_event_id:'boundary-missing-event',p_user:missingId,p_run:null,p_claim:null,p_now:null}],
  ['gtl_epl_moneyline_due',{p_run:missingId,p_claim:missingId,p_now:null}],
  ['gtl_epl_finish_moneyline_read',{p_lease:missingId,p_token:missingId,p_event:null,p_quota:null,p_error:null,p_now:null}],
  ...threeWayRpcs,
]);
// M-42 (20261110100000) is hosted as 20261110203759 since November 10, 2026; gtl-api and gtl-epl-jobs were deployed from
// 1ba75282 first (RELEASE_2026_11_10_MIGRATIONS_M41_M47.md), so the three-way pieces left this list.
export const awaitingDeploy=Object.freeze({});
