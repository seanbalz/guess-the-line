import React, {useMemo,useState} from 'react';
import {buildRankings,POSITION_OPTIONS,SCOPE_OPTIONS,formatFantasyNumber as number} from '../../shared/fantasy-rankings.mjs';
import {PictureRow} from '../../web/src/next/ui/PictureRow.jsx';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {teamName} from '../../web/src/next/ui/Matchup.jsx';

export function FantasyRankings({snapshot,settings,onProfile}){
 const [scope,setScope]=useState('weekly'),[position,setPosition]=useState('ALL'),[team,setTeam]=useState('ALL'),[search,setSearch]=useState(''),[trendsOnly,setTrendsOnly]=useState(false),[limit,setLimit]=useState(6);
 const result=useMemo(()=>buildRankings(snapshot,{...settings,scope,position,team,search,trendsOnly}),[snapshot,settings.scoring,settings.passingTds,scope,position,team,search,trendsOnly]);
 const reset=()=>{setPosition('ALL');setTeam('ALL');setSearch('');setTrendsOnly(false);setLimit(6);};
 return <div className="real-fantasy-rankings">
  <div className="real-fantasy-section-head"><h3>{scope==='weekly'?`Week ${snapshot.week} rankings`:'Rest-of-season rankings'}</h3><InfoButton title="About Fantasy rankings" body={[`${snapshot.method.name} ${snapshot.method.version}.`,snapshot.method.description,'Sorted by estimated total points. Team, search and trend filters preserve ranks within the selected position. Overall ranks are fantasy points, not draft value.']} links={[{text:'Published Fantasy source',url:'https://github.com/seanbalz/guess-the-line/releases/tag/fantasy-data-2026'}]}/></div>
  <p className="real-context">GTL estimates · not observed results or expert consensus</p>
  <Segmented label="Ranking horizon" options={SCOPE_OPTIONS} value={scope} onChange={v=>{setScope(v);setLimit(6);}}/>
  <div className="real-fantasy-filters"><label htmlFor="fantasy-rank-search">Find a player<input id="fantasy-rank-search" type="search" value={search} placeholder="Name or team" onChange={e=>{setSearch(e.target.value);setLimit(6);}}/></label><label htmlFor="fantasy-rank-position">Position<select id="fantasy-rank-position" value={position} onChange={e=>{setPosition(e.target.value);setLimit(6);}}>{POSITION_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label></div>
  <details className="real-fantasy-rank-filters"><summary>Team & trend filters</summary><label htmlFor="fantasy-rank-team">Team<select id="fantasy-rank-team" value={team} onChange={e=>{setTeam(e.target.value);setLimit(6);}}><option value="ALL">All teams</option>{result.teams.map(code=><option key={code} value={code}>{teamName(code)}</option>)}</select></label><label className="real-fantasy-check"><input type="checkbox" checked={trendsOnly} onChange={e=>{setTrendsOnly(e.target.checked);setLimit(6);}}/>Strong trends only</label></details>
  <p className="real-fantasy-count" role="status">{Math.min(limit,result.rows.length)} of {result.rows.length} matching players</p>
  <ol className="gx-prows real-fantasy-rank-list" aria-label="Ranked players">{result.rows.slice(0,limit).map(p=>{
   const trends=p.trendHighlights.slice(0,2);
   return <li key={p.id}><PictureRow data-ranked-player={p.id} ariaLabel={`${p.name}, ${p.position}, rank ${p.rank}, ${number(p.points)} estimated points. Open usage profile.`} onClick={()=>onProfile(p.id)} picture={<span className="real-fantasy-rank-picture"><TeamMark code={p.team} size={32} decorative/><b aria-hidden="true">#{p.rank}</b></span>} title={p.name} meta={<span className="real-fantasy-rank-meta"><span>{p.position} {p.positionRank} · {p.sampleGames} games sampled</span>{scope==='ros'?<span>{p.games} scheduled · {number(p.perGame)} est. / game</span>:null}{trends.map(trend=><span key={trend.id} className={'real-fantasy-trend is-'+trend.direction}>{trend.direction==='up'?'↑':'↓'} {trend.label}</span>)}</span>} value={number(p.points)} word="est. pts"/></li>;
  })}</ol>
  {result.rows.length>limit?<button type="button" className="real-fantasy-more" onClick={()=>setLimit(n=>n+6)}>Show more ranked players</button>:null}
  {!result.rows.length?<div className="real-fantasy-rank-empty"><p className="real-context">{result.summary.note??'No players match these filters.'}</p><button type="button" className="real-fantasy-more" onClick={reset}>Reset ranking filters</button></div>:null}
  <p className="real-source">All positions · {result.summary.ranked} ranked · {result.summary.byes} bye · {result.summary.unavailable} unestimated<br/>Source snapshot generated Nov 5; player availability is not injury-adjusted.</p>
 </div>;
}
