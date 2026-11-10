import React,{useEffect,useRef,useState} from 'react';
import {Check,History,ReceiptText} from 'lucide-react';
import {TrackedBetRow} from '../../web/src/next/bets/TrackedBetRow.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {unitText} from '../../web/src/trackedBetTerms.js';
import {BetEditor} from './isolated-bet-editor.jsx';
import {ResultEditor} from './isolated-result-editor.jsx';
import {initialChangeFixture,changeTicket,changeView} from './bets-change-fixtures.mjs';
const CHANGE_FIELDS={odds:'American odds',stakeUnits:'Stake units',actualReturnUnits:'Full return units',outcome:'Outcome',source:'Source',countsForRecord:'Included in records',notes:'Note',quotedAt:'Quote observed',placedAt:'Bet placed'};
function FullExampleChange({event}){const fields=Object.keys(CHANGE_FIELDS).filter(key=>event.before[key]!==event.after[key]),legs=JSON.stringify(event.before.legs)!==JSON.stringify(event.after.legs),text=value=>value===null||value===undefined||value===''?'Not entered':typeof value==='boolean'?value?'Yes':'No':String(value);return <details className="real-change-audit-more"><summary>Review full example change</summary><dl>{fields.map(key=><div key={key}><dt>{CHANGE_FIELDS[key]}</dt><dd><span>Before: {text(event.before[key])}</span><span>After: {text(event.after[key])}</span></dd></div>)}{legs?<div><dt>Selections</dt><dd><span>Before: {event.before.legs.map(l=>l.selection).join(' · ')}</span><span>After: {event.after.legs.map(l=>l.selection).join(' · ')}</span></dd></div>:null}</dl></details>;}
export function BetsChangesPreview({model,initialAction='settle'}){
 const [state,setState]=useState(()=>initialChangeFixture(model)),[editor,setEditor]=useState(initialAction),[error,setError]=useState(''),[notice,setNotice]=useState('');const root=useRef(null),entry=changeView(state,model);
 useEffect(()=>{if(!editor)root.current?.querySelector('.gx-tracked-preview')?.click();},[editor,state]);
 function preview(action,body){try{setState(changeTicket(state,model,action,body,crypto.randomUUID()));setEditor(null);setError('');setNotice(action==='settle'?'Result preview updated · nothing saved':'Correction preview updated · nothing saved');}catch(failure){setError(failure.message);}return false;}
 function open(action){setError('');setEditor(action);}
 function reset(){setState(initialChangeFixture(model));setNotice('');setError('');}
 const labels={pending:'Open',win:'Won',loss:'Lost',push:'Push',void:'Void'};
 return <section className="real-bets-changes real-bets real-play" ref={root} aria-label="Fictional ticket changes">
  <header className="real-bets-head"><div><p className="real-play-eyebrow">FICTIONAL TICKET</p><h3>Your ticket, with a history</h3></div><InfoButton title="About these ticket change examples" body={[
   'This is a fictional open ticket with a sample 0.5U stake. The selection reuses the reviewed public historical closing reference; no sportsbook price, observed quote time, placement time or saved account is supplied.',
   'The native correction and result forms are isolated from account/API controllers. Their preview callbacks use the native pure mutation, revision, reason and accounting rules in memory only.',
   'Results are player reported, not verified by a sportsbook or automated final feed. The total return includes the returned stake. For example, 1.25U returned on 0.5U risk gives +0.75U net.',
   'Only an open tracked ticket can have its terms corrected. A settled ticket retains its terms; its reported result can be revised separately or returned to pending. Each example change preserves its previous version and reason.',
   'Internal test seed and generated recording metadata is omitted from the visual history. A preview is never a real save or an account verification. New avatars/photos and awards remain held.',
  ]} links={[{text:'Historical selection reference · nflverse · CC BY 4.0',url:model.source.release}]}/></header>
  {notice?<p className="real-bets-local" role="status"><Check size={18} aria-hidden="true"/><span>{notice}<small>Example memory only · your account is unchanged.</small></span></p>:null}
  <TrackedBetRow key={entry.revision} entry={entry} games={model.games}>
   <div className="real-change-context"><ReceiptText size={22} aria-hidden="true"/><h4>Example receipt context</h4><p>Sample stake · historical selection reference · no saved price or times.</p><p>Current example revision {entry.revision}</p></div>
  </TrackedBetRow>
  <div className="real-change-actions"><Button variant="primary" haptic={false} onClick={()=>open('settle')}>Report result preview</Button><Button haptic={false} disabled={entry.outcome!=='pending'} onClick={()=>open('correct')}>Correct ticket preview</Button></div>
  {entry.outcome!=='pending'?<p className="real-change-state">Settled terms stay fixed. Revise the reported result separately.</p>:null}
  <section className="real-change-history" aria-label="Example change history"><h3><History size={21} aria-hidden="true"/>Example history</h3><ol>{state.audit.map((event,index)=><li key={event.id}><span className="real-change-history-step">{index+1}</span><div><strong>{event.action==='create'?'Original example ticket':event.action==='correct'?'Ticket correction':'Reported result'}</strong><p>{event.reason||'Open · 0.5U sample stake'}</p>{event.before?<dl><div><dt>Before</dt><dd>{labels[event.before.outcome]} · {unitText(event.before.stakeUnits)} risk{event.before.actualReturnUnits!=null?` · ${unitText(event.before.actualReturnUnits)} returned`:''}</dd></div><div><dt>After</dt><dd>{labels[event.after.outcome]} · {unitText(event.after.stakeUnits)} risk{event.after.actualReturnUnits!=null?` · ${unitText(event.after.actualReturnUnits)} returned`:''}</dd></div></dl>:null}{event.before?<FullExampleChange event={event}/>:null}</div></li>)}</ol></section>
  <Button haptic={false} onClick={reset}>Reset example ticket</Button><p className="real-bets-source">Fictional receipt · no account changes or result reports sent</p>
  {editor==='correct'?<BetEditor entry={entry} action="correct" games={model.games} season={entry.season} week={entry.week} busy={false} error={error} onSave={body=>preview('correct',body)} onClose={()=>setEditor(null)}/>:editor==='settle'?<ResultEditor entry={entry} busy={false} error={error} onSave={body=>preview('settle',body)} onClose={()=>setEditor(null)}/>:null}
 </section>;
}
