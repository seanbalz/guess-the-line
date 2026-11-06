import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TrendDetail} from '../../web/src/next/charts/TrendDetail.jsx';
import ResearchChart from '../../web/src/next/research/ResearchChart.jsx';
import {MarginChart} from '../../web/src/next/teams/MarginChart.jsx';
import '../../web/src/next/charts/charts.css';
import '../../web/src/next/research/research.css';
import '../../web/src/next/teams/teams.css';
import '../../web/src/next/styles/tokens.css';

const PERIODS={all:'Full history',recent30:'Last 30 games',recent25:'Last 25 games',season:'2026 season',previousSeason:'2025 season',rolling12:'Past 12 months'};
const signed=n=>`${n>0?'+':n<0?'−':''}${Math.abs(n).toFixed(1)}`;
const record=r=>`${r.wins}–${r.losses}–${r.pushes}`;
const pct=r=>r.wins+r.losses?Math.round(100*r.wins/(r.wins+r.losses)):null;
const date=s=>s.slice(0,10);
function Trends({model}){
 const [period,setPeriod]=useState('all');
 const current=model.trend.periods[period],r=current.record,points=current.series.points;
 let wins=0,losses=0,pushes=0;
 const cumulative=points.map(p=>{wins+=p.wins;losses+=p.losses;pushes+=p.pushes;return{value:`${signed(p.illustrativeUnits)} U`,label:`${wins}–${losses}–${pushes} · ${date(p.to)}`};});
 const values=[0,...points.map(p=>p.illustrativeUnits)],all=model.trend.periods.all.record;
 const tiles=x=>[{label:'Win rate',value:`${pct(x)}%`,meter:pct(x)},{label:'Games',value:String(x.sample)}];
 const line={values,start:points.length?date(points[0].from):'',end:points.length?date(points.at(-1).to):'',label:'Cumulative illustrative units at −110',headline:{value:`${signed(r.illustrativeUnits??0)} U`,sub:`${record(r)} W-L-P · ${PERIODS[period]}`},tiles:tiles(r),tip:i=>i===0?{value:'0.0 U',label:points.length?`Start · ${date(points[0].from)}`:'No completed matches in this period'}:cumulative[i-1]};
 const seasons={rows:model.trend.seasons,caption:'Full available matched history by season; illustrative units at -110',headline:{value:`${model.trend.seasons.length} seasons`,sub:'Full available matched history'},tiles:tiles(all)};
 return <div className="real-research-content">
  <div className="real-sample"><label htmlFor="real-research-period">Evidence period</label><select id="real-research-period" value={period} onChange={e=>setPeriod(e.target.value)}>{Object.entries(PERIODS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
  <p className="real-context">Divisional matchup · Road-team history</p>
  <TrendDetail title={model.trend.title} pill="Historical" line={line} seasons={seasons}>
   {selection=><details className="real-evidence"><summary>See supporting results</summary><ResearchChart candidate={{title:model.trend.title,series:current.series}} selection={selection}/></details>}
  </TrendDetail>
  <p className="real-data-note">Illustrative units at −110 · recorded results, not actual-price returns</p>
  <a className="real-market-link" href="https://guess-the-line.pages.dev/#research/games?season=2026&week=9&layer=game&item=ARI-SEA" target="_blank" rel="noopener">Market lines & movement <span aria-hidden="true">↗</span><small>Open this matchup in GTL</small></a>
 </div>;
}
function Teams({model}){
 const [code,setCode]=useState('SEA');const team=model.teams.find(t=>t.code===code),play=model.playStatistics.find(t=>t.team===code);
 const margins=team.margins,extent={low:Math.min(0,...margins.map(p=>p.margin)),high:Math.max(0,...margins.map(p=>p.margin))};
 return <div className="real-research-content">
  <div className="real-team-choice" role="group" aria-label="Team statistics">{model.teams.map(t=><button type="button" key={t.code} aria-pressed={code===t.code} onClick={()=>setCode(t.code)}><span className="real-team-logo"><img src={`visual-assets/${t.code.toLowerCase()}.png`} alt=""/></span>{t.name}</button>)}</div>
  <div className="real-team-stats"><div><small>Record</small><b>{team.record}</b></div><div><small>Points scored / game</small><b>{team.pointsFor.toFixed(1)}</b></div><div><small>Points allowed / game</small><b>{team.pointsAgainst.toFixed(1)}</b></div></div>
  <section className="real-chart-card"><h4>Game-by-game margins</h4><p className="real-context">2026 season · {team.games} completed games</p><MarginChart series={margins} extent={extent}/></section>
  <details className="real-observed" open><summary>Observed play statistics</summary>{play.metrics.filter(m=>m.id!=='observed-sacks').map(m=><div className="real-observed-row" key={m.id}><span>{m.title}<small>{m.sample} observed {m.unit==='share'?'plays':m.id.includes('passing')?'attempts':'carries'}</small></span><b>{m.unit==='share'?`${(m.value*100).toFixed(1)}%`:m.value.toFixed(2)}</b></div>)}</details>
  <p className="real-data-note">{play.sampleGames} games · {play.from} to {play.to}</p>
 </div>;
}
function App({model}){
 const [tab,setTab]=useState('trends');
 return <><div className="real-tabs" role="tablist" aria-label="Game research"><button id="real-trends-tab" type="button" role="tab" aria-selected={tab==='trends'} aria-controls="real-trends-pane" tabIndex={tab==='trends'?0:-1} onClick={()=>setTab('trends')} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setTab('teams');document.getElementById('real-teams-tab').focus();}}}>Trends & markets</button><button id="real-teams-tab" type="button" role="tab" aria-selected={tab==='teams'} aria-controls="real-teams-pane" tabIndex={tab==='teams'?0:-1} onClick={()=>setTab('teams')} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();setTab('trends');document.getElementById('real-trends-tab').focus();}}}>Team performance</button></div><section id="real-trends-pane" role="tabpanel" aria-labelledby="real-trends-tab" hidden={tab!=='trends'}><Trends model={model}/></section><section id="real-teams-pane" role="tabpanel" aria-labelledby="real-teams-tab" hidden={tab!=='teams'}><Teams model={model}/></section><p className="real-source">Through {model.latestCompleted} · <a href={model.source.release} target="_blank" rel="noopener">nflverse · CC BY 4.0</a></p></>;
}
export function mount(element,model){const root=createRoot(element);root.render(<App model={model}/>);return root;}
