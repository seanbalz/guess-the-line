import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { createEplService, EplError, handleEpl } from '../cloud/epl.mjs';
import { MAX_GUESS_PRICE, MAX_DNB_PRICE, distance, validGuessPrice } from '../shared/epl-moneyline.mjs';
import { EplGuessError, eplGuessView, storableEplPrice } from '../cloud/epl-guess.mjs';
const USER={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.test',emailConfirmed:true};
const OWNER='473955676301815808',OTHER='719658248843632640';
const NOW=Date.parse('2026-10-30T10:00Z'),KICK='2026-10-31T12:30:00.000Z';
const fixture={eventId:'e1',home:'ARS',away:'CHE',commenceTime:KICK,status:'scheduled',kickedOff:false};
const guess=(extra={})=>({eventId:'e1',ownerId:OWNER,club:'ARS',price:-130,status:'draft',savedAt:new Date(NOW).toISOString(),lockedAt:null,referencePrice:null,referenceObservedAt:null,referenceSource:null,distance:null,state:'draft',...extra});
function world(options={}){
 const calls=[];let current=options.current??guess(),stamp=NOW;
 const service={
  async guessReady(){calls.push('ready');return options.ready!==false;},
  async guessWeeks(){calls.push('weeks');return [{season:2026,week:9}];},
  async guessGate(season,week){calls.push(['gate',season,week]);stamp+=1000;return options.gate!==false;},
  async guessFixture(eventId){calls.push(['fixture',eventId]);return eventId==='e1'?{season:2026,week:9}:null;},
  async rpc(name,args){calls.push([name,args]);
   if(name==='gtl_epl_member')return options.owner===undefined?OWNER:options.owner;
   if(name==='gtl_epl_guess_board'){if(options.boardError)throw options.boardError;return {season:2026,week:9,ownerId:options.owner??OWNER,fixtures:[fixture],guesses:options.guesses??(current?[current]:[])};}
   if(name==='gtl_epl_save_guess_current'){
    if(options.saveError)throw options.saveError;
    current=guess({club:args.p_club,price:args.p_price,status:args.p_lock?'locked':'draft',lockedAt:args.p_lock?args.p_now:null,savedAt:args.p_now,state:args.p_lock?'pending':'draft'});
    return current;
   }
   if(name==='gtl_epl_guess_leaderboard')return {season:2026,rows:[]};
   throw new Error(`Unexpected ${name}`);
  },
  async refreshForLock(args){calls.push(['refresh',args]);stamp=Date.parse(KICK)+1000;if(options.refreshError)throw options.refreshError;return {status:'unavailable',prices:'PRIVATE'};},
 };
 const call=(route,body={})=>handleEpl({route:`/epl/guess/${route}`,body,user:USER,service,clock:()=>stamp});
 return {service,calls,call,clock:()=>stamp};
}
test('storable prices reject malformed values and integer overflow before any save or refresh',async()=>{
 for(const price of [NaN,Infinity,100.5,'-130',null,0,99,-99,2147483648,-2147483648,Number.MAX_SAFE_INTEGER,2147483647,-2147483647,MAX_GUESS_PRICE+1,-MAX_GUESS_PRICE-1]){
  assert.equal(storableEplPrice(price),false);const f=world();await assert.rejects(f.call('save',{eventId:'e1',club:'ARS',price,lock:false}),e=>e instanceof EplGuessError&&e.status===400&&e.code==='GTL_EPL_GUESS_INVALID');assert.deepEqual(f.calls,[]);
 }
 for(const lock of [null,undefined,0,1,'true']){const f=world();await assert.rejects(f.call('save',{eventId:'e1',club:'ARS',price:-130,lock}),e=>e.status===400);assert.deepEqual(f.calls,[]);}
 for(const price of [-MAX_GUESS_PRICE,MAX_GUESS_PRICE,-100,100])assert.equal(storableEplPrice(price),true);
});
test('read is open, fixed-field, server-week based, preserves gated-off history and never refreshes',async()=>{
 const f=world({gate:false});const view=await f.call('read');assert.equal(view.available,false);assert.equal(view.reason,'prices_not_verified');assert.equal(view.week,9);assert.equal(view.guesses[0].status,'draft');assert.equal(view.ownerNames[OWNER],'Sean');assert.equal(view.weeks[0].available,false);
 assert.ok(!JSON.stringify(f.calls).includes('refresh'));assert.ok(!JSON.stringify(view).includes('PRIVATE'));
 for(const owner of [null,'commissioner']){const x=world({owner,current:null});x.service.rpc=async(name)=>name==='gtl_epl_guess_board'?{season:2026,week:9,ownerId:null,fixtures:[fixture],guesses:[]}:owner;assert.equal((await x.call('read')).ownerId,null);}
 await assert.rejects(f.call('read',{season:2026}),e=>e.status===400);
 await assert.rejects(f.call('read',{season:2026,week:9,now:'past'}),e=>e.status===400);
});
test('exact missing schema reads unavailable; permissions/real errors do not look like a closed gate',async()=>{
 const f=world({boardError:new EplError(404,'off','GTL_EPL_OFF')});const v=await f.call('read');assert.equal(v.reason,'schema_unavailable');assert.deepEqual(v.guesses,[]);
 await assert.rejects(world({boardError:new Error('private permission')}).call('read'),/private permission/);
});
test('save validates member and exact-week gate before writer; unlinked commissioner cannot write',async()=>{
 for(const owner of [null,'commissioner']){const f=world({owner});await assert.rejects(f.call('save',{eventId:'e1',club:'ARS',price:-130,lock:true}),e=>e.code==='GTL_EPL_GUESS_NOT_MEMBER');assert.equal(f.calls.length,1);}
 const f=world({gate:false});await assert.rejects(f.call('save',{eventId:'e1',club:'ARS',price:-130,lock:true}),e=>e.code==='GTL_EPL_GUESS_OFF');assert.ok(!f.calls.some(c=>c[0]==='gtl_epl_save_guess_current'||c[0]==='refresh'));
});
test('draft saves do not refresh; accepted lock saves first with fresh server time then refreshes once and reads back',async()=>{
 const d=world();assert.equal((await d.call('save',{eventId:'e1',club:'ARS',price:-130,lock:false})).status,'draft');assert.ok(!d.calls.some(c=>c[0]==='refresh'));
 for(const refreshError of [null,new Error('provider private')]){const f=world({refreshError});const saved=await f.call('save',{eventId:'e1',club:'ARS',price:-140,lock:true});assert.equal(saved.status,'locked');
 const names=f.calls.filter(Array.isArray).map(c=>c[0]);assert.deepEqual(names,['gtl_epl_member','fixture','gate','gtl_epl_save_guess_current','refresh','gtl_epl_guess_board']);
 assert.equal(f.calls.find(c=>c[0]==='gtl_epl_save_guess_current')[1].p_now,new Date(NOW+1000).toISOString());assert.equal(saved.lockedAt,new Date(NOW+1000).toISOString());assert.ok(f.clock()>Date.parse(KICK));}
});
test('closed returns only persisted own draft, locked returns accepted own guess, neither calls refresh',async()=>{
 for(const code of ['GTL_EPL_GUESS_CLOSED','GTL_EPL_GUESS_LOCKED']){
  const current=code.endsWith('LOCKED')?guess({status:'locked',state:'pending',lockedAt:new Date(NOW).toISOString()}):guess();
  const f=world({current,saveError:new EplError(409,'refused',code)});
  await assert.rejects(f.call('save',{eventId:'e1',club:'ARS',price:-140,lock:true}),e=>e.code===code&&(e.draft??e.guess)?.price===-130);
  assert.ok(!f.calls.some(c=>c[0]==='refresh'));
 }
});
test('unknown save outcome or accepted lock with unreadable readback stays uncertain and never replays',async()=>{
 for(const options of [{saveError:new Error('transport private')},{boardError:new Error('readback private')}]){
  const f=world(options);await assert.rejects(f.call('save',{eventId:'e1',club:'ARS',price:-130,lock:true}),e=>e.code==='GTL_EPL_GUESS_UNCERTAIN');assert.equal(f.calls.filter(c=>c[0]==='gtl_epl_save_guess_current').length,1);
 }
});
test('defense in depth refuses raw hidden drafts, unrevealed opponents and unexpected reference fields',async()=>{
 for(const g of [guess({ownerId:OTHER}),guess({ownerId:OTHER,status:'locked',state:'pending',lockedAt:new Date(NOW).toISOString()}),guess({referencePrice:-150})])await assert.rejects(world({guesses:[g]}).call('read'),/Invalid EPL guess reply/);
 assert.deepEqual(eplGuessView({...guess(),queue:['PRIVATE'],books:'PRIVATE'}),guess());
});
test('HTTP auth/confirmed email and structured safe refusal/uncertainty response contracts',async()=>{
 const request=(body,auth=true)=>new Request('https://fixture.test/functions/v1/gtl-api/epl/guess/save',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer token'}:{})},body:JSON.stringify(body)});
 for(const [user,status] of [[null,401],[{...USER,emailConfirmed:false},403]]){const h=createCloudHandler({authenticate:async()=>user,epl:world().service});assert.equal((await h(request({}))).status,status);}
 const f=world({saveError:new Error('secret rawSQL')});const h=createCloudHandler({authenticate:async()=>USER,epl:f.service,clock:f.clock});const r=await h(request({eventId:'e1',club:'ARS',price:-130,lock:true}));assert.equal(r.status,503);const b=await r.json();assert.equal(b.code,'GTL_EPL_GUESS_UNCERTAIN');assert.equal(b.readbackRequired,true);assert.ok(!JSON.stringify(b).includes('secret'));
 assert.equal((await h(request({},false))).status,401);
});
test('real adapter narrowly maps save numeric overflow and injects lock hook; other RPC overflows stay generic',async()=>{
 const adapter=createSupabaseAdapter({url:'https://example.supabase.co',anonKey:'fixture',serviceRoleKey:'fixture',eplMoneylineRefreshForLock:async()=>({status:'cached'}),fetchImpl:async()=>Response.json({code:'22003',message:'private numeric overflow'},{status:400})});
 assert.deepEqual(await adapter.epl.refreshForLock({}),{status:'cached'});
 await assert.rejects(adapter.epl.rpc('gtl_epl_save_guess_current',{}),e=>e.status===400&&e.code==='GTL_EPL_GUESS_INVALID');
 await assert.rejects(adapter.epl.rpc('gtl_epl_guess_board',{}),e=>!e.code);
});
test('service reads only fixed week/fixture metadata and canonical exact-week boolean gate',async()=>{
 const requests=[];const service=createEplService({rpc:async(name,args)=>{requests.push([name,args]);return true;},rest:async(table,q)=>{requests.push([table,q]);return {event_id:'e1',season:2026,week:9};},rows:async(table,q,max)=>{requests.push([table,q,max]);return [{season:2026,week:9}];}});
 assert.deepEqual(await service.guessWeeks(),[{season:2026,week:9}]);assert.equal(await service.guessReady(),true);assert.equal(await service.guessGate(2026,9),true);assert.deepEqual(await service.guessFixture('e1'),{season:2026,week:9});
 assert.deepEqual(requests.find(r=>r[0]==='gtl_epl_moneyline_gate'),['gtl_epl_moneyline_gate',{p_season:2026,p_week:9}]);assert.ok(!JSON.stringify(requests).includes('gtl_epl_prices'));assert.ok(!JSON.stringify(requests).includes('gtl_epl_job_runs'));
});

test('deployed moneyline API routes require denial; absence, grants and private material are never excused',async()=>{
 const {checkCloudBoundary,awaitingDeploy}=await import('../scripts/check-cloud-boundary.mjs');
 const options={url:'https://onmrgvcehkflfaizvedl.supabase.co',key:'sb_publishable_fixture',log(){}};
 const deny=(url,r)=>Response.json({code:r.headers['Accept-Profile']?'PGRST106':'42501'},{status:r.headers['Accept-Profile']?406:401});
 for(const path of ['epl/guess/read','epl/guess/save','epl/guess/leaderboard']){
  assert.equal(awaitingDeploy[`gtl-api/${path}`],undefined);
  const fake=(status,body)=>(url,r)=>url.endsWith(`/gtl-api/${path}`)?Response.json(body,{status}):deny(url,r);
  await assert.rejects(checkCloudBoundary({...options,fetchImpl:fake(404,{error:'Not found.'})}),/unexpected 404/);
  await checkCloudBoundary({...options,strict:true,fetchImpl:deny});
  await assert.rejects(checkCloudBoundary({...options,strict:true,fetchImpl:fake(404,{error:'Not found.'})}),/unexpected 404/);
  for(const [status,body] of [[200,{}],[404,{error:'Not found.',guesses:[]}],[404,{code:'PGRST202'}],[401,{referencePrice:-150}]])await assert.rejects(checkCloudBoundary({...options,fetchImpl:fake(status,body)}),/unexpected|private material/);
 }
});


test('shared new-entry bound fits every admitted reference; larger legacy stored rows remain readable',async()=>{
 for(const sign of [-1,1]){const p=sign*MAX_GUESS_PRICE;assert.equal(validGuessPrice(p),true);assert.equal(distance(p,-sign*MAX_DNB_PRICE),2147483647);assert.equal(validGuessPrice(p+sign),false);}
 const old=guess({price:2147483647});assert.equal(eplGuessView(old).price,2147483647);
 const f=world({ready:false});const read=await f.call('read');assert.equal(read.available,false);assert.equal(read.reason,'schema_unavailable');assert.equal(read.guesses.length,1);
 await assert.rejects(f.call('save',{eventId:'e1',club:'ARS',price:-130,lock:true}),e=>e.code==='GTL_EPL_GUESS_OFF');assert.ok(!f.calls.some(c=>c[0]==='gtl_epl_save_guess_current'));
});


test('full-season gate catalog has at most four reads in flight, stable order and no provider calls',async()=>{
 const f=world({current:null});const weeks=Array.from({length:38},(_,i)=>({season:2026,week:38-i}));
 f.service.guessWeeks=async()=>weeks;let active=0,peak=0,count=0;
 f.service.guessGate=async(season,week)=>{active++;count++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return week%2===0;};
 const view=await f.call('read',{season:2026,week:9});assert.equal(peak,4);assert.equal(active,0);assert.equal(count,38);assert.deepEqual(view.weeks,weeks.map(w=>({...w,available:w.week%2===0})));assert.ok(!f.calls.some(c=>c[0]==='refresh'));
 const off=world({ready:false});off.service.guessGate=()=>{throw new Error('readiness false must buy/read no gate');};assert.equal((await off.call('read')).available,false);
});

test('a failing catalog worker yields no partial board and every active read finishes',async()=>{
 const f=world();f.service.guessWeeks=async()=>Array.from({length:8},(_,i)=>({season:2026,week:i+1}));let active=0;
 f.service.guessGate=async(season,week)=>{active++;await new Promise(resolve=>setImmediate(resolve));active--;if(week===2)throw new Error('gate unavailable');return true;};
 await assert.rejects(f.call('read'),/gate unavailable/);assert.equal(active,0);assert.ok(!f.calls.some(c=>c[0]==='gtl_epl_guess_board'));
});
