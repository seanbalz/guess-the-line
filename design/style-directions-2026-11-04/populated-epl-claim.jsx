import React,{useEffect,useId,useRef,useState} from 'react';
import {Check,Eye,Link,RefreshCw,ShieldCheck} from 'lucide-react';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Toast} from '../../web/src/next/ui/Toast.jsx';
import {DraftBoard} from '../../web/src/next/epl/DraftBoard.jsx';
import {SaveUncertainError} from '../../web/src/apiResponse.js';
import {CLAIM_COPY,ClaimCardView,claimManagers} from './isolated-epl-claim.jsx';
import {eplClaimExample} from './epl-claim-examples.mjs';

export function EplClaimPreview({data,scenario='choose'}){
 const [revision,setRevision]=useState(0),[watching,setWatching]=useState(scenario==='watching'),[notice,setNotice]=useState(''),[showToast,setShowToast]=useState(true),[open,setOpen]=useState(true),root=useRef(null),opener=useRef(null),reset=useRef(null),id=useId();
 const f=eplClaimExample(data,scenario),model=f.model,managers=watching?[]:claimManagers(model);
 const outcome=f.outcome==='linked'?{text:CLAIM_COPY.claimed('Alex Lane'),tone:'done'}:f.outcome==='taken'?{text:CLAIM_COPY.taken,tone:'warning'}:f.outcome==='already-linked'?{text:CLAIM_COPY.linked,tone:'warning'}:f.outcome==='failed'?{text:CLAIM_COPY.failed,tone:'error'}:f.outcome==='uncertain'?{text:new SaveUncertainError().message,tone:'error'}:null;
 useEffect(()=>{if(!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(n=>n.inert=false);screen.style.overflow=overflow;};},[open]);
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 function claim(ownerId){if(f.busy||!managers.some(m=>m.ownerId===ownerId))return;setNotice('Claim preview only. No manager was linked, claim sent or board read. The example stays unchanged.');}
 function watch(){if(f.busy)return;setWatching(true);setNotice('Watching preview only. The manager card is hidden in this example’s memory; no browser-session setting or account changed.');requestAnimationFrame(()=>root.current.querySelector('.real-epl-link-board')?.focus({preventScroll:true}));}
 function resetExample(){setWatching(f.watching);setNotice('');setShowToast(true);setRevision(n=>n+1);}
 function dismiss(){setShowToast(false);requestAnimationFrame(()=>reset.current?.focus({preventScroll:true}));}
 const about=<InfoButton title="About these EPL manager examples" body={[
  CLAIM_COPY.body,
  'The actual claim card offers only managers from the unlinked account’s permitted draft read. A linked account or an empty offered list gets no claim card. These are fictional managers from the existing sample draft, not real names, grants, accounts or saved links.',
  'The native CLAIM_COPY, claimManagers and ClaimCardView are isolated unchanged from the controller; only the two button sites suppress haptics. Native boardModel and DraftBoard retain eight sample managers, two separate club-crest tiles and the sample turn. Unlinked models cannot pick and have no queue. No club selection or ranking controls are supplied here.',
  'The actual first successful claim wins. Success, already-claimed, already-linked and uncertain replies ask for a board reread; an ordinary failure does not. The conflict and linked states here are fixed illustrative outcomes, not responses to button taps or claims that a board was refreshed. Taken shows a fictional offered list without Alex; the already-linked example has a linked model and no claim card.',
  'The real Just watching choice lasts for the browser session, with a memory fallback if storage is blocked. This preview hides the card only in component memory and moves focus to the read-only board; reset restores this scenario. No session storage, account, manager link, draft, pick or queue is changed.',
  'The native uncertain-save message is retained exactly. It does not assert success or failure. This preview performs no saved-data check, refresh or retry, and never treats uncertainty as a completed link.',
  'Native Toast is reused with duration null so every example remains visible for review until dismissed; focus returns to Reset this example. Busy is fixed, with disabled manager/watch controls and an action guard. No claim/API/auth/Sleeper request, provider read, storage, polling, automatic completion or message occurs. New avatar/photos and awards remain held.',
 ]}/>;
 return <section ref={root} className="real-epl-link real-epl real-commissioner real-account real-play" aria-label="Fictional EPL manager linking visual review">
  <div className="real-account-summary"><span className="real-commissioner-icon"><Link size={28} aria-hidden="true"/></span><div><h3>FEPL manager</h3><p>Fictional link examples</p></div></div><Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open manager preview</Button>
  {open?<Sheet title="Your FEPL manager" back={{label:'Pick a Team',onBack:close}} onClose={close} closeLabel="Close manager preview" tall footer={<div className="real-epl-link-footer"><Button ref={reset} haptic={false} onClick={resetExample}><RefreshCw size={17} aria-hidden="true"/>Reset this example</Button><p>Fictional managers · no account linked</p></div>}>
   <div className="real-account-preview-head"><p className="real-play-eyebrow">FICTIONAL MANAGERS · NO CLAIM SENT</p>{about}</div>
   {f.outcome?<div className="real-epl-link-example"><Link size={21} aria-hidden="true"/><p>Illustrative {f.outcome==='linked'?'link result':f.outcome==='uncertain'?'unconfirmed reply':'claim reply'} · nothing attempted</p></div>:null}
   {outcome&&showToast?<Toast className="real-epl-link-toast" text={outcome.text} tone={outcome.tone} duration={null} onDismiss={dismiss} dismissLabel="Dismiss example reply"/>:null}
   {f.busy?<p className="real-epl-link-busy" role="status">Claiming example · fixed busy state · nothing sent</p>:null}
   <ClaimCardView key={revision} id={`${id}-claim`} managers={managers} busy={f.busy} onClaim={claim} onWatch={watch}/>
   {watching?<div className="real-epl-link-watching" role="status"><Eye size={24} aria-hidden="true"/><div><h3>Just watching</h3><p>Read-only sample board · manager card hidden</p></div></div>:null}
   {!managers.length&&!watching&&!outcome?<p className="real-epl-link-example">Example offered list is empty · no claim card</p>:null}
   <section className="real-epl-hero real-epl-link-board" tabIndex={-1} aria-labelledby={`${id}-board`}><div className="real-epl-section-title"><h3 id={`${id}-board`}>Sample draft board</h3><ShieldCheck size={20} aria-hidden="true"/></div><DraftBoard model={model}/><p className="real-epl-meta">Fictional MW10 · {model.me?'linked example':'watch-only example'}<br/>No club or ranking action in this preview</p></section>
   {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  </Sheet>:null}
 </section>;
}
