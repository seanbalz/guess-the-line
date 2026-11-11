import {COMMUNITY,leagueRows,pendingInvites} from '../../web/src/next/data/league.js';
const EMAIL_PATTERN=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Exact native cloud/lobby.mjs normalizeEmail body, isolated without its controller.
export function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  return value.length <= 254 && EMAIL_PATTERN.test(value) ? value : null;
}
export const HOST_ID='g_'+('1'.repeat(32)),INVITED_ID='g_'+('3'.repeat(32));
export const EXAMPLE_LINK='https://example.invalid/gtl-invite/preview-only';
export function leagueSetupExample(){return{current:COMMUNITY.id,lobby:{leagues:[{id:HOST_ID,name:'Weekend Crew',memberCount:6,role:'commissioner',format:'group'},{id:'g_'+('2'.repeat(32)),name:'Head to Head',memberCount:2,role:'member',format:'duel'}],pendingInvites:[{id:'demo-incoming',leagueId:INVITED_ID,leagueName:'Saturday Club',inviterName:'Morgan Reed',expiresAt:null}]},community:{members:Array.from({length:8},(_,i)=>({id:`demo-community-${i}`,removed:false}))}};}
export function setupRows(state){return leagueRows({lobby:state.lobby,community:state.community,current:{id:state.current}});}
export function incomingExamples(state){return pendingInvites(state.lobby);}
export const canInvite=row=>!!row&&row.host===true&&!row.community&&row.id!=='sean-troy-luke';
export function createLeagueExample(state,name,format){
 if(typeof name!=='string'||!name.trim()||name.trim().length>80||/[\x00-\x1f\x7f]/.test(name)||!['duel','group'].includes(format))throw Error('Enter a league name between 1 and 80 characters and choose Duel or Group.');
 const next=structuredClone(state),id='g_'+String(next.lobby.leagues.length+10).padStart(32,'0');next.lobby.leagues.push({id,name:name.trim(),memberCount:1,role:'commissioner',format});next.current=id;return{state:next,league:setupRows(next).find(row=>row.id===id)};
}
export function joinLeagueExample(state,id){const invite=incomingExamples(state).find(row=>row.id===id);if(!invite)throw Error('Example invitation unavailable.');const next=structuredClone(state);if(!next.lobby.leagues.some(row=>row.id===invite.leagueId))next.lobby.leagues.push({id:invite.leagueId,name:invite.leagueName,memberCount:4,role:'member',format:'group'});next.lobby.pendingInvites=next.lobby.pendingInvites.filter(row=>row.id!==id);next.current=invite.leagueId;return next;}
export function inviteExamples(){return[{id:'demo-sent-1',email:'jordan@example.com',status:'pending'},{id:'demo-sent-2',email:'sam@example.com',status:'accepted'},{id:'demo-sent-3',email:'casey@example.com',status:'revoked'}];}
export function createInviteExample(invites,email){const clean=normalizeEmail(email);if(!clean)throw Error('Enter a valid email address.');if(clean==='alex@example.com')throw Error('You already belong to this example league.');if(invites.some(row=>row.email===clean&&['pending','active'].includes(row.status)))throw Error('An example invitation for this email is already pending.');const created={id:`demo-sent-${invites.length+1}`,email:clean,status:'pending',inviteUrl:EXAMPLE_LINK};return{created,invites:[created,...invites]};}
export function revokeInviteExample(invites,id){const row=invites.find(row=>row.id===id);if(!row||!['pending','active'].includes(row.status))throw Error('Only a pending example invitation can be revoked.');return invites.map(row=>row.id===id?{...row,status:'revoked'}:row);}
