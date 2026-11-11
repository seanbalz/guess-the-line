import {boardModel} from '../../web/src/next/epl/draftModel.js';
export function eplClaimExample(data,scenario='choose'){
 const read=structuredClone(data.read);read.me=null;read.myQueue=[];
 read.claim={managers:read.order.slice(2,5).map(m=>({...m}))};
 if(['linked','already-linked'].includes(scenario)){read.me=read.order[2].ownerId;read.claim.managers=[];}
 if(scenario==='taken')read.claim.managers=read.claim.managers.slice(1);
 if(scenario==='no-managers')read.claim.managers=[];
 return {model:boardModel(read,Date.parse(data.now)),watching:scenario==='watching',busy:scenario==='busy',
  outcome:['linked','taken','already-linked','failed','uncertain'].includes(scenario)?scenario:null};
}
