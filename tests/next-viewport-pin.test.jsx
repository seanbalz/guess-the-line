// The shell's iOS pin for the fixed bottom bars (web/src/next/shell/viewportPin.js). vitest, no browser: a small fake
// window with a mocked visualViewport stands in for iOS (jsdom is not installed here; the hook takes the window it
// pins). The browser check is in tests/cloud-browser/next-shell.spec.js. What a player relies on:
// - after the keyboard closes, the page is nudged (a no-op scroll) so WebKit re-anchors the fixed tab bar;
// - a gap left between the layout viewport and the visible bottom becomes --gx-viewport-gap, which the bars use;
// - while a text field is focused (keyboard open) or the page is pinch-zoomed, the bars are left alone;
// - every listener is removed and the variable cleared when the frame unmounts, and nothing breaks without
//   visualViewport or on the server.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { KEYBOARD_PX, SETTLE_MS, VIEWPORT_GAP_VAR, isTextField, pinFixedBars, useFixedBarsPinned, viewportGap } from '../web/src/next/shell/viewportPin.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, ...event }); }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

const field = tag => ({ tagName: tag, matches: selector => selector.includes(tag.toLowerCase()) });
const INPUT = { tagName: 'INPUT', matches: () => true };
const BUTTON = { tagName: 'BUTTON', matches: () => false };

function fakeWindow({ innerHeight = 844, height = 844, offsetTop = 0, scale = 1 } = {}) {
  const win = new Target();
  const vv = Object.assign(new Target(), { height, offsetTop, scale });
  const style = new Map();
  const frames = [];
  const timers = [];
  Object.assign(win, {
    innerHeight,
    scrollX: 0,
    scrollY: 1200,
    visualViewport: vv,
    document: { activeElement: BUTTON, documentElement: { style: { setProperty: (k, v) => style.set(k, v), removeProperty: k => style.delete(k) } } },
    scrollTo: vi.fn(),
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: id => { frames[id - 1] = null; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
  });
  const flush = () => { while (frames.some(Boolean)) { const i = frames.findIndex(Boolean); const fn = frames[i]; frames[i] = null; fn(); } };
  const runTimers = () => { for (const t of timers.splice(0)) t.fn?.(); flush(); };
  return { win, vv, style, flush, runTimers, timers };
}

describe('viewportGap', () => {
  it('is the layout bottom minus the visible bottom, in whole px', () => {
    expect(viewportGap(fakeWindow().win)).toBe(0);
    // iOS keeps a keyboard-height layout viewport after the keyboard closed: the bars sit 340 too high.
    expect(viewportGap(fakeWindow({ innerHeight: 504, height: 844 }).win)).toBe(-340);
    expect(viewportGap(fakeWindow({ innerHeight: 844, height: 800, offsetTop: 0.4 }).win)).toBe(44);
    expect(viewportGap(fakeWindow({ innerHeight: 844, height: 843.6 }).win)).toBe(0);
  });
  it('is 0 while a text field has focus, while zoomed, and without visualViewport', () => {
    const open = fakeWindow({ innerHeight: 844, height: 504 });
    open.win.document.activeElement = INPUT;
    expect(viewportGap(open.win)).toBe(0);
    expect(viewportGap(fakeWindow({ innerHeight: 844, height: 400, scale: 2 }).win)).toBe(0);
    expect(viewportGap({ innerHeight: 844 })).toBe(0);
    expect(viewportGap(undefined)).toBe(0);
  });
  it('knows which elements raise the keyboard', () => {
    expect(isTextField(field('TEXTAREA'))).toBe(true);
    expect(isTextField(BUTTON)).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('pinFixedBars', () => {
  it('nudges the scroll and writes the gap once the keyboard has closed', () => {
    const { win, vv, style, flush, runTimers } = fakeWindow({ innerHeight: 844, height: 504 });
    win.document.activeElement = INPUT;
    const stop = pinFixedBars(win);
    flush();
    // Keyboard open: nothing moves, nothing scrolls.
    expect(style.has(VIEWPORT_GAP_VAR)).toBe(false);
    expect(win.scrollTo).not.toHaveBeenCalled();

    // The field loses focus and the keyboard slides away, but WebKit keeps the short layout viewport.
    win.document.activeElement = BUTTON;
    win.dispatch('focusout', { target: INPUT });
    vv.height = 844;
    win.innerHeight = 504;
    vv.dispatch('resize');
    flush();
    expect(win.scrollTo).toHaveBeenCalledWith(0, 1200);
    expect(style.get(VIEWPORT_GAP_VAR)).toBe('-340px');

    // The next layout catches up: the correction goes away, and the settle timer nudges once more.
    win.innerHeight = 844;
    runTimers();
    expect(style.has(VIEWPORT_GAP_VAR)).toBe(false);
    expect(win.scrollTo).toHaveBeenCalledTimes(2);
    stop();
  });

  it('nudges when the visual viewport grows by a keyboard, never on a toolbar-sized resize', () => {
    const { win, vv, flush } = fakeWindow({ innerHeight: 760, height: 760 });
    const stop = pinFixedBars(win);
    flush();
    expect(win.scrollTo).not.toHaveBeenCalled();
    vv.height = 760 + KEYBOARD_PX - 40; win.innerHeight = vv.height;
    vv.dispatch('resize'); flush();
    expect(win.scrollTo).not.toHaveBeenCalled();
    vv.height = 400; win.innerHeight = 400;
    vv.dispatch('resize'); flush();
    vv.height = 844; win.innerHeight = 844;
    vv.dispatch('resize'); flush();
    expect(win.scrollTo).toHaveBeenCalledTimes(1);
    stop();
  });

  it('ignores focusout from things that are not text fields, and waits SETTLE_MS for a sliding keyboard', () => {
    const { win, flush, timers } = fakeWindow();
    const stop = pinFixedBars(win);
    flush();
    win.dispatch('focusout', { target: BUTTON });
    flush();
    expect(win.scrollTo).not.toHaveBeenCalled();
    win.dispatch('focusout', { target: INPUT });
    expect(timers.at(-1).ms).toBe(SETTLE_MS);
    stop();
  });

  it('removes every listener and the variable when stopped', () => {
    const { win, vv, style, flush } = fakeWindow({ innerHeight: 504, height: 844 });
    const stop = pinFixedBars(win);
    flush();
    expect(style.get(VIEWPORT_GAP_VAR)).toBe('-340px');
    expect(win.count() + vv.count()).toBe(6);
    stop();
    expect(win.count() + vv.count()).toBe(0);
    expect(style.has(VIEWPORT_GAP_VAR)).toBe(false);
    vv.dispatch('resize');
    flush();
    expect(style.has(VIEWPORT_GAP_VAR)).toBe(false);
  });

  it('does nothing without visualViewport or a window', () => {
    const { win } = fakeWindow();
    delete win.visualViewport;
    const stop = pinFixedBars(win);
    expect(win.count()).toBe(0);
    expect(() => stop()).not.toThrow();
    expect(() => pinFixedBars(undefined)()).not.toThrow();
  });

  it('renders on the server without touching window', () => {
    function Probe() { useFixedBarsPinned(); return <p>ok</p>; }
    expect(renderToStaticMarkup(<Probe/>)).toBe('<p>ok</p>');
  });
});

describe('the bars use the correction', () => {
  const css = file => readFileSync(new URL(`../web/src/next/${file}`, import.meta.url), 'utf8');
  it('moves the tab bar, the dock and toasts by --gx-viewport-gap, and nothing else about them', () => {
    expect(css('shell/shell.css')).toMatch(/\.gx-tabbar \{[^}]*bottom: var\(--gx-viewport-gap, 0px\);[^}]*height: calc\(var\(--gx-size-tabbar\) \+ env\(safe-area-inset-bottom, 0px\)\);/);
    expect(css('shell/shell.css')).toMatch(/\.gx-dock \{[^}]*bottom: calc\(var\(--gx-size-tabbar\) \+ env\(safe-area-inset-bottom, 0px\) \+ 8px \+ var\(--gx-viewport-gap, 0px\)\);/);
    expect(css('styles/components.css')).toMatch(/\.gx-toast \{[^}]*bottom: calc\([^;]*var\(--gx-dock-space\) \+ var\(--gx-viewport-gap, 0px\)\);/);
  });
  it('the shell mounts the pin', () => {
    expect(css('shell/Shell.jsx')).toMatch(/useFixedBarsPinned\(\);/);
  });
});
