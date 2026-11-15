import test from 'node:test';
import assert from 'node:assert/strict';
import { readRetainedPropOffers, propOfferCandidates } from '../cloud/parlay-offer-candidates.mjs';
import { buildResearchAssessments } from '../shared/research-assessments.mjs';
const now = Date.parse('2026-11-15T18:00:00Z');
const game = { id:'DAL-PHI', kickoff:'2026-11-15T20:00:00Z', spread:{visible:true}, total:{visible:true} };
const board = {season:2026,week:10,games:[game]};
const q = { gameId:game.id,kickoff:game.kickoff,provider:'the-odds-api',book:'fanduel',source:'FanDuel',odds:-110,
  observedAt:'2026-11-15T17:50:00Z', capturedAt:'2026-11-15T17:51:00Z',
  selection:{market:'prop',key:'player_pass_yds',playerId:'00-0000001',playerName:'Fixture',side:'over',line:200.5,unit:'yards'} };
const row = qs => ({game_id:game.id,markets:[q.selection.key],status:'finished',error:null,quote_payload:qs});
test('reads current real offers without editorial candidates or provider call',async()=>{
 let query; const service={retainedResearchQuotes: async x=>{query=x;return [row([q])];}};
 assert.deepEqual((await readRetainedPropOffers(service,board,now)).quotes,[q]);
 assert.equal(query.game_id,'in.(DAL-PHI)');
});
test('empty newest successful capture withdraws older and stale quotes fail closed',async()=>{
 assert.equal((await readRetainedPropOffers({retainedResearchQuotes:async()=>[row([]),row([q])]},board,now)).quotes.length,0);
 assert.equal((await readRetainedPropOffers({retainedResearchQuotes:async()=>[row([{...q, observedAt:'2026-11-15T16:00:00Z'}])]},board,now)).quotes.length,0);
});
test('locked and started games neither query nor leak; bounded reads fail closed',async()=>{
 const service={retainedResearchQuotes:async()=>{throw Error('must not read');}};
 assert.equal((await readRetainedPropOffers(service,{...board,games:[{...game,spread:{visible:false}}]},now)).status,'locked');
 assert.equal((await readRetainedPropOffers(service,board,Date.parse(game.kickoff))).status,'locked');
 assert.equal((await readRetainedPropOffers({retainedResearchQuotes:async()=>Array(501).fill(row([q]))},board,now)).status,'coverage-limit');
});
test('offers survive absent research; baseline evidence needs sampled period; per-book offers preserved',()=>{
 const research={generatedAt:'2026-11-15T17:00:00Z',source:{stats:{url:'https://example.org/stats',sha256:'a'.repeat(64)}},games:[{gameId:game.id,players:[{playerId:q.selection.playerId,playerName:'Fixture',markets:[{key:q.selection.key,unit:'yards',baseline:{status:'available',projection:230,sample:8,holdout:{mae:40,count:3},trainingPeriod:{from:'2026-09-15T18:00:00Z',to:'2026-11-10T18:00:00Z'}}}]}]}]};
 const candidates=propOfferCandidates([q,{...q,book:'draftkings',odds:-105}],research,now);
 assert.equal(candidates.length,1); assert.equal(candidates[0].evidence.length,1);
 const snapshot={version:1,season:2026,week:10,generatedAt:research.generatedAt,sources:[],candidates,quotes:[q,{...q,book:'draftkings',source:'DraftKings',odds:-105}]};
 const [a]=buildResearchAssessments({board,snapshot,now}).assessments;
 assert.equal(a.color,'yellow');assert.equal(a.offers.length,2);assert.equal(a.quote.book,'draftkings');
 assert.equal(propOfferCandidates([q],null,now)[0].evidence.length,0);
 delete research.games[0].players[0].markets[0].baseline.trainingPeriod;
 assert.equal(propOfferCandidates([q],research,now)[0].evidence.length,0);
});
test('readAssessments connects retained quotes even with no imported research snapshot', async()=>{
 const {readAssessments}=await import('../cloud/research-assessments.mjs');
 const service={rpc:async(name)=>name==='gtl_read_research_snapshot'?null:[],retainedResearchQuotes:async()=>[row([q])]};
 const result=await readAssessments({service,board,userId:'fixture',now});
 assert.equal(result.assessments.length,1); assert.equal(result.assessments[0].quote.book,'fanduel');
 assert.equal(result.assessments[0].color,'gray'); assert.equal(result.coverage.propOffers.count,1);
 const locked=await readAssessments({service,board:{...board,games:[{...game,total:{visible:false}}]},userId:'fixture',now});
 assert.equal(locked.assessments.length,0);assert.equal(locked.coverage.propOffers.count,0);
});
