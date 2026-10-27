// Touch gestures for the new app's sheets (design upgrade, "game feel"): the pure math behind swipe-to-close and
// swipe-between-pages. No DOM here, so node tests pin every threshold (tests/next-gestures.test.mjs); useSheetGestures.js
// applies it to pointer events. Distances are CSS pixels, times milliseconds, velocities pixels per millisecond.

export const GESTURE = Object.freeze({
  /** Movement before a drag picks its axis; under it a press is still a tap. */
  slop: 10,
  /** A downward drag closes a sheet past a quarter of its height, clamped to 80 to 160px. */
  closeShare: 0.25,
  closeMin: 80,
  closeMax: 160,
  /** A sideways drag turns the page past a quarter of the width, clamped to 64 to 120px. */
  pageShare: 0.25,
  pageMin: 64,
  pageMax: 120,
  /** A flick this fast counts as a full drag, once it has travelled at least `flickMin`. */
  flick: 0.5,
  flickMin: 40,
  /** The release velocity reads the samples of the last 100ms. */
  span: 100,
  /** Edge resistance: past the first or last page the content follows less and less (iOS-like). */
  rubber: 0.55,
});

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The axis a drag locks to, from its first movement: 'x', 'y', or null while it is still inside the slop. A tie goes
 * to 'y', so a diagonal start scrolls the sheet rather than turning its page.
 */
export function lockAxis(dx, dy, slop = GESTURE.slop) {
  const ax = Math.abs(dx) || 0, ay = Math.abs(dy) || 0;
  if (!(Math.max(ax, ay) >= slop)) return null;
  return ax > ay ? 'x' : 'y';
}

/** How far content follows a finger pulling past an edge: always less than the pull, never more than `size`. */
export function rubberBand(distance, size, factor = GESTURE.rubber) {
  if (!Number.isFinite(distance) || distance === 0 || !(size > 0)) return 0;
  const pull = Math.abs(distance);
  return Math.sign(distance) * (1 - 1 / ((pull * factor) / size + 1)) * size;
}

/** The release velocity along `axis` ('x' or 'y') from `{ x, y, t }` samples: the last `span` ms before `now`. */
export function velocityOf(samples, axis, now, span = GESTURE.span) {
  const recent = (samples ?? []).filter(s => Number.isFinite(s?.[axis]) && Number.isFinite(s?.t) && now - s.t <= span && s.t <= now);
  if (recent.length < 2) return 0;
  const first = recent[0], last = recent[recent.length - 1], dt = last.t - first.t;
  return dt > 0 ? (last[axis] - first[axis]) / dt : 0;
}

// ---------- swipe to close ----------

/** The drag distance that closes a sheet of `height`. */
export function closeThreshold(height) {
  return clamp((height > 0 ? height : 0) * GESTURE.closeShare, GESTURE.closeMin, GESTURE.closeMax);
}

/** Where the sheet sits while dragged: with the finger downward, never above its resting place. */
export function sheetOffset(dy) {
  return Number.isFinite(dy) && dy > 0 ? dy : 0;
}

/** Whether a released downward drag closes the sheet: far enough, or a quick downward flick. A short drag snaps back. */
export function shouldClose({ dy, velocity = 0, height }) {
  if (!(dy > 0)) return false;
  return dy >= closeThreshold(height) || (dy >= GESTURE.flickMin && velocity >= GESTURE.flick);
}

/** The scrim's opacity while the sheet is `offset` down a `height`: fades with the sheet, back to 1 at rest. */
export function scrimOpacity(offset, height) {
  if (!(offset > 0) || !(height > 0)) return 1;
  return clamp(1 - offset / height, 0, 1);
}

// ---------- swipe between pages ----------

/** The drag distance that turns a page `width` wide. */
export function pageThreshold(width) {
  return clamp((width > 0 ? width : 0) * GESTURE.pageShare, GESTURE.pageMin, GESTURE.pageMax);
}

/** Where the page sits while dragged: with the finger, or resisted toward an end with nothing beyond it. */
export function pageOffset(dx, { canPrev = false, canNext = false, width = 0 } = {}) {
  if (!Number.isFinite(dx) || dx === 0) return 0;
  const blocked = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
  return blocked ? rubberBand(dx, width) : dx;
}

/**
 * The page a released sideways drag turns to: 1 (next, the finger moved left), -1 (previous) or 0 (snap back). It
 * turns past the threshold, or on a flick in the same direction; never past the first or last page.
 */
export function pageStep({ dx, velocity = 0, width, canPrev = false, canNext = false }) {
  if (!Number.isFinite(dx) || dx === 0) return 0;
  const step = dx < 0 ? 1 : -1;
  if ((step === 1 && !canNext) || (step === -1 && !canPrev)) return 0;
  const far = Math.abs(dx) >= pageThreshold(width);
  const flick = Math.abs(dx) >= GESTURE.flickMin && Math.sign(velocity) === Math.sign(dx) && Math.abs(velocity) >= GESTURE.flick;
  return far || flick ? step : 0;
}

/** A pager's place: `{ index, count, canPrev, canNext, text }` ("2 of 14"), or null without two pages to move between. */
export function pagerPlace(index, count) {
  if (!Number.isInteger(count) || count < 2 || !Number.isInteger(index) || index < 0 || index >= count) return null;
  return { index, count, canPrev: index > 0, canNext: index < count - 1, text: `${index + 1} of ${count}` };
}
