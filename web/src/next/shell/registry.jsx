// What the shell draws for each tab and each layer id (prototype CONTRACT section 9, the layer registry). A tab's or a
// layer's own stage changes its one line here; the component lives in that tab's folder. Ids follow the prototype
// (`sh.menu`, `dlg.sitOut`, `ov.flash`, `page.settings`); state.js knows the kind from the prefix.
import { MenuSheet } from '../me/MenuSheet.jsx';
import { SwitcherSheet } from '../league/SwitcherSheet.jsx';
import { Home } from '../home/Home.jsx';
import { GameSheet } from '../lines/GameSheet.jsx';
import { AllTrendsSheet } from '../lines/AllTrendsSheet.jsx';
import { ResearchSheet } from '../research/ResearchSheet.jsx';
import { Play } from '../play/Play.jsx';
import { Bets } from '../bets/Bets.jsx';
import { Research } from '../research/Research.jsx';
import { CommentsSheet } from '../feed/CommentsSheet.jsx';
import { ReactorsSheet } from '../feed/ReactorsSheet.jsx';
import { ReactionsPopover } from '../feed/ReactionsPopover.jsx';
import { PicksSheet } from '../feed/PicksSheet.jsx';
import { HistoryPage } from '../me/HistoryPage.jsx';

/** The original tabs use live routes; Fantasy reads public player snapshots. The transitional editors retain the hosted rules until their migrations ship. */
export const SCREENS = Object.freeze({
  home: Home, // stage 12: read-only Home (the hero, who's in and the rank tiles)
  play: Play,
  bets: Bets,
  research: Research,
});

/** Each layer id's component, with its owner (CONTRACT section 9). */
export const LAYERS = Object.freeze({
  'sh.menu': MenuSheet, // me
  'sh.switcher': SwitcherSheet, // league (stage 11)
  'sh.game': GameSheet, // lines (stage 13): one game, read-only
  'sh.allTrends': AllTrendsSheet, // lines (stage 13; the stage 34 All trends sheet, pulled forward for DASH-7)
  'sh.research': ResearchSheet,
  'page.history': HistoryPage, // me (stages 73 and 74): Me › History, its code loaded when it opens
  'sh.comments': CommentsSheet, // league feed (stage 64): a post's comments or a kickoff post's game thread
  'sh.picks': PicksSheet, // league feed (stage 64): one player's picks for a week and market
  'sh.reactors': ReactorsSheet, // league feed (stage 65): who reacted
  'pop.reactions': ReactionsPopover, // league feed (stage 65): the six reactions
});
