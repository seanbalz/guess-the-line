// Entirely synthetic normalized view. No real rosters, players, observations or accounts.
import {winChance} from '../../shared/epl-fantasy.mjs';
export const FANTASY_SCENARIOS=['matchup','standings','rosters','insights','no-repeat','ambiguous','no-team','matchup-gaps','standings-missing','insights-gaps','insights-no-detail','loading','failed','forbidden','off','no-data'];
const names=['Riley Hart','Jordan Taylor','Alex Lane','Morgan Park','Sam Reed','Casey Vale','Drew Ellis','Taylor Quinn'];
const clubs=['ARS','AVL','CHE','LIV','MNC','MUN','TOT','NEW','BHA','FUL','BRE'];
const first=['Avery','Cameron','Jamie','Quinn','Robin','Blake','Dylan','Reese','Rowan','Sage','Ellis','Jules','Kendall','Skyler'];
const last=['North','Vale','Brooks','Stone','Wells','Reed','Lane','Park'];
const projected=[8.2,7.4,8.6,9.2,10.4,11.8,12.2,10.8,9.6,8.4,7.6];
const rows=[[107,118,141,122],[99,112,124,115],[94,106,117,114],[98,104,111,108],[88,100,104,101],[96,97,105,94],[85,94,101,96],[91,93,98,89]];
const round=x=>Math.round(x*100)/100;
export function fantasyView(){
 const rosters=names.map((name,i)=>({ownerId:'example-'+i,name,starters:first.slice(0,11).map((n,j)=>({playerId:`example-player-${i}-${j}`,name:`${n} ${last[i]}`,pos:j===0?'GK':j<5?'D':j<9?'M':'F',club:clubs[(i+j)%clubs.length],clubText:null})),bench:first.slice(11).map((n,j)=>({playerId:`example-bench-${i}-${j}`,name:`${n} ${last[i]}`,pos:['GK','M','F'][j],club:clubs[(i+j+4)%clubs.length],clubText:null}))}));
 const weekly=rows.flatMap((points,i)=>points.map((points,j)=>({ownerId:'example-'+i,week:j+6,points})));
 const me=rosters[2],opp=rosters[3],myProj=round(projected.reduce((a,b)=>a+b,0)),oppProj=98.6;
 const recent=rows[2].map((actual,j)=>({week:j+6,projected:[91,101.5,120,105.4][j],actual}));
 const tops=rosters.map((r,i)=>({ownerId:r.ownerId,name:r.name,playerId:r.starters[9].playerId,playerName:r.starters[9].name,points:[84,78,76.5,73,71,68,64,60][i]}));
 return{season:2026,week:10,viewer:me.ownerId,capturedAt:null,
  matchup:{week:10,basisWeek:3,matched:[2,9],me:{ownerId:me.ownerId,name:me.name},opp:{ownerId:opp.ownerId,name:opp.name},myProj,oppProj,winChance:winChance(myProj,oppProj),starters:me.starters.map((s,i)=>({...s,proj:projected[i]})),recent},
  standings:rosters.map((r,i)=>{const bonus=i===2?20:0,total=rows[i].reduce((a,b)=>a+b,0)+500+bonus;return{ownerId:r.ownerId,name:r.name,wins:[7,6,6,5,4,4,3,2][i],losses:[2,3,3,4,5,5,6,7][i],sleeperTotal:total,bonus,total};}).sort((a,b)=>b.total-a.total),
  rosters,insights:{weekly,seasonHigh:{week:8,ownerId:rosters[0].ownerId,name:rosters[0].name,points:141},myTopScorer:tops[2],topScorerPerTeam:tops,beatProjection:recent.map(r=>({ownerId:me.ownerId,week:r.week,diff:round(r.actual-r.projected)})),detailWeeks:[6,7,8,9],detailStartsWeek:6}};
}
export function fantasyExample(scenario='matchup'){
 let data=fantasyView(),section=['matchup','standings','rosters','insights'].includes(scenario)?scenario:scenario.startsWith('standings')?'standings':scenario.startsWith('insights')?'insights':'matchup';
 if(['no-repeat','ambiguous','no-team'].includes(scenario)){data.matchup={...data.matchup,unavailable:true,reason:scenario};delete data.matchup.opp;delete data.matchup.winChance;if(scenario==='no-team'){data.viewer=null;data.matchup.me=null;data.matchup.myProj=null;data.matchup.starters=[];data.matchup.recent=[];}}
 if(scenario==='matchup-gaps'){data.matchup.starters[2].proj=null;data.matchup.myProj=round(data.matchup.starters.reduce((a,s)=>a+(s.proj??0),0));data.matchup.winChance=winChance(data.matchup.myProj,data.matchup.oppProj);data.matchup.recent[1]={week:7,projected:null,actual:null};}
 if(scenario==='standings-missing'){Object.assign(data.standings.at(-1),{wins:null,losses:null,sleeperTotal:null,bonus:null,total:null});}
 if(scenario==='insights-gaps'){data.insights.weekly=data.insights.weekly.map(w=>w.week===7?{...w,points:null}:w);}
 if(scenario==='insights-no-detail'){data.insights={weekly:[],seasonHigh:null,myTopScorer:null,topScorerPerTeam:[],beatProjection:[],detailStartsWeek:10};}
 if(scenario==='loading')return{section,state:{status:'loading'}};
 const errors={failed:{status:503},forbidden:{status:403},off:{code:'GTL_EPL_OFF'},'no-data':{code:'GTL_EPL_NO_FANTASY'}};
 if(errors[scenario])return{section,state:{status:'failed',error:errors[scenario]}};
 return{section,state:{status:'loaded',data}};
}
