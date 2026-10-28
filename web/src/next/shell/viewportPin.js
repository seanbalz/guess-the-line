// Keeps the frame's fixed bottom pieces (the tab bar, the dock 8 above it, toasts) on the bottom of what the player
// sees on iOS. WebKit, mostly in a home-screen web app, can keep position:fixed elements anchored to a stale layout
// viewport after the on-screen keyboard closes (or the visual viewport otherwise resizes): the tab bar is then drawn a
// keyboard's height above the bottom of the screen, with the page scrolling under it, until the next layout.
//
// The hook listens to the visual viewport (resize, scroll), the window (resize, orientation, pageshow) and focusout
// from text fields. When the visual viewport settles it (1) makes a no-op scroll in an animation frame, which makes
// WebKit re-anchor its fixed elements, and (2) measures what is left: the layout viewport's height (innerHeight)
// against the visual viewport's bottom (height + offsetTop). A gap left with no text field focused and no pinch zoom
// is written to `--gx-viewport-gap` on the root element, which the bars add to their `bottom` (shell.css,
// components.css). While a text field has focus the keyboard is meant to cover the bar, so the gap is 0 then.
// Without visualViewport (older browsers, jsdom, SSR) it does nothing.
import { useEffect } from 'react';

export const VIEWPORT_GAP_VAR = '--gx-viewport-gap';
/** How long after a text field loses focus to measure again, for a keyboard that is still sliding away. */
export const SETTLE_MS = 350;
/** A visual viewport that grows by at least this much has lost a keyboard (toolbars change it by less). */
export const KEYBOARD_PX = 120;

const EDITABLE = 'input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=submit]):not([type=reset]):not([type=file]):not([type=color]),textarea,select,[contenteditable]:not([contenteditable=false])';

/** True when `node` is a field that brings up the on-screen keyboard. */
export function isTextField(node) {
  return !!node && typeof node.matches === 'function' && node.matches(EDITABLE);
}

/**
 * The correction in CSS px for the fixed bottom bars: the layout viewport's bottom minus the visual viewport's bottom.
 * Negative when the bars are anchored above what is visible (the stale-keyboard state), positive when below it. 0 while
 * a text field is focused (the keyboard is open and should cover the bar), while pinch-zoomed, or under a pixel.
 */
export function viewportGap(win) {
  const vv = win?.visualViewport;
  if (!vv || !Number.isFinite(vv.height) || !Number.isFinite(win.innerHeight)) return 0;
  if (Math.abs((vv.scale ?? 1) - 1) > 0.01) return 0;
  if (isTextField(win.document?.activeElement)) return 0;
  const gap = Math.round(win.innerHeight - (vv.height + (vv.offsetTop || 0)));
  return Math.abs(gap) < 1 ? 0 : gap;
}

/**
 * Starts pinning on `win` and returns a function that stops it (removes every listener, clears the variable).
 * `target` is the element that carries the variable (the document's root by default, so every fixed bar inherits it).
 */
export function pinFixedBars(win = typeof window === 'undefined' ? undefined : window, target = win?.document?.documentElement) {
  const vv = win?.visualViewport;
  if (!win || !vv || typeof vv.addEventListener !== 'function' || !target?.style) return () => {};
  const raf = typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame.bind(win) : fn => win.setTimeout(fn, 16);
  const caf = typeof win.cancelAnimationFrame === 'function' ? win.cancelAnimationFrame.bind(win) : id => win.clearTimeout(id);
  let frame = 0, timer = 0, applied = 0, stopped = false, nudge = false, lastHeight = vv.height;

  const apply = gap => {
    if (gap === applied) return;
    applied = gap;
    if (gap) target.style.setProperty(VIEWPORT_GAP_VAR, `${gap}px`);
    else target.style.removeProperty(VIEWPORT_GAP_VAR);
  };
  const settle = () => {
    frame = 0;
    if (stopped) return;
    // A scroll to where the page already is: WebKit lays its fixed elements out again against the current viewport.
    // Only when a keyboard has just gone (a field lost focus, or the visual viewport grew by a keyboard's height), so
    // a toolbar resize mid-scroll never stops the page's momentum.
    const grew = vv.height - lastHeight >= KEYBOARD_PX;
    lastHeight = vv.height;
    if ((nudge || grew) && !isTextField(win.document?.activeElement) && typeof win.scrollTo === 'function') {
      try { win.scrollTo(win.scrollX, win.scrollY); } catch { /* a browser without scrollTo(x, y) */ }
    }
    nudge = false;
    apply(viewportGap(win));
  };
  const schedule = () => {
    if (stopped || frame) return;
    frame = raf(settle);
  };
  const onFocusOut = event => {
    if (!isTextField(event?.target)) return;
    nudge = true;
    schedule();
    win.clearTimeout(timer);
    timer = win.setTimeout(() => { nudge = true; schedule(); }, SETTLE_MS);
  };

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  win.addEventListener('pageshow', schedule);
  win.addEventListener('focusout', onFocusOut);
  schedule();

  return () => {
    stopped = true;
    if (frame) caf(frame);
    win.clearTimeout(timer);
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    win.removeEventListener('pageshow', schedule);
    win.removeEventListener('focusout', onFocusOut);
    target.style.removeProperty(VIEWPORT_GAP_VAR);
  };
}

/** The shell's hook: pins the fixed bottom bars while the frame is mounted. */
export function useFixedBarsPinned() {
  useEffect(() => pinFixedBars(), []);
}
