// Pure fictional History replies. No real picks, schedule, sources or stored timestamps.
import {pickPoints} from '../../shared/game-features/week.mjs';
export const HISTORY_SCENARIOS=['weeks','week','total','other-hidden','removed','sat-out','practice','empty','loading','failed','records-off','changes-loading','changes-failed','changes-empty','changes-held','draft-active','late','ruled','no-ballot'];
const viewer='example-alex';
const members=[{id:viewer,displayName:'Alex Lane'},{id:'example-jordan',displayName:'Jordan Taylor'},{id:'example-casey',displayName:'Casey Vale',removed:true}];
const pairs=[['SEA','DEN'],['HOU','JAX'],['BAL','CLE'],['CAR','PHI'],['MIN','NYG']];
const games=pairs.map(([awayCode,homeCode],i)=>({id:'example-game-'+i,awayCode,homeCode,kickoff:'2000-01-01T00:00:00Z'}));
const values={guess_spread:[-3.5,1.5,-2,-1.5,2.5],guess_total:[44.5,46.5,39.5,47.5,42.5]},comparisons={guess_spread:[-4,2.5,1],guess_total:[45,45.5,42.5]};
function entry(mode,week=9){const picks=games.map((g,i)=>({gameId:g.id,guess:values[mode][i],lockedIn:i<4,closedAtKickoff:i===4,points:i<3?pickPoints(values[mode][i],comparisons[mode][i]):null,reference:i<3?{status:'available',basis:'example-math',value:comparisons[mode][i],exampleMath:true,source:null,observedAt:null}:i===3?{status:'pending',basis:'first_line_after_submission',value:null}:null}));return{userId:viewer,mode,status:'draft',eligible:true,games:5,picks,weekPoints:picks.reduce((a,p)=>a+(p.points??0),0),weekScored:3,submittedAt:null};}
function weeks(){return[9,8,7].map(week=>({season:2026,week,games:structuredClone(games),results:{},entries:['guess_spread','guess_total'].map(mode=>{const e=entry(mode,week);if(week===8){e.status='sat_out';e.picks=e.picks.slice(0,1);e.weekScored=1;e.weekPoints=e.picks[0].points;}if(week===7){e.status='submitted';e.eligible=false;e.eligibility='practice';e.submittedAtKnown=false;e.weekPoints=null;e.weekScored=0;e.picks.forEach(p=>p.points=null);}return e;})}));}
export function historyExample(scenario='weeks'){
 const data={viewer,season:2026,seasons:[2026,2025],now:'2000-01-02T00:00:00Z',members:structuredClone(members),weeks:weeks()};
 for(const w of data.weeks)for(const mode of ['guess_spread','guess_total']){w.entries.push({userId:'example-jordan',mode,status:'draft',eligible:true,games:5,picksHidden:true,picks:w.games.map(g=>({gameId:g.id,hidden:true})),weekPoints:null,weekScored:0},{userId:'example-casey',mode,status:'sat_out',eligible:true,games:5,picks:[],weekPoints:null,weekScored:0});}
 const changes={loading:false,data:{markets:['guess_spread','guess_total'].map(mode=>({mode,games:structuredClone(games),pendingChanges:0,changes:[{at:null,games:[{gameId:games[0].id,kind:'draft',before:null,after:mode==='guess_spread'?-3:44}]},{at:null,games:[{gameId:games[0].id,kind:'draft',before:mode==='guess_spread'?-3:44,after:values[mode][0]}]},{at:null,games:[{gameId:games[0].id,kind:'locked',before:values[mode][0],after:values[mode][0],reference:{status:'pending'}}]}]}))}};
 const args={view:'guess',mode:scenario==='total'?'guess_total':'guess_spread',...(scenario!=='weeks'&&scenario!=='removed'&&scenario!=='records-off'?{week:scenario==='sat-out'?8:scenario==='practice'?7:9}:{}),...(scenario==='other-hidden'?{player:'example-jordan'}:scenario==='removed'?{player:'example-casey'}:{})};
 const read={loading:false,data},records={data:{forfeits:[{season:2026,week:8,reason:'sitOut',modes:['guess_spread','guess_total']}]}};
 if(scenario==='other-hidden')for(const w of data.weeks){w.games.forEach(g=>g.kickoff='2000-01-03T00:00:00Z');w.entries.filter(e=>e.userId===viewer).forEach(e=>{e.status='draft';e.weekPoints=null;e.weekScored=0;e.picks.forEach(p=>{p.lockedIn=false;p.closedAtKickoff=false;p.points=null;p.reference=null;});});}
 if(scenario==='late'){data.weeks[0].entries.filter(e=>e.userId===viewer).forEach(e=>{e.late={minutes:12};e.picks[1].late={minutes:12};});changes.data.markets.forEach(m=>m.changes.at(-1).late={minutes:12});}
 if(scenario==='ruled')data.weeks[0].entries.filter(e=>e.userId===viewer).forEach(e=>Object.assign(e,{status:'submitted',eligibility:'ruled-eligible',ruling:true,submittedAtKnown:false}));
 if(scenario==='no-ballot'){data.weeks[0].entries=data.weeks[0].entries.filter(e=>e.userId!==viewer);changes.data.markets.forEach(m=>m.changes=[]);}
 if(scenario==='empty')data.weeks=[];
 if(scenario==='loading'){read.loading=true;delete read.data;}
 if(scenario==='failed'){read.error={status:503,message:'History is unavailable in this example. Your saved guesses are kept.'};delete read.data;}
 if(scenario==='records-off'){delete records.data;records.error={status:503};}
 if(scenario==='changes-loading'){changes.loading=true;delete changes.data;}
 if(scenario==='changes-failed'){changes.error={status:503};delete changes.data;}
 if(scenario==='changes-empty')changes.data.markets.forEach(m=>m.changes=[]);
 if(scenario==='changes-held')changes.data.markets.forEach(m=>{m.pendingChanges=2;m.changes=[];});
 if(scenario==='draft-active'){const w=data.weeks[0];w.games[4].kickoff='2000-01-03T00:00:00Z';w.entries.filter(e=>e.userId===viewer).forEach(e=>e.picks[4].closedAtKickoff=false);}
 return{args,read,records,changes,app:{accountId:viewer,community:{data:{rules:{sentFinal:true,revealAt:'kickoff',lateWindow:'kickoff'}}}}};
}
