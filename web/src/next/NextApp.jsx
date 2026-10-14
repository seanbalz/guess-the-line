// The new app's root (D-38; redesign build plan section 3.1). main.jsx loads it lazily, only on a device whose
// member chose "Try the new app" (stage 9, D-39), so the old app never downloads this chunk or its CSS.
//
// Stage 9 placeholder: an empty frame with "Use the old app" and Sign out. The shell (top bar, tabs, layers, the
// avatar menu with "Use the old app") replaces it in stage 10; the data layer arrives in stage 11. It reads no
// data, writes nothing and calls no route: picks, bets and posts stay where they are, and both apps share them.
import React, { useEffect, useState } from 'react';
import { APP_SWITCH_COPY, switchApp } from '../appView.js';
import { addNextFontLinks } from './styles/fonts.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

export default function NextApp({ session, onSignOut }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { addNextFontLinks(); }, []);
  // Going back never fails: switchApp falls back to ?app=classic when this browser refuses to save the choice.
  function backToOldApp() { setError(''); switchApp('classic'); }
  async function signOut() {
    if (busy) return;
    setBusy(true); setError('');
    try { await onSignOut(); }
    catch (failure) { setError(failure?.message || 'We could not sign you out. Please try again.'); setBusy(false); }
  }
  return <div className="gx">
    <main className="gx-screen" id="main">
      <header className="gx-vstack gx-gap-4">
        <p className="gx-t-meta">Guess The Line</p>
        <h1 className="gx-t-title">The new app</h1>
      </header>
      <section className="gx-empty" aria-labelledby="gx-next-soon">
        <h2 className="gx-t-section" id="gx-next-soon">Coming next</h2>
        <p className="gx-t-body">Home, Play, Bets, Lines and League arrive here in the next updates. Your picks, bets and posts are the same in both apps, so keep playing in the old app for now.</p>
        <button type="button" className="gx-btn gx-btn--primary gx-btn--block" onClick={backToOldApp}>{APP_SWITCH_COPY.useOld}</button>
      </section>
      {error && <p className="gx-t-label gx-c-loss" role="alert">{error}</p>}
      <div className="gx-vstack gx-gap-8">
        <p className="gx-t-meta gx-truncate">Signed in as {session.user.email}</p>
        <button type="button" className="gx-btn gx-btn--secondary" onClick={signOut} aria-disabled={busy || undefined}>{busy ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </main>
  </div>;
}
