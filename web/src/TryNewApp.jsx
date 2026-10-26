import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { APP_SWITCH_COPY, appFellBack, backToNewApp } from './appView.js';

/** D-60: the old app's way back. Everyone uses the new app; the old one opens only from the new app's
 *  "Older records and tools" (or its failure screens, or main.jsx's fallback when the new app cannot load), so its
 *  Community footer offers "Back to the new app". The note below the button is an always-mounted live region: it
 *  says when the new app could not open on this page and the old app came back in its place. */
export default function TryNewApp({ disabled = false }) {
  // The fallback sentence goes in after the note is on the page: a status region that appears with its words already in it
  // is not announced reliably, so it mounts empty and then changes.
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => { if (appFellBack()) setFellBack(true); }, []);
  return <div className="try-new-app">
    <button type="button" className="secondary" disabled={disabled} onClick={() => backToNewApp()}>{APP_SWITCH_COPY.backToNew}<ArrowRight size={16} aria-hidden="true"/></button>
    <p className="try-new-app-note" role="status">{fellBack ? APP_SWITCH_COPY.fellBack : ''}</p>
  </div>;
}
