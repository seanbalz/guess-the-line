// Shared wording for Guess picks on the Community screens (feed posts, revealed picks, history), so a pick
// reads the same everywhere: "Cowboys −9.5", "Even (pick'em)", or a plain total such as "47.5".
import { TEAM_NAMES } from '../../shared/nfl-schedule.mjs';

export const MODE = { guess_spread: 'Spread', guess_total: 'Total' };
// Redesign stage 17 (DP-1): a missing number (no ballot, nothing scored yet) reads "—", never "0.0".
export const show = n => (typeof n !== 'number' || !Number.isFinite(n) ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1));
export const team = code => TEAM_NAMES[code] || code;
export const shortName = code => team(code).split(' ').at(-1);
/** A home-referenced spread or a total, in the words the feed uses. `even` is the pick'em wording ("Even (pick'em)" for a guess, "Even" for a line). */
export function pickText(mode, awayCode, homeCode, value, { even = "Even (pick'em)" } = {}) {
  if (!Number.isFinite(value)) return '—';
  if (mode === 'guess_total') return show(value);
  if (value === 0) return even;
  return `${shortName(value < 0 ? homeCode : awayCode)} −${show(Math.abs(value))}`;
}

/**
 * The Late marker (D-30) stored on a sent ballot, `{ deadline, minutes }` (written from M-07): "Late · 12 min",
 * "Late · 2 h 5 min", "Late · 2 d 3 h", the same words as the new app's fmtLate (web/src/next/format.js, kept equal by
 * tests/community-cloud.test.mjs). Empty when there is no marker; without minutes it still reads "Late".
 */
export function lateText(late) {
  if (!late || typeof late !== 'object') return '';
  const n = typeof late.minutes === 'number' && Number.isFinite(late.minutes) ? late.minutes : null;
  if (n === null || n < 0) return 'Late';
  if (n < 1) return 'Late · under 1 min';
  const total = Math.floor(n), d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  const parts = d > 0 ? (h > 0 ? [[d, 'd'], [h, 'h']] : [[d, 'd']]) : h > 0 ? (m > 0 ? [[h, 'h'], [m, 'min']] : [[h, 'h']]) : [[m, 'min']];
  return `Late · ${parts.map(([v, u]) => `${v} ${u}`).join(' ')}`;
}
