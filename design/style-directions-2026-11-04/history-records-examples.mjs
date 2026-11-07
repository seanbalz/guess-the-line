// Fictional normalized record replies only. No real private records, sources, quotes or timestamps.
import {gradeBet,accuracy} from '../../server/domain.mjs';
import {weekFromPicks} from '../../shared/bets-qual.mjs';
export const RECORD_SCENARIOS=['bets','bets-empty','bets-loading','bets-unavailable','bets-failed','weeks-loading','weeks-failed','no-weeks','older','challenge','saved','forecasts','journal','slips','archives','benchmark','benchmark-unfrozen','older-loading','older-failed','older-off','older-empty','slips-loading','slips-failed','slips-empty'];
export const RECORD_OWNER='example-alex';
export const RECORD_GAMES=[['SEA','DEN'],['HOU','JAX'],['BAL','CLE'],['CAR','PHI'],['MIN','NYG']].map(([awayCode,homeCode],i)=>({id:'example-record-game-'+i,awayCode,homeCode}));
const people=[{userId:RECORD_OWNER,displayName:'Alex Lane'},{userId:'example-casey',displayName:'Casey Vale',removed:true},{userId:'example-jordan',displayName:'Jordan Taylor'}];
export function betsWeekData(week=9){
 const games=structuredClone(RECORD_GAMES),bet=(i,userId,market,side,line,units,status,net)=>({gameId:games[i].id,userId,market,status,selection:{side,line,units,odds:-110,source:'Example entered terms',quotedAt:null},result:net===null?null:{status,netUnits:net}});
 const bets=[bet(0,RECORD_OWNER,'spread','home',-3.5,1,'win',.9091),bet(1,RECORD_OWNER,'total','over',44.5,1,'push',0),bet(2,RECORD_OWNER,'spread','away',2.5,2,'pending',null),bet(3,'example-casey','total','under',47.5,1,'loss',-1),bet(4,'example-casey','spread','home',-2.5,1,'void',0),{gameId:games[1].id,userId:'example-jordan',market:'spread',status:null,selection:{side:'away',units:1.5},result:null}];
 if(week===8){bets[0].status='loss';bets[0].result={status:'loss',netUnits:-1};}
 const markets=Object.fromEntries(games.map(g=>[g.id,{spread:{visible:true},total:{visible:true}}]));markets[games[1].id].spread.visible=false;
 return{season:2026,week,games,roster:structuredClone(people),bets,markets,qualification:people.map(p=>({userId:p.userId,qualified:weekFromPicks(bets.filter(b=>b.userId===p.userId)).qualified}))};
}
export function olderData(){
 const games=structuredClone(RECORD_GAMES),result={status:'final',home:27,away:20},sel=(userId,gameId,market,side,line)=>({userId,season:2026,week:5,gameId,market,side,line,odds:-110,source:'Example entered terms',final:result});
 const selections=[sel(RECORD_OWNER,games[0].id,'spread','home',-3.5),sel('example-casey',games[0].id,'total','over',48.5),sel(RECORD_OWNER,games[1].id,'total','over',47)];selections.forEach(s=>s.grade=gradeBet(s,s.final));
 const records=people.map(p=>{const rows=selections.filter(s=>s.userId===p.userId),W=rows.filter(s=>s.grade==='W').length,L=rows.filter(s=>s.grade==='L').length,P=rows.filter(s=>s.grade==='P').length;return{userId:p.userId,selections:rows.length,W,L,P,ungraded:0,winRate:W+L?100*W/(W+L):null};});
 const history=(action,reason,after={})=>({action,reason,at:null,before:{},after});
 const journalBase={season:2026,week:5,gameId:games[0].id,market:'spread',side:'home',line:-3.5,odds:-110,source:'Example entered terms',createdAt:null,quotedAt:null,notes:'Illustrative personal record. No real transaction.',retrospective:false,archived:false,changes:[history('journal/create',null)]};
 const journal=[{...journalBase,id:'example-journal-win',kind:'user_reported_placed_bet',currency:'USD',stakeMinor:10000,returnedMinor:19091,outcome:'win'},{...journalBase,id:'example-journal-research',kind:'research_note',currency:null,stakeMinor:null,returnedMinor:null,outcome:'pending',notes:'Illustrative research note; no stake or return.'},{...journalBase,id:'example-journal-archived',kind:'user_reported_placed_bet',currency:'USD',stakeMinor:5000,returnedMinor:0,outcome:'loss',archived:true,notes:'Archived example retained in the list.',changes:[history('journal/create',null),history('journal/correct','Corrected an example note'),history('journal/archive','Illustrative archive',{archived:true})]}];
 const comparisons=Object.fromEntries(games.slice(0,3).map((g,i)=>{const value=[-4,2.5,1][i],originalPick=[-3.5,1.5,-2][i];return[g.id,{value,originalPick,points:accuracy(originalPick,value)}];}));
 return{ownerId:RECORD_OWNER,slates:[{season:2026,week:5,games,results:{[games[0].id]:result}}],challenge:{players:structuredClone(people),records,selections,hidden:[{userId:'example-jordan',season:2026,week:5,count:1}]},
 saved:[{season:2026,week:5,gameId:games[0].id,saved:true,note:'Watch the matchup and revisit the run-defense split. Illustrative note.',updatedAt:null,example:true,changes:[{at:null,before:{},after:{saved:true,notes:'Watch the matchup.'}},{at:null,before:{saved:true,notes:'Watch the matchup.'},after:{saved:true,notes:'Watch the matchup and revisit the run-defense split. Illustrative note.'}}]},{season:2026,week:5,gameId:games[1].id,saved:false,note:'A note remains even when the game is no longer saved.',updatedAt:null,example:true,changes:[{at:null,before:{saved:true},after:{saved:false,notes:'A note remains even when the game is no longer saved.'}}]}],
 forecasts:[{season:2026,week:5,gameId:games[0].id,market:'spread',value:-3.5,savedAt:null,changes:[{after:-2.5},{after:-3.5}]},{season:2026,week:5,gameId:games[1].id,market:'total',value:44.5,savedAt:null,changes:[{after:45.5},{after:44.5}]}],journal,journalHidden:1,
 archives:[{leagueId:'example-archive',name:'Illustrative archived group',week:5,archivedAt:null,example:true,archivedCount:2,games,snapshots:[{id:'example-snapshot-math',example:true,capturedAt:null,quotedAt:null,source:null,sourceUrl:null,timeBasis:null,total:21,games:comparisons},{id:'example-snapshot-hidden',example:true,capturedAt:null,quotedAt:null,source:null,sourceUrl:null,timeBasis:null,total:null,games:{}}]}],
 benchmarks:[{policyId:'example-benchmark',season:2026,week:5,status:'frozen',example:true,frozenAt:null,actualKickoff:null,capturedAt:null,quotedAt:null,sourceUrl:null,games:Object.fromEntries(Object.entries(comparisons).map(([id,r])=>[id,{value:r.value}])),decision:'Illustrative record layout only. No actual freeze, source evidence or commissioner ruling is established.'},{policyId:'example-benchmark-hidden',season:2026,week:5,status:'frozen',example:true,frozenAt:null,actualKickoff:null,capturedAt:null,quotedAt:null,sourceUrl:null,games:null,decision:null}]};
}
export function slipsData(){return{season:2026,week:5,availableWeeks:[{season:2026,week:5},{season:2026,week:4}],entries:[{id:'example-slip-own',ownerId:RECORD_OWNER,ownerName:'Alex Lane',outcome:'win',kind:'parlay',odds:150,stakeUnits:2,netUnits:3,source:'Example entered terms',lateEntry:false,notes:'Illustrative combined terms; no real wager or sportsbook quote.',legs:[{selection:'Denver Broncos −3.5',locked:false},{selection:'Over 44.5',locked:false}]},{id:'example-slip-friend',ownerId:'example-jordan',ownerName:'Jordan Taylor',outcome:'pending',kind:'single',odds:null,stakeUnits:1,netUnits:null,source:null,lateEntry:false,notes:'Illustrative permitted side; the line is withheld.',legs:[{selection:'Houston Texans',locked:true}]}]};}
export function recordsExample(scenario='bets'){
 const section=['challenge','saved','forecasts','journal','slips','archives','benchmark'].includes(scenario)?scenario:scenario==='benchmark-unfrozen'?'benchmark':scenario.startsWith('slips-')?'slips':scenario==='older-empty'?'saved':null;
 const view=scenario.startsWith('bets')||scenario.startsWith('weeks')||scenario==='no-weeks'?'bets':'older';
 const args={view,...(section?{older:section}:{})},app={accountId:RECORD_OWNER};
 const weeks={data:{weeks:[{season:2026,week:9},{season:2026,week:8}]}},reads={9:{data:betsWeekData(9)},8:{data:betsWeekData(8)}};reads.default=reads[9];
 const records={data:olderData()},slipsRead={data:slipsData()};
 if(scenario==='bets-empty')reads[9].data.bets=[];
 if(scenario==='bets-loading')reads[9]={loading:true};
 if(scenario==='bets-unavailable')reads[9]={error:{status:503}};
 if(scenario==='bets-failed')reads[9]={error:{status:500,message:'Bets history did not load in this example.'}};
 if(scenario==='weeks-loading'){delete weeks.data;weeks.loading=true;}
 if(scenario==='weeks-failed'){delete weeks.data;weeks.error={status:500,message:'The week list did not load in this example.'};}
 if(scenario==='no-weeks')weeks.data.weeks=[];
 if(scenario==='benchmark-unfrozen')records.data.benchmarks=[{policyId:'example-not-frozen',season:2026,week:5,status:'not_frozen',example:true,decision:null}];
 if(scenario==='older-loading'){delete records.data;records.loading=true;}
 if(scenario==='older-failed'){delete records.data;records.error={status:500,message:'Older records did not load in this example.'};}
 if(scenario==='older-off'){delete records.data;records.error={status:503};}
 if(scenario==='older-empty')records.data.saved=[];
 if(scenario==='slips-loading'){delete slipsRead.data;slipsRead.loading=true;}
 if(scenario==='slips-failed'){delete slipsRead.data;slipsRead.error={status:500,message:'The slips list did not load in this example.'};}
 if(scenario==='slips-empty')slipsRead.data.entries=[];
 return{args,app,weeks,reads,records,slipsRead};
}
