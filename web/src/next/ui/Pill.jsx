// A status pill (design system 7.4): 24 tall, uppercase micro text in the state color on its tint. Never color alone:
// the words carry the state (LIVE, FINAL, LATE · 12 MIN, PUSH, PROVISIONAL, REAL SLIP). A live pill leads with the
// pulsing dot, the app's one loop (reduced motion stops it).
import { cx, oneOf } from './cx.js';

export const PILL_TONES = Object.freeze(['neutral', 'win', 'loss', 'pending', 'live', 'data', 'accent', 'real']);

export function Pill({ tone = 'neutral', dot, className, children, ...rest }) {
  const t = oneOf(tone, PILL_TONES, 'neutral');
  const showDot = dot ?? t === 'live';
  return (
    <span className={cx('gx-pill', t !== 'neutral' && `gx-pill--${t}`, className)} {...rest}>
      {showDot ? <span className="gx-live-dot" aria-hidden="true"></span> : null}
      {children}
    </span>
  );
}

/**
 * NEW (D-69): the one look for a result that waits on its tile (moments) and a post newer than this device had shown
 * (the feed). The text is the word itself; the control or card around it says "new" in its accessible name.
 */
export function NewPill({ className }) {
  return <Pill tone="accent" className={cx('gx-new', className)}>NEW</Pill>;
}
