// The new app's root (D-38; redesign build plan section 3.1). main.jsx loads it lazily, only on a device whose
// member chose "Try the new app" (stage 9, D-39), so the old app never downloads this chunk or its CSS.
//
// Stage 10: the shell frame (web/src/next/shell): top bar, five tabs with their "coming next" cards, the avatar menu
// (Appearance, Use the old app, Sign out), the layer hosts and the offline banner. It still reads no data, writes
// nothing and calls no route: picks, bets and posts stay where they are, and both apps share them. The data layer
// arrives in stage 11.
import { useEffect } from 'react';
import { Shell } from './shell/Shell.jsx';
import { addNextFontLinks } from './styles/fonts.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

export default function NextApp({ session, onSignOut }) {
  useEffect(() => { addNextFontLinks(); }, []);
  return <Shell session={session} onSignOut={onSignOut}/>;
}
