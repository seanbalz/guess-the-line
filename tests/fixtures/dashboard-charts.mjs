// Explicitly synthetic UI data, never a sportsbook quote or player record.
import { seed } from '../../server/store.mjs';
import { createEngine } from '../../server/engine.mjs';
export function chartFixture(mode = 'guess_spread') {
  const data = createEngine(seed(), () => Date.parse('2026-10-08T18:00:00Z')).view('sean', mode);
  const total = mode === 'guess_total';
  Object.assign(data, { playerId:'sean', scoringPolicy:'submission-time', revealed:true, locked:false, submittedAt:'2026-10-08T17:00:00Z', snapshot:null, scoringBenchmark:null, provisionalAnalysis:null, history:[], scoreComparisonHistory:[], audit:[], revisionCount:0, maxPoints:150, officialEligible:true });
  data.league = {...data.league, name:'Preview · sample data', roster:[{id:'sean',name:'Alex',role:'Player'},{id:'troy',name:'Jordan',role:'Player'},{id:'luke',name:'Casey',role:'Player'}]};
  const ref = value => ({status:'available',value,source:'Synthetic UI example — not betting data',savedAt:data.submittedAt,capturedAt:'2026-10-08T16:59:00Z',observedAt:'2026-10-08T16:58:00Z'});
  data.games = data.games.map((g,index) => {const prediction=total?44: -3, delta=[0,.5,1,2,3][index%5];return {...g,prediction,market:prediction+delta,points:10-delta*2,scoringReference:ref(prediction+delta),currentConsensus:{...ref(total?47:-4),status:'stale'},analysisMarket:null,lastMarketReference:null,bet:null,opponents:[{id:'troy',name:'Jordan',value:total?45:-2,points:8,scoringReference:ref(total?46:-3)},{id:'luke',name:'Casey',value:null,points:null,scoringReference:null}]};});
  data.score=data.games.reduce((sum,g)=>sum+g.points,0);
  data.standings=data.league.roster.map(p=>({...p,submitted:p.id!=='luke',filled:p.id==='luke'?0:15,points:p.id==='sean'?data.score:p.id==='troy'?120:null,error:p.id==='sean'?19.5:15,exact:p.id==='sean'?3:0,record:null,scoredGames:p.id==='luke'?0:15,officialEligible:true}));
  data.statuses={guess_spread:{filled:15,submittedAt:data.submittedAt},guess_total:{filled:15,submittedAt:data.submittedAt},betting_challenge:{filled:0,submittedAt:null}};
  data.marketLineHistory = ['2026-10-08T16:00:00Z','2026-10-08T17:00:00Z','2026-10-08T18:00:00Z'].map((capturedAt,i)=>({id:`example-${i}`,source:'Synthetic UI example — not betting data',status:'collected',verified:false,timeBasis:'collection',capturedAt,quotedAt:capturedAt,games:Object.fromEntries(data.games.map(g=>[g.id,{value:total?45+i:-3-i*.5}]))}));
  data.oddsSchedule=null;data.marketFeed={status:'stale',source:'Synthetic UI example',collectedAt:'2026-10-08T18:00:00Z'};
  return data;
}
