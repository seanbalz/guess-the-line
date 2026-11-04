// D-69 section 4.3: a chart reveals left to right once, when it first shows after the member's own tap (a layer opened, a
// disclosure opened), never on a page load. Transform only: the clip group slides in from the left while its content
// slides the other way, so the drawing never moves and only the window over it grows. (The spec names scaleX on the clip
// group; a scaled clip squashes the chart unless its content is counter-scaled by 1/s, unbounded at the start, so this is
// the same wipe with translate alone; WebKit's support for animating an SVG clipPath is uneven, and the iPhone is the
// target.) Reduced motion never starts it, and the chart is always drawn whole for assistive technology. A reveal cut
// off (its disclosure closed mid-reveal, which cancels the animation or hides it) is over: the next opening draws the
// chart whole, never a second reveal.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from './cx.js';
import { motionReduced } from './motion.js';
import './chartReveal.css';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * True when `event` ends a playing reveal on `element`: its own clip animation ended or was cancelled (React has no
 * onAnimationCancel), or the disclosure around it closed.
 */
export function revealOver(event, element, details = null) {
  if (event?.type === 'toggle') return Boolean(details) && event.target === details && details.open === false;
  return (event?.type === 'animationend' || event?.type === 'animationcancel') && event.target === element;
}

/** `<ChartReveal play={opened}><svg …/></ChartReveal>`: `play` turning true (or true at mount) reveals it once. */
export function ChartReveal({ play = false, className, children }) {
  const ref = useRef(null), played = useRef(play);
  const [phase, setPhase] = useState(() => (play ? 'in' : null));
  useClientLayoutEffect(() => {
    if (motionReduced(ref.current)) { setPhase(null); return; }
    if (play && !played.current) { played.current = true; setPhase('in'); }
  }, [play]);
  useEffect(() => {
    const element = ref.current;
    if (phase !== 'in' || !element) return undefined;
    const details = element.closest('details');
    const stop = event => { if (revealOver(event, element, details)) setPhase(null); };
    element.addEventListener('animationcancel', stop);
    details?.addEventListener('toggle', stop);
    return () => { element.removeEventListener('animationcancel', stop); details?.removeEventListener('toggle', stop); };
  }, [phase]);
  const end = event => { if (revealOver(event.nativeEvent, ref.current)) setPhase(null); };
  return <span ref={ref} className={cx('gx-reveal', className)} data-reveal={phase ?? undefined} onAnimationEnd={end}>
    <span className="gx-reveal-in">{children}</span>
  </span>;
}
