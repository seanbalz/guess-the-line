import React,{useEffect,useId,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Check,Copy,Link2,Mail,MessageCircle,Settings,Share2,ShieldCheck,UserRound,Users} from 'lucide-react';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Row} from '../../web/src/next/ui/Row.jsx';
import {List} from '../../web/src/next/ui/List.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {appInvitePayload} from './app-invite-example.mjs';
export function AppInvitePreview({initialView='invite',theme='dark'}){
 const [open,setOpen]=useState(true),[view,setView]=useState(initialView),[notice,setNotice]=useState('');const root=useRef(null),opener=useRef(null),link=useRef(null),id=useId(),payload=appInvitePayload();
 useEffect(()=>{if(!open)return;const layer=root.current.querySelector('.gx-layer--sheet'),phone=root.current.closest('.phone'),changed=[];for(let branch=layer;branch&&branch!==phone;branch=branch.parentElement){for(const sibling of branch.parentElement?.children??[]){if(sibling!==branch&&!sibling.inert){sibling.inert=true;changed.push(sibling);}}}const screen=root.current.closest('.screen'),overflow=screen.style.overflow;screen.style.overflow='hidden';return()=>{changed.forEach(n=>n.inert=false);screen.style.overflow=overflow;};},[open]);
 function go(next){setView(next);setNotice('');root.current?.querySelector('.gx-sheet-body')?.scrollTo({top:0});}
 function close(){setOpen(false);requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));}
 function selectLink(){link.current?.focus();link.current?.select();setNotice('Example link selected. Nothing was copied or sent.');}
 const title=view==='account'?'Account':view==='share'?'Share app link':view==='fallback'?'Copy app link':'Invite friends';
 const about=<InfoButton title="About this app invite proposal" body={[
  'Sean selected a shareable public link and approved the supplied app invite direction in both themes. This remains a mockup; native sharing and live/device acceptance are separate.',
  'Account offers Invite friends to any player. No host role or private league is required. The public root opens the existing sign-in/create-account flow; no new authentication route or access grant is claimed.',
  'The share payload contains the app title, generic invitation text and the public root only. No player identity, email, league ID, invite token, picks, odds, account metadata or referral tracking is included.',
  'Production should use the device share menu on a deliberate tap, with copy/manual selection available when sharing is unavailable. Dismissing a share menu does not establish a send. The OS controls its own destinations and appearance.',
  'The share card here is an app-owned explanation, not a fabricated iOS menu. Preview controls never call navigator.share, clipboard, email, SMS, authentication, storage or network writers. Text selection is the only browser effect.',
  'Sharing the public app link gives no private-league membership. Existing host-only email-bound league invitations remain separate. Rewards, referral attribution, contact access, avatars/photos and awards are not introduced.',
 ]}/>;
 return <section ref={root} className="real-app-invite real-account real-play" aria-label="General app invitation visual proposal">
  <div className="real-account-summary"><span className="real-app-invite-icon"><Users size={28} aria-hidden="true"/></span><div><h3>Invite friends</h3><p>General app invitation · proposal</p></div></div><Button ref={opener} variant="primary" haptic={false} onClick={()=>setOpen(true)}>Open app invite preview</Button>
  {open?<Sheet title={title} onClose={close} closeLabel="Close app invite preview" footer={<p className="real-app-invite-footer">Visual proposal · nothing shared, copied or sent</p>}>
   {view!=='account'?<button className="real-app-invite-back" type="button" onClick={()=>go(view==='invite'?'account':'invite')}><ArrowLeft size={16} aria-hidden="true"/>{view==='invite'?'Account':'Invite friends'}</button>:null}
   <div className="real-account-preview-head"><p className="real-play-eyebrow">NEW APP INVITE · PROPOSAL</p>{about}</div>
   {view==='account'?<>
    <div className="real-app-invite-menu-intro"><h3>Your corner of the game</h3><p>App invitation entry placement</p></div><List label="Proposed Account menu" className="real-app-invite-menu"><Row title="Profile" sub="Your name and account" start={<span className="real-app-invite-icon"><UserRound size={22} aria-hidden="true"/></span>}/><Row title="Settings" sub="Sportsbooks and Home guidance" start={<span className="real-app-invite-icon"><Settings size={22} aria-hidden="true"/></span>}/><Row title="Invite friends" sub="Share Guess the Line" className="real-app-invite-entry" start={<span className="real-app-invite-icon"><Share2 size={23} aria-hidden="true"/></span>} end={<ArrowUpRight size={20} aria-hidden="true"/>} onClick={()=>go('invite')}/></List><p className="real-app-invite-caption">Available to every player.</p>
   </>:view==='invite'?<>
    <article className="real-app-invite-hero"><img className="real-app-invite-logo" src={theme==='light'?'logo-hybrid/light-deep-green.svg':'logo-hybrid/lime.svg'} alt="Guess the Line G"/><h3>Better with friends.</h3><p>Invite them to Guess the Line.</p><div className="real-app-invite-connection" aria-hidden="true"><span><MessageCircle size={23}/></span><i/><span><Users size={25}/></span><i/><span><Share2 size={23}/></span></div></article>
    <div className="real-app-invite-payload"><span className="real-app-invite-label">YOUR INVITATION</span><p>{payload.text}</p><div><Link2 size={17} aria-hidden="true"/><span>{new URL(payload.url).hostname}</span></div></div>
    <div className="real-app-invite-actions"><Button variant="primary" haptic={false} onClick={()=>go('share')}><Share2 size={19} aria-hidden="true"/>Preview share</Button><Button haptic={false} onClick={()=>go('fallback')}><Copy size={18} aria-hidden="true"/>Preview copy link</Button></div><p className="real-app-invite-note"><ShieldCheck size={17} aria-hidden="true"/><span>Friends can create an account or sign in. Private leagues use their own invitation.</span></p>
   </>:view==='share'?<>
    <article className="real-app-invite-share"><span className="real-app-invite-icon"><Share2 size={29} aria-hidden="true"/></span><h3>Choose where to share.</h3><p>Your device would open its share menu.</p><div className="real-app-invite-destinations" aria-hidden="true"><span><MessageCircle size={24}/>Message</span><span><Mail size={24}/>Email</span><span><Share2 size={24}/>More</span></div><small>Illustrative options · your device decides what appears</small></article>
    <div className="real-app-invite-payload"><span className="real-app-invite-label">SHARE PREVIEW</span><strong>{payload.title}</strong><p>{payload.text}</p><div><Link2 size={17} aria-hidden="true"/><span>{new URL(payload.url).hostname}</span></div></div><Button haptic={false} onClick={()=>{go('invite');setNotice('Example share menu dismissed. Nothing sent.');}}>Preview dismiss</Button><Button haptic={false} onClick={()=>go('fallback')}>Use the link instead</Button>
   </>:<>
    <div className="real-app-invite-fallback-heading"><span className="real-app-invite-icon"><Link2 size={28} aria-hidden="true"/></span><h3>A link you can send anywhere.</h3><p>Use this when device sharing isn’t available.</p></div><label className="real-app-invite-label" htmlFor={id+'-link'}>PUBLIC APP LINK</label><input ref={link} className="real-app-invite-link" id={id+'-link'} readOnly value={payload.url} onFocus={e=>e.target.select()}/><Button variant="primary" haptic={false} onClick={selectLink}><Copy size={18} aria-hidden="true"/>Select link in preview</Button><p className="real-app-invite-caption">In the finished app, Copy link would copy this address. You can also select it manually.</p><p className="real-app-invite-note"><ShieldCheck size={17} aria-hidden="true"/><span>This public link contains no private league or player information.</span></p>
   </>}
   {notice?<p className="real-app-invite-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  </Sheet>:null}
 </section>;
}
