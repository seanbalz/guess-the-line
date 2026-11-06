import React, {useMemo, useRef, useState} from 'react';
import {PlayerProfileBody,PlayerCompare,PlayerToolButtons} from '../../web/src/next/fantasy/FantasyTools.jsx';
import {playerProfile} from '../../shared/fantasy-tools.mjs';
import {SCORING_OPTIONS,formatFantasyNumber as number} from '../../shared/fantasy-rankings.mjs';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {MiniArea} from '../../web/src/next/charts/TrendRow.jsx';

export function FantasyPreview({model,onSelection}){
 const snapshot=model.snapshot,[scoring,setScoring]=useState('ppr'),[passingTds,setPassingTds]=useState(4),[tab,setTab]=useState('players'),[profileId,setProfileId]=useState(null),[ids,setIds]=useState(model.initialCompare),[query,setQuery]=useState(''),[position,setPosition]=useState('ALL'),[limit,setLimit]=useState(6),root=useRef(null),saved=useRef(null);
 const settings={scoring,passingTds};
 const profiles=useMemo(()=>snapshot.players.map(p=>playerProfile(snapshot,p.id,{scoring,passingTds})).filter(p=>p.summary.season.games>0&&p.summary.season.points.value!==null),[snapshot,scoring,passingTds]);
 const order=new Map(model.featuredIds.map((id,i)=>[id,i]));
 const matching=profiles.filter(p=>(position==='ALL'||p.player.position===position)&&`${p.player.name} ${p.player.team} ${p.player.position}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>(order.get(a.player.id)??999)-(order.get(b.player.id)??999)||a.player.name.localeCompare(b.player.name));
 const profile=profileId?playerProfile(snapshot,profileId,settings):null;
 function toggle(id){setIds(values=>values.includes(id)?values.filter(v=>v!==id):values.length<3?[...values,id]:values);}
 function open(id){const scroll=root.current.closest('.screen');saved.current={scroll,top:scroll.scrollTop,opener:root.current.ownerDocument.activeElement};setProfileId(id);onSelection({name:snapshot.players.find(p=>p.id===id).name,open:true});scroll.scrollTop=0;requestAnimationFrame(()=>root.current.querySelector('.real-fantasy-back')?.focus({preventScroll:true}));}
 function close(){setProfileId(null);onSelection({name:'Fantasy',open:false});requestAnimationFrame(()=>{saved.current?.opener?.focus({preventScroll:true});if(saved.current)saved.current.scroll.scrollTop=saved.current.top;});}
 return <div className="real-fantasy" ref={root}>
  {!profile?<Segmented label="Fantasy tools" options={[{value:'players',label:'Players'},{value:'compare',label:`Compare (${ids.length})`}]} value={tab} onChange={setTab}/>:<button type="button" className="real-fantasy-back" onClick={close}>← Back to Fantasy</button>}
  <p className="real-context">2026 · Stats through Week {snapshot.statsThroughWeek} · Published Nov 5</p>
  {(tab==='players'||profile)&&<div className="real-fantasy-settings"><Segmented label="Fantasy scoring" options={SCORING_OPTIONS} value={scoring} onChange={setScoring}/><label>Passing TDs<select aria-label="Passing touchdown points" value={passingTds} onChange={e=>setPassingTds(Number(e.target.value))}><option value={4}>4 points</option><option value={6}>6 points</option></select></label></div>}
  <section hidden={tab!=='players'||!!profile} aria-label="Player research">
   <div className="real-fantasy-filters"><label htmlFor="fantasy-player-search">Find a player<input id="fantasy-player-search" type="search" placeholder="Name, team or position" value={query} onChange={e=>{setQuery(e.target.value);setLimit(6);}}/></label><label htmlFor="fantasy-position">Position<select id="fantasy-position" value={position} onChange={e=>{setPosition(e.target.value);setLimit(6);}}>{['ALL','QB','RB','WR','TE','K'].map(v=><option key={v} value={v}>{v==='ALL'?'All':v}</option>)}</select></label></div>
   <p className="real-fantasy-count" role="status">{Math.min(limit,matching.length)} of {matching.length} players with recorded points</p>
   <div className="real-fantasy-players">{matching.slice(0,limit).map(p=>{const player=p.player,values=p.weeks.filter(w=>w.status==='played'&&w.points!==null).map(w=>w.points);return <article className="real-fantasy-player" key={player.id} data-player={player.id}>
    <div className="real-fantasy-player-head"><TeamMark code={player.team} size={48} decorative/><div><h3>{player.name}</h3><span className="real-fantasy-position">{player.position}</span></div><div className="real-fantasy-average"><b>{number(p.summary.season.points.value)}</b><small>pts / game</small></div></div>
    <div className="real-fantasy-spark" role="img" aria-label={`${player.name}, actual fantasy points in recorded games: ${values.map(number).join(', ')}`}><MiniArea values={values}/></div><p className="real-context">Observed production · {p.summary.season.games} recorded games</p>
    <PlayerToolButtons player={player} compared={ids.includes(player.id)} full={ids.length>=3} onProfile={open} onCompare={toggle}/>
   </article>;})}</div>
   {matching.length>limit?<button type="button" className="real-fantasy-more" onClick={()=>setLimit(n=>n+6)}>Show more players</button>:null}
   {!matching.length?<p className="real-context">No recorded players match these filters.</p>:null}
  </section>
  <section hidden={tab!=='compare'||!!profile} aria-label="Player comparison"><PlayerCompare key={`${scoring}-${passingTds}`} snapshot={snapshot} ids={ids} onChange={setIds} settings={settings} onProfile={open}/></section>
  {profile?<section className="real-fantasy-profile" aria-label={`${profile.player.name}, usage and production`}><div className="real-fantasy-profile-mark"><TeamMark code={profile.player.team} size={48} decorative/><span>{profile.player.position} · {profile.summary.season.games} recorded games</span></div><PlayerProfileBody profile={profile} snapshot={snapshot} settings={settings} compare={{compared:ids.includes(profileId),full:ids.length>=3,onCompare:toggle}}/></section>:null}
  <p className="real-source">{snapshot.players.length} published roster entries · <a href={model.source.release} target="_blank" rel="noopener">nflverse · CC BY 4.0</a><br/>Published GTL pace estimates are labelled separately from observed production.</p>
 </div>;
}
