// What the shell draws for each tab and each layer id (prototype CONTRACT section 9, the layer registry). A tab's or a
// layer's own stage changes its one line here; the component lives in that tab's folder. Ids follow the prototype
// (`sh.menu`, `dlg.sitOut`, `ov.flash`, `page.settings`); state.js knows the kind from the prefix.
import { ComingNext } from './Frame.jsx';
import { MenuSheet } from '../me/MenuSheet.jsx';
import { SwitcherSheet } from '../league/SwitcherSheet.jsx';
import { Home } from '../home/Home.jsx';
import { LinesBoard } from '../lines/LinesBoard.jsx';
import { GameSheet } from '../lines/GameSheet.jsx';
import { AllTrendsSheet } from '../lines/AllTrendsSheet.jsx';

const coming = tab => Object.assign(() => <ComingNext tab={tab}/>, { displayName: `ComingNext(${tab})` });

/** Each tab's screen. Until a tab's stage arrives it shows its "coming next" card. */
export const SCREENS = Object.freeze({
  home: Home, // stage 12: read-only Home (the hero, who's in and the rank tiles)
  play: coming('play'),
  bets: coming('bets'),
  lines: LinesBoard, // stage 13: read-only Lines and game sheet
  league: coming('league'),
});

/** Each layer id's component, with its owner (CONTRACT section 9). */
export const LAYERS = Object.freeze({
  'sh.menu': MenuSheet, // me
  'sh.switcher': SwitcherSheet, // league (stage 11)
  'sh.game': GameSheet, // lines (stage 13): one game, read-only
  'sh.allTrends': AllTrendsSheet, // lines (stage 13; the stage 34 All trends sheet, pulled forward for DASH-7)
});
