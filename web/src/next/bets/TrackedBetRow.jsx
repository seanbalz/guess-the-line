import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,ChevronDown,ChevronRight,ChevronUp} from 'lucide-react';
import {Matchup} from '../ui/Matchup.jsx';
import {Pill} from '../ui/Pill.jsx';
import {cashText,trackedLeg,unitText,validUnitCash} from '../../trackedBetTerms.js';
import './tracked-bets.css';
export function TrackedBetRow({entry,games,unitCash,children}) {
  const [expanded,setExpanded]=useState(false),[open,setOpen]=useState(false),id=useId();
  const preview=useRef(null),collapse=useRef(null),nextFocus=useRef(null);
  useEffect(()=>{
    const target=nextFocus.current==='details'?collapse.current:nextFocus.current==='preview'?preview.current:null;
    nextFocus.current=null;
    target?.focus({preventScroll:true});
  },[expanded]);
  const showTicket=()=>{nextFocus.current='details';setExpanded(true);};
  const hideTicket=()=>{nextFocus.current='preview';setExpanded(false);};
  const source=typeof entry.source==='string'?entry.source:entry.source?.name,pending=entry.outcome==='pending',parlay=entry.kind==='parlay';
  const status={pending:'Open',win:'Won',loss:'Lost',push:'Push',void:'Void'}[entry.outcome]||'Pending';
  const tone=['win','loss','pending'].includes(entry.outcome)?entry.outcome:'neutral';
  const odds=Number.isFinite(entry.odds)?`${entry.odds>0?'+':'−'}${Math.abs(entry.odds)}`:'Odds unknown';
  const cash=value=>validUnitCash(unitCash)&&Number.isFinite(value)?cashText(value*Number(unitCash)):null;
  const result=pending?entry.potentialReturnUnits:entry.netUnits;
  const allTouchdowns=parlay&&entry.legs.every(leg=>trackedLeg(leg).stat==='Anytime touchdown');
  const first=trackedLeg(entry.legs[0]),title=parlay?`${entry.legs.length}-leg parlay`:first.name;
  const gameIds=[...new Set(entry.legs.map(leg=>leg.gameId))];
  const risk=cash(entry.stakeUnits)||unitText(entry.stakeUnits),returned=pending?(cash(result)||unitText(result)):unitText(result);
  const resultClass=!pending&&result>0?'gx-c-win':!pending&&result<0?'gx-c-loss':undefined;
  return <article className="gx-tracked-row" aria-label={`${parlay?`${entry.legs.length}-leg parlay`:entry.legs[0]?.selection||'Tracked bet'} · ${status}`}>
    <button type="button" ref={preview} className="gx-tracked-preview" hidden={expanded} aria-label={`Expand ${title}`} aria-expanded={expanded} aria-controls={`${id}-ticket`} aria-describedby={`${id}-meta ${id}-money`} onClick={showTicket}>
      <span id={`${id}-meta`} className="gx-tracked-preview-head"><span>{source||'Book unknown'}</span><Pill tone={tone}>{status}</Pill></span>
      <span className="gx-tracked-preview-heading"><strong>{title}</strong><ChevronRight size={20} aria-hidden="true"/></span>
      {parlay?allTouchdowns&&<span className="gx-tracked-preview-description">Anytime touchdowns</span>:first.pick&&<span className="gx-tracked-preview-description"><span className="gx-tracked-preview-pick">{first.pick}</span> {first.stat}</span>}
      <span className="gx-tracked-preview-games" aria-hidden="true">{gameIds.slice(0,3).map(gameId=>{
        const game=games.find(item=>item.id===gameId);
        return <span key={gameId}>{game?<Matchup away={game.awayCode||game.away} home={game.homeCode||game.home} codes={false}/>:gameId}</span>;
      })}{gameIds.length>3&&<span className="gx-tracked-more">+{gameIds.length-3}</span>}</span>
      {(entry.countsForRecord===false||entry.lateEntry)&&<span className="gx-tracked-preview-flags">{entry.countsForRecord===false&&<span>Excluded</span>}{entry.lateEntry&&<span>Recorded after kickoff</span>}</span>}
      <span id={`${id}-money`} className="gx-tracked-preview-money"><span><small>Risk</small><strong>{risk}</strong></span><ArrowRight size={20} aria-hidden="true"/><span><small>{pending?'Total return':'Net units'}</small><strong className={resultClass}>{returned}</strong></span></span>
    </button>
    <div id={`${id}-ticket`} className="gx-tracked-expanded" hidden={!expanded}>
    <header className="gx-tracked-head"><span>{source||'Book unknown'}</span><Pill tone={tone}>{status}</Pill><button type="button" ref={collapse} className="gx-tracked-collapse" aria-label={`Collapse ${title}`} aria-expanded={expanded} aria-controls={`${id}-ticket`} onClick={hideTicket}><ChevronUp size={20} aria-hidden="true"/></button></header>
    <div className="gx-tracked-title"><h2>{title}{allTouchdowns&&<small>Anytime touchdowns</small>}</h2><span className={Number.isFinite(entry.odds)?'gx-tracked-price':'gx-tracked-price gx-tracked-price--unknown'}>{odds}</span></div>
    <ol className={parlay?'gx-tracked-legs':'gx-tracked-legs gx-tracked-single'} aria-label="Ticket selections">{entry.legs.map((leg,index)=>{
      const game=games.find(item=>item.id===leg.gameId),words=trackedLeg(leg);
      return <li key={index}><span className="gx-tracked-matchup">{game?<Matchup away={game.awayCode||game.away} home={game.homeCode||game.home}/>:leg.gameId}</span>{parlay&&<strong className="gx-tracked-player">{words.name}</strong>}{words.pick&&<strong className="gx-tracked-pick">{words.pick}</strong>}{!allTouchdowns&&<span className="gx-tracked-market">{words.stat}</span>}</li>;
    })}</ol>
    <dl className="gx-tracked-money"><div><dt>Risk</dt><dd>{risk}{cash(entry.stakeUnits)&&<small>{unitText(entry.stakeUnits)}</small>}</dd></div><div><dt>{pending?'To return':'Net units'}</dt><dd className={resultClass}>{returned}<small>{pending?'Includes stake':'Player reported'}</small></dd></div></dl>
    <footer className="gx-tracked-context"><div className="gx-tracked-tags"><span>Week {entry.week}</span>{entry.countsForRecord===false&&<span>Excluded</span>}{entry.lateEntry&&<span>Recorded after kickoff</span>}</div><button type="button" className="gx-tracked-menu" aria-label="Ticket details" aria-expanded={open} aria-controls={`${id}-history`} onClick={()=>setOpen(v=>!v)}>Ticket details<ChevronDown size={16} aria-hidden="true"/></button></footer>
    <div id={`${id}-history`} hidden={!open} className="gx-tracked-detail">{children}</div>
    </div>
  </article>;
}
