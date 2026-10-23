// Guess the Points (D-56): the rules every layer shares. Pure; no I/O.
import { pacificDate, pacificToUtc, weekOpenAt } from './nfl-schedule.mjs';

export const POINTS_SLOTS = Object.freeze(['QB', 'RB', 'WR', 'TE', 'FLEX']);
export const SLOT_POSITIONS = Object.freeze({ QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], FLEX: ['RB', 'WR', 'TE'] });
export const GUESS_MIN = 0;
export const GUESS_MAX = 60;
export const POINTS_RULES = Object.freeze({ format: 'ppr', passingTds: 4, version: 'points-1' });

const finite = value => typeof value === 'number' && Number.isFinite(value);
export const validGuess = value => Number.isInteger(value) && value >= GUESS_MIN && value <= GUESS_MAX;
/** Whole tenths; toFixed strips float noise such as 146.49999999999997 before rounding. */
export const tenths = value => Math.sign(value) * Math.round(Number((Math.abs(value) * 10).toFixed(6)));

/** One decimal, half away from zero (PostgreSQL numeric rounding). Missing never becomes 0. */
export function roundActual(points) {
  if (!finite(points)) return null;
  const value = tenths(points) / 10;
  return value === 0 ? 0 : value;
}
const score = (a, b) => Math.max(0, 100 - Math.abs(tenths(a) - tenths(b))) / 10;
export const slotPoints = (guess, actual) => (validGuess(guess) && finite(actual) ? score(guess, actual) : null);
export const housePoints = (estimate, actual) => (finite(estimate) && finite(actual) ? score(estimate, actual) : null);
export const weekMax = voids => 10 * (POINTS_SLOTS.length - voids);

/** Competition ranking on exact tenths (shared ranks, D-36); rows without points are not ranked. */
export function rankPoints(rows) {
  const scored = rows.filter(row => finite(row?.points)).map(row => ({ ...row, key: tenths(row.points) }))
    .sort((a, b) => b.key - a.key || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
  return scored.map(({ key, ...row }) => ({ ...row, rank: 1 + scored.filter(r => r.key > key).length, tied: scored.filter(r => r.key === key).length > 1 }));
}
export const rankLabel = row => (row?.rank ? (row.tied ? `T-${row.rank}` : String(row.rank)) : '—');

const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Tuesday 12:00 PM America/Los_Angeles of the competition week (D-24 Monday open + 1 day). */
export const pointsOpenAt = deadline => pacificToUtc(addDays(pacificDate(weekOpenAt(deadline)).date, 1), '12:00');
/** The first Thursday after the week's last kickoff (Pacific date), at 12:00 PM PT. */
export function finalizeAt(lastKickoff) {
  const { date, weekday } = pacificDate(lastKickoff);
  return pacificToUtc(addDays(date, ((4 - weekday + 7) % 7) || 7), '12:00');
}
