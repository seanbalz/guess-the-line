// Isolated visual adapter; native rules/models and presentation, no EPL API, polling, account claims or persistence.
import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Clock,LockKeyhole,RefreshCw} from 'lucide-react';
import {DraftBoard,Crest} from '../../web/src/next/epl/DraftBoard.jsx';
import {boardModel} from '../../web/src/next/epl/draftModel.js';
import {canPick,onTheClock} from '../../shared/epl-draft.mjs';
import {MarginChart} from '../../web/src/next/epl/MarginChart.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {QueueSheetView} from './isolated-epl-queue.jsx';
function scenarioRead(data,scenario){
 const read=structuredClone(data.read);
 if(scenario==='waiting'){read.picks=read.picks.slice(0,1);read.onTheClock=read.order[1].ownerId;}
 if(scenario==='closed'){const codes=['ARS','CHE','AVL','LIV','MNC','BOU','BRE','BHA'];read.picks=read.order.map((m,i)=>({ownerId:m.ownerId,club:codes[i],final:true}));read.status='closed';read.onTheClock=null;}
 return read;
}
export function EplPreview({data,initialView,onSelection}){
 const [read,setRead]=useState(()=>scenarioRead(data,'pick')),[scenario,setScenario]=useState('pick'),[selected,setSelected]=useState('AVL'),[all,setAll]=useState(false),[view,setView]=useState('board'),[queueOpen,setQueueOpen]=useState(false),[queue,setQueue]=useState(data.read.myQueue),[notice,setNotice]=useState('');
 const root=useRef(null),queueOpener=useRef(null),savedScroll=useRef(0),model=boardModel(read,Date.parse(data.now));
 useEffect(()=>{onSelection?.({name:view==='confirmation'?'Team confirmation':'Pick a Team',open:view==='confirmation'});},[view,onSelection]);
 useEffect(()=>{if(initialView==='confirmation')pick('AVL');},[]);
 useEffect(()=>{
  if(!queueOpen)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];
  for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const s of branch.parentElement?.children??[]){if(s!==branch&&!s.inert){s.inert=true;changed.push(s);}}}
  const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(s=>s.inert=false);screen.style.overflow=overflow;};
 },[queueOpen]);
 function showBoard(){setView('board');setSelected(null);root.current.closest('.screen').scrollTop=0;}
 function changeScenario(next){setScenario(next);setRead(scenarioRead(data,next));setSelected(next==='pick'?'AVL':null);setAll(false);setNotice('');}
 function pick(club,source='pick',ranked=read.myQueue){
  if(!model.canPick)return;
  const result=canPick({order:read.order.map(o=>o.ownerId),picks:read.picks.map(p=>({managerId:p.ownerId,club:p.club})),managerId:read.me,club,clubs:read.clubs.map(c=>c.code),now:new Date(data.now),deadline:new Date(read.deadline)});
  if(!result.ok){setNotice('That choice is unavailable in this sample state.');return;}
  const picks=[...read.picks.filter(p=>p.ownerId!==read.me),{ownerId:read.me,club,source,pickedAt:data.now,final:false}];
  setRead({...read,picks,myQueue:ranked,onTheClock:onTheClock(read.order.map(o=>o.ownerId),picks.map(p=>({managerId:p.ownerId,club:p.club})))});setSelected(null);setView('confirmation');setNotice('');requestAnimationFrame(()=>{root.current.closest('.screen').scrollTop=0;root.current.querySelector('.real-epl-confirm')?.focus({preventScroll:true});});
 }
 function openQueue(){setQueue([...read.myQueue]);queueOpener.current=root.current.ownerDocument.activeElement;savedScroll.current=root.current.closest('.screen').scrollTop;setQueueOpen(true);}
 function closeQueue(){setQueueOpen(false);requestAnimationFrame(()=>{queueOpener.current?.focus({preventScroll:true});root.current.closest('.screen').scrollTop=savedScroll.current;});}
 function previewQueue(){
  if(model.locked)return;closeQueue();
  const first=queue.find(code=>model.available.some(c=>c.code===code));
  if(model.onClockMe&&first)pick(first,'queue',queue);
  else{setRead({...read,myQueue:[...queue]});setNotice(model.onClockMe?'Ranking preview updated. No ranked club is available; your manual turn stays open.':model.myClub?'Ranking preview updated. Your sample pick is unchanged.':'Ranking preview updated. Your sample turn is still waiting.');}
 }
 const chosen=model.clubs.find(c=>c.code===selected),clubs=all?model.available:model.available.slice(0,8),taken=new Set(read.picks.map(p=>p.club)),queueClubs=model.clubs.map(c=>({...c,taken:taken.has(c.code)}));
 return <section className="real-epl real-play" ref={root} aria-label="Fictional Pick a Team visual review">
  <div className="real-epl-head"><div><p className="real-play-eyebrow">FICTIONAL DRAFT · MW10 EXAMPLE</p><h3>{view==='confirmation'?'Your sample club':'Your draft'}</h3></div><InfoButton title="About this draft preview" body={[data.notice,'No fixture pairings, sportsbook prices, current table, live Sleeper scores or actual kickoff times are invented. The club pool is the existing configured catalog. Timing uses an internal fixed test clock, not a real match schedule.','Draft order, turn eligibility, latest-picker changes and the margin bonus use GTL’s native pure helpers. Lower weekly score picks first; ties use lower season total.','The ranking sheet demonstrates the existing turn-start rule: the highest-ranked available club is assigned. If none are available, the manual turn stays open. A ranking preview on your sample turn can therefore open the team confirmation.','All actions change this example in memory only. No pick, ranking, account claim or preference is saved. New avatars, awards and celebration work remain held.']}/></div>
  {view==='confirmation'?<>
   <div className="real-epl-confirm" role="status" tabIndex={-1}><span className="real-epl-check"><Check size={23} aria-hidden="true"/></span><p className="real-play-eyebrow">PREVIEW ONLY · NOTHING SAVED</p><Crest code={model.myClub.code} size="lg"/><h3>{model.myClub.name}</h3><p>{model.backupPick?'Highest available club from your sample ranking.':'Selected for this example draft.'}</p><small>{model.canPick?'A change is available until the next manager picks or the draft closes.':'Your sample selection is final.'}</small></div>
   <div className="real-epl-hero"><h4>Updated sample board</h4><DraftBoard model={model}/><p className="real-epl-meta">{model.onClockName} is on the clock</p></div>
   <Button variant="primary" haptic={false} onClick={showBoard}>Back to sample draft<ArrowRight size={17} aria-hidden="true"/></Button>
  </>:<>
   <Segmented label="Draft scenario" value={scenario} options={[{value:'pick',label:'Can pick'},{value:'waiting',label:'Waiting'},{value:'closed',label:'Closed'}]} onChange={changeScenario}/>
   <section className="real-epl-hero"><div className="real-epl-section-title"><h4>Pick order</h4><span>Sample managers</span></div><DraftBoard model={model}/>
    <p className="real-epl-turn">{model.locked?<><LockKeyhole size={16} aria-hidden="true"/>Draft closed</>:model.onClockMe?<><Clock size={16} aria-hidden="true"/>Your turn · Alex Lane</>:model.changing?'Your sample pick can still change':`${model.onClockName} is on the clock`}</p>
    {model.canPick?<Button variant="primary" haptic={false} disabled={!chosen} onClick={()=>pick(selected)}>{chosen?`Preview ${model.changing?'change to':'pick'} ${chosen.name}`:'Choose a club below'}</Button>:null}
    <p className="real-epl-meta">{model.locked?'Club and ranking changes are closed.':'Draft closes at the first kickoff · sample state'}</p>
   </section>
   {notice?<p className="real-epl-notice" role="status">{notice}</p>:null}
   {!model.locked?<section className="real-epl-pool"><div className="real-epl-section-title"><h4>Still available</h4><span>{model.available.length} sample clubs</span></div><ul className="real-epl-clubs">{clubs.map(c=><li key={c.code}>{model.canPick?<button type="button" className={'real-epl-club'+(selected===c.code?' is-selected':'')} data-preview-club={c.code} aria-pressed={selected===c.code} onClick={()=>setSelected(selected===c.code?null:c.code)}><Crest code={c.code}/><strong>{c.name}</strong>{selected===c.code?<span className="real-epl-selected"><Check size={12} aria-hidden="true"/>Selected</span>:null}</button>:<div className="real-epl-club" data-preview-club={c.code}><Crest code={c.code}/><strong>{c.name}</strong></div>}</li>)}</ul>{model.available.length>8?<Button haptic={false} aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Show fewer clubs':`Show all ${model.available.length} clubs`}</Button>:null}{!model.canPick?<p className="real-epl-meta">Club choices open when your turn begins.</p>:null}</section>:null}
   <Button haptic={false} disabled={model.locked} onClick={openQueue}>Backup ranking<ArrowRight size={17} aria-hidden="true"/></Button>
   <section className="real-epl-bonus"><div className="real-epl-section-title"><h4>Last matchweek’s bonus</h4><span>Fictional results</span></div><MarginChart bonus={model.bonus} clubName={model.clubName}/><p className="real-epl-meta">Equal 3–0 sample wins · margin 3 × 5 = 15 points each</p></section>
  </>}
  <button type="button" className="real-epl-reset" onClick={()=>{setView('board');changeScenario('pick');}}><RefreshCw size={14} aria-hidden="true"/>Reset this example</button>
  <p className="real-epl-source">Fictional managers, picks, rankings and results<br/>Configured club crests · no live draft · no saves</p>
  {queueOpen?<QueueSheetView clubs={queueClubs} queue={queue} onChange={setQueue} onTurn={true} onSave={previewQueue} onClose={closeQueue} busy={false}/>:null}
 </section>;
}
