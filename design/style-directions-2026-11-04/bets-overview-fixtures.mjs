import {emptySocialState,socialView} from '../../shared/social-bets.mjs';
import {trackedOverview} from '../../web/src/trackedBetTerms.js';
export const OVERVIEW_ACTOR='demo-overview-owner';
// Fictional reported tickets, prices, sources and dates. Selection lines reuse the reviewed historical examples.
const ROWS=[['win',.5,1.25,150,'DraftKings'],['loss',1,0,100,'FanDuel'],['win',.75,1.5,100,'BetMGM'],['loss',.5,0,100,'DraftKings'],['win',1,2,100,'FanDuel'],['push',.5,.5,100,'BetMGM'],['win',.5,1.25,150,'DraftKings'],['win',.75,1.5,100,'FanDuel'],['pending',.5,null,null,'BetMGM'],['win',1,2,100,'DraftKings']];
export function overviewFixtures(base){
 const state=emptySocialState();
 state.entries=ROWS.map(([outcome,stakeUnits,actualReturnUnits,odds,source],i)=>{
  const parlay=i%3===0,at=new Date(Date.UTC(2026,10,2+Math.floor(i/2),18+i%2)).toISOString();
  return {...base.receipt,id:`demo-overview-${i+1}`,ownerId:OVERVIEW_ACTOR,kind:parlay?'parlay':'single',legs:structuredClone(parlay?base.receipt.legs:[base.receipt.legs[i%2]]),stakeUnits,actualReturnUnits,odds,source,outcome,countsForRecord:i!==9,placedAt:null,quotedAt:null,recordedAt:at,updatedAt:at,settledAt:outcome==='pending'?null:at,notes:'Fictional ticket example. Source, price, result and recording date are illustrative manual entries, not a quote or saved account history.',revision:0};
 });
 return state;
}
export function overviewProjection(base,filters={},extra={}){
 const read=socialView(overviewFixtures(base),{actorId:OVERVIEW_ACTOR,games:base.games,filters,now:Date.UTC(2026,10,7)});
 return trackedOverview(read,{actorId:OVERVIEW_ACTOR,...extra});
}
