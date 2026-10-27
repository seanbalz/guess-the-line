// The plain parts of <CountUp> (design lane, "game feel"): a number counts from the last value this device saw for the
// same account and figure to the value the server sent now, once, for the brand's `big` duration with a token easing
// (BRAND_GUIDE D-38 Motion: count-ups take at most 600 ms). Pure: no React, no clock of its own; storage is passed in.
//
// Honest numbers (rule of restraint 8):
// - The resting value is always exactly the server's value, formatted the way the screen formats it.
// - Nothing counts from 0 or from a made-up start: without a value this device saw before, the number simply shows.
// - A missing value reads "—" and leaves the remembered value alone; it is never written as 0.
// - Reduced motion (the device setting or the app's own) shows the final value at once.
import { DASH, MINUS } from '../format.js';

export const COUNT_UP_PREFIX = 'gtl.next.countUp.v1.';
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** The storage key for one figure ("community.guess_spread.season.<userId>") of one account, or null without both. */
export function countUpKey(account, figure) {
  if (typeof account !== 'string' || !account || typeof figure !== 'string' || !figure) return null;
  return `${COUNT_UP_PREFIX}${encodeURIComponent(account)}.${figure}`;
}

const deviceStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The value this device last saw under `key`, or null (nothing saved, storage blocked, or not a finite number). */
export function readSeen(key, storage = deviceStorage()) {
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

/** Remembers a server value under `key`. Only finite numbers are written; a device that blocks storage just never counts. */
export function writeSeen(key, value, storage = deviceStorage()) {
  if (!key || !storage || !finite(value)) return;
  try { storage.setItem(key, String(value)); } catch { /* No count-up next time on this device. */ }
}

/** `[x1, y1, x2, y2]` from a token such as "cubic-bezier(0.05, 0.7, 0.1, 1)", or null. */
export function parseBezier(text) {
  const m = /^\s*cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const points = m.slice(1).map(Number);
  if (!points.every(Number.isFinite) || points[0] < 0 || points[0] > 1 || points[2] < 0 || points[2] > 1) return null;
  return points;
}

/**
 * The easing function of a CSS cubic-bezier: progress (0–1) in, eased progress out. It solves x(t) = progress for t
 * (Newton steps, then bisection when the slope is flat) and returns y(t). Without points it is linear.
 */
export function bezierEasing(points) {
  if (!points) return p => Math.min(1, Math.max(0, p));
  const [x1, y1, x2, y2] = points;
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const slope = (a, b, t) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return progress => {
    const x = Math.min(1, Math.max(0, progress));
    if (x === 0 || x === 1) return x;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = at(x1, x2, t) - x;
      if (Math.abs(error) < 1e-6) return at(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 40; i += 1) {
      const value = at(x1, x2, t);
      if (Math.abs(value - x) < 1e-7) break;
      if (value < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return at(y1, y2, t);
  };
}

/**
 * A CSS time in milliseconds: "600ms" and ".6s" (the built stylesheet's minifier writes tokens.css's 600ms that way)
 * are both 600; anything else is NaN.
 */
export function cssTimeMs(value) {
  const m = /^\s*(\d*\.?\d+)(ms|s)\s*$/i.exec(String(value ?? ''));
  return m ? Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1) : Number.NaN;
}

/** The brand's cap for a count-up (BRAND_GUIDE D-38 Motion: `big`, 600 ms, "count-ups, at most"). */
export const COUNT_UP_CAP_MS = 600;
/** The tokens the count-up is timed with, as the --gx- custom properties tokens.css defines from design/tokens-next.json. */
export const COUNT_UP_TOKENS = Object.freeze({ duration: '--gx-dur-big', ease: '--gx-ease-enter' });

/**
 * The count's timing from the app's tokens: `{ ms, ease }`. `read(name)` returns a custom property's value (the
 * element's computed style inside .gx). The duration is the `big` token held to the brand's cap; without the tokens it
 * is the cap with a plain linear count.
 */
export function countUpTiming(read = () => '') {
  const ms = cssTimeMs(read(COUNT_UP_TOKENS.duration));
  return {
    ms: Number.isFinite(ms) && ms > 0 ? Math.min(ms, COUNT_UP_CAP_MS) : COUNT_UP_CAP_MS,
    ease: bezierEasing(parseBezier(String(read(COUNT_UP_TOKENS.ease) ?? '').trim())),
  };
}

/** Decimal places a value is written with: 0, 1 or 2 (the board's points are whole or halves). */
export function decimalsOf(value) {
  if (!finite(value)) return 0;
  for (let d = 0; d < 2; d += 1) if (Math.abs(Math.round(value * 10 ** d) - value * 10 ** d) < 1e-9) return d;
  return 2;
}

/** A number for the count, with the real minus sign: "46.5", "−3", "20"; "—" when missing. */
export function formatCount(value, decimals = decimalsOf(value)) {
  if (!finite(value)) return DASH;
  const fixed = Math.abs(value).toFixed(Math.max(0, Math.min(2, decimals)));
  return `${value < 0 && Number(fixed) !== 0 ? MINUS : ''}${fixed}`;
}

/**
 * Whether to count and from where: `{ animate, from, to }`. It counts only from a value this device saw (finite and
 * different), never from 0 or a guess, and never under reduced motion or while the page is hidden.
 */
export function countUpPlan({ seen, value, reduced = false, hidden = false } = {}) {
  if (!finite(value)) return { animate: false, from: null, to: null };
  const animate = finite(seen) && seen !== value && !reduced && !hidden;
  return { animate, from: animate ? seen : value, to: value };
}

/**
 * The number one frame shows: from `from` toward `to` by the eased `progress`, rounded to the finer of the two values'
 * decimals and kept between the two (an easing that overshoots never shows a number past the server's). At progress 1
 * (or past it) it is exactly `to`.
 */
export function frameAt({ from, to, progress, ease = p => p }) {
  if (progress >= 1) return to;
  const decimals = Math.max(decimalsOf(from), decimalsOf(to));
  const raw = from + (to - from) * ease(Math.max(0, progress));
  const step = 10 ** decimals;
  const lo = Math.min(from, to), hi = Math.max(from, to);
  return Math.min(hi, Math.max(lo, Math.round(raw * step) / step));
}
