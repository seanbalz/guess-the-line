// Account visual review only: fictional identity and device scenarios; no auth, push store, permissions or persistence.
import React,{useEffect,useId,useRef,useState} from 'react';
import {BellOff,BellRing,Check,LockKeyhole,Monitor,Smartphone} from 'lucide-react';
import {Avatar} from '../../web/src/next/ui/Avatar.jsx';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Switch} from '../../web/src/next/ui/Switch.jsx';
import {profileName} from '../../web/src/next/data/account.js';
import {MAX_NAME,profileDraft} from './account-profile-rules.mjs';
import {REMINDER_COPY,reminderSwitch} from './isolated-reminder-view.mjs';
const DEFAULT_NAME=profileName({profile:{displayName:'Alex Lane'}});
const EMAIL='alex@example.com';
const DEVICE={
 off:{env:'supported',phase:'off',permission:'Not requested',delivery:'Off'},
 on:{env:'supported',phase:'on',permission:'Allowed',delivery:'On for this example device'},
 blocked:{env:'denied',phase:'off',permission:'Blocked',delivery:'Unavailable until allowed'},
 install:{env:'needs-install',phase:'off',permission:'Not requested',delivery:'Home Screen app needed'},
 unsupported:{env:'unsupported',phase:'off',permission:'Unavailable',delivery:'Unsupported in this browser'},
 unconfigured:{env:'supported',phase:'off',permission:'Not requested',delivery:'Service not configured'},
};
export function AccountPreview({initialView,scenario='off',profileScenario='edit'}){
 const [open,setOpen]=useState(true),[name,setName]=useState(profileScenario==='conflict'?'Alex River':DEFAULT_NAME),[draft,setDraft]=useState(profileScenario==='edit'?DEFAULT_NAME:'Alex Rivera'),[pending,setPending]=useState(profileScenario==='pending'),[problem,setProblem]=useState(profileScenario==='conflict'?'Example: the saved name changed to Alex River. Your draft is kept. Review it before previewing again.':''),[notice,setNotice]=useState(''),[device,setDevice]=useState(scenario),[deviceMessage,setDeviceMessage]=useState(''),[permission,setPermission]=useState(DEVICE[scenario]?.permission??DEVICE.off.permission);
 const root=useRef(null),input=useRef(null),opener=useRef(null),formId=useId(),helpId=useId(),errorId=useId();
 const profile=initialView==='profile',draftView=profileDraft(draft),dirty=draft!==name;
 const state=DEVICE[device]??DEVICE.off,view=reminderSwitch(state),configured=device!=='unconfigured';
 useEffect(()=>{
  if(!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];
  for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const s of branch.parentElement?.children??[]){if(s!==branch&&!s.inert){s.inert=true;changed.push(s);}}}
  const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(s=>s.inert=false);screen.style.overflow=overflow;};
 },[open]);
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 function previewName(event){event.preventDefault();if(pending)return;
  if(!draftView.valid){setProblem('Enter a display name between 1 and 60 characters.');input.current?.focus();return;}
  setName(draftView.clean);setDraft(draftView.clean);setProblem('');setNotice('Name preview updated. Nothing was saved to an account.');
 }
 function checkExample(event){event.preventDefault();setPending(false);setNotice('Example check: that name is not saved. Your draft is kept for review.');}
 const about=<InfoButton title={profile?'About this profile preview':'About these reminder examples'} body={profile?[
  'Alex Lane and alex@example.com are fictional examples. No signed-in account, email, credential or saved profile is read.',
  'The existing display-name validation is retained: trim whitespace, 1 to 60 characters, no control characters. The native initials avatar is unchanged; there are no new picture options.',
  'Conflict and needs-checking are explicit example layouts, not incidents affecting your account. A status check never automatically replays a save.',
  'Typing and Preview name affect memory only. Actual account refresh, overwrite checks, recovery and saving still belong to the production controller, which is not imported here.',
 ]:[
  'These are explicit fictional device scenarios, not observations of your phone or the hosted notification service.',
  'The native reminder copy/status/switch helpers are isolated without their push store. Switching this preview never asks permission, registers a service worker, subscribes, unsubscribes or sends a notification.',
  'The live control is available only when the server reports push support. This device-only opt-in retains the existing two-hours-before-due reminder rule and keeps picks and lines out of the notification.',
  'On, Off, blocked, Home Screen setup, unsupported and service-unavailable examples are selected in the outer review toolbar. No new prompt, award, avatar or notification delivery feature is added.',
 ]}/>;
 return <section className="real-account real-play" ref={root} aria-label="Fictional account visual review">
  <div className="real-account-summary"><Avatar id="demo-member-0" name={name} size={56}/><div><h3>{name}</h3><p>Example account</p></div></div>
  <Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open {profile?'profile':'pick reminders'} preview</Button>
  <p className="real-account-source">Fictional identity and device states · no account changes</p>
  {open?<Sheet title={profile?'Profile':REMINDER_COPY.title} closeLabel={profile?'Close profile preview':'Close reminder preview'} onClose={close} footer={profile?<div className="real-account-profile-footer">{pending?<Button variant="primary" haptic={false} onClick={checkExample}>Preview status check</Button>:<Button type="submit" form={formId} variant="primary" haptic={false} disabled={!dirty}>Preview name</Button>}<p>Preview only · nothing is saved to an account</p></div>:<p className="real-account-device-footer">{REMINDER_COPY.device}<small>Example states · permissions and subscriptions unchanged</small></p>}>
   <div className="real-account-preview-head"><p className="real-play-eyebrow">{profile?'FICTIONAL ACCOUNT':'EXAMPLE DEVICE STATE'}</p>{about}</div>
   {profile?<>
    <div className="real-account-identity"><Avatar id="demo-member-0" name={name} size={56}/><div><strong>{name}</strong><span>{EMAIL}</span></div></div>
    <form className="real-account-form" id={formId} onSubmit={previewName} noValidate><label htmlFor={formId+'-name'}>Display name</label><input ref={input} id={formId+'-name'} autoComplete="nickname" maxLength={MAX_NAME} value={draft} readOnly={pending} aria-describedby={`${helpId} ${errorId}`} aria-invalid={problem&&!draftView.valid?true:undefined} onChange={e=>{setDraft(e.target.value);setProblem('');setNotice('');}}/><p id={helpId}>Friends see this name across your leagues. Up to 60 characters.</p>{dirty?<div className="real-account-draft-note"><span></span><p>Unsaved example draft · kept while this preview stays open.</p></div>:null}<div id={errorId} role="alert">{problem?<p className="real-account-problem">{problem}</p>:null}</div>{pending?<p className="real-account-problem">Example: a save needs checking. No request will be sent again automatically.</p>:null}{notice?<p className="real-account-notice" role="status"><Check size={16} aria-hidden="true"/>{notice}</p>:null}</form>
   </>:<>
    <div className="real-account-reminder-hero"><span className="real-account-bell">{device==='on'?<BellRing size={30} aria-hidden="true"/>:device==='blocked'?<LockKeyhole size={30} aria-hidden="true"/>:device==='unsupported'?<Monitor size={30} aria-hidden="true"/>:<BellOff size={30} aria-hidden="true"/>}</span><div><strong>2h</strong><span>before picks are due</span></div><div className="real-account-mode-labels"><span>Spread</span><span>Total</span><span>Points</span></div></div>
    {configured?<div className="real-account-switch-card"><Switch label={REMINDER_COPY.title} sub={view.sub} checked={view.checked} disabled={view.disabled} data-reminders={view.status} onChange={on=>{setDevice(on?'on':'off');if(on)setPermission('Allowed');setDeviceMessage(`Example switched ${on?'on':'off'}. No permission or subscription changed.`);}}/></div>:<div className="real-account-switch-card"><strong>Example: service unavailable</strong><p>Pick reminders are not available yet.</p></div>}
    <dl className="real-account-device-facts"><div><dt><Smartphone size={15} aria-hidden="true"/>Device example</dt><dd>{device==='install'?'Safari tab':device==='unsupported'?'Unsupported browser':'Home Screen app'}</dd></div><div><dt>Notification permission</dt><dd>{permission}</dd></div><div><dt>Reminder delivery</dt><dd>{state.delivery}</dd></div></dl>
    {deviceMessage?<p className="real-account-notice" role="status">{deviceMessage}</p>:null}
   </>}
  </Sheet>:null}
 </section>;
}
