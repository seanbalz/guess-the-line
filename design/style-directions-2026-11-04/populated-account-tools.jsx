import React,{useEffect,useRef,useState} from 'react';
import {Activity,BookOpen,ChartNoAxesCombined,Check,ChevronDown,CloudSun,Coins,Database,History,Info,Settings2,Shield,SlidersHorizontal,Target,Ticket,Users} from 'lucide-react';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Switch} from '../../web/src/next/ui/Switch.jsx';
import {Avatar} from '../../web/src/next/ui/Avatar.jsx';
import {INFO,GUIDANCE_ORDER} from '../../web/src/next/info.js';
import {SPORTSBOOK_NAMES} from '../../shared/account-preferences.mjs';
import {sameSettings,settingsExample,previewSettings,settingsBookKeys} from './account-settings-examples.mjs';
const TOPIC_ICONS={trends:ChartNoAxesCombined,gameBets:Users,yourPick:Target,guessPicks:Users,marketLines:Activity,research:BookOpen,researchData:Database,trackedBets:Ticket,recommended:SlidersHorizontal,virtual:Coins,everyone:Users,scores:Target,weather:CloudSun,points:ChartNoAxesCombined,history:History,trendBuilder:Settings2,teamRecords:Shield};
export function AccountToolsPreview({initialView='settings',scenario='standard'}){
 const fixture=useRef(settingsExample(scenario)),[base,setBase]=useState(fixture.current.base),[draft,setDraft]=useState(fixture.current.draft),[problem,setProblem]=useState(fixture.current.problem),[notice,setNotice]=useState(''),[open,setOpen]=useState(true);const root=useRef(null),opener=useRef(null),guidance=initialView==='guidance',dirty=!sameSettings(base,draft),books=settingsBookKeys(base,draft);
 useEffect(()=>{if(!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(n=>n.inert=false);screen.style.overflow=overflow;};},[open]);
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 function change(next){setDraft(next);setNotice('');}
 function preview(){try{setBase(previewSettings(base,draft));setProblem('');setNotice('Settings preview updated. Nothing was saved to an account.');}catch(error){setProblem(error.message);}}
 const about=<InfoButton title={guidance?'About this guidance preview':'About these settings examples'} body={guidance?[
  'This preview retains every existing guidance topic, with its original title, paragraphs, source links and licenses unchanged. Topics open in place to keep the list readable.',
  'The copy describes existing product rules and sources. Opening a topic or source does not read an account, collect a quote or change a preference. Source links open externally only when you choose one.',
  'This is a visual layout review. It does not approve new awards, avatar options or any change to existing guidance content.',
 ]:[
  'These are explicit fictional settings and catalog states. No account preferences, supported-book capabilities or current connections are read.',
  'When validated recommendations are available, offers will use the best fresh line and price among these books.',
  'The nine-key account sportsbook catalog is reused unchanged. It is separate from the existing 33 manual tracking source labels. Showing a name here never establishes a new integration or current availability.',
  'The real app only offers books present in its collected data, and retains a previously selected book with an unavailable label. The unavailable example demonstrates that rule without asserting real provider status.',
  'The existing book validation, normalized choices and Show guide behavior are retained. Preview settings affects memory only; it never saves settings, writes a tab draft or performs a conflict check on your account.',
  'The conflict layout is an explicit example. Its draft is kept for a separate tap; no request is replayed or saved automatically.',
 ]}/>;
 return <section className="real-account-tools real-account real-play" ref={root} aria-label="Account settings and guidance visual review">
  <div className="real-account-summary"><Avatar id="demo-member-0" name="Alex Lane" size={56}/><div><h3>Alex Lane</h3><p>Fictional account</p></div></div><Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open {guidance?'guidance':'settings'} preview</Button>
  {open?<Sheet title={guidance?'Guidance and sources':'Settings'} onClose={close} closeLabel="Close account tools preview" tall={guidance} footer={guidance?<p className="real-tools-footer">Existing guidance copy · no account data</p>:<div className="real-tools-actions"><Button variant="primary" haptic={false} disabled={!dirty} onClick={preview}>Preview settings</Button><p>Example settings · no account or device changes</p></div>}>
   <div className="real-account-preview-head"><p className="real-play-eyebrow">{guidance?'EXISTING TOPICS & SOURCES':'FICTIONAL SETTINGS · EXAMPLE CATALOG'}</p>{about}</div>
   {guidance?<div className="real-guide-topics">{GUIDANCE_ORDER.map(key=>{const topic=INFO[key],Icon=TOPIC_ICONS[key]??Info,title=topic.title.replace(/^About /,'').replace(/^./,c=>c.toUpperCase());return <details key={key} data-guidance={key} className="real-guide-topic"><summary><span className="real-tools-icon"><Icon size={21} aria-hidden="true"/></span><span>{title}{topic.links?.length?<small>Sources included</small>:null}</span><ChevronDown size={16} aria-hidden="true"/></summary><div className="real-guide-topic-body">{topic.body.map(text=><p key={text}>{text}</p>)}{(topic.links??[]).map(link=><a key={link.url+link.text} href={link.url} target="_blank" rel="noreferrer">{link.text}</a>)}</div></details>;})}</div>:<>
    <div className="real-tools-settings-heading"><span className="real-tools-icon"><Ticket size={26} aria-hidden="true"/></span><div><h3>Your sportsbooks</h3><p>Choose books you use.</p></div><strong aria-live="polite">{draft.sportsbooks.length}<small>selected</small></strong></div>
    <fieldset className="real-tools-books"><legend>Example sportsbook options</legend>{books.map(book=><label key={book} data-unavailable={!base.supportedBooks.includes(book)}><input type="checkbox" checked={draft.sportsbooks.includes(book)} onChange={e=>change({...draft,sportsbooks:e.target.checked?[...draft.sportsbooks,book]:draft.sportsbooks.filter(b=>b!==book)})}/><span className="real-tools-book-check" aria-hidden="true">{draft.sportsbooks.includes(book)?<Check size={16}/>:null}</span><span>{SPORTSBOOK_NAMES[book]}{!base.supportedBooks.includes(book)?<small>Unavailable in this example</small>:null}</span></label>)}</fieldset>
    <div className="real-tools-home-guidance"><div><span className="real-tools-icon"><BookOpen size={23} aria-hidden="true"/></span><h3>Home guidance</h3></div><Switch label="Show the getting started guide" sub="Help with your first picks on Home." checked={!draft.guidanceCollapsed} onChange={on=>change({...draft,guidanceCollapsed:!on})}/></div>
    {dirty?<p className="real-tools-draft">Unsaved example draft · kept while this preview stays open</p>:null}{problem?<p className="real-tools-problem" role="alert">{problem}</p>:null}{notice?<p className="real-tools-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
   </>}
  </Sheet>:null}
 </section>;
}
