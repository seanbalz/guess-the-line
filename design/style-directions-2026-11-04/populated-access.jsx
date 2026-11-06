import React,{useEffect,useId,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,LockKeyhole,LogIn,MailCheck,ShieldCheck} from 'lucide-react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {Avatar} from '../../web/src/next/ui/Avatar.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {profileDraft,MAX_NAME} from './account-profile-rules.mjs';
import {NAME_STEP_COPY,EXAMPLE_EMAIL,EXAMPLE_PASSWORD} from './access-example-copy.mjs';
export function AccessPreview({initialView='signin',theme='dark'}){
 const [view,setView]=useState(initialView),[name,setName]=useState('Alex Lane'),[notice,setNotice]=useState(''),[problem,setProblem]=useState('');const id=useId(),heading=useRef(null),input=useRef(null),root=useRef(null),first=useRef(true),draft=profileDraft(name),creating=view==='signup';
 useEffect(()=>{if(first.current){first.current=false;return;}heading.current?.focus({preventScroll:true});root.current?.closest('.screen')?.scrollTo({top:0});},[view]);
 function go(next){setView(next);setNotice('');setProblem('');}
 function preview(event){event.preventDefault();if(creating)go('confirmation');else setNotice('Sign-in example previewed. No account was accessed.');}
 function previewName(event){event.preventDefault();if(!draft.valid){setProblem(NAME_STEP_COPY.empty);input.current?.focus();return;}setName(draft.clean);setProblem('');setNotice('Name example previewed. Nothing was saved to an account.');}
 const about=<InfoButton title="About these account access examples" body={[
  'This is the selected glass treatment for the existing AuthGate and NameStep flow, using fictional alex@example.com and a fixed example password. Email/password fields are read-only; do not enter real credentials here.',
  'The actual AuthGate offers Google and email sign-in/account creation. These preview controls never start OAuth, sign in, register an account, send/resend mail, confirm an email, sign out or navigate to a provider. No provider configuration or connection is asserted.',
  'Email account creation may require confirmation. Its native notice is preserved. View first-name example is an explicit storyboard step, not a confirmation or an access bypass. Existing returning players with saved names skip first-name setup in the actual app.',
  'The native static NAME_STEP_COPY is isolated without importing NameStep, AppData or tab draft storage. The existing trimmed 1-to-60-character name rule is reused. Name input and the initials avatar change example memory only.',
  'The general public app link is selected; it carries no private-league token. No saved private-invitation notice or granted membership is fabricated. Private-league invitation acceptance remains a separate flow.',
  'Privacy and Terms are the existing public destinations, opened separately. This review does not change authentication rules, Google/email configuration, verification, scoring, storage, app installation, avatars/photos or awards. Account recovery and unseen errors remain separate review work.',
 ]}/>;
 const title=view==='name'?NAME_STEP_COPY.title:view==='confirmation'?'Check your email.':creating?'Start your next rivalry.':'Your games. Any device.';
 return <section className="real-access real-account real-play" ref={root} aria-label="Fictional account access visual review">
  <header className="real-access-brand"><img src={theme==='light'?'logo-hybrid/light-deep-green.svg':'logo-hybrid/lime.svg'} alt="Guess the Line G"/><strong>Guess the Line</strong><span>ACCOUNT ACCESS · PREVIEW</span></header>
  <div className="real-access-panel">
   <div className="real-access-heading-icon">{view==='name'?<Avatar id="demo-member-0" name={name} size={80}/>:<span>{view==='confirmation'?<MailCheck size={30} aria-hidden="true"/>:<LockKeyhole size={27} aria-hidden="true"/>}</span>}{about}</div>
   <h2 ref={heading} tabIndex={-1}>{title}</h2>
   {view==='signin'||creating?<>
    <p className="real-access-pitch">Guess every NFL game’s spread and total each week. Closest to the number scores. No real-money wagers.</p>
    <Segmented label="Account access example" options={[{value:'signin',label:'Sign in'},{value:'signup',label:'Create account'}]} value={view} onChange={go}/>
    <Button haptic={false} onClick={()=>setNotice('Google sign-in example only. No provider was opened.')}><LogIn size={19} aria-hidden="true"/>Preview Google sign-in</Button>
    <p className="real-access-divider">or use email</p>
    <form className="real-access-form" onSubmit={preview}><label htmlFor={id+'-email'}>Email</label><input id={id+'-email'} type="email" autoComplete="off" readOnly value={EXAMPLE_EMAIL}/><label htmlFor={id+'-password'}>Password</label><input id={id+'-password'} type="password" autoComplete="off" readOnly value={EXAMPLE_PASSWORD}/><p className="real-access-field-note">Read-only example details</p>{creating?<p className="real-access-copy">Use at least 8 characters. Account creation may send a confirmation email. Invitations give access only to the game you accept.</p>:null}<Button type="submit" variant="primary" haptic={false}>{creating?'Preview account creation':'Preview sign in'}<ArrowRight size={18} aria-hidden="true"/></Button></form>
    <p className="real-access-account-note"><ShieldCheck size={16} aria-hidden="true"/><span>Use the same game account on every device. Each player uses their own account.</span></p>
   </>:view==='confirmation'?<>
    <p className="real-access-copy">Check your email for a confirmation link, then return here to sign in. You can create your own game or accept an invitation after confirming your account.</p>
    <article className="real-access-mail-card"><span><MailCheck size={27} aria-hidden="true"/></span><strong>{EXAMPLE_EMAIL}</strong><p>Example address · no email sent</p></article>
    <Button variant="primary" haptic={false} onClick={()=>go('signin')}>Return to sign-in example</Button><Button haptic={false} onClick={()=>setNotice('Resend layout previewed. No email sent; live cooldown rules are unchanged.')}>Preview resend layout</Button><div className="real-access-next"><p>Next storyboard step · after account confirmation</p><Button haptic={false} onClick={()=>go('name')}>View first-name example<ArrowRight size={18} aria-hidden="true"/></Button></div>
   </>:<>
    <p className="real-access-copy">{NAME_STEP_COPY.help}</p><form className="real-access-form" onSubmit={previewName} noValidate><label htmlFor={id+'-name'}>{NAME_STEP_COPY.label}</label><input ref={input} id={id+'-name'} autoComplete="off" maxLength={MAX_NAME} value={name} aria-describedby={id+'-name-help'} aria-invalid={problem?true:undefined} onChange={e=>{setName(e.target.value);setNotice('');setProblem('');}}/><p className="real-access-field-note" id={id+'-name-help'}>Fictional name · example memory only</p>{problem?<p className="real-access-problem" role="alert">{problem}</p>:null}<Button type="submit" variant="primary" haptic={false}>Preview {NAME_STEP_COPY.continue.toLowerCase()}<ArrowRight size={18} aria-hidden="true"/></Button></form><div className="real-access-name-note"><ShieldCheck size={21} aria-hidden="true"/><p>Your display name appears across your leagues.</p></div><Button haptic={false} onClick={()=>go('signin')}><ArrowLeft size={17} aria-hidden="true"/>Back to sign-in example</Button>
   </>}
   {notice?<p className="real-access-notice" role="status"><Check size={16} aria-hidden="true"/>{notice}</p>:null}
   <nav className="real-access-legal" aria-label="Account access legal pages"><a href="https://guess-the-line.pages.dev/privacy" target="_blank" rel="noreferrer">Privacy</a><a href="https://guess-the-line.pages.dev/terms" target="_blank" rel="noreferrer">Terms</a></nav>
  </div><p className="real-access-footer">Fictional example · no sign-in, account creation or email</p>
 </section>;
}
