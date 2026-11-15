import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchProvider } from '../cloud/trends-research.mjs';
import { readAssessments } from '../cloud/research-assessments.mjs';
import { buildPropBaselineProjection } from '../shared/prop-baseline-projections.mjs';
import { createResearchSnapshot, sha256, scheduleSourceText } from '../shared/trends-research-candidates.mjs';
import { row, registry, venues, corrections, T } from './trends-fixture.mjs';
const at='2026-10-21T19:00:00.000Z', now=Date.parse(at), kickoff='2026-10-25T17:00:00Z', playerId='00-0036358';
const old=Array.from({length:50},(_,i)=>row({season:2025,week:i+1,gameday:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),away_team:'DAL',home_team:'NYG',home_score:30,away_score:10,spread_line:3,total_line:39}));
const upcoming=row({season:2026,week:7,gameday:'2026-10-25',away_team:'DAL',home_team:'NYG',spread_line:99,total_line:999});
const csv=T.writeCompactCsv([...old,upcoming]);
const board=()=>({season:2026,week:7,games:[{id:'DAL-NYG',awayCode:'DAL',homeCode:'NYG',kickoff,started:false,spread:{visible:true,value:-3},total:{visible:true,value:40}}]});
let prepared;
async function fixture(){
  prepared ??= await createResearchSnapshot({csv,now:at,season:2026,registry,venues,corrections});
  const snapshot=structuredClone(prepared);
  const rows=Array.from({length:8},(_,i)=>({playerId,gameId:`history-${i}`,kickoff:new Date(now-(12-i)*7*86400000).toISOString(),availableAt:new Date(now-(12-i)*7*86400000+86400000).toISOString(),value:50+i}));
  snapshot.propResearch={version:1,generatedAt:at,source:{stats:{url:'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv',sha256:'a'.repeat(64),updatedAt:at,retrievedAt:at},rosters:{url:'https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv',sha256:'b'.repeat(64),updatedAt:at,retrievedAt:at},schedule:{url:'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',sha256:await sha256(csv),semanticSha256:await sha256(scheduleSourceText(T.parseCsvRows(csv).rows)),updatedAt:at,retrievedAt:at}},games:[{gameId:'DAL-NYG',kickoff,week:7,players:[{playerId,playerName:'Synthetic Player',team:'DAL',opponent:'NYG',position:'WR',markets:[{key:'player_reception_yds',unit:'yards',baseline:buildPropBaselineProjection({rows,playerId,gameId:'DAL-NYG',kickoff,asOf:at}),matchups:{season:null,last5:null}}]}]}]};
  return snapshot;
}
async function read(snapshot,options={}){
  const provider=createResearchProvider({loadSchedule:async()=>csv,loadSnapshot:async()=>snapshot,clock:()=>now,venues,corrections,...options});
  return provider.read({board:board()});
}
test('fresh matching public source yields experimental baseline with both reveals',async()=>{
  const out=await read(await fixture()); assert.equal(out.history.status,'fresh');assert.equal(out.propResearch.status,'available');
  assert.equal(out.propResearch.games[0].players[0].markets[0].baseline.projection,53.5);
});
test('fresh generatedAt does not revive stale history or a different schedule receipt',async()=>{
  for(const change of [s=>s.source.completedSha256='d'.repeat(64),s=>s.source.scheduleSha256='d'.repeat(64),s=>s.propResearch.source.schedule.semanticSha256='d'.repeat(64)]){
    const s=await fixture();change(s);const out=await read(s);assert.equal(out.propResearch.status,'unavailable');
    assert.equal(out.propResearch.games.length,0);
  }
});
test('source refresh failure cannot leave previous prop projection available',async()=>{
  let clock=now,fail=false;const snapshot=await fixture();
  const provider=createResearchProvider({loadSchedule:async()=>{if(fail)throw Error('unavailable');return csv;},loadSnapshot:async()=>snapshot,clock:()=>clock,venues,corrections});
  assert.equal((await provider.read({board:board()})).propResearch.status,'available');
  clock+=300001;fail=true;assert.equal((await provider.read({board:board()})).propResearch.status,'unavailable');
});
test('assessment endpoint rechecks freshness, scope and final server clock, not raw provider keys',async()=>{
  const raw=(await fixture()).propResearch;
  const existing={history:{status:'fresh',sourceSha256:raw.source.schedule.sha256,scheduleSha256:raw.source.schedule.semanticSha256},propResearch:{...raw,private:'secret'}};
  const service={research:{read:async()=>existing},rpc:async name=>name==='gtl_read_research_snapshot'?null:null};
  const run=(clock=()=>now,b=board())=>readAssessments({service,board:b,userId:'synthetic',now,clock});
  let out=await run();assert.equal(out.propResearch.status,'available');assert.equal(JSON.stringify(out.propResearch).includes('secret'),false);
  existing.history.status='stale';assert.equal((await run()).propResearch.status,'unavailable');existing.history.status='fresh';
  const hidden=board();hidden.games[0].total.visible=false;assert.equal((await run(()=>now,hidden)).propResearch.status,'unavailable');
  assert.equal((await run(()=>Date.parse(kickoff))).propResearch.status,'unavailable');
});

test('equivalent schedule receipts use canonical fingerprint, not download serialization bytes',async()=>{
  const s=await fixture();s.propResearch.source.schedule.sha256='f'.repeat(64);
  assert.equal((await read(s)).propResearch.status,'available');
});
