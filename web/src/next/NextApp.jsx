// The new app's root (D-38; redesign build plan section 3.1). main.jsx loads it lazily for every signed-in member;
// it is the only app (the old app is gone).
//
// Stage 10: the shell frame (web/src/next/shell). Stage 11: the data layer (web/src/next/data/AppData.jsx) reads
// `/lobby` and `/community/read` once and shares them; the app gate (shell/AppGate.jsx) shows the name step, the
// frame with the league switcher and the Play counter, or the removed-account and access-pending screens. Picks, bets
// and posts stay where they are, and both apps share them.
// The styles load first, so the frame's own stylesheet (shell/shell.css, imported by the frame) comes after them.
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import '../liveWorkflows.css';
import { useEffect } from 'react';
import { AppDataProvider } from './data/AppData.jsx';
import { AppGate } from './shell/AppGate.jsx';
import { addNextFontLinks } from './styles/fonts.js';

export default function NextApp({ session, onSignOut }) {
  // main.jsx's authenticated SportEntry mounts NBA before this NFL-only data provider.
  useEffect(() => { addNextFontLinks(); }, []);
  return (
    <AppDataProvider session={session}>
      <AppGate session={session} onSignOut={onSignOut}/>
    </AppDataProvider>
  );
}
