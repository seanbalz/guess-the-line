// <CountUp>: a server number that counts from the last value this device saw to the new one (design lane, "game feel";
// BRAND_GUIDE D-38 Motion, "count-ups"). Home's season points and the League board's totals use it. The plain rules
// live in moments/countUp.js; this file only times the frames:
// - The `big` duration (600 ms, the brand's cap for count-ups) with the `enter` easing, read from the element's
//   --gx-dur-big and --gx-ease-enter, which tokens.css defines from design/tokens-next.json (tests/next-tokens.test.mjs
//   keeps the two equal). Enter never overshoots, and frameAt keeps every frame between the two values anyway.
// - The remembered value is per account and figure in device storage (`gtl.next.countUp.v1.…`), so it counts once per
//   change. D-69 (launchValue): every value before the member's first press, and the first value a mount sees on the
//   launch screen (before the first navigation), shows as it is and is not remembered; a later value in the same mount
//   counts from the value on screen.
// - At rest the element holds one text node, the server's value ("—" when it sent none), in a polite live region
//   (spec 4.4). While counting, the moving digits are hidden from assistive technology and the final value is in
//   screen-reader text, so nobody is told a number the server did not send.
// - Reduced motion (the device setting, or data-motion="reduce" on the app root) and a hidden page show the final value
//   at once. Only text changes: no layout property animates.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from './cx.js';
import { countUpKey, countUpPlan, countUpTiming, decimalsOf, formatCount, frameAt, launchValue, readSeen, writeSeen } from '../moments/countUp.js';
import { motionReduced } from './motion.js';
import { hasNavigated, isSettled } from '../moments/launch.js';
import './countUp.css';

export { motionReduced } from './motion.js';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** The element's count timing from the --gx- tokens it inherits inside the .gx root. */
function timingOf(element) {
  const style = element && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element) : null;
  return countUpTiming(name => style?.getPropertyValue(name) ?? '');
}

/**
 * `<CountUp value={20} account={viewer} figure="community.guess_spread.season.u-1"/>`. `value` is the server's number or
 * null; `format` writes the resting value (default: "46.5", "−3", "—").
 */
export function CountUp({ value, account, figure, format = formatCount, className, ...rest }) {
  const final = finite(value) ? value : null;
  const text = final === null ? formatCount(null) : format(final);
  // `seenFor`: what one value is planned from; `shown`: the value this mount last showed at rest, for one figure;
  // `fresh`: true until the mount's first value.
  const ref = useRef(null), seenFor = useRef(null), shown = useRef(null), fresh = useRef(true);
  const [frame, setFrame] = useState(null);
  const key = countUpKey(account, figure);
  useClientLayoutEffect(() => {
    if (final === null || !key) { setFrame(null); return undefined; }
    // Read the remembered and shown values once per new value: under React's development double effects the second
    // pass must still count from what the device saw and showed, not from the value the first pass just wrote.
    const id = `${key}=${final}`;
    if (seenFor.current?.id !== id) {
      const launch = launchValue({ first: fresh.current, settled: isSettled(), navigated: hasNavigated() });
      fresh.current = false;
      seenFor.current = { id, seen: readSeen(key), shown: shown.current?.key === key ? shown.current.value : null, launch };
    }
    const { seen, shown: from, launch } = seenFor.current;
    const plan = countUpPlan({ seen, shown: from, value: final, reduced: motionReduced(ref.current), hidden: typeof document !== 'undefined' && document.hidden === true, launch });
    if (plan.remember) writeSeen(key, final);
    shown.current = { key, value: final };
    if (!plan.animate) { setFrame(null); return undefined; }
    const { ms, ease } = timingOf(ref.current);
    const decimals = Math.max(decimalsOf(plan.from), decimalsOf(plan.to));
    let raf = 0, start = null;
    setFrame(formatCount(plan.from, decimals));
    // The clock starts at the first frame drawn, not when the value arrived: a busy first render (a page load) must
    // not use up the count before anyone can see it.
    const step = now => {
      start ??= now;
      const progress = (now - start) / ms;
      if (progress >= 1) { setFrame(null); return; }
      setFrame(formatCount(frameAt({ from: plan.from, to: plan.to, progress, ease }), decimals));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [final, key]);
  if (frame === null) return <span ref={ref} className={cx('gx-countup', className)} data-count="rest" aria-live="polite" {...rest}>{text}</span>;
  return (
    <span ref={ref} className={cx('gx-countup', className)} data-count="run" {...rest}>
      <span aria-hidden="true">{frame}</span>
      <span className="gx-sr-only">{text}</span>
    </span>
  );
}
