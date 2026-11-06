// Public historical adapter for the native gapRecord calculation. No account reads, current quotes or saved picks.
import {gapRecord,GAP_WIN_UNITS,recommendationMarket} from '../../shared/recommended-bets.mjs';
export const GAP_MARKETS=[{value:'all',label:'All'},{value:'spread',label:'Spreads'},{value:'total',label:'Totals'}];
export const GAP_OUTCOMES={win:{letter:'W',label:'Win'},loss:{letter:'L',label:'Loss'},push:{letter:'P',label:'Push'}};
export const paperAmount=n=>{const r=Math.round(n*100)/100;return`${r>0?'+':r<0?'−':''}${Math.abs(r).toFixed(2)}U`;};
export function exampleGapBoard(model,weekNumber){
 const week=model.history.weeks.find(w=>w.week===weekNumber);if(!week)throw Error('Example week unavailable');
 const picks=Object.fromEntries(['spread','total'].map(market=>[market,new Map((week.entries.find(e=>e.userId===model.history.viewer&&e.mode===(market==='spread'?'guess_spread':'guess_total'))?.picks??[]).map(p=>[p.gameId,p]))]));
 return {games:week.games.map(game=>{const row={...game,started:true,final:{...game.recordedFinal,status:'final'},mine:{}};for(const market of ['spread','total']){const p=picks[market].get(game.id);if(p){row.mine[market]={guess:p.guess,lockedIn:p.lockedIn===true};row[market]={visible:Number.isFinite(p.reference?.value),value:p.reference?.value,provenance:'public_historical_example'};}}return row;})};
}
export function exampleGapView(model,weekNumber,market='all',tier='all'){
 const board=exampleGapBoard(model,weekNumber),record=gapRecord(board,{market:recommendationMarket(market)}),summary=tier==='large'?record.favorable:record;
 const rows=record.graded.filter(row=>tier!=='large'||row.favorable).map(row=>({...row,key:`${row.gameId}:${row.market}`,game:board.games.find(g=>g.id===row.gameId)}));
 let wins=0,losses=0;const points=rows.map(row=>{if(row.outcome==='win')wins++;if(row.outcome==='loss')losses++;return{...row,value:wins*GAP_WIN_UNITS-losses};});
 return {board,record,summary,rows,points};
}
export function gapSelection(game,market,value){return market==='total'?`${value} total points`:value===0?'Pick’em':`${value<0?game.homeName:game.awayName} −${Math.abs(value)}`;}

export function gapSide(row){if(row.market==='total')return `${row.side==='over'?'Over':'Under'} ${row.line}`;const value=row.side==='home'?row.line:-row.line,name=row.side==='home'?row.game.homeName:row.game.awayName;return`${name} ${value===0?'Pick’em':value>0?'+'+value:'−'+Math.abs(value)}`;}
