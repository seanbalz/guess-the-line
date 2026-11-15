import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPropResearch } from '../shared/project-prop-research.mjs';
import { buildPropBaselineProjection } from '../shared/prop-baseline-projections.mjs';
const NOW = Date.parse('2026-11-15T18:00:00Z');
const at = new Date(NOW).toISOString(), kickoff = '2026-11-16T18:00:00Z';
const playerId = '00-0036358';
function fixture() {
  const board = {season:2026,week:11,games:[{id:'SEA-DEN',awayCode:'SEA',homeCode:'DEN',kickoff,started:false,spread:{visible:true},total:{visible:true}}]};
  const rows = Array.from({length:8},(_,i)=>({playerId,gameId:`game-${i}`,kickoff:new Date(NOW-(10-i)*7*86400000).toISOString(),availableAt:new Date(NOW-(10-i)*7*86400000+86400000).toISOString(),value:50+i}));
  const baseline = buildPropBaselineProjection({rows,playerId,gameId:'SEA-DEN',kickoff,asOf:at});
  const match = {defense:'DEN',position:'WR',total:300,meanAllowed:100,sampleGames:3,playerAppearances:9,selectedGames:3,missingGames:0,period:{from:rows[0].kickoff,to:rows[2].kickoff},asOf:at,rank:1,rankedDefenses:2,status:'ranked'};
  const raw = {version:1,generatedAt:at,source:{stats:{url:'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv',sha256:'a'.repeat(64),updatedAt:at,retrievedAt:at},rosters:{url:'https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv',sha256:'b'.repeat(64),updatedAt:at,retrievedAt:at},schedule:{url:'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',sha256:'c'.repeat(64),semanticSha256:'d'.repeat(64),updatedAt:at,retrievedAt:at}},games:[{gameId:'SEA-DEN',week:11,kickoff,players:[{playerId,playerName:'Synthetic Player',team:'SEA',opponent:'DEN',position:'WR',markets:[{key:'player_reception_yds',unit:'yards',baseline,matchups:{season:match,last5:match}}]}]}]};
  return {raw,board};
}
test('projects fresh exact-target baseline and descriptive matchup only; strips arbitrary payload keys',()=>{
  const {raw,board}=fixture(); raw.secret='private'; raw.source.stats.secret='private';raw.games[0].players[0].markets[0].baseline.secret='private';raw.games[0].players[0].markets[0].matchups.season.secret='private';raw.games[0].players[0].markets[0].quote={odds:100};
  const before=JSON.stringify(raw), out=projectPropResearch(raw,board,NOW);
  assert.equal(out.status,'available');assert.equal(out.games[0].players[0].markets[0].baseline.projection,53.5);
  assert.equal(out.games[0].players[0].markets[0].matchups.season.rank,1);
  assert.equal(JSON.stringify(out).includes('private'),false);assert.equal(JSON.stringify(out).includes('odds'),false);
  assert.equal(JSON.stringify(raw),before);
});
test('both gates, scope and exact event time are required; closed games return no target metadata',()=>{
  for(const change of [b=>b.games[0].spread.visible=false,b=>b.games[0].total.visible=false,b=>b.games[0].started=true,b=>b.week=12,b=>b.games[0].kickoff='2026-11-16T19:00:00Z',b=>b.games=[]]){
    const {raw,board}=fixture();change(board);const out=projectPropResearch(raw,board,NOW);
    assert.deepEqual(out,{version:1,status:'unavailable',generatedAt:null,source:null,games:[]});
  }
});
test('rejects future, stale, invalid provenance and kickoff-now data',()=>{
  for(const change of [r=>r.generatedAt=new Date(NOW+1).toISOString(),r=>r.generatedAt=new Date(NOW-86400000).toISOString(),r=>r.source.stats.url='https://evil.test/stats.csv',r=>r.source.rosters.sha256='no',r=>r.version=2,r=>r.games=Array(33).fill(r.games[0])]){
    const {raw,board}=fixture();change(raw);assert.equal(projectPropResearch(raw,board,NOW).status,'unavailable');
  }
  const {raw,board}=fixture();assert.equal(projectPropResearch(raw,board,Date.parse(kickoff)).status,'unavailable');
});
test('rejects identity, unit, forecast and rank corruption rather than echoing it',()=>{
  for(const change of [p=>p.playerId='name-only',p=>p.position='DB',p=>p.team='ATL',p=>p.opponent='SEA',p=>p.markets[0].unit='points',p=>p.markets[0].key='unknown']){
    const {raw,board}=fixture();change(raw.games[0].players[0]);assert.equal(projectPropResearch(raw,board,NOW).status,'unavailable');
  }
  const {raw,board}=fixture(), market=raw.games[0].players[0].markets[0];market.baseline.projection=Infinity;market.matchups.season.rank=33;market.matchups.last5.meanAllowed=999;
  assert.equal(projectPropResearch(raw,board,NOW).status,'unavailable');
});
test('returns null for invalid baseline independently of valid matchup, never promotes calibration',()=>{
  const {raw,board}=fixture(), b=raw.games[0].players[0].markets[0].baseline;b.interval={lower:10,upper:20,sample:3,residualPercentiles:[10,90],calibration:'calibrated'};
  const m=projectPropResearch(raw,board,NOW).games[0].players[0].markets[0];assert.equal(m.baseline,null);assert.equal(m.matchups.season.rank,1);
});

test('duplicate identities cannot choose a favorable first occurrence',()=>{
  for(const level of ['game','player','market']) {
    const {raw,board}=fixture();
    if(level==='game') raw.games.push(structuredClone(raw.games[0]));
    if(level==='player') raw.games[0].players.push(structuredClone(raw.games[0].players[0]));
    if(level==='market') raw.games[0].players[0].markets.push(structuredClone(raw.games[0].players[0].markets[0]));
    assert.equal(projectPropResearch(raw,board,NOW).status,'unavailable');
  }
});

test('old or future receipt checks cannot be repackaged with a fresh generation time',()=>{
  for(const change of [s=>s.retrievedAt=new Date(NOW-3600001).toISOString(),s=>s.retrievedAt=new Date(NOW+1).toISOString(),s=>s.updatedAt=new Date(NOW+1).toISOString(),s=>delete s.updatedAt]) {
    const {raw,board}=fixture();change(raw.source.stats);assert.equal(projectPropResearch(raw,board,NOW).status,'unavailable');
  }
  const {raw,board}=fixture();raw.source.rosters.updatedAt='2026-11-01T00:00:00Z';
  assert.equal(projectPropResearch(raw,board,NOW).status,'available','weekly roster age alone is not stale if checked now');
});
