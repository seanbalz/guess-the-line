import {useId,useState} from 'react';
import {Matchup} from '../ui/Matchup.jsx';
import {Pill} from '../ui/Pill.jsx';
import {cashText,trackedLeg,unitText,validUnitCash} from '../../trackedBetTerms.js';
import './tracked-bets.css';
export function TrackedBetRow({entry,games,unitCash,children}) {
  const [open,setOpen]=useState(false),id=useId();
  const source=typeof entry.source==='string'?entry.source:entry.source?.name,pending=entry.outcome==='pending',parlay=entry.kind==='parlay';
  const status={pending:'Open',win:'Won',loss:'Lost',push:'Push',void:'Void'}[entry.outcome]||'Pending';
  const tone=['win','loss','pending'].includes(entry.outcome)?entry.outcome:'neutral';
  const odds=Number.isFinite(entry.odds)?`${entry.odds>0?'+':'−'}${Math.abs(entry.odds)}`:'Odds unknown';
  const cash=value=>validUnitCash(unitCash)&&Number.isFinite(value)?cashText(value*Number(unitCash)):null;
  const result=pending?entry.potentialReturnUnits:entry.netUnits;
  const allTouchdowns=parlay&&entry.legs.every(leg=>trackedLeg(leg).stat==='Anytime touchdown');
  return <article className="gx-tracked-row" aria-label={`${parlay?`${entry.legs.length}-leg parlay`:entry.legs[0]?.selection||'Tracked bet'} · ${status}`}>
    <header className="gx-tracked-head"><span>{source||'Book unknown'}</span><Pill tone={tone}>{status}</Pill><button className="gx-tracked-menu" aria-label="Ticket details" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}><span aria-hidden="true">⋯</span></button></header>
    <div className="gx-tracked-title"><h2>{parlay?`${entry.legs.length}-leg parlay`:trackedLeg(entry.legs[0]).name}{allTouchdowns&&<small>Anytime touchdowns</small>}</h2><span className={Number.isFinite(entry.odds)?'gx-tracked-price':'gx-tracked-price gx-tracked-price--unknown'}>{odds}</span></div>
    <ol className={parlay?'gx-tracked-legs':'gx-tracked-legs gx-tracked-single'} aria-label="Ticket selections">{entry.legs.map((leg,index)=>{
      const game=games.find(item=>item.id===leg.gameId),words=trackedLeg(leg);
      return <li key={index}><span className="gx-tracked-matchup">{game?<Matchup away={game.awayCode||game.away} home={game.homeCode||game.home}/>:leg.gameId}</span>{parlay&&<strong className="gx-tracked-player">{words.name}</strong>}{words.pick&&<strong className="gx-tracked-pick">{words.pick}</strong>}{!allTouchdowns&&<span className="gx-tracked-market">{words.stat}</span>}</li>;
    })}</ol>
    <dl className="gx-tracked-money"><div><dt>Risk</dt><dd>{cash(entry.stakeUnits)||unitText(entry.stakeUnits)}{cash(entry.stakeUnits)&&<small>{unitText(entry.stakeUnits)}</small>}</dd></div><div><dt>{pending?'To return':'Net units'}</dt><dd className={!pending&&result>0?'gx-c-win':!pending&&result<0?'gx-c-loss':undefined}>{pending?(cash(result)||unitText(result)):unitText(result)}<small>{pending?'Includes stake':'Player reported'}</small></dd></div></dl>
    <footer className="gx-tracked-context"><span>Week {entry.week}</span>{entry.countsForRecord===false&&<span>Excluded</span>}{entry.lateEntry&&<span>Recorded after kickoff</span>}</footer>
    <div id={id} hidden={!open} className="gx-tracked-detail">{children}</div>
  </article>;
}
