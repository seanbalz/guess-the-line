import React,{useMemo,useState} from 'react';
import {ArrowLeft,ChartNoAxesCombined,Filter} from 'lucide-react';
import {TrackedOverview} from '../../web/src/next/bets/TrackedOverview.jsx';
import {TrackedBetRow} from '../../web/src/next/bets/TrackedBetRow.jsx';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {overviewProjection,OVERVIEW_ACTOR} from './bets-overview-fixtures.mjs';
const TYPES=[{value:'',label:'All types'},{value:'single',label:'Singles'},{value:'parlay',label:'Parlays'}];
export function BetsOverviewPreview({model}){
 const [pane,setPane]=useState('overview'),[filters,setFilters]=useState({}),[extra,setExtra]=useState({source:'',from:'',to:''}),[amounts,setAmounts]=useState('units'),[unitCash,setUnitCash]=useState(null);
 const data=useMemo(()=>overviewProjection(model,filters,extra),[model,filters,extra]);
 const all=useMemo(()=>overviewProjection(model),[model]);
 const active=Boolean(filters.kind||filters.outcome||extra.source||extra.from||extra.to);
 const choose=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPane('tickets');};
 return <section className="real-bets-overview real-bets real-play" aria-label="Fictional tracked bets overview">
  <header className="real-bets-head"><div><p className="real-play-eyebrow">FICTIONAL HISTORY</p></div><InfoButton title="About this performance example" body={[
   'All tickets, sources, manually entered prices, amounts, results and recording dates are fictional. No signed-in account, real ticket history, current quote or sportsbook connection is read.',
   'Selection lines reuse the previously reviewed public Week 8 historical closing references. They are not actual placed terms or submission-time references. Hypothetical ticket prices are manual-input examples, never bookmaker quotes.',
   'Native socialView, trackedOverview, TrackedOverview, NetUnits, TrendDetail and TrackedBetRow retain the actual filtering, accounting, chart and receipt calculations. Each parlay counts once.',
   'The example has 10 tickets: nine included, one excluded. Five wins, two losses, one push and one open ticket give +2.5U from eight settled tickets. Actual reported returns support ROI even if a saved price is unknown.',
   'Filter and cash-value changes affect this preview in memory only. No save, settlement, source collection or preference write occurs.',
  ]} links={[{text:'Historical selection references · nflverse · CC BY 4.0',url:model.source.release}]}/></header>
  <Segmented label="Tracked bets section" options={[{value:'overview',label:'Overview'},{value:'tickets',label:'Tickets'}]} value={pane} onChange={setPane}/>
  <details className="real-overview-filters"><summary><Filter size={18} aria-hidden="true"/>Filters & options{active?<span>Applied</span>:null}</summary><div>
   <label>Bet type<select aria-label="Bet type" value={filters.kind??''} onChange={e=>setFilters(f=>({...f,kind:e.target.value}))}>{TYPES.map(({value,label})=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Result<select aria-label="Result" value={filters.outcome??''} onChange={e=>setFilters(f=>({...f,outcome:e.target.value}))}>{[['','All results'],['win','Won'],['loss','Lost'],['push','Push'],['pending','Open'],['settled','Settled']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Sportsbook<select aria-label="Sportsbook" value={extra.source} onChange={e=>setExtra(f=>({...f,source:e.target.value}))}><option value="">All sportsbooks</option>{all.books.map(name=><option key={name} value={'book:'+name}>{name}</option>)}</select></label>
   <label>From example date<input type="date" value={extra.from} max={extra.to||undefined} onChange={e=>setExtra(f=>({...f,from:e.target.value}))}/></label>
   <label>Through example date<input type="date" value={extra.to} min={extra.from||undefined} onChange={e=>setExtra(f=>({...f,to:e.target.value}))}/></label>
   <label>Display cash value of 1U ($)<input type="number" min="0.01" max="1000000" step="0.01" value={unitCash??''} onChange={e=>{setUnitCash(e.target.value===''?null:Number(e.target.value));setAmounts('units');}}/></label><p>Example recording dates use Pacific time. Cash conversion changes display only.</p>
   <Button haptic={false} onClick={()=>{setFilters({});setExtra({source:'',from:'',to:''});}}>Reset filters</Button>
  </div></details>
  {data.rangeError?<p className="real-overview-error" role="alert">{data.rangeError}</p>:null}
  {active?<div className="real-overview-applied" role="status"><Filter size={15} aria-hidden="true"/><span>Matching example tickets · {data.entries.length}</span><button type="button" onClick={()=>{setFilters({});setExtra({source:'',from:'',to:''});}}>Clear</button></div>:null}
  {pane==='overview'?<TrackedOverview model={data} actorId={OVERVIEW_ACTOR} unitCash={unitCash} amounts={amounts} onAmounts={setAmounts} onFilter={choose} onSource={source=>{setExtra(f=>({...f,source}));setPane('tickets');}} onTickets={()=>setPane('tickets')}/>:<div className="real-overview-tickets"><button className="real-overview-back" type="button" onClick={()=>setPane('overview')}><ArrowLeft size={16} aria-hidden="true"/>Back to overview</button><h3>{data.entries.length} matching example tickets</h3>{data.entries.map(entry=><TrackedBetRow key={entry.id} entry={entry} games={model.games} unitCash={unitCash}><div className="real-overview-context"><strong>Example receipt context</strong><p>{entry.notes}</p><p>Quote and placement times were not supplied.</p></div></TrackedBetRow>)}{!data.entries.length?<p>No example tickets match these filters.</p>:null}</div>}
  <p className="real-bets-source"><ChartNoAxesCombined size={16} aria-hidden="true"/>Fictional history · no account or preference changes</p>
 </section>;
}
