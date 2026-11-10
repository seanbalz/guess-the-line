// Preview-only tracked receipt + isolated native entry form. No account reader, writer or settlement action.
import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,ReceiptText,Ticket} from 'lucide-react';
import {TrackedBetRow} from '../../web/src/next/bets/TrackedBetRow.jsx';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {BetEditor} from './isolated-bet-editor.jsx';
import {applySocialMutation,emptySocialState,socialView} from '../../shared/social-bets.mjs';
import {unitText} from '../../web/src/trackedBetTerms.js';
export function BetsPreview({model,initialView,onSelection}){
 const [view,setView]=useState(initialView),[state,setState]=useState('settled'),[editing,setEditing]=useState(initialView==='tracking'),[captured,setCaptured]=useState(null),[unitCash,setUnitCash]=useState(null),[editorError,setEditorError]=useState('');
 const root=useRef(null);
 const sample=state==='settled'?model.receipt:model.draft;
 const entry=captured??sample;
 useEffect(()=>{onSelection?.({name:view==='tracking'?'Track a bet':'Ticket details'});},[view,onSelection]);
 useEffect(()=>{if(view==='ticket')root.current?.querySelector('.gx-tracked-preview')?.click();},[view,state,captured]);
 function openEditor(){setEditorError('');setView('tracking');setEditing(true);}
 function closeEditor(){setEditing(false);setView('ticket');}
 function preview(body){
  try{const now=Date.now(),local=applySocialMutation(emptySocialState(),{actorId:'demo-viewer',action:'create',body:{...body,requestId:crypto.randomUUID()},games:model.games,now});
   const result=socialView(local,{actorId:'demo-viewer',games:model.games,now}).entries[0];
   // Use native validation/normalization/accounting; generated recording metadata is not a real save.
   setCaptured({...result,recordedAt:null,updatedAt:null,audit:[],lateEntry:false});setEditing(false);setView('ticket');
  }catch(error){setEditorError(error.message);}return false;
 }
 return <section className="real-bets real-play" ref={root} aria-label="Tracked ticket visual review">
  <div className="real-bets-head"><div><p className="real-play-eyebrow">FICTIONAL RECEIPT · WEEK 8</p><h3>{view==='tracking'?'Record your ticket':'Your tracked ticket'}</h3></div><InfoButton title="About these ticket examples" body={[model.notice,'The two selection lines are the reviewed public historical closing references. They are not anyone’s actual placed terms or a current sportsbook quote. The sample 0.5U stake and 1.25U reported return preserve a +0.75U layout illustration.','Personal ticket prices, books and observed/placed times cannot be inferred from NFL research. These stay unknown until entered. Unknown prices are never replaced with −110.','The form reuses the native editor body and controls. Its ordinary save label is marked Preview, and its callback only builds a local display. No account, money, record, qualification, result or preference is changed.','The existing player-prop manual entry remains available. Player suggestions and further prop, correction, tail and settlement flows are outside this supplied review.']} links={[{text:'Historical references · nflverse · CC BY 4.0',url:model.source.release}]}/></div>
  {captured?<div className="real-bets-local" role="status"><Check size={18} aria-hidden="true"/><span>Preview built · nothing saved<small>Your entered values exist in this preview only.</small></span></div>:null}
  {!captured&&view==='ticket'?<Segmented label="Sample ticket state" options={[{value:'settled',label:'Settled receipt'},{value:'open',label:'Open ticket'}]} value={state} onChange={setState}/>:null}
  {view==='ticket'?<>
   <TrackedBetRow key={`${state}:${captured?'local':'sample'}`} entry={entry} games={model.games} unitCash={unitCash}>
    <div className="real-bets-receipt-details"><div className="real-bets-detail-title"><ReceiptText size={20} aria-hidden="true"/><h4>Receipt context</h4></div>
     <dl><div><dt>Price</dt><dd>{entry.odds==null?'Not entered':`${entry.odds>0?'+':'−'}${Math.abs(entry.odds)}`}</dd></div><div><dt>Source</dt><dd>{entry.source||'Not entered'}</dd></div><div><dt>Quote observed</dt><dd>{entry.quotedAt||'Not entered'}</dd></div><div><dt>Bet placed</dt><dd>{entry.placedAt||'Not entered'}</dd></div>{entry.actualReturnUnits!=null?<div><dt>Reported full return</dt><dd>{unitText(entry.actualReturnUnits)} · includes stake</dd></div>:null}<div><dt>Records</dt><dd>{entry.countsForRecord?'Included in sample':'Excluded in sample'}</dd></div></dl>
     <p>{captured?'Local preview, not a saved receipt.':'Fictional receipt · sample amounts, no recorded account history.'}</p><p>Quoted prices and times come from your actual ticket.</p>
     {entry.notes?<p className="real-bets-notes">{entry.notes}</p>:null}
    </div>
   </TrackedBetRow>
   <Button variant="primary" haptic={false} onClick={openEditor}>Try the entry form<ArrowRight size={17} aria-hidden="true"/></Button>
   {captured?<Button haptic={false} onClick={()=>{setCaptured(null);setState('settled');}}>Return to sample receipt</Button>:null}
  </>:<div className="real-bets-entry-card"><Ticket size={32} aria-hidden="true"/><h3>Keep the terms on your receipt</h3><p>Record a bet placed elsewhere. Nothing here places a wager or moves money.</p><Button variant="primary" haptic={false} onClick={()=>setEditing(true)}>Open sample entry form</Button><button type="button" className="real-bets-back" onClick={()=>setView('ticket')}><ArrowLeft size={16} aria-hidden="true"/>Back to sample receipt</button></div>}
  <p className="real-bets-source">Historical selection references · fictional receipt<br/>Personal prices and times are never assumed · no saves</p>
  {editing?<BetEditor unitCash={unitCash} onUnitCash={setUnitCash} entry={captured??model.draft} action="create" games={model.games} season={2026} week={8} busy={false} error={editorError} onSave={preview} onClose={closeEditor}/>:null}
 </section>;
}
