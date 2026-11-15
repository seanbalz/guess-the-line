import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPropResearch } from '../shared/prop-research-build.mjs';

const fields = {
  schedule: ['game_id','season','week','game_type','gameday','gametime','away_team','home_team','away_score','home_score'],
  rosters: ['season','week','game_type','gsis_id','team','position','status','full_name'],
  stats: ['player_id','season','week','season_type','game_id','team','passing_yards','rushing_yards','receiving_yards','receptions','carries'],
};
const csv = (name, records) => [fields[name].join(','), ...records.map(r => fields[name].map(k => r[k] ?? '').join(','))].join('\n');
function fixture() {
  const dates=['2026-09-13','2026-09-20','2026-09-27','2026-10-04','2026-10-11','2026-10-18','2026-10-25','2026-11-01','2026-11-08'];
  const schedule=dates.map((date,i)=>({game_id:`2026_${String(i+1).padStart(2,'0')}_SEA_DEN`,season:2026,week:i+1,game_type:'REG',gameday:date,gametime:'13:00',away_team:'SEA',home_team:'DEN',away_score:i<8?20:'',home_score:i<8?21:''}));
  const rosters=schedule.flatMap(g=>[['00-0000001','SEA'],['00-0000002','DEN']].map(([gsis_id,team])=>({season:2026,week:g.week,game_type:'REG',gsis_id,team,position:'WR',status:'ACT',full_name:`Synthetic ${team}`})));
  const stats=schedule.slice(0,8).flatMap(g=>[['00-0000001','SEA'],['00-0000002','DEN']].map(([player_id,team])=>({player_id,team,season:2026,week:g.week,season_type:'REG',game_id:g.game_id,passing_yards:0,rushing_yards:0,receiving_yards:30+10*g.week,receptions:5,carries:0})));
  return {schedule,rosters,stats};
}
function run(f, extra={}) {return buildPropResearch({scheduleCsv:csv('schedule',f.schedule),rostersCsv:csv('rosters',f.rosters),statsCsv:csv('stats',f.stats),season:2026,now:'2026-11-06T12:00:00Z',source:{label:'synthetic fixture'},...extra});}
const player = r => r.games[0].players.find(p=>p.playerId==='00-0000001');
const market = r => player(r).markets.find(m=>m.key==='player_reception_yds');

test('joins eight completed player games to target roster with no target result leakage',()=>{
  const f=fixture(), r=run(f), m=market(r);
  assert.equal(r.games.length,1); assert.equal(r.games[0].gameId,'SEA-DEN');
  assert.equal(m.baseline.projection,75); assert.equal(m.baseline.sample,8);
  assert.equal(m.baseline.holdout.count,3);
  assert.equal(m.matchups.season.meanAllowed,75); assert.equal(m.matchups.season.sampleGames,8);
  assert.equal(m.matchups.last5.sampleGames,5); assert.equal(m.matchups.last5.meanAllowed,90);
  const target=f.schedule.at(-1);target.away_score=100;target.home_score=99;
  f.stats.push({...f.stats[0],game_id:target.game_id,week:9,receiving_yards:999});
  assert.equal(market(run(f)).baseline.projection,75);
});

test('missing ACT teammate excludes matchup coverage but preserves known individual baseline',()=>{
  const f=fixture();f.rosters.push({...f.rosters.find(r=>r.week===8&&r.team==='SEA'),gsis_id:'00-0000003',full_name:'Synthetic missing teammate'});
  const m=market(run(f));
  assert.equal(m.baseline.sample,8);assert.equal(m.baseline.projection,75);
  assert.equal(m.matchups.season.sampleGames,7);assert.equal(m.matchups.season.missingGames,1);
  assert.equal(m.matchups.last5.sampleGames,4);assert.equal(m.matchups.last5.selectedGames,5);
});

test('unknown historical position, incomplete final and missing stat cells are not zero observations',()=>{
  const f=fixture();f.rosters.find(r=>r.week===1&&r.team==='SEA').position='';
  f.schedule[1].home_score='';f.stats.find(r=>r.week===3&&r.team==='SEA').receiving_yards='';
  const m=market(run(f));assert.equal(m.baseline.sample,5);assert.equal(m.baseline.projection,90);
  assert.equal(m.matchups.season.sampleGames,5);
});

test('blank IDs are excluded; exact roster duplicates collapse; conflicts exclude affected identity',()=>{
  const f=fixture();f.rosters.push({...f.rosters[0],gsis_id:''},{...f.rosters[0]});
  assert.equal(market(run(f)).baseline.sample,8);
  f.rosters.push({...f.rosters[0],position:'RB'});
  assert.equal(market(run(f)).baseline.sample,7);
  const target=f.rosters.find(r=>r.week===9&&r.team==='SEA');f.rosters.push({...target,team:'DEN'});
  assert.equal(run(f).games[0].players.some(p=>p.playerId==='00-0000001'),false);
});

test('wrong-team or missing historical roster joins cannot enter observations',()=>{
  const f=fixture();f.rosters.find(r=>r.week===1&&r.team==='SEA').team='BUF';
  f.rosters=f.rosters.filter(r=>!(r.week===2&&r.team==='SEA'));
  assert.equal(market(run(f)).baseline.sample,6);
});

test('last5 preserves missing-final calendar gaps instead of backfilling older games',()=>{
  const f=fixture();f.schedule[7].home_score='';
  const m=market(run(f));
  assert.equal(m.baseline.sample,7);assert.equal(m.matchups.last5.selectedGames,5);
  assert.equal(m.matchups.last5.sampleGames,4);assert.equal(m.matchups.last5.missingGames,1);
  assert.equal(m.matchups.last5.meanAllowed,85);
});

test('unknown or conflicting active roster identities cannot silently disappear from matchup coverage',()=>{
  const f=fixture(), known=f.rosters.find(r=>r.week===8&&r.team==='SEA');
  f.rosters.push({...known,gsis_id:'00-0000003'},{...known,gsis_id:'00-0000003',position:'RB'});
  let m=market(run(f));assert.equal(m.baseline.sample,8);assert.equal(m.matchups.last5.sampleGames,4);
  const f2=fixture();f2.rosters.push({...known,gsis_id:''});
  m=market(run(f2));assert.equal(m.baseline.sample,8);assert.equal(m.matchups.last5.sampleGames,4);
});
