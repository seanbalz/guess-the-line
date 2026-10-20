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
  assert.deepEqual(calls,['gtl_claim_results_refresh','fetch','gtl_settle_virtual_units','gtl_complete_results_refresh']);
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
