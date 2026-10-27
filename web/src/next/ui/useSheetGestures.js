// The DOM side of the sheet gestures (design upgrade, "game feel"; gesture.js holds the math):
// - useDismissDrag: drag the sheet's grab handle or head down and the sheet follows the finger; let go past the
//   threshold (or flick) and it slides away and closes, a short drag snaps back. The close button and Escape are
//   unchanged; focus returns to the opener as on any close (useModal).
// - usePagerSwipe: drag a paging sheet's body sideways and the page follows the finger, resisted past the first and
//   last page; let go past the threshold (or flick) and the next page slides in. The first movement picks the axis, so
//   a vertical drag still scrolls the body (on a touch screen the browser scrolls it natively: touch-action pan-y).
// Each drag moves the sheet or its body with an inline transform on that element itself, never on an ancestor of the
// fixed tab bar. The motion classes (sheet.css) time the snap back, the exit and the page change on the --gx-dur and
// --gx-ease tokens; under reduced motion they do not transition, so everything lands at once. A drag that moved never
// also clicks what it started on.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { lockAxis, pageOffset, pagerPlace, pageStep, scrimOpacity, sheetOffset, shouldClose, velocityOf } from './gesture.js';

const SAMPLES = 32;
/** After a close or a page turn the owner may refuse (unsaved changes); this long without a change, the sheet comes back. */
const REFUSED_MS = 250;
/** The longest any of these transitions runs (dur-base 240ms) plus room; a safety net if transitionend never comes. */
const SAFETY_MS = 600;

/** The device setting, or the app's own (data-motion="reduce" on the .gx root). */
export function reducedMotion(node) {
  if (node?.closest?.('[data-motion="reduce"]')) return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs `done` once the CSS transitions now running on `nodes` end (at once when none run, as under reduced motion). */
function whenSettled(nodes, done) {
  let called = false;
  const finish = () => { if (!called) { called = true; done(); } };
  const list = nodes.filter(Boolean);
  if (!list.every(node => typeof node.getAnimations === 'function')) { setTimeout(finish, SAFETY_MS); return; }
  const running = list.flatMap(node => node.getAnimations()).filter(animation => 'transitionProperty' in animation);
  if (!running.length) { finish(); return; }
  Promise.all(running.map(animation => animation.finished)).then(finish, finish);
  setTimeout(finish, SAFETY_MS);
}

/** A drag that moved must not also click the button it started on. */
function swallowClick() {
  const swallow = event => { event.stopPropagation(); event.preventDefault(); };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}

function clearSelection() {
  try { window.getSelection?.()?.removeAllRanges(); } catch { /* Nothing selected. */ }
}

/** Follows one pointer from its pointerdown on window, until it lifts or the browser takes it (a native scroll). */
function follow(event, { move, end }) {
  const id = event.pointerId;
  const samples = [{ x: event.clientX, y: event.clientY, t: event.timeStamp }];
  const start = { x: event.clientX, y: event.clientY };
  const onMove = e => {
    if (e.pointerId !== id) return;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (samples.length > SAMPLES) samples.splice(0, samples.length - SAMPLES);
    move(e.clientX - start.x, e.clientY - start.y, e);
  };
  const onEnd = e => {
    if (e.pointerId !== id) return;
    stop();
    end({ dx: e.clientX - start.x, dy: e.clientY - start.y, samples, at: e.timeStamp, cancelled: e.type === 'pointercancel' });
  };
  function stop() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
  return stop;
}

const primaryPress = event => event.isPrimary !== false && event.button === 0;

/**
 * `const onDragStart = useDismissDrag(panelRef, scrimRef, onClose)`; put it on the grab handle and the head as
 * onPointerDown. `onClose` is the sheet's own close (the owner may still refuse it).
 */
export function useDismissDrag(panelRef, scrimRef, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  const st = useRef({ stop: null, busy: false, alive: true, timer: 0 });
  useEffect(() => {
    const s = st.current;
    s.alive = true;
    return () => { s.alive = false; s.stop?.(); clearTimeout(s.timer); };
  }, []);
  return useCallback(event => {
    const s = st.current, panel = panelRef.current;
    if (!panel || s.stop || s.busy || !primaryPress(event)) return;
    let active = false, offset = 0;
    const scrim = () => scrimRef.current;
    const place = value => {
      offset = value;
      panel.style.transform = value ? `translate3d(0, ${value}px, 0)` : '';
      const layer = scrim();
      if (layer) layer.style.opacity = value ? String(scrimOpacity(value, panel.offsetHeight)) : '';
    };
    const settle = () => {
      s.busy = true;
      panel.classList.remove('gx-sheet--leave');
      scrim()?.classList.remove('gx-scrim--leave');
      panel.classList.add('gx-sheet--settle');
      scrim()?.classList.add('gx-scrim--settle');
      place(0);
      whenSettled([panel, scrim()], () => {
        panel.classList.remove('gx-sheet--settle');
        scrim()?.classList.remove('gx-scrim--settle');
        s.busy = false;
      });
    };
    const leave = () => {
      s.busy = true;
      panel.classList.add('gx-sheet--leave');
      scrim()?.classList.add('gx-scrim--leave');
      panel.style.transform = 'translate3d(0, 100%, 0)';
      if (scrim()) scrim().style.opacity = '0';
      whenSettled([panel, scrim()], () => {
        if (!s.alive) return;
        close.current?.();
        s.timer = setTimeout(() => { if (s.alive) settle(); }, REFUSED_MS);
      });
    };
    s.stop = follow(event, {
      move(dx, dy) {
        if (!active) {
          const axis = lockAxis(dx, dy);
          if (!axis) return;
          if (axis !== 'y' || dy < 0) { s.stop?.(); s.stop = null; return; }
          active = true;
          panel.classList.add('gx-sheet--drag');
          clearSelection();
        }
        place(sheetOffset(dy));
      },
      end({ dy, samples, at, cancelled }) {
        s.stop = null;
        if (!active) return;
        panel.classList.remove('gx-sheet--drag');
        swallowClick();
        const velocity = velocityOf(samples, 'y', at);
        if (!cancelled && shouldClose({ dy: sheetOffset(dy), velocity, height: panel.offsetHeight })) leave();
        else settle();
      },
    });
  }, [panelRef, scrimRef]);
}

/** Where a sideways swipe may start inside `root`: not on a field, a native dialog, or anything with its own sideways gesture. */
export function swipeStartsHere(root, event) {
  const target = event.target;
  if (!root || !target || typeof target.closest !== 'function' || !root.contains(target)) return false;
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [data-gx-swipe="off"]')) return false;
    // A chart that captured the pointer (its crosshair) owns this drag. A touch's own target holds an implicit capture
    // in some browsers, so only an ancestor's capture counts; a chart's plot also says pan-y, which the next check reads.
    if (el !== target && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(event.pointerId)) return false;
    const style = getComputedStyle(el);
    const touch = style.touchAction || 'auto';
    if (touch !== 'auto' && touch !== 'manipulation' && !/pan-x|pan-left|pan-right/.test(touch)) return false;
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return false;
  }
  return true;
}

/**
 * `const { onPointerDown, turn } = usePagerSwipe(bodyRef, pager)`: `pager` is `{ index, count, onMove(step) }` (step -1
 * or 1). Put onPointerDown on the sheet's body; `turn(step)` is the previous and next buttons'. When `index` changes the
 * body scrolls to its top and the new page slides in from the side it came from.
 */
export function usePagerSwipe(bodyRef, pager) {
  const latest = useRef(pager);
  latest.current = pager;
  // `pending`: a turn on its way (its step), from the moment it is asked until the new page shows or is refused.
  // `gen`: bumped whenever the body's motion changes, so a finished (or cancelled) older transition does nothing.
  const st = useRef({ stop: null, pending: 0, alive: true, timer: 0, index: pager?.index, gen: 0 });
  useEffect(() => {
    const s = st.current;
    s.alive = true;
    return () => { s.alive = false; s.stop?.(); clearTimeout(s.timer); };
  }, []);

  /** Back at rest at once: no motion class, no inline transform or opacity; any transition still running is dropped. */
  const reset = useCallback(node => {
    st.current.gen += 1;
    node.classList.remove('gx-sheet-body--drag', 'gx-sheet-body--leave', 'gx-sheet-body--settle', 'gx-sheet-body--enter');
    node.style.transform = '';
    node.style.opacity = '';
  }, []);
  /** Runs `done` when this motion ends, unless another one has started since. */
  const after = useCallback((node, done) => {
    const gen = ++st.current.gen;
    whenSettled([node], () => { if (st.current.alive && st.current.gen === gen) done(); });
  }, []);
  const settle = useCallback(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.classList.remove('gx-sheet-body--drag', 'gx-sheet-body--leave', 'gx-sheet-body--enter');
    node.classList.add('gx-sheet-body--settle');
    node.style.transform = '';
    node.style.opacity = '';
    after(node, () => node.classList.remove('gx-sheet-body--settle'));
  }, [bodyRef, after]);

  const turn = useCallback((step, { swiped = false } = {}) => {
    const s = st.current, node = bodyRef.current, current = latest.current;
    const place = pagerPlace(current?.index, current?.count);
    const allowed = place && (step === 1 ? place.canNext : step === -1 ? place.canPrev : false);
    if (!node || !allowed || s.pending) { if (swiped && !s.pending) settle(); return false; }
    s.pending = step;
    const go = () => {
      latest.current?.onMove?.(step);
      clearTimeout(s.timer);
      // Still on the same page: the owner refused (unsaved changes), so the page comes back.
      s.timer = setTimeout(() => { if (s.alive && s.pending) { s.pending = 0; settle(); } }, REFUSED_MS);
    };
    if (!swiped) { go(); return true; }
    if (reducedMotion(node)) { reset(node); go(); return true; }
    node.classList.remove('gx-sheet-body--drag');
    node.classList.add('gx-sheet-body--leave');
    node.style.transform = `translate3d(${-step * node.clientWidth}px, 0, 0)`;
    node.style.opacity = '0';
    after(node, go);
    return true;
  }, [bodyRef, settle, reset, after]);

  // A new page: back to the top, sliding in from the side it came from (at once under reduced motion).
  const index = pager?.index;
  useLayoutEffect(() => {
    const s = st.current, node = bodyRef.current, was = s.index;
    s.index = index;
    if (!node || !Number.isInteger(index) || !Number.isInteger(was) || was === index) return;
    const step = s.pending || Math.sign(index - was);
    s.pending = 0;
    clearTimeout(s.timer);
    reset(node);
    node.scrollTop = 0;
    if (reducedMotion(node)) return;
    node.style.transform = `translate3d(${step * Math.round(node.clientWidth * 0.3)}px, 0, 0)`;
    node.style.opacity = '0';
    node.getBoundingClientRect();
    node.classList.add('gx-sheet-body--enter');
    node.style.transform = '';
    node.style.opacity = '';
    after(node, () => node.classList.remove('gx-sheet-body--enter'));
  }, [index, bodyRef, reset, after]);

  const onPointerDown = useCallback(event => {
    const s = st.current, node = bodyRef.current, current = latest.current;
    const place = pagerPlace(current?.index, current?.count);
    if (!place || !node || s.stop || s.pending || !primaryPress(event) || !swipeStartsHere(node, event)) return;
    let active = false;
    const edges = () => ({ canPrev: place.canPrev, canNext: place.canNext, width: node.clientWidth });
    s.stop = follow(event, {
      move(dx, dy) {
        if (!active) {
          const axis = lockAxis(dx, dy);
          if (!axis) return;
          // Vertical: the body scrolls (natively on touch; a mouse drag is left alone).
          if (axis !== 'x') { s.stop?.(); s.stop = null; return; }
          active = true;
          // A page still sliding in (or back) lands at once, and the finger takes it from there.
          reset(node);
          node.classList.add('gx-sheet-body--drag');
          clearSelection();
        }
        node.style.transform = `translate3d(${pageOffset(dx, edges())}px, 0, 0)`;
      },
      end({ dx, samples, at, cancelled }) {
        s.stop = null;
        if (!active) return;
        swallowClick();
        const step = cancelled ? 0 : pageStep({ dx, velocity: velocityOf(samples, 'x', at), ...edges() });
        if (step) turn(step, { swiped: true });
        else settle();
      },
    });
  }, [bodyRef, settle, turn, reset]);

  return { onPointerDown, turn };
}
