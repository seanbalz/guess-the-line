// Manual tracking presentation only; never fetches prices or grades bets.
import {summarizeSocialBets} from '../../shared/social-bets.mjs';
export const PROP_STATS = [['rushing yards','Rushing yards'],['receiving yards','Receiving yards'],['passing yards','Passing yards'],['receptions','Receptions'],['rushing + receiving yards','Rushing + receiving yards'],['passing touchdowns','Passing touchdowns'],['anytime touchdown','Anytime touchdown']];
export const unitText = value => Number.isFinite(value) ? `${Number(value.toFixed(4))}U` : 'Unknown';
export const cashText = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value) : '—';
export const validUnitCash = value => Number.isFinite(Number(value)) && Number(value)>0 && Number(value)<=1000000 && Math.abs(Number(value)*100-Math.round(Number(value)*100))<1e-7;
export function cashToUnits(cash,unit) {
  if(!validUnitCash(cash)||!validUnitCash(unit))return null;
  const units=Math.round(Number(cash)/Number(unit)*10000)/10000;
  return units>0&&units<=1000000&&Math.abs(Math.round(units*Number(unit)*100)/100-Number(cash))<1e-7?units:null;
}
export function ownUnitHint(entries,actorId) {
  if(!actorId)return null;
  const hints=(entries||[]).filter(e=>e.ownerId===actorId&&!e.noteHidden&&!e.locked).flatMap(e=>{
    return [...(e.notes||'').matchAll(/(?:\bat\s+\$([\d,.]+)\/U\b|1U\s*=\s*\$([\d,.]+)(?=$|[;!?\s]|\/U\b))/gi)].flatMap(match=>{
      const token=(match[1]??match[2]).replace(/\.$/,'');
      if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token))return [];
      const value=Number(token.replaceAll(',',''));return validUnitCash(value)?[value]:[];
    });
  });
  return hints.length&&new Set(hints).size===1?hints[0]:null;
}
export function readUnitCash(actorId) {
  if(!actorId||typeof window==='undefined')return null;
  try{const value=JSON.parse(localStorage.getItem(`gtl.tracking-unit.${actorId}`));return value?.ownerId===actorId&&validUnitCash(value.value)?Number(value.value):null;}catch{return null;}
}
export function saveUnitCash(actorId,value) {
  if(!actorId||typeof window==='undefined')return;
  try{if(validUnitCash(value))localStorage.setItem(`gtl.tracking-unit.${actorId}`,JSON.stringify({ownerId:actorId,value:Number(value)}));else localStorage.removeItem(`gtl.tracking-unit.${actorId}`);}catch{/* View works without storage. */}
}
export function parsePlayerProp(leg) {
  if(leg?.locked||leg?.market!=='prop'||typeof leg.selection!=='string')return null;
  const text=leg.selection.trim(),td=/^(.+?)\s+anytime touchdown(?:\s*\(1\+\))?$/i.exec(text);
  if(td)return {player:td[1],stat:'anytime touchdown',direction:'at least',line:'1'};
  const m=/^(.+?)\s+(over|under|at least)\s+(\d+(?:\.\d+)?)\s+(.+)$/i.exec(text),a=/^(.+?)\s+(\d+(?:\.\d+)?)\+\s+(.+)$/i.exec(text);
  const result=m?{player:m[1],direction:m[2].toLowerCase(),line:m[3],stat:m[4].toLowerCase()}:a?{player:a[1],direction:'at least',line:a[2],stat:a[3].toLowerCase()}:null;
  return result&&PROP_STATS.some(([stat])=>stat===result.stat)?result:null;
}
export function playerPropLeg(gameId,fields) {
  const {player,stat,direction,line}=fields,name=player.trim(),threshold=Number(line),td=stat==='anytime touchdown';
  const ready=name.length>0&&PROP_STATS.some(([value])=>value===stat)&&(td||['over','under','at least'].includes(direction)&&line!==''&&Number.isFinite(threshold)&&threshold>=0&&threshold<=10000&&Number.isInteger(threshold*2));
  return {gameId,market:'prop',side:name,line:td?null:ready?threshold:null,selection:ready?td?`${name} anytime touchdown (1+)`:direction==='at least'?`${name} ${threshold}+ ${stat}`:`${name} ${direction} ${threshold} ${stat}`:''};
}
export function trackedLeg(leg) {
  if(leg.locked)return {name:leg.selection||'Selection',pick:'Locked',stat:'Line locked'};
  const prop=parsePlayerProp(leg);
  if(prop)return {name:prop.player,pick:prop.stat==='anytime touchdown'?'1+ TD':`${prop.direction==='over'?'Over':prop.direction==='under'?'Under':''} ${prop.line}${prop.direction==='at least'?'+':''}`.trim(),stat:PROP_STATS.find(([stat])=>stat===prop.stat)[1]};
  const win=leg.market==='prop'&&/^(.+) to win \(moneyline\)$/i.exec(leg.selection||'');
  if(win)return {name:win[1],pick:'Win',stat:'Moneyline'};
  if(leg.market==='total')return {name:'Game total',pick:`${leg.side==='over'?'Over':'Under'} ${leg.line??'—'}`,stat:'Total points'};
  return {name:leg.selection||'Selection',pick:null,stat:leg.market==='spread'?'Spread':'Custom selection'};
}

const bookName = entry => (typeof entry.source==='string'?entry.source:entry.source?.name||'').trim();
const placementDay=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
/** Date filters use the saved placement date, or recording date when placement is unknown, in Pacific time. */
export function trackedBetDate(entry) {
  const time=Date.parse(entry.placedAt||entry.recordedAt||'');
  if(!Number.isFinite(time))return null;
  const parts=placementDay.formatToParts(time);
  return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-');
}
/** Owner-only dashboard projection. Accounting is the same core used by the server; saved tickets never change. */
export function trackedOverview(data,{actorId,source='',from='',to=''}={}) {
  const own=(data?.entries||[]).filter(entry=>actorId&&entry.ownerId===actorId&&entry.origin==='tracked');
  const books=[...new Set(own.map(bookName))].sort((a,b)=>a.localeCompare(b));
  const validDate=value=>!value||/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const rangeError=!validDate(from)||!validDate(to)?'Enter valid dates.':from&&to&&from>to?'Start date must be on or before end date.':null;
  const entries=rangeError?[]:own.filter(entry=>{
    if(source&&source!==`book:${bookName(entry)}`)return false;
    if(!from&&!to)return true;
    const date=trackedBetDate(entry);return date&&(!from||date>=from)&&(!to||date<=to);
  });
  const included=entries.filter(entry=>entry.countsForRecord!==false),ids=new Set(included.map(entry=>entry.id));
  let running=0;
  const chart=(data?.chart||[]).filter(point=>point.ownerId===actorId&&ids.has(point.entryId)&&Number.isFinite(point.netUnits)).map(point=>{
    running=Math.round((running+point.netUnits)*10000)/10000;
    return {...point,cumulativeNetUnits:running};
  });
  const group=labelOf=>{
    const rows=new Map();
    for(const entry of included){const label=labelOf(entry);rows.set(label,(rows.get(label)||0)+1);}
    return [...rows].map(([label,count])=>({label,count}));
  };
  const marketOf=entry=>{
    const markets=[...new Set(entry.legs.map(leg=>leg.market==='spread'?'Spreads':leg.market==='total'?'Totals':trackedLeg(leg).stat==='Moneyline'?'Moneylines':'Props / custom'))];
    return markets.length===1?markets[0]:'Mixed markets';
  };
  const pending=included.filter(entry=>entry.outcome==='pending');
  return {entries,books,chart,summary:summarizeSocialBets(entries),rangeError,
    types:['Singles','Parlays'].map(label=>({label,count:included.filter(entry=>entry.kind===(label==='Singles'?'single':'parlay')).length})),
    markets:group(marketOf).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)),
    sources:group(bookName).map(row=>({...row,value:`book:${row.label}`,label:row.label||'Unknown book'})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)),
    outcomes:['win','loss','push','pending','void'].map(outcome=>({outcome,label:({win:'Won',loss:'Lost',push:'Push',pending:'Open',void:'Void'})[outcome],count:included.filter(entry=>entry.outcome===outcome).length})),
    pendingStakeUnits:Math.round(pending.reduce((sum,entry)=>sum+(Number.isFinite(entry.stakeUnits)?entry.stakeUnits:0),0)*10000)/10000,
    unknownPendingStakes:pending.filter(entry=>!Number.isFinite(entry.stakeUnits)).length,
  };
}
