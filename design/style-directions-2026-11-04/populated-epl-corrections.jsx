import React,{useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,Check,ClipboardCheck,History,LockKeyhole,ShieldCheck,TriangleAlert} from 'lucide-react';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Skeleton} from '../../web/src/next/ui/Skeleton.jsx';
import {fmtFull,fmtNum,fmtSigned} from '../../web/src/next/format.js';
import {EPL_CORRECTION_COPY as COPY,eplCorrectionExample,nextWeekCopy} from './epl-correction-examples.mjs';

function Comparison({label,before,after,change}){
 return <div className="real-epl-comparison"><div className="real-epl-metric-title"><h5>{label}</h5><span className="real-epl-delta" aria-label={`${label} change ${fmtSigned(change)}`}>{fmtSigned(change)}</span></div><div className="real-epl-values"><dl><dt>Original</dt><dd>{fmtNum(before)}</dd></dl><ArrowRight size={18} aria-hidden="true"/><dl><dt>Recheck</dt><dd>{fmtNum(after)}</dd></dl></div></div>;
}
export function EplCorrectionsPreview({scenario='ready'}){
 const fixture=useRef(eplCorrectionExample(scenario)),f=fixture.current,[open,setOpen]=useState(true),[notice,setNotice]=useState(''),root=useRef(null),opener=useRef(null),id=useId();
 useEffect(()=>{if(!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(n=>n.inert=false);screen.style.overflow=overflow;};},[open]);
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 function refresh(){if(f.loading)return;setNotice('Refresh preview only. No account, correction, capture or permission was read. This example stays unchanged; nothing was saved or reordered.');}
 const about=<InfoButton title="About these EPL correction examples" body={[
  COPY.intro,
  'This is the existing read-only Community commissioner tool. The actual parent and server enforce access. This preview reads no permission, account, roster, pick, draft order, correction audit or Sleeper record.',
  'Every person, matchweek, recorded-pick count, capture timestamp and total shown is fictional. The pair of totals compares original capture with recheck, not two different matchweeks. Signed changes describe source differences, not wins, losses or new awards.',
  'The unchanged native fmtFull, fmtNum and fmtSigned formatters preserve Pacific source times, decimals, signed changes and missing values as —. Original and recheck times are separate in Source captures. No interpolated chart or invented trend is added.',
  'Native preservation, no-picks, partial totals, empty, unavailable, failed, denied, first-load and refresh guidance is retained. Missing totals and their deltas stay — rather than becoming zero. A denied fixture contains no review data; unavailable is separate from a successful empty list.',
  'The stale example is explicitly fictional last-loaded content. Its source times stay unchanged. Refreshing keeps supplied reviews visible and disables Refresh; first loading uses the native static Skeleton without sample totals. Neither state automatically completes.',
  'Refresh shows a no-action notice only, without network, status readback, auth, storage, polling or timers. There is no apply, acknowledge, reorder or save control. Existing picks, draft order and native correction behavior remain untouched. New avatars/photos and awards remain held.',
 ]}/>;
 const message=f.denied?COPY.denied:f.failed?f.data?COPY.stale:COPY.failed:f.data?.available===false?COPY.unavailable:f.data?.available&&!f.data.reviews?.length?COPY.empty:null;
 const reviews=!f.denied&&f.data?.available?f.data.reviews??[]:[];
 return <section ref={root} className="real-epl-corrections real-commissioner real-account real-play" aria-label="Fictional EPL stat correction visual review">
  <div className="real-account-summary"><span className="real-commissioner-icon"><ClipboardCheck size={28} aria-hidden="true"/></span><div><h3>EPL stat corrections</h3><p>Read-only example</p></div></div><Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open corrections preview</Button>
  {open?<Sheet title="EPL stat corrections" back={{label:'Commissioner tools',onBack:close}} onClose={close} closeLabel="Close corrections preview" tall footer={<div className="real-epl-correction-footer"><Button variant="primary" haptic={false} disabled={f.loading} onClick={refresh}>{COPY.refresh} · preview</Button><p>Illustrative reviews · no account or source read</p></div>}>
   <div className="real-account-preview-head"><p className="real-play-eyebrow">FICTIONAL TOTALS · READ-ONLY</p>{about}</div>
   <div className="real-epl-correction-intro"><span className="real-commissioner-icon"><ShieldCheck size={26} aria-hidden="true"/></span><p>{COPY.intro}</p></div>
   {f.loading&&!f.data?<Skeleton label={COPY.loading} shape="panels" count={2}/>:f.loading?<p role="status" className="real-epl-refreshing"><History size={20} aria-hidden="true"/>{COPY.refreshing}<small>Fixed example · nothing requested</small></p>:null}
   {message?<div className="real-epl-correction-message" data-problem={f.failed||f.denied} role={f.failed||f.denied?'alert':'status'}>{f.denied?<LockKeyhole size={29} aria-hidden="true"/>:f.failed?<TriangleAlert size={29} aria-hidden="true"/>:<ClipboardCheck size={29} aria-hidden="true"/>}<p>{message}</p>{f.failed&&f.data?<small>Example last-loaded reviews below · no refresh occurred</small>:null}</div>:null}
   {reviews.map(review=><article className="real-epl-review" key={review.week} aria-labelledby={`${id}-mw${review.week}`}>
    <div className="real-epl-review-title"><span className="real-commissioner-icon"><ClipboardCheck size={24} aria-hidden="true"/></span><h3 id={`${id}-mw${review.week}`}>MW{review.week} stat correction needs review</h3></div>
    <p className="real-epl-preserved"><ShieldCheck size={19} aria-hidden="true"/>{nextWeekCopy(review)}</p>
    {!review.totalsComplete?<p role="status" className="real-epl-missing">{COPY.missing}</p>:null}
    {review.changes.map(change=><section className="real-epl-change" key={change.name} aria-label={change.name}><h4>{change.name}</h4><Comparison label="Season points" before={change.before.points} after={change.after.points} change={change.pointsChange}/><Comparison label="Points against" before={change.before.against} after={change.after.against} change={change.againstChange}/></section>)}
    <details className="real-ops-details real-epl-captures"><summary>Source captures</summary><p>Illustrative Sleeper capture times</p><dl><div><dt>Original capture</dt><dd>{fmtFull(review.original?.capturedAt)}</dd></div><div><dt>Recheck</dt><dd>{fmtFull(review.corrected?.capturedAt)}</dd></div></dl></details>
   </article>)}
   {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  </Sheet>:null}
 </section>;
}
