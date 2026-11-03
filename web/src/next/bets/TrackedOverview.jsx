import {useState} from 'react';
import {NetUnits} from './NetUnits.jsx';
import {StatTiles} from '../charts/StatTiles.jsx';
import {Button} from '../ui/Button.jsx';
import {InfoButton} from '../ui/InfoButton.jsx';
import {cashText,unitText,validUnitCash} from '../../trackedBetTerms.js';
import './tracked-overview.css';

function Breakdown({title,rows,onChoose}) {
  const [all,setAll]=useState(false);
  const maximum=Math.max(1,...rows.map(row=>row.count));
  const shown=all?rows:rows.slice(0,6),total=rows.reduce((sum,row)=>sum+row.count,0);
  return <section className="gx-overview-card" aria-label={title}>
    <h2 className="gx-t-section">{title}</h2>
    {total?<ul className="gx-overview-bars">{shown.map(row=><li key={row.value||row.label}>
      {onChoose?<button type="button" className="gx-overview-bar-row" aria-label={`Show ${row.label}: ${row.count} ${row.count===1?'bet':'bets'}`} onClick={()=>onChoose(row)}><span>{row.label}</span><strong>{row.count}</strong></button>:<div className="gx-overview-bar-row"><span>{row.label}</span><strong>{row.count}</strong></div>}
      <span className="gx-overview-bar-track" aria-hidden="true"><span style={{width:`${row.count/maximum*100}%`}}/></span>
    </li>)}</ul>:<p className="gx-t-body gx-c-2">No included bets match these filters.</p>}
    {rows.length>6&&<Button variant="ghost" onClick={()=>setAll(value=>!value)}>{all?'Show fewer':`Show all ${rows.length}`}</Button>}
  </section>;
}

export function TrackedOverview({model,actorId,unitCash,amounts,onAmounts,onFilter,onSource,onTickets}) {
  const {summary,chart,types,markets,sources,outcomes,pendingStakeUnits,unknownPendingStakes}=model;
  const cash=amounts==='cash'&&validUnitCash(unitCash),amount=value=>cash?cashText(value*unitCash):unitText(value);
  const openRisk=unknownPendingStakes?(pendingStakeUnits>0?`≥${amount(pendingStakeUnits)}`:'—'):amount(pendingStakeUnits);
  return <section className="gx-tracked-overview" aria-label="Tracked bets overview" data-bets="overview">
    <div className="gx-overview-options"><div className="gx-seg" role="group" aria-label="Chart amounts">
      <button type="button" className={`gx-seg-btn ${!cash?'gx-seg-btn--on':''}`} aria-pressed={!cash} onClick={()=>onAmounts('units')}>Units</button>
      <button type="button" className={`gx-seg-btn ${cash?'gx-seg-btn--on':''}`} aria-pressed={cash} disabled={!validUnitCash(unitCash)} onClick={()=>onAmounts('cash')}>Cash</button>
    </div><InfoButton title="About tracked bet charts" body={[
      'Every chart uses the filters above and only your tracked bets. Excluded tickets stay available in Tickets and do not count in performance.',
      'ROI is net units divided by risk on settled bets with enough return information. Actual reported returns take precedence over saved odds. Pending and void tickets do not enter ROI.',
      'Each single or parlay counts once. Markets classify a whole ticket; a parlay containing different markets appears as Mixed markets. Market filters match any leg.',
      'Date filters use the saved placement date, falling back to the recorded date, in Pacific time. Tracked outcomes are player reported.',
      'Cash uses your chosen value of one unit for display. Set that value in Filters & options; saved unit stakes never change.',
    ]}/></div>
    <NetUnits summary={summary} points={chart} player={actorId} amounts={cash?'cash':'units'} unitCash={unitCash}/>
    <section className="gx-overview-card" aria-label="Bet activity"><StatTiles tiles={[
      {label:'Tracked bets',value:summary.bets,sub:'Included in records'},
      {label:'Open bets',value:summary.pending,sub:'Awaiting results'},
      {label:'Open risk',value:openRisk,sub:unknownPendingStakes?`${unknownPendingStakes} unknown stakes`:'Known stakes'},
    ]}/></section>
    <section className="gx-overview-card" aria-label="Bet results"><h2 className="gx-t-section">Results</h2>
      {summary.bets>0?<><div className="gx-overview-results" role="img" aria-label={outcomes.map(row=>`${row.count} ${row.label.toLowerCase()}`).join(', ')}>{outcomes.filter(row=>row.count>0).map(row=><span key={row.outcome} className={`gx-overview-result gx-overview-result--${row.outcome}`} style={{flex:row.count}}/>)}</div>
      <div className="gx-overview-result-key">{outcomes.map(row=><button type="button" key={row.outcome} onClick={()=>onFilter('outcome',row.outcome)} aria-label={`Show ${row.label}: ${row.count} bets`}><span className={`gx-overview-dot gx-overview-result--${row.outcome}`}/>{row.label}<strong>{row.count}</strong></button>)}</div></>:<p className="gx-t-body gx-c-2">Your results appear here when included tickets match.</p>}
    </section>
    <Breakdown title="Bet types" rows={types} onChoose={row=>onFilter('kind',row.label==='Singles'?'single':'parlay')}/>
    <Breakdown title="Markets per ticket" rows={markets}/>
    <Breakdown title="Sportsbooks" rows={sources} onChoose={row=>onSource(row.value)}/>
    <p className="gx-t-meta gx-c-2">{summary.excludedCount} excluded from records · {summary.incompleteCount} missing stake or price</p>
    <Button variant="secondary" onClick={onTickets}>View matching tickets ({model.entries.length})</Button>
  </section>;
}
