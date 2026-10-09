import test from 'node:test';
import assert from 'node:assert/strict';
import { accuracy, validatePrediction, closestResults, gradeBet, winRate, consensus, freezeBenchmark, validateBet } from '../server/domain.mjs';
const now=Date.parse('2026-10-08T16:00:00Z');
test('accuracy is identical for spreads and totals with floor and decimal precision',()=>{
  for(const [error,points] of [[0,10],[.5,9],[1,8],[5,0],[6,0]])assert.equal(accuracy(44.5+error,44.5),points);
  assert.equal(accuracy(-3,-3.3),9.4);assert.equal(accuracy(null,-3),null);assert.equal(accuracy(4,undefined),null);assert.equal(accuracy(NaN,3),null);
});
test('predictions require finite half points; zero is a valid total',()=>{
  for(const value of [null,'45',Infinity,NaN,.25])assert.throws(()=>validatePrediction('guess_total',value));
  assert.throws(()=>validatePrediction('guess_total',-1));assert.throws(()=>validatePrediction('invalid',4));assert.equal(validatePrediction('guess_total',0),0);assert.equal(validatePrediction('guess_spread',-9.5),-9.5);
});
test('closest results handle sole winners, two/three player ties, and missing ballots',()=>{
  assert.deepEqual(closestResults({s:3,t:4,l:5},3),{s:'W',t:'L',l:'L'});
  assert.deepEqual(closestResults({s:44,t:45},44.5),{s:'T',t:'T'});
  assert.deepEqual(closestResults({s:44,t:45,l:49},44.5),{s:'T',t:'T',l:'L'});
  assert.deepEqual(closestResults({s:3,t:3,l:3},3),{s:'T',t:'T',l:'T'});
  assert.equal(closestResults({s:3,t:null},3),null);assert.equal(closestResults({s:3},3),null);
});
test('ATS grades from the selected team perspective, totals push, and non-finals stay pending',()=>{
 const result={status:'final',home:27,away:24};
 assert.equal(gradeBet({market:'spread',side:'home',line:-3},result),'P');
 assert.equal(gradeBet({market:'spread',side:'away',line:3.5},result),'W');
 assert.equal(gradeBet({market:'spread',side:'home',line:-3.5},result),'L');
 assert.equal(gradeBet({market:'total',side:'over',line:50.5},result),'W');
 assert.equal(gradeBet({market:'total',side:'under',line:51},result),'P');
 assert.equal(gradeBet({market:'total',side:'under',line:50},result),'L');
 assert.equal(gradeBet({market:'total',side:'over',line:1},{...result,status:'live'}),null);
 assert.equal(winRate({W:2,L:1,P:7}),66.67);assert.equal(winRate({W:0,L:0,P:1}),null);
});
const quotes=[-3,-3.5,-3].map((value,i)=>({book:`fixture-book-${i}`,value,quotedAt:'2026-10-08T15:58:00Z'}));
const crossCheck={value:-3,quotedAt:'2026-10-08T15:59:00Z',source:'Action Network'};
test('consensus fails closed on source count, duplicates, stale, future, outliers, and disagreement',()=>{
 assert.equal(consensus(quotes,{now,crossCheck}).value,-3);
 assert.equal(consensus(quotes.slice(1),{now,crossCheck}),null);
 assert.equal(consensus([quotes[0],quotes[0],quotes[2]],{now,crossCheck}),null);
 assert.equal(consensus(quotes,{now:now+7*3600_000,crossCheck}),null);
 assert.equal(consensus(quotes,{now:now-3600_000,crossCheck}),null);
 assert.equal(consensus([...quotes.slice(0,2),{...quotes[2],value:20}],{now,crossCheck}),null);
 assert.equal(consensus(quotes,{now,crossCheck:{...crossCheck,value:0}}),null);
 assert.equal(consensus(quotes,{now,crossCheck:null}),null);
 assert.equal(consensus(quotes,{now,crossCheck:{...crossCheck,quotedAt:'2026-10-08T15:00:00Z'}}),null);
});
test('freeze uses final complete valid pre-kickoff snapshot and never replaces a lock',()=>{
 const cutoff='2026-10-08T16:00:00Z', base={mode:'guess_spread',capturedAt:'2026-10-08T15:59:30Z',games:{game:{quotes,crossCheck}}};
 const snapshots=[{...base,capturedAt:'2026-10-08T15:59:00Z'},base,{...base,capturedAt:'2026-10-08T16:00:01Z'}];
 const frozen=freezeBenchmark(null,snapshots,cutoff,now,['game'],'guess_spread',{practice:false});
 assert.equal(frozen.snapshot.capturedAt,base.capturedAt);
 assert.equal(freezeBenchmark(frozen,[],cutoff,now+10000,['game'],'guess_spread',{practice:false}),frozen);
 assert.equal(freezeBenchmark(null,snapshots,cutoff,now-1,['game'],'guess_spread',{practice:false}),null);
 assert.equal(freezeBenchmark(null,snapshots,null,now,['game'],'guess_spread',{practice:false}),null);
 assert.equal(freezeBenchmark(null,snapshots,cutoff,now,['missing'],'guess_spread',{practice:false}),null);
 assert.equal(freezeBenchmark(null,snapshots,cutoff,now,['game'],'guess_total',{practice:false}),null);
 assert.equal(freezeBenchmark(null,[{...base,games:{game:{quotes:[],crossCheck}}}],cutoff,now,['game'],'guess_spread',{practice:false}),null);
});
test('practice or missing eligibility cannot freeze or reuse an official spread or total benchmark',()=>{
 const cutoff='2026-10-08T16:00:00Z';
 for(const mode of ['guess_spread','guess_total']){
  const value=mode==='guess_total'?44.5:-3;
  const snapshot={mode,capturedAt:'2026-10-08T15:59:30Z',games:{game:{quotes:quotes.map(q=>({...q,value})),crossCheck:{...crossCheck,value}}}};
  const frozen=freezeBenchmark(null,[snapshot],cutoff,now,['game'],mode,{practice:false});
  assert(frozen);
  for(const eligibility of [undefined,{}, {practice:true}]){
   assert.equal(freezeBenchmark(null,[snapshot],cutoff,now,['game'],mode,eligibility),null);
   assert.equal(freezeBenchmark(frozen,[snapshot],cutoff,now,['game'],mode,eligibility),null);
  }
 }
});
test('manual quotes require valid odds, named sources, fresh time, and pre-kickoff selection',()=>{
 const bet={market:'spread',side:'home',line:-3,odds:-110,source:'Unit test only',quotedAt:'2026-10-08T15:59:00Z'},kickoff='2026-10-09T00:15:00Z';
 assert.equal(validateBet(bet,now,kickoff).line,-3);
 for(const patch of [{odds:0},{odds:99},{source:''},{side:'over'},{quotedAt:'2026-10-08T16:01:00Z'},{quotedAt:'2026-10-07T00:00:00Z'},{line:null}])assert.throws(()=>validateBet({...bet,...patch},now,kickoff));
 assert.throws(()=>validateBet(bet,Date.parse(kickoff),kickoff));
});
test('freeze honors UTC offsets through Pacific DST and rejects quote evidence recorded after capture',()=>{
 for(const [kickoff,utc] of [['2026-10-08T17:15:00-07:00','2026-10-09T00:15:00Z'],['2026-11-05T17:15:00-08:00','2026-11-06T01:15:00Z']]){
  const cutoff=Date.parse(utc),quotedAt=new Date(cutoff-60000).toISOString();
  const snapshot={mode:'guess_total',capturedAt:new Date(cutoff-30000).toISOString(),games:{g:{quotes:quotes.map(q=>({...q,value:44.5,quotedAt})),crossCheck:{value:44.5,quotedAt,source:'Action Network'}}}};
  assert(freezeBenchmark(null,[snapshot],kickoff,cutoff,['g'],'guess_total',{practice:false}));
  assert.equal(freezeBenchmark(null,[{...snapshot,capturedAt:new Date(cutoff-120000).toISOString()}],kickoff,cutoff,['g'],'guess_total',{practice:false}),null);
 }
});
