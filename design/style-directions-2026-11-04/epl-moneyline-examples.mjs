import {distance,leaderboard} from '../../shared/epl-moneyline.mjs';
export const MONEYLINE_SCENARIOS=['entry','saved-draft','results','closed','uncertain','stale','busy','read-only','unavailable','loading','failed','leaderboard','leaderboard-empty','leaderboard-loading','leaderboard-failed'];
export const EXAMPLE_NOW=Date.parse('2000-01-01T00:00:00Z');
const fixture=(id,away,home,day)=>({eventId:id,away,home,commenceTime:`2000-01-0${day}T12:30:00Z`,status:'scheduled',kickedOff:false});
const guess=(eventId,patch={})=>({eventId,ownerId:'example-alex',name:'Alex Lane',club:'ARS',price:-120,status:'draft',state:'draft',referencePrice:null,referenceObservedAt:null,referenceSource:null,distance:null,...patch});
export function exampleLeaderboard(){
 const samples=[['example-riley','Riley Stone',[0,0]],['example-jordan','Jordan Taylor',[5,15]],['example-morgan','Morgan Park',[15,15,15]],['example-alex','Alex Lane',[10,20]],['example-sam','Sam Rivera',[20,30,null]],['example-casey','Casey Reed',[null]]];
 const names=Object.fromEntries(samples.map(([id,name])=>[id,name]));
 return {season:2026,rows:leaderboard(samples.flatMap(([ownerId,,values])=>values.map(value=>({ownerId,distance:value})))).map(row=>({...row,name:names[row.ownerId]}))};
}
export function moneylineExample(scenario='entry'){
 const data={available:true,season:2026,week:10,ownerId:'example-alex',weeks:[{season:2026,week:10,available:true},{season:2026,week:9,available:false}],
  fixtures:[fixture('example-one','CHE','ARS',2),fixture('example-two','AVL','LIV',3)],guesses:[]};
 const state={status:'ready',data,drafts:{'example-one':{club:'ARS',price:'-105'}},busy:false,uncertain:false,notice:null,error:null};
 if(scenario==='saved-draft'){data.guesses=[guess('example-one')];state.drafts={};}
 if(scenario==='results'){
  data.fixtures.push({...fixture('example-three','MUN','TOT',4),kickedOff:true,status:'final'});
  data.guesses=[guess('example-one',{status:'locked',state:'scored',referencePrice:120,distance:distance(-120,120),exampleMath:true}),
   guess('example-two',{club:'LIV',price:-110,status:'locked',state:'pending'}),guess('example-three',{club:'TOT',price:160,status:'locked',state:'unscored'}),
   guess('example-one',{ownerId:'example-jordan',name:'Jordan Taylor',price:-130,status:'locked',state:'scored',distance:distance(-130,120),exampleMath:true})];state.drafts={};
 }
 if(scenario==='closed'){data.fixtures=[{...data.fixtures[0],kickedOff:true,status:'final'}];state.drafts={'example-one':{club:'CHE',price:'+160'}};}
 if(scenario==='uncertain'){state.status='stale';state.uncertain=true;state.notice='Save not confirmed. Check saved guesses before trying again. Your draft is still here.';}
 if(scenario==='stale')state.status='stale';
 if(scenario==='busy')state.busy=true;
 if(scenario==='read-only'){data.ownerId=null;state.drafts={};}
 if(scenario==='unavailable'){data.available=false;data.reason='prices_not_verified';data.guesses=[guess('example-one',{status:'locked',state:'pending'})];state.drafts={};}
 if(scenario==='loading'){state.data=null;state.status='loading';state.drafts={};}
 if(scenario==='failed'){state.data=null;state.status='error';state.error={status:503};state.drafts={};}
 const board=exampleLeaderboard();if(scenario==='leaderboard-empty')board.rows=[];
 return {state,now:EXAMPLE_NOW,leaderboard:board,view:scenario.startsWith('leaderboard')?'leaderboard':'guesses',leaderboardStatus:scenario==='leaderboard-loading'?'loading':scenario==='leaderboard-failed'?'failed':'ready'};
}
