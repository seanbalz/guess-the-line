// D-69 section 4.3: a tab change the member makes after the launch fades in the new tab's screen over the quick
// duration. Only that navigation fades: the next one inside the tab (opening a section, a nesting card's layer) plays
// that card's own entrance instead, so each navigation moves once. The top bar, tab bar and dock never animate (the
// fade rule targets only <main>'s screen, a sibling of them). A tab change before the first press (a deep link, a
// restore) never counts: that screen is the launch screen.
import { useRef } from 'react';
import { isSettled, setTabFading } from '../moments/launch.js';

/** The rule, pure. `fadeNav` is the navigation count (`state.nav`) that changed tabs; `prevTab` the tab before. */
export function tabFadeNext({ fadeNav = null, prevTab, tab, nav, settled }) {
  if (!settled) return { fadeNav: null, prevTab: tab };
  return tab !== prevTab ? { fadeNav: nav, prevTab: tab } : { fadeNav, prevTab };
}

/** True while the shell shows the navigation that changed tabs. */
export const fadesNow = (step, nav) => step.fadeNav !== null && step.fadeNav === nav;

/** True for the navigation that changed tabs, and tells ui/Nest.jsx (through launch.js) so its card does not rise too. */
export function useTabFade(tab, nav) {
  const step = useRef({ fadeNav: null, prevTab: tab });
  step.current = tabFadeNext({ ...step.current, tab, nav, settled: isSettled() });
  const on = fadesNow(step.current, nav);
  setTabFading(on);
  return on;
}
