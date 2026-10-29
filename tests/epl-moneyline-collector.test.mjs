import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createEplMoneylineAdapter, createEplMoneylineCollector, createEplMoneylineRefreshForLock, normalizeEplMoneylineEvent } from '../cloud/epl-moneyline-collector.mjs';
import { fetchEplDrawNoBet } from '../cloud/epl-sources.mjs';
import { runEplJob } from '../cloud/epl-jobs.mjs';
const T=Date.parse('2026-10-30T12:00:00Z'), at=n=>new Date(n).toISOString();
const U=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fixture={eventId:'e1',home:'ARS',away:'CHE',commenceTime:at(T+86400000)};
const books={draftkings:{ARS:-110,CHE:110},fanduel:{ARS:120,CHE:-120}};
const event=(change={})=>({...fixture,available:true,books,observedAt:at(T),bookObservedAt:{draftkings:at(T-30000),fanduel:at(T-60000)},responseSha256:'a'.repeat(64),...change});
const lease={status:'ready',leaseId:U(20),token:U(21),fixture};

test('normalizes both allowed-book medians across ±100, requires two fresh complete books and exact fixture/time/hash',()=>{
  const result=normalizeEplMoneylineEvent(event(),fixture,T);
  assert.deepEqual(result.medians,{ARS:105,CHE:-105});
  assert.deepEqual(Object.keys(result.books),['draftkings','fanduel']);
  for(const change of [{available:false},{home:'LIV'},{eventId:'e2'},{commenceTime:at(T+9)},{observedAt:at(T+1)},
    {observedAt:at(T-120001)},{responseSha256:'bad'}, {books:{draftkings:books.draftkings}},
    {books:{...books,fanduel:{ARS:-99,CHE:120}}},{books:{...books,fanduel:{ARS:-110,CHE:120,Draw:200}}},
    {bookObservedAt:{draftkings:at(T-300001),fanduel:at(T-300001)}}, {bookObservedAt:{draftkings:at(T+1),fanduel:at(T+1)}}]) {
    assert.equal(normalizeEplMoneylineEvent(event(change),fixture,T),null,JSON.stringify(change));
  }
  assert.equal(normalizeEplMoneylineEvent(event(),fixture,T+86400000),null,'no collection after kickoff');
  const extra=normalizeEplMoneylineEvent(event({books:{...books,pinnacle:{ARS:-1000,CHE:900}}}),fixture,T);
  assert.deepEqual(extra.books,books,'unknown book never affects reference or evidence');
});

test('source observation mode retains raw-response hash, collection time and actual market/book observation timestamps',async()=>{
  const raw={id:'e1',home_team:'Arsenal',away_team:'Chelsea',commence_time:fixture.commenceTime,
    bookmakers:[{key:'draftkings',last_update:at(T-30000),markets:[{key:'draw_no_bet',outcomes:[{name:'Arsenal',price:-110},{name:'Chelsea',price:110}]}]},
      {key:'fanduel',last_update:at(T-60000),markets:[{key:'draw_no_bet',last_update:at(T-10000),outcomes:[{name:'Arsenal',price:120},{name:'Chelsea',price:-120}]}]}]};
  const body=JSON.stringify(raw);let calls=0;
  const result=await fetchEplDrawNoBet({apiKey:'test-only-key',eventIds:['e1'],observations:true,clock:()=>T,
    fetchImpl:async()=>{calls++;return new Response(body,{headers:{'x-requests-remaining':'399'}});}});
  assert.equal(calls,1); assert.equal(result.events[0].observedAt,at(T));
  assert.equal(result.events[0].responseSha256,createHash('sha256').update(body).digest('hex'));
  assert.deepEqual(result.events[0].bookObservedAt,{draftkings:at(T-30000),fanduel:at(T-10000)});
  assert.deepEqual(normalizeEplMoneylineEvent(result.events[0],fixture,T).medians,{ARS:105,CHE:-105});
});

test('post-save hook makes at most one leased event request then one atomic finish; fixed status only, no private details',async()=>{
  const calls=[];
  const collector=createEplMoneylineCollector({clock:()=>T,rpc:async(name,args)=>{calls.push([name,args]);return name.includes('begin')?lease:{status:'refreshed',privatePrices:books};},
    drawNoBet:async args=>{calls.push(['source',args]);return {events:[event()],quota:{remaining:399,used:101,last:1}};}});
  assert.deepEqual(await collector.refreshForLock({userId:U(1),eventId:'e1'}),{status:'refreshed'});
  assert.deepEqual(calls.map(([n])=>n),['gtl_epl_begin_moneyline_read','source','gtl_epl_finish_moneyline_read']);
  assert.deepEqual(calls[0][1],{p_event_id:'e1',p_user:U(1),p_now:at(T)});
  assert.deepEqual(calls[1][1],{eventIds:['e1'],observations:true});
  assert.equal(calls[2][1].p_event.responseSha256,'a'.repeat(64));
});

test('cached/off/busy/unknown/permission/network paths never buy; provider failure still finishes conservatively without throwing',async()=>{
  for(const reply of [{status:'cached'},{status:'unavailable'},null,new Error('private error')]) {
    let source=0; const collector=createEplMoneylineCollector({clock:()=>T,rpc:async()=>{if(reply instanceof Error)throw reply;return reply;},drawNoBet:async()=>{source++;}});
    const result=await collector.refreshForLock({userId:U(1),eventId:'e1'});
    assert.equal(result.status,reply?.status==='cached'?'cached':'unavailable'); assert.equal(source,0);
  }
  for(const code of ['EPL_SOURCE_AUTH','EPL_SOURCE_RATE_LIMIT','EPL_SOURCE_UNAVAILABLE']) {
    const calls=[];const collector=createEplMoneylineCollector({clock:()=>T,rpc:async(name,args)=>{calls.push([name,args]);return calls.length===1?lease:{status:'unavailable'};},
      drawNoBet:async()=>{throw Object.assign(new Error('provider private message'),{code,quota:{remaining:399}});}});
    assert.deepEqual(await collector.refreshForLock({userId:U(1),eventId:'e1'}),{status:'unavailable'});
    assert.equal(calls[1][1].p_event,null); assert.equal(calls[1][1].p_quota.remaining,399);
    assert.equal(calls[1][1].p_error,code==='EPL_SOURCE_AUTH'?'auth':code==='EPL_SOURCE_RATE_LIMIT'?'rate_limit':'unavailable');
  }
});

test('crossing kickoff after an accepted lock sends no price to finish, never throws/refuses or backdates',async()=>{
  let now=T;const calls=[];
  const collector=createEplMoneylineCollector({clock:()=>now,rpc:async(name,args)=>{calls.push([name,args]);return name.includes('begin')?lease:{status:'unavailable'};},
    drawNoBet:async()=>{now=T+86400001;return {events:[event({observedAt:at(now)})],quota:{remaining:399}};}});
  assert.deepEqual(await collector.refreshForLock({userId:U(1),eventId:'e1'}),{status:'unavailable'});
  assert.equal(calls[1][1].p_event,null); assert.equal(calls[1][1].p_now,at(now));
});

test('optional adapter admits exact missing entry only, keeps nested/permission/transport errors distinct and refuses other RPCs',async()=>{
  for(const [status,body,code] of [[404,{code:'PGRST202'},'GTL_EPL_MONEYLINE_OFF'],[404,{code:'42883',message:'function public.gtl_epl_begin_moneyline_read(text) does not exist'},'GTL_EPL_MONEYLINE_OFF'],
    [404,{code:'42883',message:'function public.nested_missing() does not exist'},'UNAVAILABLE'],[403,{code:'42501'},'UNAVAILABLE'],[503,{code:'PGRST202'},'UNAVAILABLE']]) {
    const adapter=createEplMoneylineAdapter({url:'https://fixture.supabase.co',serviceRoleKey:'test-service-key',fetchImpl:async()=>new Response(JSON.stringify(body),{status})});
    await assert.rejects(adapter.rpc('gtl_epl_begin_moneyline_read',{}),e=>e.code===code);
    await assert.rejects(adapter.rpc('gtl_epl_save_guess',{}),e=>e.code==='CONFIG');
  }
});

test('separate moneyline job tolerates preapply exact absence; due batch stops after first unavailable provider and never reserves via old writer',async()=>{
  const run={p_run:U(20),p_claim:U(21)};
  const off=await runEplJob({job:'moneyline',now:T,run,service:{rpc:async name=>{if(name==='gtl_epl_jobs_state')return{};throw {code:'GTL_EPL_MONEYLINE_OFF'};}},sources:{}});
  assert.equal(off.reason,'not_open');
  const calls=[];let source=0;
  const result=await runEplJob({job:'moneyline',now:T,run,service:{rpc:async(name,args)=>{calls.push(name);
    if(name==='gtl_epl_jobs_state')return{};if(name==='gtl_epl_moneyline_due')return['e1','e2'];
    if(name==='gtl_epl_begin_moneyline_read')return lease; if(name==='gtl_epl_finish_moneyline_read')return{status:'unavailable'}; throw Error(name);}},
    sources:{drawNoBet:async()=>{source++;throw {code:'EPL_SOURCE_AUTH'};}}});
  assert.equal(result.reason,null);assert.deepEqual(result.detail,{refreshed:0,cached:0,unavailable:1});assert.equal(source,1);
  assert.ok(!calls.includes('gtl_epl_reserve_credits'));assert.ok(!calls.includes('gtl_epl_upsert_prices'));
});


test('missing edge provider configuration makes zero RPC/provider calls',async()=>{
  let calls=0;
  const refresh=createEplMoneylineRefreshForLock({url:'https://fixture.supabase.co',serviceRoleKey:'test-service',apiKey:'',fetchImpl:async()=>{calls++;throw Error('must not fetch');}});
  assert.deepEqual(await refresh({userId:U(1),eventId:'e1'}),{status:'unavailable'});assert.equal(calls,0);
});
