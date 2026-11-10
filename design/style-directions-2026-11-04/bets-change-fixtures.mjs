import {applySocialMutation,emptySocialState,socialView} from '../../shared/social-bets.mjs';
export const CHANGE_ACTOR='demo-change-owner';
const FIXED_CLOCK=Date.UTC(2026,10,6,12);
export function initialChangeFixture(model){
 const draft=model.draft;let id=0;
 const body={requestId:'00000000-0000-4000-8000-000000000001',season:draft.season,week:draft.week,kind:draft.kind,origin:'tracked',legs:draft.legs.map(({gameId,market,side,line,selection})=>({gameId,market,side,line,selection})),odds:null,stakeUnits:draft.stakeUnits,source:'',quotedAt:null,placedAt:null,countsForRecord:true,notes:'Fictional open ticket; historical closing-reference selection, sample stake and no saved quote.'};
 return applySocialMutation(emptySocialState(),{actorId:CHANGE_ACTOR,action:'create',body,games:model.games,now:FIXED_CLOCK,uuid:()=>`demo-maintenance-${++id}`});
}
export function changeTicket(state,model,action,body,requestId,now=Date.now()){
 const entry=state.entries[0];return applySocialMutation(state,{actorId:CHANGE_ACTOR,action,body:{...body,requestId,entryId:entry.id,revision:entry.revision},games:model.games,now:Math.max(FIXED_CLOCK,now),uuid:()=>`demo-change-audit-${state.audit.length+1}`});
}
export function changeView(state,model){
 const entry=socialView(state,{actorId:CHANGE_ACTOR,games:model.games,now:FIXED_CLOCK+60000}).entries[0];
 // Test seed and generated recording metadata are internal fixture mechanics, not real account observations.
 return {...entry,recordedAt:null,updatedAt:null,settledAt:null,lateEntry:false,audit:entry.audit.map(event=>({...event,at:null}))};
}
