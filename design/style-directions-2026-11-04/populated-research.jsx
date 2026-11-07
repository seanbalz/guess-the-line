import {EplShellPreview} from './populated-epl-shell.jsx';
import {NflActionsPreview} from './populated-nfl-actions.jsx';
import {HistoryRecordsPreview} from './populated-history-records.jsx';
import {AccountHistoryPreview} from './populated-account-history.jsx';
import {EplFantasyPreview} from './populated-epl-fantasy.jsx';
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TrendDetail} from '../../web/src/next/charts/TrendDetail.jsx';
import {TrendRow} from '../../web/src/next/charts/TrendRow.jsx';
import ResearchChart from '../../web/src/next/research/ResearchChart.jsx';
import {MarginChart} from '../../web/src/next/teams/MarginChart.jsx';
import {GamesList} from './populated-games.jsx';
import {TeamsBrowser} from './populated-teams.jsx';
import {FantasyPreview} from './populated-fantasy.jsx';
import {PlayPreview} from './populated-play.jsx';
import {PointsPreview} from './populated-points.jsx';
import {ScorePreview} from './populated-score.jsx';
import {LeaguePreview} from './populated-league.jsx';
import {BetsPreview} from './populated-bets.jsx';
import {EplPreview} from './populated-epl.jsx';
import {GapRecordPreview} from './populated-gap-record.jsx';
import {BetsChangesPreview} from './populated-bets-changes.jsx';
import {BetsOverviewPreview} from './populated-bets-overview.jsx';
import {EplMoneylinePreview} from './populated-epl-moneyline.jsx';
import {EplHomePreview} from './populated-epl-home.jsx';
import {EplClaimPreview} from './populated-epl-claim.jsx';
import {EplCorrectionsPreview} from './populated-epl-corrections.jsx';
import {OddsConnectionPreview} from './populated-odds-connection.jsx';
import {FinalReviewPreview} from './populated-final-review.jsx';
import {RefereesPreview} from './populated-referees.jsx';
import {CommissionerStatusPreview} from './populated-commissioner-status.jsx';
import {CommissionerPreview} from './populated-commissioner.jsx';
import {SessionRecoveryPreview,NameRecoveryPreview} from './populated-session-recovery.jsx';
import {LeagueAccessPreview} from './populated-league-access.jsx';
import {ContinuityPreview} from './populated-continuity.jsx';
import {ExportPreview} from './populated-export.jsx';
import {AppearancePreview} from './populated-appearance.jsx';
import {AccessPreview} from './populated-access.jsx';
import {AppInvitePreview} from './populated-app-invite.jsx';
import {LeagueSetupPreview} from './populated-league-setup.jsx';
import {AccountToolsPreview} from './populated-account-tools.jsx';
import {AccountPreview} from './populated-account.jsx';
import '../../web/src/next/charts/charts.css';
import '../../web/src/next/research/research.css';
import '../../web/src/next/teams/teams.css';
import '../../web/src/next/styles/tokens.css';

const PERIODS={all:'Full history',recent30:'Last 30 games',recent25:'Last 25 games',season:'2026 season',previousSeason:'2025 season',rolling12:'Past 12 months'};
const signed=n=>`${n>0?'+':n<0?'−':''}${Math.abs(n).toFixed(1)}`;
const record=r=>`${r.wins}–${r.losses}–${r.pushes}`;
const pct=r=>r.wins+r.losses?Math.round(100*r.wins/(r.wins+r.losses)):null;
const date=s=>s.slice(0,10);
function Evidence({trend,period}){
 const current=trend.periods[period],r=current.record,points=current.series.points;
 let wins=0,losses=0,pushes=0;
 const cumulative=points.map(p=>{wins+=p.wins;losses+=p.losses;pushes+=p.pushes;return{value:`${signed(p.illustrativeUnits)} U`,label:`${wins}–${losses}–${pushes} · ${date(p.to)}`};});
 const values=[0,...points.map(p=>p.illustrativeUnits)],all=trend.periods.all.record;
 const tiles=x=>[{label:'Win rate',value:`${pct(x)}%`,meter:pct(x)},{label:'Games',value:String(x.sample)}];
 const line={values,start:points.length?date(points[0].from):'',end:points.length?date(points.at(-1).to):'',label:'Cumulative illustrative units at −110',headline:{value:`${signed(r.illustrativeUnits??0)} U`,sub:`${record(r)} W-L-P · ${PERIODS[period]}`},tiles:tiles(r),tip:i=>i===0?{value:'0.0 U',label:points.length?`Start · ${date(points[0].from)}`:'No completed matches in this period'}:cumulative[i-1]};
 const seasons={rows:trend.seasons,caption:'Full available matched history by season; illustrative units at -110',headline:{value:`${trend.seasons.length} seasons`,sub:'Full available matched history'},tiles:tiles(all)};
 return <TrendDetail title={trend.title} pill="Historical" line={line} seasons={seasons}>
  {selection=><details className="real-evidence"><summary>See supporting results</summary><ResearchChart candidate={{title:trend.title,series:current.series}} selection={selection}/></details>}
 </TrendDetail>;
}
function PeriodSelect({id,period,onChange}){
 return <div className="real-sample"><label htmlFor={id}>Evidence period</label><select id={id} value={period} onChange={e=>onChange(e.target.value)}>{Object.entries(PERIODS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>;
}
function Trends({model}){
 const [period,setPeriod]=useState('all');
 return <div className="real-research-content">
  <PeriodSelect id="real-research-period" period={period} onChange={setPeriod}/>
  <p className="real-context">Divisional matchup · Road-team history</p>
  <Evidence trend={model.trend} period={period}/>
  <p className="real-data-note">Illustrative units at −110 · recorded results, not actual-price returns</p>
  <a className="real-market-link" href="https://guess-the-line.pages.dev/#research/games?season=2026&week=9&layer=game&item=ARI-SEA" target="_blank" rel="noopener">Market lines & movement <span aria-hidden="true">↗</span><small>Open this matchup in GTL</small></a>
 </div>;
}
function Teams({model}){
 const [code,setCode]=useState(model.teams.at(-1).code);const team=model.teams.find(t=>t.code===code),play=model.playStatistics.find(t=>t.team===code);
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

function TrendsList({model}){
 const [period,setPeriod]=useState('season'),[market,setMarket]=useState('all'),[opened,setOpened]=useState(null);
 const visible=model.trendList.filter(t=>market==='all'||t.market===market);
 return <div className="real-trends-list">
  <div className="real-trends-intro"><p>ATS and totals, with the history behind them.</p></div>
  <div className="real-market-filters" role="group" aria-label="Trend market">{[['all','All'],['spread','Spread'],['total','Totals']].map(([key,label])=><button key={key} type="button" aria-pressed={market===key} onClick={()=>{setMarket(key);setOpened(null);}}>{label}</button>)}</div>
  <PeriodSelect id="real-list-period" period={period} onChange={setPeriod}/>
  <div className="real-list-key"><span role="status">{visible.length} historical examples</span><span>Win rate · W–L–P</span></div>
  <ul className="gx-tc-list">{visible.map((trend,i)=>{
   const r=trend.periods[period].record,open=opened===trend.id,controls=`real-list-detail-${i}`;
   return <li key={trend.id} className={'gx-tc-item real-list-item'+(open?' is-open':'')} data-candidate={trend.id}>
    <div className="gx-tc-rowcard"><TrendRow title={trend.displayTitle} sub={`${trend.market==='spread'?'ATS':'Total'} · ${record(r)}`} values={[0,...trend.periods[period].series.points.map(p=>p.illustrativeUnits)]} value={pct(r)===null?'—':`${pct(r)}%`} open={open} controls={controls} onToggle={()=>setOpened(open?null:trend.id)}/><div className="real-row-context"><span>{trend.context}</span><span>{r.sample.toLocaleString()} games</span></div></div>
    <div id={controls} hidden={!open}>{open?<Evidence trend={trend} period={period}/>:null}</div>
   </li>;
  })}</ul>
  <p className="real-data-note">Curves show illustrative units at −110. Historical results, not a current-game recommendation.</p>
  <p className="real-source">6 examples from {model.registeredCandidateCount} published candidates · through {model.latestCompleted}<br/><a href={model.source.release} target="_blank" rel="noopener">nflverse · CC BY 4.0</a></p>
 </div>;
}
export function mountTrends(element,model){const root=createRoot(element);root.render(<TrendsList model={model}/>);return root;}
export function mountGames(element,model){const root=createRoot(element);root.render(<GamesList model={model} renderTeams={comparison=><Teams model={comparison}/>}/>);return root;}
export function mountTeams(element,model,onSelection){const root=createRoot(element);root.render(<TeamsBrowser model={model} onSelection={onSelection}/>);return root;}
export function mountFantasy(element,model,onSelection){const root=createRoot(element);root.render(<FantasyPreview model={model} onSelection={onSelection}/>);return root;}
export function mountPlay(element,model,initialMode,onMode){const root=createRoot(element);root.render(<PlayPreview model={model} initialMode={initialMode} onMode={onMode}/>);return root;}
export function mountPoints(element,model,research,onSelection){const root=createRoot(element);root.render(<PointsPreview model={model} research={research} onSelection={onSelection}/>);return root;}
export function mountScore(element,model,onSelection){const root=createRoot(element);root.render(<ScorePreview model={model} onSelection={onSelection}/>);return root;}

export function mountLeague(element,model,theme,onSelection){const root=createRoot(element);root.render(<LeaguePreview model={model} theme={theme} onSelection={onSelection}/>);return root;}

export function mountBets(element,model,initialView,onSelection){const root=createRoot(element);root.render(<BetsPreview model={model} initialView={initialView} onSelection={onSelection}/>);return root;}

export function mountEpl(element,data,initialView,onSelection){const root=createRoot(element);root.render(<EplPreview data={data} initialView={initialView} onSelection={onSelection}/>);return root;}

export function mountAccount(element,initialView,scenario,profileScenario){const root=createRoot(element);root.render(<AccountPreview initialView={initialView} scenario={scenario} profileScenario={profileScenario}/>);return root;}

export function mountBetsOverview(element,model){const root=createRoot(element);root.render(<BetsOverviewPreview model={model}/>);return root;}

export function mountBetsChanges(element,model,initialAction){const root=createRoot(element);root.render(<BetsChangesPreview model={model} initialAction={initialAction}/>);return root;}

export function mountGapRecord(element,model){const root=createRoot(element);root.render(<GapRecordPreview model={model}/>);return root;}

export function mountAccountTools(element,initialView,scenario){const root=createRoot(element);root.render(<AccountToolsPreview initialView={initialView} scenario={scenario}/>);return root;}

export function mountLeagueSetup(element,initialView,scenario){const root=createRoot(element);root.render(<LeagueSetupPreview initialView={initialView} scenario={scenario}/>);return root;}

export function mountAppInvite(element,initialView){const root=createRoot(element);root.render(<AppInvitePreview initialView={initialView} theme={element.dataset.theme}/>);return root;}

export function mountAccess(element,initialView){const root=createRoot(element);root.render(<AccessPreview initialView={initialView} theme={element.dataset.theme}/>);return root;}

export function mountAppearance(element,scenario){const root=createRoot(element);root.render(<AppearancePreview theme={element.dataset.theme} scenario={scenario}/>);return root;}

export function mountExport(element,initialPhase){const root=createRoot(element);root.render(<ExportPreview initialPhase={initialPhase}/>);return root;}

export function mountContinuity(element,scenario){const root=createRoot(element);root.render(<ContinuityPreview theme={element.dataset.theme} scenario={scenario}/>);return root;}

export function mountLeagueAccess(element,scenario){const root=createRoot(element);root.render(<LeagueAccessPreview scenario={scenario}/>);return root;}

export function mountSessionRecovery(element,scenario){const root=createRoot(element);root.render(<SessionRecoveryPreview scenario={scenario}/>);return root;}
export function mountNameRecovery(element,scenario){const root=createRoot(element);root.render(<NameRecoveryPreview theme={element.dataset.theme} scenario={scenario}/>);return root;}

export function mountCommissioner(element,scenario){const root=createRoot(element);root.render(<CommissionerPreview scenario={scenario}/>);return root;}

export function mountCommissionerStatus(element,model,scenario){const root=createRoot(element);root.render(<CommissionerStatusPreview model={model} scenario={scenario}/>);return root;}

export function mountReferees(element,model,scenario){const root=createRoot(element);root.render(<RefereesPreview model={model} scenario={scenario}/>);return root;}

export function mountFinalReview(element,model,scenario){const root=createRoot(element);root.render(<FinalReviewPreview model={model} scenario={scenario}/>);return root;}

export function mountOddsConnection(element,scenario){const root=createRoot(element);root.render(<OddsConnectionPreview scenario={scenario}/>);return root;}

export function mountEplCorrections(element,scenario){const root=createRoot(element);root.render(<EplCorrectionsPreview scenario={scenario}/>);return root;}

export function mountEplClaim(element,data,scenario){const root=createRoot(element);root.render(<EplClaimPreview data={data} scenario={scenario}/>);return root;}

export function mountEplHome(element,data,scenario){const root=createRoot(element);root.render(<EplHomePreview data={data} scenario={scenario}/>);return root;}

export function mountEplMoneyline(element,scenario){const root=createRoot(element);root.render(<EplMoneylinePreview scenario={scenario}/>);return root;}

export function mountEplFantasy(element,scenario){const root=createRoot(element);root.render(<EplFantasyPreview scenario={scenario}/>);return root;}

export function mountAccountHistory(element,scenario){const root=createRoot(element);root.render(<AccountHistoryPreview scenario={scenario}/>);return root;}

export function mountHistoryRecords(element,scenario){const root=createRoot(element);root.render(<HistoryRecordsPreview scenario={scenario}/>);return root;}

export function mountNflActions(element,scenario){const root=createRoot(element);root.render(<NflActionsPreview theme={element.dataset.theme} scenario={scenario}/>);return root;}

export function mountEplShell(element,scenario){const root=createRoot(element);root.render(<EplShellPreview theme={element.dataset.theme} scenario={scenario}/>);return root;}
