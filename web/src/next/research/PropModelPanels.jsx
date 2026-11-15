import {useState,useEffect} from 'react';
import {Button} from '../ui/index.js';
import {propStat} from '../../../../shared/player-props.mjs';
import {propCategory} from '../../../../shared/parlay-research.mjs';
const value=n=>Number.isFinite(n)?n.toFixed(1):'Unavailable';
const stamp=s=>Number.isFinite(Date.parse(s))?new Date(s).toLocaleString():'Unavailable';
export default function PropModelPanels({research,assessments,category}){
  const [position,setPosition]=useState('All'),[period,setPeriod]=useState('season'),[page,setPage]=useState(0);
  useEffect(()=>setPage(0),[position,category,research?.generatedAt]);
  const rows=(research?.status==='available'?research.games:[]).flatMap(g=>g.players.flatMap(p=>p.markets.map(m=>({g,p,m})))).filter(({p,m})=>(position==='All'||p.position===position)&&(category==='All props'||propCategory({selection:{key:m.key}})===category));
  const forecasts=rows.filter(({m})=>m.baseline?.status==='available');
  const pageCount=Math.max(1,Math.ceil(forecasts.length/6)),shownPage=Math.min(page,pageCount-1);
  const seen=new Set();const matchups=rows.flatMap(r=>{const match=r.m.matchups?.[period];const id=`${r.p.opponent}:${r.p.position}:${r.m.key}`;if(!match||match.rank===null||seen.has(id))return[];seen.add(id);return[{...r,match}];}).sort((a,b)=>a.match.rank-b.match.rank||a.p.opponent.localeCompare(b.p.opponent));
  return <>
    <h3 className="gx-t-section">Projection center</h3>
    <p className="gx-t-body">Experimental baseline: last eight recorded appearances, minimum five. Not adjusted for injuries, role, opponent or price. A gap to the market is not a betting edge.</p>
    <label className="gx-ra-select gx-t-body">Position<select aria-label="Position" value={position} onChange={e=>setPosition(e.target.value)}>{['All','QB','RB','WR','TE'].map(p=><option key={p}>{p}</option>)}</select></label>
    <div className="gx-parlay-grid">{forecasts.slice(shownPage*6,shownPage*6+6).map(({g,p,m})=>{
      const b=m.baseline,quote=assessments.find(a=>a.gameId===g.gameId&&a.selection.playerId===p.playerId&&a.selection.key===m.key&&a.selection.unit===m.unit&&a.quote)?.quote;
      const quoted=quote?assessments.find(a=>a.quote===quote):null;
      return <article className="gx-parlay-card gx-vstack gx-gap-12" key={`${g.gameId}:${p.playerId}:${m.key}`}>
        <h4 className="gx-t-section">{p.playerName} · {p.position}</h4><p className="gx-t-meta">{propStat(m.key)?.label} · {g.gameId.replace('-',' at ')}</p>
        <dl className="gx-parlay-compare"><div><dt>Baseline</dt><dd>{value(b.projection)} {m.unit}</dd></div><div><dt>Market line</dt><dd>{quoted?`${quoted.selection.side} ${quoted.selection.line} ${m.unit}`:'Unavailable'}</dd></div></dl>
        <p className="gx-t-meta">{b.sample} recorded appearances · Last result available {stamp(b.lastObservationAt)}</p>
        <p className="gx-t-body">Historical error: {value(b.holdout.mae)} {m.unit} MAE · {b.holdout.count} chronological holdouts.</p>
        <p className="gx-t-meta">{b.interval?`Empirical residual range: ${value(b.interval.lower)}–${value(b.interval.upper)} ${m.unit}. Not calibrated coverage.`:'Range unavailable: fewer than 20 historical holdouts.'}</p>
        {quote?<p className="gx-t-meta">{quote.source} · Quote recorded {stamp(quote.observedAt)}</p>:null}
        <details className="gx-ra-evidence"><summary>Method and limitations</summary>{b.limitations.map(s=><p className="gx-t-meta" key={s}>{s}</p>)}</details>
      </article>;
    })}</div>
    {forecasts.length>6?<div className="gx-ra-filters"><Button variant="secondary" disabled={shownPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Previous projections</Button><span className="gx-t-meta">Page {shownPage+1} of {pageCount}</span><Button variant="secondary" disabled={shownPage>=pageCount-1} onClick={()=>setPage(p=>Math.min(pageCount-1,p+1))}>Next projections</Button></div>:null}
    {!forecasts.length?<p className="gx-t-body">No eligible baseline projections in this view. Source coverage, five prior appearances and both game reveal gates are required; no sample projections are substituted.</p>:null}
    <h3 className="gx-t-section">Position vs defense</h3>
    <p className="gx-t-body">Highest observed totals allowed per game to a position, ranked within each statistic. Descriptive, not opponent-adjusted: higher allowance does not guarantee a favorable matchup or betting value.</p>
    <label className="gx-ra-select gx-t-body">Matchup period<select aria-label="Matchup period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="season">Season</option><option value="last5">Last five defense games</option></select></label>
    <div className="gx-parlay-grid">{matchups.slice(0,6).map(({p,m,match})=><article className="gx-parlay-card gx-parlay-spotlight gx-vstack gx-gap-12" key={`${p.position}:${p.opponent}:${m.key}`}>
      <h4 className="gx-t-section">{p.position} vs {p.opponent}</h4><p className="gx-t-body">{propStat(m.key)?.label}: <strong>{value(match.meanAllowed)} {m.unit}</strong> allowed per covered game</p>
      <p className="gx-t-meta">Rank {match.rank} of {match.rankedDefenses} covered defenses · highest allowance first; ties share a rank.</p>
      <p className="gx-t-meta">{match.sampleGames} covered / {match.selectedGames} selected games · {match.playerAppearances} player appearances · {match.missingGames} missing games</p>
      <p className="gx-t-meta">{stamp(match.period.from)} to {stamp(match.period.to)}</p>
      <p className="gx-t-meta">Totals across published players at this position, not a prediction for one player. Missing position rows are excluded, not treated as zero.</p>
    </article>)}</div>
    {!matchups.length?<p className="gx-t-body">Position-defense rankings unavailable: at least three covered games and verified player-position joins are required.</p>:null}
    {research?.status==='available'?<p className="gx-t-meta">Generated {stamp(research.generatedAt)} · <a className="gx-ra-link" href={research.source.stats.url} target="_blank" rel="noreferrer">nflverse player statistics</a> · <a className="gx-ra-link" href={research.source.rosters.url} target="_blank" rel="noreferrer">Weekly rosters</a> · CC BY 4.0. Current-final-data retrospective evaluation; later stat revisions can affect errors.</p>:null}
  </>;
}
