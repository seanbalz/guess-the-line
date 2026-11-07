import {refereeFor} from '../../shared/trends-view.mjs';
export const REFEREE_COPY=Object.freeze({
 title:'Game referees',
 help:number=>`Week ${number}. Pick each game’s referee once the NFL announces crews. Every member’s trends then show that referee’s records. Changes are kept with their history, never deleted.`,
 unassigned:'Not assigned yet',
 save:'Save referees',
 saving:'Saving…',
 error:'No connection. Reconnect and try again.',
 kept:'Unsaved choices stay selected.',
});
export function refereeExample(model,scenario='ready'){
 const options=['Example official A','Example official B','Example official C'],games=model.games.map(g=>({...g})),week={season:model.season,week:model.week,games,refereeOptions:options,assignedReferees:Object.fromEntries(games.map((g,i)=>[g.id,options[i%3]]))};
 const hosted=scenario==='read-error'?null:{assignments:{[games[0].id]:{referee:options[1]},[games[2].id]:{referee:null}}},drafts=scenario==='ready'||scenario==='read-error'?{}:{[games[0].id]:options[0],[games[1].id]:options[2],[games.at(-1).id]:options[1]};
 if(scenario==='partial')hosted.assignments[games[0].id]={referee:options[0]};
 return{week,hosted,drafts,options,busy:scenario==='busy',state:scenario==='read-error'?'error':'ready',problem:scenario==='partial'?`${REFEREE_COPY.error} Saved before the error: ${games[0].away} at ${games[0].home}: ${options[0]}. ${REFEREE_COPY.kept}`:scenario==='read-error'?REFEREE_COPY.error:''};
}
export const currentReferee=(fixture,id)=>refereeFor(fixture.week,id,fixture.hosted).name||'';
export const changedReferees=(fixture,drafts)=>fixture.week.games.filter(game=>Object.hasOwn(drafts,game.id)&&drafts[game.id]!==currentReferee(fixture,game.id));
export function refereeOptions(fixture,value){return value&&!fixture.options.includes(value)?[value,...fixture.options]:fixture.options;}
