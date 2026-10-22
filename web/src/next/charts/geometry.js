// D-55 trend charts as plain numbers: the smoothed line and area, the zero baseline, the nearest point to a pointer,
// the season stems and the signed labels. Pure (no React, DOM or clock) so tests/next-charts.test.mjs can check it.

/** Break-even at −110: 110 / 210 = 52.38%, drawn as the tick on every hit-rate bar. */
export const BREAK_EVEN_PCT = 52.4;
const MINUS = '−';
const round1 = n => Math.round(n * 10) / 10;
const finite = n => typeof n === 'number' && Number.isFinite(n);

/** "+45.2", "−2.2", "0.0" with the real minus sign; `digits` decimals. */
export function signed(n, digits = 1) {
  if (!finite(n)) return '—';
  const text = Math.abs(n).toFixed(digits);
  return Number(text) === 0 ? text : `${n > 0 ? '+' : MINUS}${text}`;
}

/** "229–163–3", leaving off zero pushes. */
export const recordText = (w, l, p = 0) => `${w}–${l}${p ? `–${p}` : ''}`;

/**
 * The line through `values` in a `width` × `height` box, smoothed with a Catmull-Rom curve that passes through every
 * point (so the drawn line never invents a peak between two real points), with the zero line always in range.
 * Returns `{ line, area, zeroY, x, y }`; `area` closes along the zero line.
 */
export function linePath(values, { width = 320, height = 160, top = 12, bottom = 12 } = {}) {
  const v = values.filter(finite);
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v), span = hi - lo || 1;
  const x = i => (v.length > 1 ? (i * width) / (v.length - 1) : 0);
  const y = value => top + ((hi - value) * (height - top - bottom)) / span;
  const pts = v.map((value, i) => [x(i), y(value)]);
  let line = pts.length ? `M${round1(pts[0][0])} ${round1(pts[0][1])}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C${round1(c1[0])} ${round1(c1[1])} ${round1(c2[0])} ${round1(c2[1])} ${round1(p2[0])} ${round1(p2[1])}`;
  }
  const zeroY = round1(y(0));
  const area = pts.length ? `${line} L${round1(x(v.length - 1))} ${zeroY} L0 ${zeroY} Z` : '';
  return { line, area, zeroY, x, y };
}

/** The point nearest a pointer `fraction` (0 at the left edge, 1 at the right) of `count` points. */
export function nearestIndex(fraction, count) {
  if (!(count > 0)) return 0;
  const f = finite(fraction) ? Math.min(1, Math.max(0, fraction)) : 1;
  return Math.round(f * (count - 1));
}

/**
 * One stem per season from the zero line: `{ zeroY, stems: [{ top, height, up }] }` in a box `height` tall, as
 * fractions of that height (0 to 1) so the HTML stems scale with their container. A season at exactly zero gets a
 * 2% stub so it still shows.
 */
export function stemLayout(units, { pad = 0.06 } = {}) {
  const v = units.map(n => (finite(n) ? n : 0));
  const lo = Math.min(0, ...v), hi = Math.max(0, ...v), span = hi - lo || 1;
  const y = value => pad + ((hi - value) * (1 - 2 * pad)) / span;
  const zeroY = y(0);
  return {
    zeroY,
    stems: v.map(value => {
      const end = y(value), height = Math.max(0.02, Math.abs(end - zeroY));
      return { top: value >= 0 ? zeroY - height : zeroY, height, up: value >= 0 };
    }),
  };
}

/** Win rate of decided games as a percent with one decimal (pushes left out), or null with none decided. */
export function hitPct(w, l) {
  return w + l > 0 ? round1((100 * w) / (w + l)) : null;
}
