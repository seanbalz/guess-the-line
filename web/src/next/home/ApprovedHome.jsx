import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Avatar, Icon, NewPill } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { show } from '../../communityFormat.js';
import { homeProgress, homeSeason, homeActivity } from './approvedHomeModel.js';
import { useMomentScope, useNewCount, usePopped } from '../moments/MomentsProvider.jsx';
import { SCOPES, scoreScope } from '../moments/catalog.js';
import { useRankMoment } from '../league/useRankMoment.js';
import { weekLockedId } from '../play/moments.js';
import { HOME_LAYERS } from './homeModel.js';
import { useFeatures } from '../features/useFeatures.js';
import { COMMUNITY } from '../data/league.js';
import trend from './scoring-trend.json';
import './approvedHome.css';

function GlassIcon({ icon }) { return <span className="gx-home-icon" aria-hidden="true"><Icon icon={icon} size={24}/></span>; }

function ProgressRing({ done, of, state }) {
  const ratio=of>0?Math.min(1,done/of):0, length=2*Math.PI*25;
  const words=state==='satOut'?'sat out':state==='sent'?'submitted':state==='locked'?'locked in':'drafted';
  return <span className="gx-home-ring" role="img" aria-label={of>0?`${done} of ${of} picks ${words}`:'No open slate'}>
    <svg viewBox="0 0 60 60" aria-hidden="true"><circle className="gx-home-ring-track" cx="30" cy="30" r="25"/><circle className="gx-home-ring-fill" cx="30" cy="30" r="25" strokeDasharray={`${length*ratio} ${length}`}/></svg>
    <strong aria-hidden="true">{of>0?`${done}/${of}`:'—'}</strong>
  </span>;
}

function LeaderBars({ rows }) {
  if (!rows.length) return <span className="gx-home-mini-empty" aria-hidden="true"><Icon icon="trophy" size={32}/></span>;
  const ordered=[...rows.slice(0,3)].reverse();
  return <svg className="gx-home-mini-chart" viewBox="0 0 140 88" aria-hidden="true">
    {ordered.map((r,i)=>{const h=74-Math.min(2,r.rank-1)*16;return <g key={r.id}><rect className={r.you?'gx-home-chart-you':'gx-home-chart-other'} x={10+i*42} y={78-h} width="32" height={h} rx="5"/><text x={26+i*42} y="70" textAnchor="middle">{r.tied?'T-':''}{r.rank}</text></g>;})}
  </svg>;
}

function ResearchChart() {
  const min=Math.min(...trend.values),span=Math.max(1,Math.max(...trend.values)-min);
  const points=trend.values.map((v,i)=>`${8+i*124/Math.max(1,trend.values.length-1)},${70-(v-min)/span*52}`);
  return <svg className="gx-home-mini-chart" viewBox="0 0 140 88" role="img" aria-label={`Historical league scoring: ${trend.season}, weeks ${trend.weeks.join(', ')}. Average combined points per completed game: ${trend.values.join(', ')}. Data: nflverse.`}>
    <polygon className="gx-home-chart-area" points={`8,80 ${points.join(' ')} 132,80`}/><polyline className="gx-home-chart-line" points={points.join(' ')}/>
  </svg>;
}

export function ApprovedHome({ app, shell, community, hero, headline, weekContent, toPicks, toLines }) {
  useMomentScope(SCOPES.home);
  // Keep the existing shared awards read and away-results reporting; their cards remain on Play.
  useFeatures(app, shell);
  const marketKey=`gtl.approvedHome.market.${app.accountId}`;
  const [market,setMarket]=useState(()=>{try{return sessionStorage.getItem(marketKey)==='total'?'total':'spread';}catch{return 'spread';}});
  const chooseMarket=value=>{setMarket(value);try{sessionStorage.setItem(marketKey,value);}catch{/* still works for this visit */}};
  const progress=homeProgress(community), stats=homeSeason(community,app.accountId,market), activity=homeActivity(community);
  const isNew=useNewCount(scoreScope(stats.mode))>0;
  const fresh=app.community?.status==='ready'&&!app.community?.error&&(typeof community.viewer!=='string'||!app.accountId||community.viewer.toLowerCase()===app.accountId.toLowerCase());
  const spread=homeSeason(community,app.accountId,'spread'),total=homeSeason(community,app.accountId,'total');
  useRankMoment({account:app.accountId,league:'community',mode:'guess_spread',rank:spread.rank,tied:spread.tied,market:'Spread',read:community,fresh});
  useRankMoment({account:app.accountId,league:'community',mode:'guess_total',rank:total.rank,tied:total.tied,market:'Total',read:community,fresh});
  const spreadPop=usePopped(Number.isInteger(community.week?.season)?weekLockedId(community.week.season,hero.week,'guess_spread'):'');
  const totalPop=usePopped(Number.isInteger(community.week?.season)?weekLockedId(community.week.season,hero.week,'guess_total'):'');
  const openLeague=view=>{app.chooseLeague(COMMUNITY);shell.go('league',{view,market:stats.mode});};
  const toScore=()=>shell.go('play',{section:'score',season:community.week?.season??null,week:community.week?.week??null,market,team:'',matchup:'',scoreGame:null});
  const pending=hero.action?.primary===true;
  const rank=stats.rank===null?'—':`${stats.tied?'T-':''}${String(stats.rank).padStart(2,'0')}`;
  return <div className="gx-home-approved gx-screen" data-landing="home">
    <header className="gx-home-heading"><p>{hero.week===null?'Your community':`Week ${hero.week}`} · National Football League</p><h1 aria-label="Home">Your week.</h1></header>
    <section className="gx-home-card gx-home-action" data-home="hero" data-state={hero.state} aria-labelledby="gx-approved-home-action">
      <p className="gx-home-kicker">{pending?'Your next move':'Your week'}</p>
      <h2 id="gx-approved-home-action">{pending?'Finish your picks':headline.title}</h2>
      <div className="gx-home-progress" data-moment={spreadPop||totalPop?'pop':undefined}><ProgressRing done={progress.done} of={progress.of} state={progress.state}/><div><strong>{pending?(progress.left?`${progress.left} ${progress.label} ${progress.left===1?'pick':'picks'} left`:`${progress.label} draft ready`):headline.sub||'Your picks are kept'}</strong><span>{pending?(progress.closed?`${progress.closed} ${progress.closed===1?'game':'games'} closed`:progress.state==='locked'?'Lock in remaining picks':'Finish your drafts'):hero.state==='not_open'?'The next slate opens automatically':'Explore your week'}</span></div></div>
      <button type="button" className="gx-home-primary" aria-label={pending?'Continue picks':'Explore games'} onClick={pending?toPicks:toLines}>{pending?'Continue picks':'Explore games'} <Icon icon={ArrowUpRight} size={16}/></button>
    </section>
    {app.community?.error?<p className="gx-home-notice" role="status">This week could not refresh. Showing the last loaded update.</p>:null}
    <section className="gx-home-card gx-home-season" aria-labelledby="gx-home-season-title">
      <div className="gx-home-section-head"><h2 id="gx-home-season-title">Your season</h2><div className="gx-home-markets" role="group" aria-label="Season market">{['spread','total'].map(value=><button key={value} type="button" aria-pressed={market===value} onClick={()=>chooseMarket(value)}>{value==='spread'?'Spread':'Total'}</button>)}</div></div>
      <div className="gx-home-stat-grid">
        <span data-tile={market}><button type="button" id={`gx-h-tile-${market}`} className="gx-home-stat" onClick={toScore} aria-label={`${market==='spread'?'Spread':'Total'} Community rank, ${stats.rank===null?'not scored yet':`${rank} of ${stats.of}`}. Open your score${isNew?', new':''}`}><span>Community rank</span><GlassIcon icon="trophy"/><strong>{rank}{stats.rank!==null?<small> / {stats.of}</small>:null}</strong>{isNew?<NewPill/>:null}</button></span>
        <button type="button" className="gx-home-stat" data-tile={market} onClick={toScore} aria-label={`${market==='spread'?'Spread':'Total'} accuracy points, ${stats.points===null?'not scored yet':show(stats.points)}. Open your score`}><span>Accuracy points</span><GlassIcon icon="chart"/><strong data-home="points"><CountUp key={market} value={stats.points} account={app.accountId} figure={`community.${stats.mode}.season.${app.accountId}`}/></strong></button>
      </div>
    </section>
    <div className="gx-home-nav-grid">
      <button type="button" className="gx-home-card gx-home-nav-card" onClick={()=>openLeague('board')} aria-label={`League. ${market==='spread'?'Spread':'Total'} Community standings`}><GlassIcon icon="people"/><span className="gx-home-card-label">League <Icon icon={ArrowUpRight} size={16}/></span><LeaderBars rows={stats.leaders}/><span className="gx-home-card-sub">{stats.rank===null?'Season standings':`Your rank · ${stats.tied?'T-':''}${stats.rank} of ${stats.of}`}</span></button>
      <button type="button" className="gx-home-card gx-home-nav-card" onClick={()=>shell.go('research',{section:'trends',season:null,week:null})} aria-label="Research. Explore games and trends"><GlassIcon icon="chart"/><span className="gx-home-card-label">Research <Icon icon={ArrowUpRight} size={16}/></span><ResearchChart/><span className="gx-home-card-sub">Scoring · {trend.season} weeks {trend.weeks[0]}–{trend.weeks.at(-1)}</span></button>
    </div>
    {weekContent}
    <section className="gx-home-card gx-home-activity" aria-labelledby="gx-home-activity-title"><div className="gx-home-section-head"><h2 id="gx-home-activity-title">Around the league</h2><span data-tile="who"><button type="button" id="gx-h-tile-who" className="gx-home-text-button" aria-label={`Community, Who’s in, ${community.members?.length??0} members`} onClick={()=>{app.chooseLeague(COMMUNITY);shell.setView('home',{layer:HOME_LAYERS.who});}}>Community</button></span></div>
      {activity?<button type="button" className="gx-home-activity-row" onClick={()=>openLeague('feed')}><Avatar id={activity.actorId} name={activity.name} size={32}/><span><strong>{activity.name} {activity.text}</strong><span>Opponent guesses stay hidden until allowed.</span></span></button>:<button type="button" className="gx-home-activity-row" onClick={()=>openLeague('feed')}><GlassIcon icon="people"/><span><strong>Visit your community</strong><span>Standings, picks and league updates</span></span></button>}
    </section>
  </div>;
}
