import React,{useEffect,useId,useRef,useState} from 'react';
import {CalendarDays,Check,Clock3,Coins,LockKeyhole,Plug,ShieldCheck,TriangleAlert} from 'lucide-react';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {fmtFull} from '../../web/src/next/format.js';
import {STATUS_COPY as COPY,statusExample,weekInputValid} from './commissioner-status-examples.mjs';
import {refreshLabel,scheduleDetails} from './commissioner-schedule-copy.mjs';
export function CommissionerStatusPreview({model,scenario='status'}){
 const weekView=scenario.startsWith('week-'),uncertain=scenario==='uncertain',paused=scenario==='paused',example=statusExample(paused),total=model.games.length;
 const [open,setOpen]=useState(true),[season,setSeason]=useState(String(model.season)),[week,setWeek]=useState(String(model.week)),[preview,setPreview]=useState(scenario==='week-review'),[all,setAll]=useState(false),[problem,setProblem]=useState(scenario==='week-error'?COPY.error:''),[notice,setNotice]=useState('');const root=useRef(null),opener=useRef(null),id=useId();
 useEffect(()=>{if(!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(n=>n.inert=false);screen.style.overflow=overflow;};},[open]);
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 function edit(setter){return event=>{setter(event.target.value);setPreview(false);setAll(false);setNotice('');setProblem('');};}
 function review(){setNotice('');if(!weekInputValid(season,week)){setProblem('Example validation: season 2000–2200 and week 1–25, whole numbers only.');return;}if(Number(season)!==model.season||Number(week)!==model.week){setProblem('Only the archived 2026 Week 9 schedule is included in this mockup. No schedule was requested.');return;}setProblem('');setPreview(true);setAll(false);}
 const about=<InfoButton title="About these commissioner status examples" body={[
  'The native schedule/settlement and week-opening layouts are restyled only. Enabled/paused states, automatic-run time and 8-of-15 settlement counts are fictional visual examples, not hosted observations. No provider quota, job, account or saved result is read.',
  'The odds schedule label and details reuse the exact existing pure formatter bodies, isolated from their API import. Paused uses the existing free-quota-protected label. Detailed guidance remains behind the schedule disclosure; no freshness, connection, budget or benchmark claim is made.',
  'Settle and Check show no-action notices. The uncertain example retains its check-only state; it never repeats settlement or pretends results were refreshed. Live settlement checks results with a separate read before another explicit operation.',
  'The schedule is a 15-game projection of the previously verified November 5 public season snapshot. Matchups, kickoff times and neutral flags are retained, including the neutral Bengals/Falcons game. The illustrative deadline follows the native buildSlate earliest-kickoff rule. This archived slate is not an upcoming/current publication and cannot be published here.',
  'Review is local only. Changing season/week clears the old schedule immediately; only this archived slate is supplied. Three games are initially shown with an explicit Show all 15 control. Publish displays a preview notice without creating a week, changing locks or claiming saved success.',
  'No community/API/auth read or write, refresh, storage, settlement, publish, provider fetch, timer or message occurs. Native rules, permissions, free limits and entered records are unchanged. New avatars/photos and awards remain held.',
 ]} links={[{text:'Archived public research snapshot · nflverse · CC BY 4.0',url:model.source.release}]}/>;
 return <section className="real-commissioner-status real-commissioner real-account real-play" ref={root} aria-label="Fictional commissioner status and week review">
  <div className="real-account-summary"><span className="real-commissioner-icon"><ShieldCheck size={28} aria-hidden="true"/></span><div><h3>{weekView?COPY.weeks:COPY.title}</h3><p>Example commissioner view</p></div></div><Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open status preview</Button>
  {open?<Sheet title={weekView?COPY.weeks:COPY.title} back={{label:'Commissioner tools',onBack:close}} onClose={close} closeLabel="Close status preview" tall footer={<p className="real-commissioner-footer">Visual example · no settlement or publication</p>}>
   <div className="real-account-preview-head"><p className="real-play-eyebrow">{weekView?'ARCHIVED SCHEDULE · REVIEW ONLY':'ILLUSTRATIVE SYSTEM STATUS'}</p>{about}</div>
   {weekView?<>
    <p className="real-commissioner-explanation">{COPY.weeksHelp}</p><p className="real-ops-archive">November 5 public snapshot · 2026 Week 9 example</p>
    <div className="real-ops-fields"><label htmlFor={id+'-season'}>Season<input id={id+'-season'} type="number" inputMode="numeric" min={2000} max={2200} value={season} onChange={edit(setSeason)}/></label><label htmlFor={id+'-week'}>Week<input id={id+'-week'} type="number" inputMode="numeric" min={1} max={25} value={week} onChange={edit(setWeek)}/></label></div>
    <Button haptic={false} onClick={review}>{COPY.review} · preview</Button>
    {problem?<p className="real-ops-problem" role="alert">{problem}</p>:null}
    {preview?<div className="real-ops-schedule" data-schedule>
     <div className="real-ops-card-title"><span className="real-commissioner-icon"><CalendarDays size={25} aria-hidden="true"/></span><div><h3>Week {model.week} · {total} games</h3><p>Archived schedule · example only</p></div></div>
     <ul aria-label={`Week ${model.week} archived schedule`} className="real-ops-games">{model.games.slice(0,all?total:3).map(game=><li key={game.id} data-game={game.id}><div className="real-ops-matchup" aria-label={game.matchup}><span className="real-ops-logo"><TeamMark code={game.awayCode} size={32} decorative/></span><span className="real-ops-at">at</span><span className="real-ops-logo"><TeamMark code={game.homeCode} size={32} decorative/></span></div><strong>{game.away} at {game.home}</strong><span>{fmtFull(game.kickoff)}{game.neutral?' · Neutral site':''}</span></li>)}</ul>
     <p className="real-ops-list-count">Showing {all?total:3} of {total} games</p><Button haptic={false} onClick={()=>setAll(!all)} aria-expanded={all}>{all?'Show first 3 games':`Show all ${total} games`}</Button>
     <div className="real-ops-deadline"><LockKeyhole size={20} aria-hidden="true"/><p>Picks lock {fmtFull(model.deadline)}<small>Archived deadline · no live locks changed</small></p></div><Button variant="primary" haptic={false} onClick={()=>setNotice('Publish preview only. No week was opened, deadline changed or request sent.')}>Preview Publish Week {model.week}</Button>
    </div>:null}
   </>:<>
    <article className="real-ops-card" data-status="week-open"><div className="real-ops-card-title"><span className="real-commissioner-icon"><CalendarDays size={26} aria-hidden="true"/></span><div><h3>{COPY.automatic}</h3><p>{COPY.monday}</p></div></div><span className="real-ops-pill">Enabled · example</span><p>Example last run {fmtFull(example.weekOpen.lastRunAt)} · {example.weekOpen.lastStatus}</p></article>
    <article className="real-ops-card" data-status="odds"><div className="real-ops-card-title"><span className="real-commissioner-icon"><Plug size={26} aria-hidden="true"/></span><div><h3>{COPY.odds}</h3><p>Example automatic schedule</p></div></div><span className="real-ops-pill" data-paused={paused}>{refreshLabel(example)}</span><details className="real-ops-details"><summary>Schedule details</summary><p>{scheduleDetails(example)}</p></details></article>
    <article className="real-ops-card real-ops-settlement" data-status="settlement"><div className="real-ops-card-title"><span className="real-commissioner-icon"><Coins size={26} aria-hidden="true"/></span><div><h3>{COPY.settlement}</h3><p>Week {model.week} · illustrative counts</p></div></div><div className="real-ops-count"><strong>{example.settledGames}<small> / {total}</small></strong><span>games settled · example</span></div><div className="real-ops-progress" role="meter" aria-label="Example settled games" aria-valuemin={0} aria-valuemax={total} aria-valuenow={example.settledGames}><span style={{width:(example.settledGames/total*100)+'%'}}/></div><p>Finals settle after each results refresh.</p>
     {uncertain?<div className="real-ops-problem" role="alert"><TriangleAlert size={22} aria-hidden="true"/><p>{COPY.uncertain}</p></div>:null}<Button variant="primary" haptic={false} onClick={()=>setNotice(uncertain?'Check preview only. No saved results were read and no settlement was repeated; this example still needs checking.':'Settlement preview only. No finals were settled, picks graded or results changed.')}>{uncertain?COPY.check:COPY.settle} · preview</Button>
    </article>
   </>}
   {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  </Sheet>:null}
 </section>;
}
