// D-69 section 4.3: once the member switches tabs after the launch, every new tab screen fades in over the quick
// duration. The top bar, tab bar and dock never animate (the fade rule targets only <main>'s screen, a sibling of them).
import { useRef, useState } from 'react';
import { isSettled } from '../moments/launch.js';

/** True from the first tab change the member makes after the launch. */
export function useTabFade(tab) {
  const first = useRef(tab);
  const [on, setOn] = useState(false);
  if (!on && tab !== first.current && isSettled()) setOn(true);
  return on;
}
