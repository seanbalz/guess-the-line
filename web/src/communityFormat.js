// Shared wording for Guess picks on the Community screens (feed posts, revealed picks, history), so a pick
// reads the same everywhere: "Cowboys −9.5", "Even (pick'em)", or a plain total such as "47.5".
import { TEAM_NAMES } from '../../shared/nfl-schedule.mjs';

export const MODE = { guess_spread: 'Spread', guess_total: 'Total' };
export const show = n => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1));
export const team = code => TEAM_NAMES[code] || code;
export const shortName = code => team(code).split(' ').at(-1);
/** A home-referenced spread or a total, in the words the feed uses. `even` is the pick'em wording ("Even (pick'em)" for a guess, "Even" for a line). */
export function pickText(mode, awayCode, homeCode, value, { even = "Even (pick'em)" } = {}) {
  if (!Number.isFinite(value)) return '—';
  if (mode === 'guess_total') return show(value);
  if (value === 0) return even;
  return `${shortName(value < 0 ? homeCode : awayCode)} −${show(Math.abs(value))}`;
}
