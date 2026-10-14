// What the shell draws for each tab and each layer id (prototype CONTRACT section 9, the layer registry). A tab's or a
// layer's own stage changes its one line here; the component lives in that tab's folder. Ids follow the prototype
// (`sh.menu`, `dlg.sitOut`, `ov.flash`, `page.settings`); state.js knows the kind from the prefix.
import { ComingNext } from './Frame.jsx';
import { MenuSheet } from '../me/MenuSheet.jsx';
import { SwitcherSheet } from '../league/SwitcherSheet.jsx';

const coming = tab => Object.assign(() => <ComingNext tab={tab}/>, { displayName: `ComingNext(${tab})` });

/** Each tab's screen. Until a tab's stage arrives it shows its "coming next" card. */
export const SCREENS = Object.freeze({
  home: coming('home'),
  play: coming('play'),
  bets: coming('bets'),
  lines: coming('lines'),
  league: coming('league'),
});

/** Each layer id's component, with its owner (CONTRACT section 9). */
export const LAYERS = Object.freeze({
  'sh.menu': MenuSheet, // me
  'sh.switcher': SwitcherSheet, // league (stage 11 fills it)
});
