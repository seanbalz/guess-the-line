import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultsHandler } from '../cloud/results-refresh.mjs';
const token='a'.repeat(64), runId='00000000-0000-4000-8000-000000000001';
const request=()=>new Request('https://fixture.test',{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({runId})});
const csv='season,game_type,week,away_team,away_score,home_team,home_score\n2026,REG,5,TB,14,DAL,21\n2026,REG,6,SEA,,SF,';
test('one download settles all published scopes, skips pending and completes the claimed run',async()=>{
  const calls=[];
  const service={schedule:async()=>{calls.push('fetch');return csv;},rpc:async(name,args)=>{
    calls.push(name);
    if(name==='gtl_claim_results_refresh')return {claim:runId,scopes:[{season:2026,week:5},{season:2026,week:6}]};
    if(name==='gtl_settle_virtual_units'){assert.equal(args.p_week,5);assert.equal(args.p_results.games.length,1);return {};}
    return {status:'succeeded'};
  }};
  const r=await createResultsHandler({service})(request());assert.equal(r.status,200);
  assert.deepEqual(calls,['gtl_claim_results_refresh','fetch','gtl_settle_virtual_units','gtl_settle_social_pending','gtl_complete_results_refresh']);
});
test('unauthorized and replay requests never fetch or settle',async()=>{
 const service={rpc:async()=>({replay:true,status:'succeeded'}),schedule:async()=>{throw Error('must not fetch');}};
 const handler=createResultsHandler({service});assert.equal((await handler(new Request('https://fixture.test',{method:'POST'}))).status,401);
 assert.equal((await handler(request())).status,200);
});
test('malformed later scope causes no partial settlement',async()=>{
 let writes=0,reason;
 const service={schedule:async()=>csv.replace('SEA,,SF,','SEA,bad,SF,7'),rpc:async(name,args)=>{
 if(name==='gtl_claim_results_refresh')return {claim:runId,scopes:[{season:2026,week:5},{season:2026,week:6}]};
 if(name==='gtl_settle_virtual_units')writes++;
 if(name==='gtl_complete_results_refresh'){reason=args.p_reason;return {status:'failed'};}
 }};
 await createResultsHandler({service})(request());assert.equal(writes,0);assert.equal(reason,'schedule_unavailable');
});
test('M-19: shared tickets settle after the finals, for the claimed season; a missing function is a no-op, other failures fail the run',async()=>{
 const run=async social=>{const calls=[];let reason;
  const service={schedule:async()=>csv,rpc:async(name,args)=>{calls.push([name,args]);
   if(name==='gtl_claim_results_refresh')return {claim:runId,season:2026,scopes:[{season:2026,week:5}]};
   if(name==='gtl_settle_social_pending')return social(args);
   if(name==='gtl_complete_results_refresh'){reason=args.p_reason;return {status:reason?'failed':'succeeded'};}
   return {};
  }};
  const response=await createResultsHandler({service})(request());return {calls,reason,status:response.status};};
 const ok=await run(()=>({settled:1}));
 assert.deepEqual(ok.calls.map(([name])=>name),['gtl_claim_results_refresh','gtl_settle_virtual_units','gtl_settle_social_pending','gtl_complete_results_refresh']);
 assert.deepEqual(ok.calls[2][1],{p_season:2026,p_week:null,p_now:null,p_dry_run:false});
 assert.equal(ok.reason,null);assert.equal(ok.status,200);
 const missing=await run(()=>{throw Object.assign(Error('x'),{code:'MISSING'});});
 assert.equal(missing.reason,null,'the worker may ship before the migration is applied');
 const broken=await run(()=>{throw Object.assign(Error('x'),{code:'UNAVAILABLE'});});
 assert.equal(broken.reason,'settlement_failed');assert.equal(broken.status,503);
});
test('M-19: the adapter maps a 404 (function not in the schema yet) to MISSING and allows only the four operations',async()=>{
 const {createResultsAdapter}=await import('../cloud/results-refresh.mjs');
 const fetchImpl=async()=>new Response(JSON.stringify({code:'PGRST202',message:'Could not find the function'}),{status:404});
 const adapter=createResultsAdapter({url:'https://fixture.supabase.co',serviceRoleKey:'service-fixture',fetchImpl});
 await assert.rejects(()=>adapter.rpc('gtl_settle_social_pending',{}),error=>error.code==='MISSING');
 await assert.rejects(()=>adapter.rpc('gtl_commit_social',{}),/Invalid operation/);
});
