import { Share2 } from 'lucide-react';
import { AccountSheet } from './AccountSheet.jsx';
import { useRef, useState } from 'react';
import { Button, Icon } from '../ui/index.js';
import { PrismBrand } from '../ui/PrismBrand.jsx';
import { useShell } from '../shell/context.js';
import { APP_INVITE, shareApp } from './appInvite.js';
import './accountPrism.css';

export function AppInvite() {
  const shell = useShell(), input = useRef(null), running = useRef(false);
  const [fallback, setFallback] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function share() {
    if (running.current) return;
    running.current = true; setBusy(true);
    const result = await shareApp();
    if (result === 'fallback') { setFallback(true); setMessage('Select and copy the public link, then share it with your friends.'); }
    else setMessage(result === 'cancelled' ? 'Sharing cancelled.' : 'Device sharing closed.');
    running.current = false; setBusy(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(APP_INVITE.url); setMessage('Public app link copied.'); }
    catch { setFallback(true); setMessage('Select and copy the public link.'); requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); }); }
  }
  return <AccountSheet title="Invite friends" className="gx-account-prism gx-app-invite" back={{ label: 'Menu', onBack: () => shell.setSheetArgs({ sub: null }) }} onClose={shell.closeSheet}>
    <section className="gx-account-hero gx-app-invite-hero"><PrismBrand/><h3>Better with friends.</h3><p>Invite your friends to Guess the Line.</p><div className="gx-invite-connection" aria-hidden="true"><span><Icon icon="message"/></span><i/><span><Icon icon="people"/></span><i/><span><Icon icon={Share2}/></span></div></section>
    <section className="gx-account-panel gx-app-invite-payload"><p className="gx-account-eyebrow">YOUR INVITATION</p><strong>{APP_INVITE.title}</strong><p>{APP_INVITE.text}</p><a href={APP_INVITE.url}><Icon icon="copy" size={16}/>{APP_INVITE.url}</a></section>
    <div className="gx-account-stack"><Button variant="primary" block icon={Share2} disabled={busy} onClick={share}>{busy ? 'Opening sharing…' : 'Share app invite'}</Button><Button block icon="copy" onClick={copy}>Copy link</Button></div>
    {fallback && <label className="gx-field">Public app link<input ref={input} className="gx-input" readOnly value={APP_INVITE.url} onFocus={event => event.target.select()}/></label>}
    <p className="gx-account-note"><Icon icon="shieldCheck" size={16}/>This public link opens sign-in or account creation. It does not grant access to a private league.</p>
    <p className="gx-account-notice" role="status">{message}</p>
  </AccountSheet>;
}
