import React,{useEffect,useRef,useState} from 'react';
import {Check,FileJson,History,Layers,LoaderCircle,MessageCircle,Receipt,ShieldCheck,TriangleAlert} from 'lucide-react';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {INFO} from '../../web/src/next/info.js';
import {EXPORT_COPY as COPY,EXAMPLE_FILE_PATTERN} from './export-example.mjs';
export function ExportPreview({initialPhase='idle'}){
 const [open,setOpen]=useState(true),[phase,setPhase]=useState(initialPhase),[notice,setNotice]=useState('');const root=useRef(null),opener=useRef(null),busy=phase==='preparing';
 useEffect(()=>{if(!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(n=>n.inert=false);screen.style.overflow=overflow;};},[open]);
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 function preview(){if(busy)return;if(phase==='unavailable'){setNotice('Example availability check only. No request or file operation occurred.');return;}setPhase('preparing');setNotice('');}
 const about=<InfoButton title={INFO.export.title} body={[...INFO.export.body,
  'This mockup reads no account records and never calls the authenticated /me/export controller. The actual export requires the existing account checks; its ownerId match must succeed before any real download. This preview is not authorization or a bypass.',
  'The cards name existing record categories only. They contain no sample user record, private pick, line, membership, count or JSON payload. Historical NBA records remain mentioned in the original guidance; no NBA product option is added.',
  'YYYY-MM-DD is deliberately a filename pattern, not an observed export time. Completion is a labelled example of the native message, not a created file or a claim that a download happened.',
  'Preview controls only change component memory. Preparation has no timer or automatic transition. View completion example is an explicit storyboard control. There is no API, Blob, object URL, download anchor, browser save dialog, clipboard, message or storage write.',
  'Failure and unavailable states are fictional, not live service observations. Actual data preservation, downloaded bytes, owner isolation, provider availability and physical-device file handling remain separate. New avatars/photos and awards remain held.',
 ]}/>;
 return <section ref={root} className="real-export real-account real-play" aria-label="Export my data visual review">
  <div className="real-account-summary"><span className="real-export-icon"><FileJson size={27} aria-hidden="true"/></span><div><h3>{COPY.title}</h3><p>Personal records · preview</p></div></div><Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open export preview</Button>
  {open?<Sheet title={COPY.title} onClose={close} closeLabel="Close export preview" footer={<p className="real-export-footer">Preview only · no account read or file download</p>}>
   <div className="real-account-preview-head"><p className="real-play-eyebrow">YOUR RECORDS · VISUAL EXAMPLE</p>{about}</div>
   <article className="real-export-hero"><span className="real-export-file"><FileJson size={48} aria-hidden="true"/></span><h3>Your records. One file.</h3><p>{COPY.lead}</p><span className="real-export-format">JSON</span></article>
   <div className="real-export-categories" aria-label="Existing export categories"><div><Layers size={20} aria-hidden="true"/><span>Guesses & revisions</span></div><div><Receipt size={20} aria-hidden="true"/><span>Bets & tickets</span></div><div><MessageCircle size={20} aria-hidden="true"/><span>Posts & settings</span></div><div><History size={20} aria-hidden="true"/><span>History & memberships</span></div></div>
   <div className="real-export-privacy"><ShieldCheck size={24} aria-hidden="true"/><div><strong>Only your records.</strong><p>Other players’ records and push-device addresses and keys are excluded.</p></div></div>
   {busy?<article className="real-export-status" role="status" data-phase={phase}><LoaderCircle size={25} aria-hidden="true"/><div><strong>{COPY.working}</strong><p>Example preparation · no data requested</p></div></article>:phase==='done'?<article className="real-export-status" role="status" data-phase={phase}><Check size={25} aria-hidden="true"/><div><strong>Example completion message</strong><p>{COPY.done(EXAMPLE_FILE_PATTERN)}</p><small>Filename pattern only · no file created</small></div></article>:phase==='failed'||phase==='unavailable'?<article className="real-export-status" role="status" data-phase={phase}><TriangleAlert size={25} aria-hidden="true"/><div><strong>{phase==='failed'?'Example: file preparation failed':'Example: export unavailable'}</strong><p>{phase==='failed'?COPY.failed:COPY.off}</p></div></article>:null}
   <Button variant="primary" haptic={false} disabled={busy} onClick={preview}>{busy?'Preparing · example':phase==='unavailable'?'Preview availability check':phase==='failed'?'Preview retry':'Preview download flow'}</Button>
   {busy?<div className="real-export-storyboard"><p>Storyboard control · no automatic download</p><Button haptic={false} onClick={()=>{setPhase('done');setNotice('');}}>View completion example</Button></div>:null}
   {notice?<p className="real-export-notice" role="status">{notice}</p>:null}
  </Sheet>:null}
 </section>;
}
