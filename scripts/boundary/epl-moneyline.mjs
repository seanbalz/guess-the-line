// M-36 applied private collection boundary. Inert fixtures only; no live run/user/lease/market is supplied.
import { missingId } from './fixtures.mjs';
export const tables=Object.freeze(['epl_moneyline_attempts','epl_moneyline_collections']);
export const rpcChecks=Object.freeze([
  ['gtl_epl_moneyline_save_ready',{}],
  ['gtl_epl_save_guess_current',{p_user:missingId,p_event_id:'boundary-missing-event',p_club:'ARS',p_price:-120,p_lock:true,p_now:null}],
  ['gtl_epl_moneyline_gate',{p_season:2000,p_week:38}],
  ['gtl_epl_begin_moneyline_read',{p_event_id:'boundary-missing-event',p_user:missingId,p_run:null,p_claim:null,p_now:null}],
  ['gtl_epl_moneyline_due',{p_run:missingId,p_claim:missingId,p_now:null}],
  ['gtl_epl_finish_moneyline_read',{p_lease:missingId,p_token:missingId,p_event:null,p_quota:null,p_error:null,p_now:null}],
]);
export const awaitingDeploy=Object.freeze({});
