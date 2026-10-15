import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { APP_SWITCH_COPY, appFellBack, switchApp } from './appView.js';

// The first look (build plan Phase 1, October 14, 2026): every build offers the button to every signed-in member (D-39).
// A build with VITE_GTL_OFFER_NEW_APP=0 leaves it out, the off switch if the new app has to be withdrawn from the
// Community footer without a code change; a device that already chose the new app keeps it (appView.js).
export const NEW_APP_OFFERED = import.meta.env?.VITE_GTL_OFFER_NEW_APP !== '0';

/** D-38, D-39 (redesign build plan stage 9): "Try the new app" in the Community footer, for every signed-in member.
 *  The choice is kept on this device and the page reloads into the new app. The note below the button is an
 *  always-mounted live region: it says when this browser refuses to save the choice, or when the new app could not
 *  open on this page and the old app came back in its place (main.jsx's fallback). */
export default function TryNewApp({ disabled = false }) {
  const [blocked, setBlocked] = useState(false);
  // The fallback sentence goes in after the note is on the page: a status region that appears with its words already in it
  // is not announced reliably, so it mounts empty and then changes.
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => { if (NEW_APP_OFFERED && appFellBack()) setFellBack(true); }, []);
  const note = blocked ? APP_SWITCH_COPY.storageBlocked : fellBack ? APP_SWITCH_COPY.fellBack : '';
  if (!NEW_APP_OFFERED) return null;
  return <div className="try-new-app">
    <button type="button" className="secondary" disabled={disabled} onClick={() => setBlocked(!switchApp('next'))}>{APP_SWITCH_COPY.tryNew}<ArrowRight size={16} aria-hidden="true"/></button>
    <p className="try-new-app-note" role="status">{note}</p>
  </div>;
}
