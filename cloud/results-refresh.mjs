import { readRunBody } from './odds-refresh.mjs';
import { buildSettlementResults, validateSettlementPayload, createVirtualSettlementAdapter } from './virtual-settlement.mjs';
const names=['gtl_claim_results_refresh','gtl_complete_results_refresh','gtl_settle_virtual_units','gtl_settle_social_pending'];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createResultsAdapter({url,serviceRoleKey,fetchImpl=fetch}) {
 const adapter=createVirtualSettlementAdapter({url,serviceRoleKey,fetchImpl});
 return {...adapter,async rpc(name,body){
  if(!names.includes(name))throw Error('Invalid operation');
  const response=await fetchImpl(new URL(`/rest/v1/rpc/${name}`,url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){
   let code;try{code=(await response.json()).message;}catch{}
   const error=Error('Results operation unavailable');
   // 404: the function is not in the schema yet (the worker can ship before its migration is applied).
   error.code=['GTL_SCHEDULE_AUTH','GTL_SCHEDULE_RUN','GTL_SCHEDULE_EXPIRED'].includes(code)?code:response.status===404?'MISSING':'UNAVAILABLE';throw error;
  }
  return response.json();
 }};
}
export function createResultsHandler({service,clock=Date.now}) {
 return async request=>{
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(new URL(request.url).search)return json({error:'Invalid request'},400);
  const token=/^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization')||'');
  if(!token)return json({error:'Unauthorized'},401);
  try {
   const {runId}=await readRunBody(request,3000);
   const job=await service.rpc('gtl_claim_results_refresh',{p_token:token[1],p_run:runId});
   if(job.replay)return json({runId,status:job.status});
   let reason=null,plans;
   try {
    const csv=await service.schedule();
    plans=job.scopes.map(({season,week})=>({season,week,...buildSettlementResults(csv,season,week,{observedAt:new Date(clock()).toISOString()})}));
    for(const plan of plans)validateSettlementPayload(plan.payload);
   } catch {reason='schedule_unavailable';}
   if(!reason)try {
    for(const plan of plans)if(plan.finals.length)await service.rpc('gtl_settle_virtual_units',{p_season:plan.season,p_week:plan.week,p_results:plan.payload});
   } catch {reason='settlement_failed';}
   // M-19 (D-64, proposed): then settle pending shared Bet Tracker tickets from the finals the ledger now holds, once the
   // game's Pacific day has ended. It reads only stored finals, so it runs even when this run's download failed. A missing
   // function (migration not applied yet) is a no-op; any other failure fails the run.
   try {await service.rpc('gtl_settle_social_pending',{p_season:Number.isInteger(job.season)?job.season:null,p_week:null,p_now:null,p_dry_run:false});}
   catch(error) {if(error?.code!=='MISSING')reason=reason??'settlement_failed';}
   const result=await service.rpc('gtl_complete_results_refresh',{p_run:runId,p_claim:job.claim,p_reason:reason});
   return json({runId,status:result.status,reason},reason?503:200);
  } catch(error) {if(error?.code==='GTL_SCHEDULE_AUTH')return json({error:'Unauthorized'},401); if(error?.code==='INPUT')return json({error:'Invalid request'},400);return json({error:'Results refresh unavailable'},503);}
 };
}
