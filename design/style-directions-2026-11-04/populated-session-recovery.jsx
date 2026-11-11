import React,{useId,useRef,useState} from 'react';
import {Check,LockKeyhole,ShieldCheck} from 'lucide-react';
import {Dialog} from '../../web/src/next/ui/Dialog.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Avatar} from '../../web/src/next/ui/Avatar.jsx';
import {SIGN_IN_AGAIN_COPY as SESSION} from './session-example-copy.mjs';
import {NAME_STEP_COPY as NAME,EXAMPLE_EMAIL,EXAMPLE_PASSWORD} from './access-example-copy.mjs';
import {MAX_NAME,profileDraft} from './account-profile-rules.mjs';
export function SessionRecoveryPreview({scenario='standard'}){
 const [open,setOpen]=useState(true),[draft,setDraft]=useState('Alex Rivera'),[notice,setNotice]=useState('');const id=useId(),opener=useRef(null),googleOnly=scenario==='google',failed=scenario==='failed';
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 const about=<InfoButton title="About these session examples" body={[
  'This is the existing same-account Sign in again prompt for a 401, with native Dialog and native static copy, in the selected glass system. The account, password and underlying draft name are fictional. No session has expired or been accessed here.',
  'Password and Google controls follow explicit example method capabilities. Password is read-only; Google-only omits the password form. No provider configuration or method availability for your actual account is asserted.',
  'Not now and Escape dismiss only this example dialog. The underlying typed draft stays in component memory. Actual sign-out/account switching has different draft-clearing rules; it is never called here.',
  'Preview sign in and Google only show a no-action notice. There is no auth request, OAuth redirect, sign-out, refresh, write replay, password read, storage operation or account change. The failed-password copy is an explicit fictional fallback, not a real rejection.',
  'Real same-account reauthentication, tab-draft persistence, provider redirects and returning from Google remain separate acceptance. No new avatar/photo, award or notification design is introduced.',
 ]}/>;
 return <section className="real-session real-account real-play" aria-label="Fictional session recovery visual review">
  <div className="real-session-example"><span className="real-session-icon"><LockKeyhole size={28} aria-hidden="true"/></span><h2>Example unsaved name</h2><label htmlFor={id+'-draft'}>Example draft name</label><input id={id+'-draft'} value={draft} maxLength={MAX_NAME} autoComplete="off" onChange={event=>setDraft(event.target.value)}/><p>Component memory only · fictional draft</p><Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open sign-in-again example</Button></div>
  <Dialog open={open} title={SESSION.title} text={SESSION.text} onClose={close} className="real-session-dialog">
   <div className="real-session-head"><span>EXAMPLE SESSION · NOTHING SENT</span>{/* React bubbles dialog cancel/close synthetically; keep nested information local. */}<div onCancel={event=>event.stopPropagation()} onClose={event=>event.stopPropagation()}>{about}</div></div><p className="real-session-account">{SESSION.account(EXAMPLE_EMAIL)}</p>
   {!googleOnly?<form className="real-session-form" onSubmit={event=>{event.preventDefault();setNotice('Sign-in preview only. No account was accessed and no draft was replayed.');}}><label htmlFor={id+'-password'}>{SESSION.password}</label><input id={id+'-password'} type="password" readOnly autoComplete="off" value={EXAMPLE_PASSWORD} aria-invalid={failed?true:undefined}/><small>Read-only example password</small><Button variant="primary" type="submit" haptic={false}>Preview {SESSION.signIn.toLowerCase()}</Button></form>:null}
   <Button variant={googleOnly?'primary':'secondary'} haptic={false} onClick={()=>setNotice('Google preview only. No provider opened and the example draft is unchanged.')}>Preview Google sign-in</Button>
   {failed?<div className="real-session-error" role="alert"><strong>Example: sign-in failed</strong><p>{SESSION.failed}</p></div>:null}
   {notice?<p className="real-session-notice" role="status">{notice}</p>:null}<Button variant="ghost-2" haptic={false} onClick={close}>{SESSION.later}</Button><p className="real-session-footer">Fictional example · no session or storage changes</p>
  </Dialog>
 </section>;
}
export function NameRecoveryPreview({theme='dark',scenario='uncertain'}){
 const [draft,setDraft]=useState('Alex Rivera'),[notice,setNotice]=useState(''),[problem,setProblem]=useState(scenario==='uncertain'?{kind:'uncertain',message:NAME.uncertain}:scenario==='offline'?{kind:'offline',message:NAME.offline}:scenario==='sign-in'?{kind:'signIn',message:NAME.signIn}:null);const id=useId(),input=useRef(null),value=profileDraft(draft),invited=scenario==='invited';
 function preview(event){event.preventDefault();if(!value.valid){setProblem({kind:'empty',message:NAME.empty});input.current?.focus();return;}setNotice('Name-save preview only. Your example draft is kept; no save was attempted.');}
 const about=<InfoButton title="About these name recovery examples" body={[
  'These are existing first-name setup recovery layouts, using all native NAME_STEP_COPY words and the reviewed name bound/initials treatment. Alex Rivera is a fictional draft, held only in this component. No actual profile, draft or invitation is read.',
  'An uncertain save offers Check if it saved. The actual check reads lobby only, never resubmits; if the name landed, the real app moves on. Here the explicit example check keeps the draft and shows the native still-not-saved wording without any read, automatic retry or success claim.',
  'Offline and sign-in-required examples retain typed text. Continue is an explicit preview only; no save, auth, refresh or write replay occurs. Actual persistence across reload/provider redirects is not established by this in-memory example.',
  'The private-invited example uses only a fictional presence flag to show the native invite notice. It has no recipient, URL, token or permission grant and is separate from the selected public app link.',
  'The actual Sign out clears account-scoped drafts through AuthGate. This preview button never calls sign-out or clears anything, and it does not change that production rule. New avatars/photos and awards remain held.',
 ]}/>;
 return <section className="real-name-recovery real-access real-account real-play" aria-label="Fictional name recovery visual review">
  <header className="real-access-brand"><img src={theme==='light'?'logo-hybrid/light-deep-green.svg':'logo-hybrid/lime.svg'} alt="Guess the Line G"/><strong>Guess the Line</strong><span>NAME RECOVERY · EXAMPLE</span></header>
  <div className="real-access-panel"><div className="real-access-heading-icon"><Avatar id="demo-member-0" name={draft} size={80}/>{about}</div><h2>{NAME.title}</h2><p className="real-access-copy">{NAME.help}</p>
   {invited?<div className="real-name-invite"><ShieldCheck size={23} aria-hidden="true"/><div><strong>Private invitation · example</strong><p>{NAME.invite}</p></div></div>:null}
   <form className="real-access-form" onSubmit={preview} noValidate><label htmlFor={id+'-name'}>{NAME.label}</label><input ref={input} id={id+'-name'} autoComplete="off" maxLength={MAX_NAME} value={draft} aria-describedby={id+'-help'} aria-invalid={problem?.kind==='empty'?true:undefined} onChange={event=>{setDraft(event.target.value);setNotice('');if(problem?.kind==='empty')setProblem(null);}}/><p className="real-access-field-note" id={id+'-help'}>Fictional draft · kept in example memory</p>
    {problem?<div className="real-name-recovery-problem" role="alert"><strong>Example: {problem.kind==='uncertain'?'save needs checking':problem.kind==='offline'?'offline':problem.kind==='signIn'?'sign-in required':'name needed'}</strong><p>{problem.message}</p></div>:null}
    <Button variant="primary" type="submit" haptic={false}>Preview {NAME.continue.toLowerCase()}</Button>
    {problem?.kind==='uncertain'?<Button haptic={false} onClick={()=>{setProblem({kind:'uncertain',message:NAME.stillNotSaved});setNotice('Example check only. No account was refreshed and no name was resubmitted.');}}>{NAME.check}</Button>:null}
   </form><Button variant="ghost-2" haptic={false} onClick={()=>setNotice('Sign-out preview only. No session or draft was cleared.')}>{NAME.signOut} · preview</Button>
   {notice?<p className="real-access-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  </div><p className="real-access-footer">Fictional recovery · no account, draft-store or invite changes</p>
 </section>;
}
