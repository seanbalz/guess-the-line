import {boardModel,draftReducer} from '../../web/src/next/epl/draftModel.js';
export const EPL_HOME_SCENARIOS=['turn','picked','unlinked','all-in','locked','progress-failed','loading','failed','forbidden','off','no-week','stale','review'];
export function eplHomeExample(data,scenario='turn'){
 const read=structuredClone(data.read);let now=Date.parse(data.now),moneyline={status:'ready',locked:2,total:10};
 if(scenario==='progress-failed')moneyline={status:'unavailable',reason:'read_failed'};
 if(scenario==='picked'){
  read.picks.push({ownerId:read.me,club:'AVL',source:'pick',final:false});read.onTheClock=read.order[3].ownerId;
  moneyline={status:'unavailable',reason:'prices_not_verified'};
 }else if(scenario==='unlinked'){
  read.me=null;read.myQueue=[];read.claim={managers:read.order.slice(2,5).map(m=>({...m}))};moneyline={status:'readonly'};
 }else if(['all-in','locked'].includes(scenario)){
  const clubs=['ARS','CHE','AVL','LIV','MNC','BOU','BRE','BHA'];
  read.picks=read.order.map((m,i)=>({ownerId:m.ownerId,club:clubs[i],final:true}));read.onTheClock=null;
  moneyline=scenario==='all-in'?{status:'loading'}:{status:'idle'};
  if(scenario==='locked'){read.status='closed';now=Date.parse(read.deadline)+1;}
 }else if(scenario==='review'){
  read.status='needs_review';read.onTheClock=null;
  // Existing native-view test metadata, solely to exercise the validated source-guidance branch.
  read.standingsSource={kind:'wikimedia-community',official:false,dataAsOf:'2026-10-25',
   source:{url:'https://en.wikipedia.org/w/index.php?title=2026%E2%80%9327%20Premier%20League&oldid=1382589055'},license:{url:'https://creativecommons.org/licenses/by-sa/4.0/'}};
 }
 let state=draftReducer(undefined,{type:'loaded',data:read});
 if(scenario==='loading')state=draftReducer(undefined,{type:'start'});
 if(['failed','forbidden','off','no-week','stale'].includes(scenario)){
  const error=scenario==='forbidden'?{status:403}:scenario==='off'?{code:'GTL_EPL_OFF'}:scenario==='no-week'?{code:'GTL_EPL_NO_WEEK'}:{status:503};
  state=draftReducer(scenario==='failed'?undefined:state,{type:'failed',error});
 }
 return {read:state.data,state,now,model:boardModel(state.data,now),moneyline,home:['turn','picked','unlinked','all-in','locked','progress-failed'].includes(scenario)};
}
