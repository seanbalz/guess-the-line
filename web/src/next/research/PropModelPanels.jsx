import {useState,useEffect} from 'react';
import {Button, TeamMark} from '../ui/index.js';
import {propStat} from '../../../../shared/player-props.mjs';
import {propCategory} from '../../../../shared/parlay-research.mjs';
const value=n=>Number.isFinite(n)?n.toFixed(1):'—';
const stamp=s=>Number.isFinite(Date.parse(s))?new Date(s).toLocaleString():'Unavailable';
const odds=n=>n>0?`+${n}`:String(n).replace('-','−');
export default function PropModelPanels({research,assessments,category,view='projections'}){
  const [position,setPosition]=useState('All'),[period,setPeriod]=useState('season'),[stat,setStat]=useState(''),[page,setPage]=useState(0);
  useEffect(()=>setPage(0),[position,category,research?.generatedAt]);
  const rows=(research?.status==='available'?research.games:[]).flatMap(g=>g.players.flatMap(p=>p.markets.map(m=>({g,p,m})))).filter(({p,m})=>(position==='All'||p.position===position)&&(category==='All props'||propCategory({selection:{key:m.key}})===category));
  const forecasts=rows.filter(({m})=>m.baseline?.status==='available');
  const pageCount=Math.max(1,Math.ceil(forecasts.length/6)),shownPage=Math.min(page,pageCount-1);
  const stats=[...new Set(rows.map(r=>r.m.key))];
  const selectedStat=stats.includes(stat)?stat:stats[0];
  const seen=new Set();const matchups=rows.flatMap(r=>{const match=r.m.matchups?.[period];const id=`${r.p.opponent}:${r.p.position}:${r.m.key}`;if(r.m.key!==selectedStat||!match||match.rank===null||seen.has(id))return[];seen.add(id);return[{...r,match}];}).sort((a,b)=>a.match.rank-b.match.rank||a.p.opponent.localeCompare(b.p.opponent));
  return <>
    <h3 className="gx-t-section">{view==='matchups'?'Matchup spotlight':'Player projections'}</h3>
    <div className="gx-lab-tabs gx-lab-positions" role="group" aria-label="Position">{['All','QB','RB','WR','TE'].map(p=><button key={p} type="button" aria-pressed={position===p} onClick={()=>setPosition(p)}>{p}</button>)}</div>
    {view==='projections'?<>
      <p className="gx-t-meta">Historical baseline, not an opponent-adjusted forecast. Compare the number, then check the evidence.</p>
      <div className="gx-parlay-grid">{forecasts.slice(shownPage*6,shownPage*6+6).map(({g,p,m})=>{
        const b=m.baseline,quoted=assessments.find(a=>a.gameId===g.gameId&&a.selection.playerId===p.playerId&&a.selection.key===m.key&&a.selection.unit===m.unit&&a.quote);
        const quote=quoted?.quote;
        return <article className="gx-parlay-card gx-lab-projection" key={`${g.gameId}:${p.playerId}:${m.key}`}>
          <div className="gx-lab-player"><TeamMark code={p.team||g.gameId.split('-')[0]} size={40} decorative/><div><h4 className="gx-t-section">{p.playerName}</h4><p className="gx-t-meta">{p.position} · {g.gameId.replace('-',' at ')}</p></div></div>
          <p className="gx-t-body">{propStat(m.key)?.label}</p>
          <dl className="gx-parlay-compare"><div><dt>Baseline</dt><dd>{value(b.projection)}</dd></div><div><dt>Sportsbook line</dt><dd>{quoted?`${quoted.selection.side} ${quoted.selection.line??''}`:'—'}</dd></div></dl>
          {quote?<div className="gx-lab-market"><strong>{odds(quote.odds)}</strong><span>{quote.source}</span><span className="gx-t-meta">{stamp(quote.observedAt)}</span></div>:<p className="gx-t-meta">No current sportsbook quote · Not a priced pick</p>}
          {quoted?.offers?.length>1?<details className="gx-ra-evidence"><summary>Compare {quoted.offers.length} books</summary>{quoted.offers.map(q=><p className="gx-t-body" key={q.book}>{q.source}: {odds(q.odds)} · {stamp(q.observedAt)}</p>)}</details>:null}
          <p className="gx-t-meta">{b.sample} appearances · {m.unit}</p>
          {b.interval?<div><p className="gx-t-meta">Empirical residual range · {value(b.interval.lower)}–{value(b.interval.upper)} {m.unit} · Not calibrated coverage.</p><div className="gx-lab-range" aria-hidden="true"><span/></div></div>:<p className="gx-t-meta">Range unavailable · fewer than 20 holdouts</p>}
          <details className="gx-ra-evidence"><summary>Model, sample & limitations</summary><p className="gx-t-meta">Last eight recorded appearances, minimum five. Not adjusted for injuries, role, opponent or price. A gap to the market is not a betting edge.</p><p className="gx-t-meta">Historical error: {value(b.holdout.mae)} {m.unit} MAE · {b.holdout.count} chronological holdouts. Last result {stamp(b.lastObservationAt)}.</p>{b.limitations.map(s=><p className="gx-t-meta" key={s}>{s}</p>)}</details>
        </article>;
      })}</div>
      {forecasts.length>6?<div className="gx-lab-section-heading"><Button variant="secondary" disabled={shownPage===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Previous</Button><span className="gx-t-meta">{shownPage+1} / {pageCount}</span><Button variant="secondary" disabled={shownPage>=pageCount-1} onClick={()=>setPage(p=>Math.min(pageCount-1,p+1))}>Next</Button></div>:null}
      {!forecasts.length?<div className="gx-parlay-card"><h4 className="gx-t-section">No eligible player projections</h4><p className="gx-t-body">Five prior appearances, source coverage and both game reveal gates are required. No sample players are substituted.</p></div>:null}
    </>:<>
      <p className="gx-t-meta">Position vs defense · Highest allowance first within one statistic. Descriptive context, not a betting edge.</p>
      <div className="gx-lab-controls"><label className="gx-ra-select gx-t-meta">Statistic<select aria-label="Matchup statistic" value={selectedStat||''} onChange={e=>setStat(e.target.value)}>{stats.map(k=><option key={k} value={k}>{propStat(k)?.label||k}</option>)}</select></label><label className="gx-ra-select gx-t-meta">Period<select aria-label="Matchup period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="season">Season</option><option value="last5">Last five</option></select></label></div>
      <div className="gx-parlay-grid">{matchups.slice(0,6).map(({p,m,match},index)=><article className={`gx-parlay-card gx-lab-matchup ${index===0?'gx-lab-featured':''}`} key={`${p.position}:${p.opponent}:${m.key}`}>
        <div className="gx-lab-player"><TeamMark code={p.opponent} size={40} decorative/><div><p className="gx-t-label">{index===0?'HIGHLIGHTED MATCHUP':'POSITION VS DEFENSE'}</p><h4 className="gx-t-section">{p.position} vs {p.opponent}</h4></div></div>
        <div className="gx-lab-section-heading"><div><p className="gx-lab-number">{value(match.meanAllowed)}</p><p className="gx-t-meta">{m.unit} allowed / covered game</p></div><div><strong className="gx-lab-number">#{match.rank}</strong><p className="gx-t-meta">of {match.rankedDefenses}</p></div></div>
        <div className="gx-lab-range" aria-hidden="true"><span style={{width:`${100*match.sampleGames/Math.max(1,match.selectedGames)}%`}}/></div><p className="gx-t-meta">Coverage: {match.sampleGames} of {match.selectedGames} games</p>
        <details className="gx-ra-evidence"><summary>What this matchup tells us</summary><p className="gx-t-body">{propStat(m.key)?.label} allowed across published {p.position} players. Rank compares the same statistic, highest allowance first; ties share a rank. This does not predict one player's output.</p><p className="gx-t-meta">{match.playerAppearances} player appearances · {match.missingGames} missing games excluded, not zero. {stamp(match.period.from)} to {stamp(match.period.to)}. Not opponent-adjusted.</p></details>
      </article>)}</div>
      {!matchups.length?<div className="gx-parlay-card"><h4 className="gx-t-section">Matchup rankings unavailable</h4><p className="gx-t-body">At least three covered games and verified player-position joins are required.</p></div>:null}
    </>}
    {research?.status==='available'?<details className="gx-ra-evidence"><summary>Sources & freshness</summary><p className="gx-t-meta">Generated {stamp(research.generatedAt)} · <a className="gx-ra-link" href={research.source.stats.url} target="_blank" rel="noreferrer">nflverse player statistics</a> · <a className="gx-ra-link" href={research.source.rosters.url} target="_blank" rel="noreferrer">Weekly rosters</a> · CC BY 4.0. Current-final-data retrospective evaluation; later stat revisions can affect errors.</p></details>:null}
  </>;
}
