// Applied M-32 RPCs enforce storage/locking/reveal. No live provider call belongs to a read.
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';
import { validGuessPrice } from '../shared/epl-moneyline.mjs';
import { EPL_CLUBS } from '../shared/epl-clubs.mjs';
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const seasonOk=v=>Number.isInteger(v)&&v>=2000&&v<=2200;
const weekOk=v=>Number.isInteger(v)&&v>=1&&v<=38;
const eventOk=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const clubs=new Set(EPL_CLUBS.map(c=>c.code));
const manager=v=>typeof v==='string'&&Object.hasOwn(MANAGER_NAMES,v);
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
const storedPrice=v=>Number.isInteger(v)&&Math.abs(v)>=100&&v>=-2147483647&&v<=2147483647;
export const storableEplPrice=validGuessPrice;
const messages=Object.freeze({
  GTL_EPL_GUESS_INVALID:[400,'Choose a valid match, club and whole American price.'],
  GTL_EPL_GUESS_LOCKED:[409,'This guess is already locked in.'],
  GTL_EPL_GUESS_CLOSED:[409,'This match is closed. Your saved draft is preserved.'],
  GTL_EPL_GUESS_NOT_MEMBER:[403,'Link an FEPL manager to save a guess.'],
  GTL_EPL_GUESS_OFF:[404,'Guess the Line is unavailable for this matchweek.'],
  GTL_EPL_GUESS_UNCERTAIN:[503,'Check the saved guess before trying another save.'],
});
export const EPL_GUESS_PUBLIC_CODES=Object.freeze(Object.keys(messages));
export class EplGuessError extends Error {
  constructor(code,details={}){super(messages[code]?.[1]??messages.GTL_EPL_GUESS_UNCERTAIN[1]);this.name='EplGuessError';this.code=Object.hasOwn(messages,code)?code:'GTL_EPL_GUESS_UNCERTAIN';this.status=messages[this.code][0];
    if(this.code==='GTL_EPL_GUESS_CLOSED')this.draft=details.draft??null;
    if(this.code==='GTL_EPL_GUESS_LOCKED'&&details.guess)this.guess=details.guess;
  }
}
const fail=(code,details)=>{throw new EplGuessError(code,details);};
export const eplGuessErrorBody=error=>({error:error.message,code:error.code,...(error.code==='GTL_EPL_GUESS_UNCERTAIN'?{readbackRequired:true}:{}),
  ...(error.code==='GTL_EPL_GUESS_CLOSED'?{draft:error.draft}:{}),...(error.guess?{guess:error.guess}:{})});
const unavailable=error=>error?.status===404&&error?.code==='GTL_EPL_OFF';
const keys=(body,wanted)=>{if(!record(body)||Object.keys(body).some(k=>!wanted.includes(k)))fail('GTL_EPL_GUESS_INVALID');};
const invalidReply=()=>new Error('Invalid EPL guess reply.');

// Rebuild every SQL-permitted row; never return raw table/RPC objects or an unfiltered quote.
export function eplGuessView(g){
  if(!record(g)||!eventOk(g.eventId)||!manager(g.ownerId)||!clubs.has(g.club)||!storedPrice(g.price)
    ||!['draft','locked'].includes(g.status)||!['draft','pending','scored','unscored'].includes(g.state)||!iso(g.savedAt))throw invalidReply();
  const locked=g.status==='locked';
  if((locked&&!iso(g.lockedAt))||(!locked&&(g.lockedAt!==null||g.state!=='draft'))|| (locked&&g.state==='draft'))throw invalidReply();
  const scored=g.state==='scored';
  if(scored?(!storedPrice(g.referencePrice)||!iso(g.referenceObservedAt)||!['at-lock','first-after'].includes(g.referenceSource)||!Number.isInteger(g.distance)||g.distance<0||g.distance>2147483647)
    :[g.referencePrice,g.referenceObservedAt,g.referenceSource,g.distance].some(v=>v!==null))throw invalidReply();
  return {eventId:g.eventId,ownerId:g.ownerId,club:g.club,price:g.price,status:g.status,savedAt:iso(g.savedAt),lockedAt:locked?iso(g.lockedAt):null,
    referencePrice:scored?g.referencePrice:null,referenceObservedAt:scored?iso(g.referenceObservedAt):null,referenceSource:scored?g.referenceSource:null,distance:scored?g.distance:null,state:g.state};
}
function boardView(raw,target){
  if(!record(raw)||raw.season!==target.season||raw.week!==target.week||(raw.ownerId!==null&&!manager(raw.ownerId))||!Array.isArray(raw.fixtures)||raw.fixtures.length>100
    ||!Array.isArray(raw.guesses)||raw.guesses.length>800)throw invalidReply();
  const fixtures=raw.fixtures.map(f=>{
    if(!record(f)||!eventOk(f.eventId)||!clubs.has(f.home)||!clubs.has(f.away)||f.home===f.away||!iso(f.commenceTime)||!['scheduled','final','postponed'].includes(f.status)||typeof f.kickedOff!=='boolean')throw invalidReply();
    return {eventId:f.eventId,home:f.home,away:f.away,commenceTime:iso(f.commenceTime),status:f.status,kickedOff:f.kickedOff};
  });
  if(new Set(fixtures.map(f=>f.eventId)).size!==fixtures.length)throw invalidReply();
  const byEvent=new Map(fixtures.map(f=>[f.eventId,f]));
  const guesses=raw.guesses.map(eplGuessView);
  if(new Set(guesses.map(g=>`${g.eventId}/${g.ownerId}`)).size!==guesses.length)throw invalidReply();
  const ownLocks=new Set(guesses.filter(g=>g.ownerId===raw.ownerId&&g.status==='locked').map(g=>g.eventId));
  // SQL is authoritative. Defense in depth also refuses any accidentally broadened pre-reveal payload.
  for(const g of guesses){const f=byEvent.get(g.eventId);if(!f||![f.home,f.away].includes(g.club)|| (g.ownerId!==raw.ownerId&&(g.status!=='locked'||(!f.kickedOff&&!ownLocks.has(g.eventId)))))throw invalidReply();}
  return {season:target.season,week:target.week,ownerId:raw.ownerId,fixtures,guesses};
}
const empty=(target={season:null,week:null})=>({...target,ownerId:null,fixtures:[],guesses:[]});

export function createEplGuessService({rpc,rest,rows,refreshForLock}){
  return {
    ...(typeof refreshForLock==='function'?{refreshForLock}:{}),
    async guessReady(){try{const ready=await rpc('gtl_epl_moneyline_save_ready',{});if(ready!==true)throw invalidReply();return true;}catch(error){if(unavailable(error))return false;throw error;}},
    async guessWeeks(){
      const weeks=await rows('gtl_epl_weeks',{select:'season,week',order:'season.desc,week.desc',limit:'38'},38);
      if(!Array.isArray(weeks)||weeks.length>38||weeks.some(w=>!seasonOk(w.season)||!weekOk(w.week))||new Set(weeks.map(w=>`${w.season}/${w.week}`)).size!==weeks.length)throw invalidReply();
      return weeks.map(w=>({season:w.season,week:w.week}));
    },
    async guessGate(season,week){
      const result=await rpc('gtl_epl_moneyline_gate',{p_season:season,p_week:week});
      if(typeof result!=='boolean')throw invalidReply();return result;
    },
    async guessFixture(eventId){
      const f=await rest('gtl_epl_fixtures',{select:'event_id,season,week',event_id:`eq.${eventId}`,limit:'1'});
      if(f===null)return null;if(!record(f)||f.event_id!==eventId||!seasonOk(f.season)||!weekOk(f.week))throw invalidReply();
      return {season:f.season,week:f.week};
    },
  };
}
async function weeksView(service,ready){
  const list=await service.guessWeeks();
  if(!Array.isArray(list)||list.length>38||list.some(w=>!seasonOk(w.season)||!weekOk(w.week)))throw invalidReply();
  if(!ready)return list.map(w=>({...w,available:false}));
  const out=new Array(list.length);let next=0;
  // At most four service-only boolean reads in flight. Keep stored-week order and await all workers even on failure.
  const workers=Array.from({length:Math.min(4,list.length)},async()=>{
    for(;;){const index=next++;if(index>=list.length)return;const w=list[index];out[index]={...w,available:await service.guessGate(w.season,w.week)===true};}
  });
  const results=await Promise.allSettled(workers),failure=results.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
  return out;
}
async function guessRead({body,user,service}){
  keys(body,['season','week']);
  if((body.season!==undefined||body.week!==undefined)&&(!seasonOk(body.season)||!weekOk(body.week)))fail('GTL_EPL_GUESS_INVALID');
  const ready=await service.guessReady();
  const weeks=await weeksView(service,ready),target=body.season!==undefined?{season:body.season,week:body.week}:weeks[0]?{season:weeks[0].season,week:weeks[0].week}:null;
  if(!target)return {available:false,reason:'prices_not_verified',...empty(),weeks,ownerNames:{...MANAGER_NAMES}};
  const available=ready&&((weeks.find(w=>w.season===target.season&&w.week===target.week)?.available)??await service.guessGate(target.season,target.week));
  let board;
  try{board=boardView(await service.rpc('gtl_epl_guess_board',{p_user:user.id,p_season:target.season,p_week:target.week}),target);}
  catch(error){if(!unavailable(error))throw error;return {available:false,reason:'schema_unavailable',...empty(target),weeks:weeks.map(w=>({...w,available:false})),ownerNames:{...MANAGER_NAMES}};}
  return {available:available===true,reason:!ready?'schema_unavailable':available===true?null:'prices_not_verified',...board,weeks:ready?weeks:weeks.map(w=>({...w,available:false})),ownerNames:{...MANAGER_NAMES}};
}
async function ownReadback(service,user,target,eventId,owner){
  const board=boardView(await service.rpc('gtl_epl_guess_board',{p_user:user.id,p_season:target.season,p_week:target.week}),target);
  if(board.ownerId!==owner)throw invalidReply();
  return board.guesses.find(g=>g.eventId===eventId&&g.ownerId===owner)??null;
}
async function guessSave({body,user,service,clock}){
  keys(body,['eventId','club','price','lock']);
  if(!eventOk(body.eventId)||!clubs.has(body.club)||!storableEplPrice(body.price)||typeof body.lock!=='boolean')fail('GTL_EPL_GUESS_INVALID');
  const owner=await service.rpc('gtl_epl_member',{p_user:user.id});
  if(!manager(owner))fail('GTL_EPL_GUESS_NOT_MEMBER');
  if(await service.guessReady()!==true)fail('GTL_EPL_GUESS_OFF');
  const target=await service.guessFixture(body.eventId);
  if(!target)fail('GTL_EPL_GUESS_INVALID');
  if(await service.guessGate(target.season,target.week)!==true)fail('GTL_EPL_GUESS_OFF');
  let saved;
  try{
    // Read the trusted clock immediately before the writer, after every membership/gate/storage lookup.
    const stamp=clock();if(!Number.isFinite(stamp))throw invalidReply();
    saved=eplGuessView(await service.rpc('gtl_epl_save_guess_current',{p_user:user.id,p_event_id:body.eventId,p_club:body.club,p_price:body.price,p_lock:body.lock,p_now:new Date(stamp).toISOString()}));
    if(saved.ownerId!==owner||saved.eventId!==body.eventId||saved.club!==body.club||saved.price!==body.price||saved.status!==(body.lock?'locked':'draft'))throw invalidReply();
  }catch(error){
    if(unavailable(error))fail('GTL_EPL_GUESS_OFF');
    if(error?.code==='GTL_EPL_GUESS_INVALID')fail('GTL_EPL_GUESS_INVALID');
    if(error?.code==='GTL_EPL_FORBIDDEN')fail('GTL_EPL_GUESS_NOT_MEMBER');
    if(['GTL_EPL_GUESS_CLOSED','GTL_EPL_GUESS_LOCKED'].includes(error?.code)){
      let persisted=null;try{persisted=await ownReadback(service,user,target,body.eventId,owner);}catch{/* Refusal is definite; no retry or leaked provider payload. */}
      fail(error.code,error.code==='GTL_EPL_GUESS_CLOSED'?{draft:persisted?.status==='draft'?persisted:null}:{guess:persisted?.status==='locked'?persisted:null});
    }
    fail('GTL_EPL_GUESS_UNCERTAIN');
  }
  if(!body.lock)return saved;
  // The accepted lock precedes the best-effort collection. Provider errors or crossing kickoff never undo it.
  if(typeof service.refreshForLock==='function')try{await service.refreshForLock({userId:user.id,eventId:body.eventId});}catch{/* Pending is allowed. */}
  try{const accepted=await ownReadback(service,user,target,body.eventId,owner);if(!accepted||accepted.status!=='locked')throw invalidReply();return accepted;}
  catch{fail('GTL_EPL_GUESS_UNCERTAIN');}
}
async function guessLeaderboard({body,service}){
  keys(body,['season']);if(body.season!==undefined&&!seasonOk(body.season))fail('GTL_EPL_GUESS_INVALID');
  const season=body.season??(await service.guessWeeks())[0]?.season??null;
  if(season===null)return {season:null,rows:[]};
  let raw;try{raw=await service.rpc('gtl_epl_guess_leaderboard',{p_season:season});}catch(error){if(unavailable(error))return {season,rows:[],available:false,reason:'schema_unavailable'};throw error;}
  if(!record(raw)||raw.season!==season||!Array.isArray(raw.rows)||raw.rows.length>8)throw invalidReply();
  const rows=raw.rows.map(r=>{if(!record(r)||!manager(r.ownerId)||!Number.isSafeInteger(r.guessed)||r.guessed<0||!Number.isSafeInteger(r.unscored)||r.unscored<0
      ||(r.guessed===0?(r.average!==null||r.total!==null):(!Number.isFinite(r.average)||r.average<0||!Number.isSafeInteger(r.total)||r.total<0)))throw invalidReply();
    return {ownerId:r.ownerId,name:MANAGER_NAMES[r.ownerId],average:r.average,total:r.total,guessed:r.guessed,unscored:r.unscored};});
  if(new Set(rows.map(r=>r.ownerId)).size!==rows.length)throw invalidReply();return {season,rows};
}
export const EPL_GUESS_METHODS=Object.freeze({'/epl/guess/read':['POST'],'/epl/guess/save':['POST'],'/epl/guess/leaderboard':['POST']});
export const EPL_GUESS_RPCS=Object.freeze(['gtl_epl_guess_board','gtl_epl_save_guess_current','gtl_epl_guess_leaderboard','gtl_epl_moneyline_save_ready','gtl_epl_moneyline_gate']);
export async function handleEplGuess(args){
  if(args.route==='/epl/guess/read')return guessRead(args);
  if(args.route==='/epl/guess/save')return guessSave(args);
  return guessLeaderboard(args);
}
