import React,{useEffect,useRef,useState} from 'react';
import {Avatar,Button,Card,Icon,InfoButton,Segmented} from '../../web/src/next/ui/index.js';
import {sportOptions} from '../../web/src/next/epl/route.js';
import {TopBar,TabBar} from './isolated-nfl-actions.jsx';
import {EplLeaguesView,EplHistoryView,EplBetsView} from './isolated-epl-shell.jsx';
import './populated-epl-shell.css';

export function EplShellPreview({scenario='leagues',theme='dark'}){
 const root=useRef(null),opener=useRef(null),[open,setOpen]=useState(true),[notice,setNotice]=useState('');
 const noRead=label=>setNotice(label+' preview only. No navigation, account, league, picks or records were read or changed.');
 const close=()=>{setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));};
 const shell={closeSheet:close,closePage:close};
 useEffect(()=>{if(scenario!=='leagues'||!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}const screen=root.current.closest('.screen'),old=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(n=>n.inert=false);screen.style.overflow=old;};},[open,scenario]);
 const about=<div className="real-action-disclaimer"><p>EXISTING EPL STATE · VISUAL REVIEW</p><InfoButton title="About these EPL shell previews" body={[
  'These are the existing EPL shell states in the selected glass design. FEPL is the native league identity; Alex Lane is a fictional account. No league roster, account permission, private pick, saved record, provider or feature flag is read.',
  'The native FEPL league sheet has one selected league row. Pick a Team and Fantasy use FEPL; NFL leagues remain accessible in NFL. This preview does not add a create/join/invite flow to EPL.',
  'The native History screen currently says EPL history is not available here yet and keeps the View NFL history action. EPL Bets currently says bets are not available for the Premier League. These source-defined states do not mean player data was deleted or that a fetch returned no data.',
  'Native EplLeagues and EplHistory presentations from EplShell.jsx, plus EplBets/EPL_COPY from EplApp.jsx, are isolated from providers and controllers. Local shell/navigation callbacks are injected; Button haptics are off. Existing history/ticket icons decorate the two native notice cards. Copy and available actions are retained.',
  'The header and four tabs reuse the previously reviewed native frame. They show FEPL and an explicit empty tab-slot map, with no invented NFL badges or counters. Menu uses the already-reviewed account-wide design; its real commissioner/push guard read is not run here.',
  'The page behind the league sheet is a labelled FEPL review context rather than live Home data. The sheet closes locally and returns focus; other destination buttons only show a no-read notice. No URL, account or device preference changes. No API/auth/provider read, write, polling, storage or timer controller runs. NBA stays hidden. New avatar/photo/award work and parked Signal files remain held.',
 ]}/></div>;
 return <section ref={root} className="real-epl-shell real-nfl-actions real-account real-play real-epl-home real-shared-navigation" data-scenario={scenario} aria-label="EPL shell visual review">
  <TopBar leagueName="FEPL" you={{id:'example-alex',name:'Alex Lane',theme}} onHome={()=>noRead('Home')} onLeague={()=>{if(scenario==='leagues')setOpen(true);else noRead('FEPL league selector');}} onMenu={()=>noRead('Previously reviewed account Menu')}/>
  <nav className="gx-sport-controls" aria-label="Sports"><Segmented label="Sport" value="epl" options={sportOptions(true)} onChange={()=>noRead('Switch to NFL')}/></nav>
  <div className="real-epl-shell-content">
   {scenario==='history'&&open?<EplHistoryView shell={shell} navigateSport={hash=>noRead('View NFL history ('+hash+')')}/>:scenario==='bets'?<EplBetsView/>:<>
    <p className="real-play-eyebrow">FEPL · REVIEW CONTEXT</p><h1>Home</h1>
    <Card className="gx-vstack gx-gap-12"><Avatar id="fepl" name="FEPL" size={40}/><h2 className="gx-t-section">FEPL</h2><p className="gx-t-body gx-c-2">Pick a Team and Fantasy</p><p className="gx-t-meta">Context only · previously reviewed Home content is separate.</p></Card>
   </>}
   {(scenario==='leagues'||scenario==='history'&&!open)?<Button ref={opener} haptic={false} variant="primary" onClick={()=>setOpen(true)}>Open {scenario==='leagues'?'FEPL leagues':'EPL history'} preview</Button>:null}
   {about}
   {notice?<p className="real-action-notice" role="status">{notice}</p>:null}
  </div>
  <TabBar current={scenario==='bets'?'bets':'home'} data={{}} onTab={()=>noRead('Previously reviewed destination')}/>
  {scenario==='leagues'&&open?<EplLeaguesView shell={shell}/>:null}
  <p className="real-epl-home-note">Existing state · no live account or route changes</p>
 </section>;
}
