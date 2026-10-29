import test from 'node:test';
import assert from 'node:assert/strict';
import { runEplJob } from '../cloud/epl-jobs.mjs';
import { completeEplTotals, eplFinalCaptureDueAt } from '../shared/epl-corrections.mjs';
const OWNERS=Array.from({length:8},(_,i)=>String(i+1));
const totals=()=>OWNERS.map(owner_id=>({owner_id,settings:{fpts:500,fpts_against:400}}));
const week={season:2026,week:9,windowStart:'2026-10-30T00:00Z',windowEnd:'2026-11-04T00:00Z',firstKickoff:'2026-10-31T12:30Z',pickOrder:OWNERS,status:'resolved'};
const match={eventId:'a',home:'ARS',away:'LIV',commenceTime:'2026-11-02T20:00Z',status:'scheduled',homeGoals:null,awayGoals:null};
function fixture({installed=true,interval=true,expired=false,final=false}={}) {
  let now=Date.parse('2026-11-02T22:45Z'),outage=false;
  const state={week:{...week},fixtures:[{...match,...(final?{status:'final',homeGoals:1,awayGoals:0}:{})}],picks:[{ownerId:OWNERS[0],club:'ARS'}],queues:{},prices:[],
    snapshots:['after-mw08','daily-2026-11-02','daily-2026-11-03','daily-2026-11-04'],bonusTotals:{},budget:{remaining:400,paused:false}};
  const calls=[],reads=[];let scoreCalls=0,sleeperCalls=0;
  const off=code=>{const error=new Error('off');error.code=code;throw error;};
  const service={async rpc(name,args){calls.push([name,args]);switch(name){
    case 'gtl_epl_jobs_state':return state;
    case 'gtl_epl_apply_recheck_orders':return installed?{applied:0,sameOrder:0,preserved:0,pending:0}:off('GTL_EPL_ORDER_UPDATE_OFF');
    case 'gtl_epl_recheck_state':return null;
    case 'gtl_epl_capture_interval':return !installed?off('GTL_EPL_CAPTURE_INTERVAL_OFF'):interval?{source:'commissioner_verified_schedule',scheduleSha256:'a'.repeat(64),verifiedAt:'2026-10-28T00:00Z',nextKickoff:expired?'2026-11-02T22:30Z':'2026-11-07T12:30Z'}:null;
    case 'gtl_epl_order_correction_state':return installed?[]:off('GTL_EPL_ORDER_STATE_OFF');
    case 'gtl_epl_reserve_result_read':
      if(!installed)return off('GTL_EPL_RESULT_READ_OFF');
      if(reads.length>=8)return{ok:false,reason:'limit'};
      if(reads.length&&now-reads.at(-1)<12*3600_000)return{ok:false,reason:'cooldown'};
      reads.push(now);state.budget.remaining-=2;return{ok:true};
    case 'gtl_epl_reserve_credits':state.budget.remaining-=args.p_cost;return{ok:true};
    case 'gtl_epl_record_quota':return{};
    case 'gtl_epl_upsert_fixtures':for(const row of args.p_rows)Object.assign(state.fixtures.find(f=>f.eventId===row.event_id),{status:row.status,homeGoals:row.home_goals,awayGoals:row.away_goals,commenceTime:row.commence_time});return args.p_rows.length;
    case 'gtl_epl_save_snapshot':state.snapshots.push(args.p_label);return true;
    case 'gtl_epl_flag_week_review':state.week.status='needs_review';return{};
    case 'gtl_epl_read_snapshots':return Object.fromEntries(args.p_labels.map(label=>[label,{rosters:totals()}]));
    case 'gtl_epl_settle_week':return{awarded:0,nextOpened:false};
    default:throw new Error(`unexpected ${name}`);
  }}};
  const sources={async scores(){scoreCalls++;if(outage)throw new Error('provider down');return{scores:[{...match,completed:true,homeGoals:1,awayGoals:0}],unmapped:[]};},async sleeper({label}){sleeperCalls++;return{label,capturedAt:new Date(now).toISOString(),sha256:{},payload:{state:{week:10,season:'2026'},rosters:totals()}};}};
  return {state,calls,reads,service,sources,scoreCalls:()=>scoreCalls,sleeperCalls:()=>sleeperCalls,at:value=>{now=Date.parse(value);},outage:value=>{outage=value;},
    run:(job,clock=()=>now)=>runEplJob({job,service,sources,now,run:{p_run:'fixture',p_claim:'fixture'},clock})};
}

test('Monday eligibility no longer waits for Wednesday window_end; midweek targets its verified finish rather than Monday',()=>{
  assert.equal(new Date(eplFinalCaptureDueAt(week,[match])).toISOString(),'2026-11-02T22:30:00.000Z');
  assert.equal(new Date(eplFinalCaptureDueAt(week,[{...match,commenceTime:'2026-11-01T16:00Z'}])).toISOString(),'2026-11-02T08:00:00.000Z');
  assert.equal(new Date(eplFinalCaptureDueAt(week,[{...match,commenceTime:'2026-11-04T20:00Z'}])).toISOString(),'2026-11-04T22:30:00.000Z');
  assert.equal(eplFinalCaptureDueAt(week,[]),null);
  const valid={rosters:totals()};assert.equal(completeEplTotals(valid,OWNERS),true);
  for(const rosters of [[],totals().slice(1),[...totals().slice(1),totals()[1]],totals().map(r=>({...r,settings:{fpts:'500',fpts_against:400}}))])assert.equal(completeEplTotals({rosters},OWNERS),false);
});

test('Monday final uses positive all-fixture results and exact Sleeper totals before its explicit cutoff',async()=>{
  const f=fixture();const result=await f.run('snapshot');
  assert.equal(result.reason,null);assert.equal(f.scoreCalls(),1);assert.equal(f.sleeperCalls(),1);
  assert.ok(f.state.snapshots.includes('after-mw9'));
  assert.equal(f.state.fixtures[0].status,'final');
  assert.equal(f.state.week.status,'resolved','capture never settles/opens a draft or invents a bonus');
  await f.run('snapshot');assert.equal(f.scoreCalls(),1);assert.equal(f.sleeperCalls(),1,'cached final capture buys/captures nothing twice');
});

test('snapshot and settle share durable-reservation semantics across outages/cooldown; expiry is a manual-review state',async()=>{
  const f=fixture();f.outage(true);
  assert.equal((await f.run('snapshot')).reason,'source_unavailable');assert.equal(f.scoreCalls(),1);assert.equal(f.reads.length,1);
  f.at('2026-11-02T23:00Z');assert.equal((await f.run('settle')).reason,'results_pending');
  assert.equal((await f.run('snapshot')).reason,'results_pending');assert.equal(f.scoreCalls(),1);
  f.at('2026-11-03T10:45Z');f.outage(false);assert.equal((await f.run('snapshot')).reason,null);
  assert.equal(f.scoreCalls(),2);await f.run('settle');assert.equal(f.scoreCalls(),2);
  const old=fixture();old.state.fixtures[0].commenceTime='2026-10-30T20:00Z';
  assert.equal((await old.run('snapshot')).reason,'needs_review');assert.equal(old.scoreCalls(),0);
  Object.assign(old.state.fixtures[0],{status:'final',homeGoals:1,awayGoals:0});
  assert.equal((await old.run('snapshot')).reason,null,'an explicit recovered final can unblock without another paid read');assert.equal(old.scoreCalls(),0);
});

test('unknown/expired intervals and old schema never trigger new snapshot result buys or polluted after labels',async()=>{
  for(const options of [{installed:false},{interval:false},{expired:true}]){
    const f=fixture(options);const result=await f.run('snapshot');
    assert.equal(result.reason,options.expired?'scores_incomplete':'snapshot_pending');
    assert.equal(f.scoreCalls(),0);assert.equal(f.sleeperCalls(),0);assert.ok(!f.state.snapshots.includes('after-mw9'));
    if(options.installed===false)assert.equal(result.detail.orderUpdateReady,false);
  }
  const legacy=fixture({installed:false});assert.equal((await legacy.run('settle')).reason,'snapshot_pending');assert.equal(legacy.scoreCalls(),1,'legacy scheduled settle keeps its existing paid behavior');
  const legacyFinal=fixture({installed:false});legacyFinal.at('2026-11-04T00:05Z');
  const captured=await legacyFinal.run('snapshot');assert.equal(captured.reason,null);assert.equal(captured.detail.legacyFinalCapture,true);assert.equal(captured.detail.captureIntervalReady,false);
  assert.ok(legacyFinal.state.snapshots.includes('after-mw9'));assert.equal(legacyFinal.scoreCalls(),0,'pre-M35 final capture preserves the old window path without adding a snapshot result buy');
});

test('pending rollover keeps its independent daily capture; a source fetch crossing the cutoff never anchors finals',async()=>{
  const f=fixture({final:true});f.state.snapshots=f.state.snapshots.filter(label=>label!=='daily-2026-11-02');
  const fetch=f.sources.sleeper;f.sources.sleeper=async args=>{const snap=await fetch(args);snap.payload.state.week=9;return snap;};
  assert.equal((await f.run('snapshot')).reason,'snapshot_pending');
  assert.equal(f.state.snapshots.filter(label=>label==='daily-2026-11-02').length,1);
  assert.ok(!f.state.snapshots.includes('after-mw9'));
  await f.run('snapshot');assert.equal(f.state.snapshots.filter(label=>label==='daily-2026-11-02').length,1);
  const late=fixture({final:true});late.at('2026-11-07T12:29Z');
  assert.equal((await late.run('snapshot',()=>Date.parse('2026-11-07T12:30Z'))).reason,'scores_incomplete');
  assert.ok(!late.state.snapshots.includes('after-mw9'));
});

test('Tuesday cumulative recheck at the next-round cutoff is unavailable even while Sleeper remains N+1',async()=>{
  const f=fixture({expired:true,final:true});f.state.week={...f.state.week,week:10};f.state.fixtures=[];f.state.snapshots.push('after-mw9');f.at('2026-11-03T20:05Z');
  const original=f.service.rpc;f.service.rpc=async(name,args)=>name==='gtl_epl_recheck_state'?{season:2026,week:9,lastKickoff:match.commenceTime,originalCapturedAt:'2026-11-03T02:00Z'}:original(name,args);
  assert.equal((await f.run('snapshot')).reason,'scores_incomplete');assert.equal(f.sleeperCalls(),0);
  assert.ok(!f.calls.some(([name])=>name==='gtl_epl_record_recheck'));
});


test('rejected final evidence keeps its failure reason and independently saves today daily exactly once',async()=>{
  for(const [change,crossesClock] of [[snap=>{snap.payload.rosters.pop();},false],[snap=>{snap.payload.state.season='2025';},false],
    [snap=>{snap.payload.state.week='10';},false],[snap=>{snap.payload.state.week=11;},false],
    [snap=>{snap.capturedAt='2026-11-07T12:30Z';},false],[()=>{},true]]){
    const f=fixture({final:true});f.state.snapshots=f.state.snapshots.filter(label=>label!=='daily-2026-11-02');
    const original=f.sources.sleeper;f.sources.sleeper=async args=>{const snap=await original(args);if(args.label.startsWith('after-'))change(snap);return snap;};
    const crossClock=crossesClock?()=>Date.parse('2026-11-07T12:30Z'):undefined;
    assert.equal((await f.run('snapshot',crossClock)).reason,'scores_incomplete');
    assert.ok(!f.state.snapshots.includes('after-mw9'));
    assert.equal(f.state.snapshots.filter(label=>label==='daily-2026-11-02').length,1);
    assert.equal(f.calls.filter(([name,args])=>name==='gtl_epl_save_snapshot'&&args.p_label==='daily-2026-11-02').length,1);
    await f.run('snapshot',crossClock);
    assert.equal(f.state.snapshots.filter(label=>label==='daily-2026-11-02').length,1);
    assert.ok(!f.state.snapshots.includes('after-mw9'));
  }
});


test('second order recompute reads a fresh clock after correction fetch/writer instead of run start',async()=>{
 const f=fixture({final:true});f.state.week={...f.state.week,week:10};f.state.fixtures=[];f.state.snapshots.push('after-mw9');f.at('2026-11-03T20:05Z');
 const before=Date.parse('2026-11-03T20:05Z'),after=before+60_000;let clock=before;
 const original=f.service.rpc;f.service.rpc=async(name,args)=>{
   if(name==='gtl_epl_recheck_state')return {season:2026,week:9,lastKickoff:match.commenceTime,originalCapturedAt:'2026-11-03T02:00Z'};
   if(name==='gtl_epl_record_recheck'){clock=after;return {recorded:true,scoresChanged:true,status:'needs_review'};}
   return original(name,args);
 };
 const outcome=await f.run('snapshot',()=>clock);
 assert.equal(outcome.reason,'needs_review');
 const applies=f.calls.filter(([name])=>name==='gtl_epl_apply_recheck_orders');
 assert.equal(applies.length,2);assert.equal(Date.parse(applies[0][1].p_now),before);assert.equal(Date.parse(applies[1][1].p_now),after);
});
