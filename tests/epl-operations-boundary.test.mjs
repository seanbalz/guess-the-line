// Transport fixtures complement real SQL privilege assertions; none of these checks touches a hosted project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCloudBoundary, awaitingDeploy, privateResponse } from '../scripts/check-cloud-boundary.mjs';
import { tables,rpcChecks } from '../scripts/boundary/epl-operations.mjs';
import { APPLIED,NOT_HOSTED,REQUIRES } from './migrations.mjs';
const options={url:'https://onmrgvcehkflfaizvedl.supabase.co',key:'sb_publishable_fixture',log(){}};
const response=(status,body)=>Response.json(body,{status});
const deny=(url,request)=>request.headers['Accept-Profile']?response(406,{code:'PGRST106'}):response(401,{code:'42501'});
// M-35 is hosted as 20261111171357 since November 11, 2026, after M-33 (20261111171228); its REQUIRES entry left with that
// apply record (RELEASE_2026_11_11_STAT_CORRECTIONS_M33_M35.md).
test('M35 is hosted after M33; canonical applied M32 remains mandatory',()=>{
  assert.ok(APPLIED.includes(20261029162144));assert.ok(!NOT_HOSTED.includes(20261029162144));
  assert.ok(APPLIED.includes(20261029151727));assert.equal(REQUIRES[20261029162144],undefined);assert.ok(APPLIED.includes(20261029150000));
});
for(const [key,path,code] of [...tables.map(name=>[`table/${name}`,`/rest/v1/gtl_${name}?`,'PGRST205']),...rpcChecks.map(([name])=>[`rpc/${name}`,`/rest/v1/rpc/${name}`,'PGRST202'])])test(`${key}: denial required; exact absence and dangerous grants both fail`,async()=>{
  assert.equal(awaitingDeploy[key],undefined);
  const strict=await checkCloudBoundary({...options,strict:true,fetchImpl:deny});
  assert.deepEqual(strict.awaiting,[]);assert.equal(strict.denied,strict.checked);
  const fetchWith=(status,body)=>(url,request)=>url.includes(path)?response(status,body):deny(url,request);
  // Hosted M-35: an exact-missing reply is no longer excused, with or without --strict.
  await assert.rejects(checkCloudBoundary({...options,fetchImpl:fetchWith(404,{code})}),/unexpected 404/);
  await assert.rejects(checkCloudBoundary({...options,strict:true,fetchImpl:fetchWith(404,{code})}),/unexpected 404/);
  for(const status of [200,400,503])await assert.rejects(checkCloudBoundary({...options,fetchImpl:fetchWith(status,{})}),new RegExp(`unexpected ${status}`));
  await assert.rejects(checkCloudBoundary({...options,fetchImpl:fetchWith(404,{code:'UNRELATED'})}),/unexpected 404/);
});

test('M35 denied and exact-missing replies never carry private correction or interval fields',async()=>{
  for(const field of ['previous_order','candidate_order','baseline_snapshot_id','verified_by','schedule_sha256','nextKickoff','outcome']){
    // The exact-missing case runs the awaiting path through an explicit pendingDeploy fixture: hosted M-35 has no entry.
    for(const missing of [false,true])await assert.rejects(checkCloudBoundary({...options,...(missing?{pendingDeploy:{'table/epl_order_corrections':'migration fixture_not_applied.sql'}}:{}),fetchImpl:(url,request)=>url.includes('/rest/v1/gtl_epl_order_corrections?')?response(missing?404:401,{code:missing?'PGRST205':'42501',[field]:'private'}):deny(url,request)}),/private material/);
  }
});


test('public weather outcome is allowed in success data but never in a denied reply', async () => {
  assert.doesNotMatch(JSON.stringify({ refresh: { outcome: 'fetched' } }), privateResponse);
  for (const outcome of ['fetched', 'applied', 'same_order', 'preserved_picks', 'preserved_closed'])
    await assert.rejects(checkCloudBoundary({...options,fetchImpl:(url,request)=>url.includes('/rest/v1/gtl_epl_order_corrections?')
      ?response(401,{code:'42501',outcome}):deny(url,request)}),/private material/);
});
