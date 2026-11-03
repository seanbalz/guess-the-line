// D-69 section 4.3: once the member switches tabs after the launch, every new tab screen fades in over the quick
// duration. The top bar, tab bar and dock never animate (the fade rule targets only <main>'s screen, a sibling of them).
// A tab change made before the first press (a deep link, a restore) never counts: that screen is the launch screen.
import { useRef, useState } from 'react';
import { isSettled } from '../moments/launch.js';

/** The rule, pure: `first` follows the tab until the launch settles; after that a different tab turns `on` for good. */
export function tabFadeNext({ on, first, tab, settled }) {
  if (!settled) return { on, first: tab };
  return { on: on || tab !== first, first };
}

/** True from the first tab change the member makes after the launch. */
export function useTabFade(tab) {
  const first = useRef(tab);
  const [on, setOn] = useState(false);
  const next = tabFadeNext({ on, first: first.current, tab, settled: isSettled() });
  first.current = next.first;
  if (next.on !== on) setOn(next.on);
  return on;
}
