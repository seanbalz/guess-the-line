// Applied M-32 RPCs enforce storage/locking/reveal. No live provider call belongs to a read.
// Three-way markets (20261110100000, pending): reads and saves are market-aware only when gtl_epl_three_way_ready is
// installed. Its exact absence keeps every reply and RPC on the legacy two-way contract, byte for byte.
import { MANAGER_NAMES } from '../shared/epl-sleeper.mjs';
import { validGuessPrice, validOutcome, outcomeClub, clubOutcome, EPL_MARKETS } from '../shared/epl-moneyline.mjs';
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
  GTL_EPL_MARKET_OFF:[409,'Three-way guessing is not available yet. Your saved guess is unchanged.'],
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
/** A market-aware row: M-32's rebuilt fields plus market and outcome, consistent with its fixture. */
export function eplMarketGuessView(g,fixture){
  const view=eplGuessView(g.club===null&&g.market==='three_way'&&g.outcome==='draw'?{...g,club:fixture?.home}:g);
  if(!EPL_MARKETS.includes(g.market)||!validOutcome(g.market,g.outcome)||!fixture)throw invalidReply();
  const club=outcomeClub(fixture,g.outcome);
  if(g.outcome==='draw'?g.club!==null:g.club!==club)throw invalidReply();
  return {...view,club,market:g.market,outcome:g.outcome};
}
function boardView(raw,target,markets=false){
  if(!record(raw)||raw.season!==target.season||raw.week!==target.week||(raw.ownerId!==null&&!manager(raw.ownerId))||!Array.isArray(raw.fixtures)||raw.fixtures.length>100
    ||!Array.isArray(raw.guesses)||raw.guesses.length>800)throw invalidReply();
  const fixtures=raw.fixtures.map(f=>{
    if(!record(f)||!eventOk(f.eventId)||!clubs.has(f.home)||!clubs.has(f.away)||f.home===f.away||!iso(f.commenceTime)||!['scheduled','final','postponed'].includes(f.status)||typeof f.kickedOff!=='boolean')throw invalidReply();
    return {eventId:f.eventId,home:f.home,away:f.away,commenceTime:iso(f.commenceTime),status:f.status,kickedOff:f.kickedOff};
  });
  if(new Set(fixtures.map(f=>f.eventId)).size!==fixtures.length)throw invalidReply();
  const byEvent=new Map(fixtures.map(f=>[f.eventId,f]));
  if(markets&&typeof raw.threeWayEntry!=='boolean')throw invalidReply();
  const guesses=raw.guesses.map(g=>markets?eplMarketGuessView(g,byEvent.get(g?.eventId)):eplGuessView(g));
  if(new Set(guesses.map(g=>`${g.eventId}/${g.ownerId}`)).size!==guesses.length)throw invalidReply();
  const ownLocks=new Set(guesses.filter(g=>g.ownerId===raw.ownerId&&g.status==='locked').map(g=>g.eventId));
  // SQL is authoritative. Defense in depth also refuses any accidentally broadened pre-reveal payload.
  for(const g of guesses){const f=byEvent.get(g.eventId);if(!f||!(g.outcome==='draw'?g.club===null:[f.home,f.away].includes(g.club))|| (g.ownerId!==raw.ownerId&&(g.status!=='locked'||(!f.kickedOff&&!ownLocks.has(g.eventId)))))throw invalidReply();}
  return {season:target.season,week:target.week,ownerId:raw.ownerId,fixtures,guesses,...(markets?{markets:raw.threeWayEntry?['draw_no_bet','three_way']:['draw_no_bet']}:{})};
}
const empty=(target={season:null,week:null})=>({...target,ownerId:null,fixtures:[],guesses:[]});

export function createEplGuessService({rpc,rest,rows,refreshForLock}){
  return {
    ...(typeof refreshForLock==='function'?{refreshForLock}:{}),
    async guessReady(){try{const ready=await rpc('gtl_epl_moneyline_save_ready',{});if(ready!==true)throw invalidReply();return true;}catch(error){if(unavailable(error))return false;throw error;}},
    /** null: the three-way schema is exactly absent (legacy two-way). true/false: market-aware; false is the off switch. */
    async marketsReady(){try{const ready=await rpc('gtl_epl_three_way_ready',{});if(typeof ready!=='boolean')throw invalidReply();return ready;}catch(error){if(unavailable(error))return null;throw error;}},
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
      const f=await rest('gtl_epl_fixtures',{select:'event_id,season,week,home,away',event_id:`eq.${eventId}`,limit:'1'});
      if(f===null)return null;if(!record(f)||f.event_id!==eventId||!seasonOk(f.season)||!weekOk(f.week)||!clubs.has(f.home)||!clubs.has(f.away)||f.home===f.away)throw invalidReply();
      return {season:f.season,week:f.week,home:f.home,away:f.away};
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
  const markets=ready?await marketsMode(service):null;
  const weeks=await weeksView(service,ready),target=body.season!==undefined?{season:body.season,week:body.week}:weeks[0]?{season:weeks[0].season,week:weeks[0].week}:null;
  if(!target)return {available:false,reason:'prices_not_verified',...empty(),weeks,ownerNames:{...MANAGER_NAMES}};
  const available=ready&&((weeks.find(w=>w.season===target.season&&w.week===target.week)?.available)??await service.guessGate(target.season,target.week));
  let board;
  try{board=await readBoard(service,user,target,markets);}
  catch(error){if(!unavailable(error))throw error;return {available:false,reason:'schema_unavailable',...empty(target),weeks:weeks.map(w=>({...w,available:false})),ownerNames:{...MANAGER_NAMES}};}
  return {available:available===true,reason:!ready?'schema_unavailable':available===true?null:'prices_not_verified',...board,weeks:ready?weeks:weeks.map(w=>({...w,available:false})),ownerNames:{...MANAGER_NAMES}};
}
const marketsMode=async service=>typeof service.marketsReady==='function'?service.marketsReady():null;
const readBoard=async(service,user,target,markets)=>markets===null
  ?boardView(await service.rpc('gtl_epl_guess_board',{p_user:user.id,p_season:target.season,p_week:target.week}),target)
  :boardView(await service.rpc('gtl_epl_guess_board_markets',{p_user:user.id,p_season:target.season,p_week:target.week}),target,true);
async function ownReadback(service,user,target,eventId,owner,markets=null){
  const board=await readBoard(service,user,target,markets);
  if(board.ownerId!==owner)throw invalidReply();
  return board.guesses.find(g=>g.eventId===eventId&&g.ownerId===owner)??null;
}
// Legacy body {eventId, club, price, lock} is a two-way guess. The market-aware body is {eventId, market, outcome, price,
// lock}; it names no club. A three-way save needs the installed capability to answer true.
function parseSave(body){
  if(!record(body))fail('GTL_EPL_GUESS_INVALID');
  const legacy=!Object.hasOwn(body,'market');
  keys(body,legacy?['eventId','club','price','lock']:['eventId','market','outcome','price','lock']);
  if(!eventOk(body.eventId)||!storableEplPrice(body.price)||typeof body.lock!=='boolean')fail('GTL_EPL_GUESS_INVALID');
  if(legacy?!clubs.has(body.club):!validOutcome(body.market,body.outcome))fail('GTL_EPL_GUESS_INVALID');
  return legacy?{eventId:body.eventId,market:'draw_no_bet',club:body.club,outcome:null,price:body.price,lock:body.lock,legacy}
    :{eventId:body.eventId,market:body.market,club:null,outcome:body.outcome,price:body.price,lock:body.lock,legacy};
}
async function guessSave({body,user,service,clock}){
  const want=parseSave(body);
  const owner=await service.rpc('gtl_epl_member',{p_user:user.id});
  if(!manager(owner))fail('GTL_EPL_GUESS_NOT_MEMBER');
  if(await service.guessReady()!==true)fail('GTL_EPL_GUESS_OFF');
  const markets=await marketsMode(service);
  if(want.market==='three_way'&&markets!==true)fail('GTL_EPL_MARKET_OFF');
  const target=await service.guessFixture(body.eventId);
  if(!target)fail('GTL_EPL_GUESS_INVALID');
  // Resolve the side the request names against the stored fixture: a two-way club must play in it.
  const fixture=clubs.has(target.home)&&clubs.has(target.away)?{home:target.home,away:target.away}:null;
  if(want.legacy&&fixture){want.outcome=clubOutcome(fixture,want.club);if(!want.outcome)fail('GTL_EPL_GUESS_INVALID');}
  if(!want.legacy){if(!fixture)fail('GTL_EPL_GUESS_UNCERTAIN');want.club=outcomeClub(fixture,want.outcome);}
  if(await service.guessGate(target.season,target.week)!==true)fail('GTL_EPL_GUESS_OFF');
  let saved;
  try{
    // Read the trusted clock immediately before the writer, after every membership/gate/storage lookup.
    const stamp=clock();if(!Number.isFinite(stamp))throw invalidReply();
    const p_now=new Date(stamp).toISOString();
    saved=markets===null
      ?eplGuessView(await service.rpc('gtl_epl_save_guess_current',{p_user:user.id,p_event_id:body.eventId,p_club:want.club,p_price:body.price,p_lock:body.lock,p_now}))
      :eplMarketGuessView(await service.rpc('gtl_epl_save_market_guess_current',{p_user:user.id,p_event_id:body.eventId,p_market:want.market,p_outcome:want.outcome,p_price:body.price,p_lock:body.lock,p_now}),fixture);
    if(saved.ownerId!==owner||saved.eventId!==body.eventId||saved.club!==want.club||saved.price!==body.price||saved.status!==(body.lock?'locked':'draft')
      ||(markets!==null&&(saved.market!==want.market||saved.outcome!==want.outcome)))throw invalidReply();
  }catch(error){
    if(unavailable(error))fail('GTL_EPL_GUESS_OFF');
    if(error?.code==='GTL_EPL_GUESS_INVALID')fail('GTL_EPL_GUESS_INVALID');
    if(error?.code==='GTL_EPL_FORBIDDEN')fail('GTL_EPL_GUESS_NOT_MEMBER');
    if(error?.code==='GTL_EPL_MARKET_OFF')fail('GTL_EPL_MARKET_OFF');
    if(['GTL_EPL_GUESS_CLOSED','GTL_EPL_GUESS_LOCKED'].includes(error?.code)){
      let persisted=null;try{persisted=await ownReadback(service,user,target,body.eventId,owner,markets);}catch{/* Refusal is definite; no retry or leaked provider payload. */}
      fail(error.code,error.code==='GTL_EPL_GUESS_CLOSED'?{draft:persisted?.status==='draft'?persisted:null}:{guess:persisted?.status==='locked'?persisted:null});
    }
    fail('GTL_EPL_GUESS_UNCERTAIN');
  }
  if(!body.lock)return saved;
  // The accepted lock precedes the best-effort collection. Provider errors or crossing kickoff never undo it.
  if(typeof service.refreshForLock==='function')try{await service.refreshForLock({userId:user.id,eventId:body.eventId});}catch{/* Pending is allowed. */}
  try{const accepted=await ownReadback(service,user,target,body.eventId,owner,markets);if(!accepted||accepted.status!=='locked')throw invalidReply();return accepted;}
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
export const EPL_GUESS_RPCS=Object.freeze(['gtl_epl_guess_board','gtl_epl_save_guess_current','gtl_epl_guess_leaderboard','gtl_epl_moneyline_save_ready','gtl_epl_moneyline_gate',
  'gtl_epl_three_way_ready','gtl_epl_guess_board_markets','gtl_epl_save_market_guess_current']);
export async function handleEplGuess(args){
  if(args.route==='/epl/guess/read')return guessRead(args);
  if(args.route==='/epl/guess/save')return guessSave(args);
  return guessLeaderboard(args);
}
