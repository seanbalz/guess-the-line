// Formatters for the new app (redesign build plan, stage 7; prototype contract section 6; design system
// "honest data"). Pure: no clock, storage or network. Every function takes what it needs, including `now`
// for relative times, and returns a string or a small plain object.
//
// - Times are Pacific through Intl with the IANA zone America/Los_Angeles, never a fixed offset, so daylight
//   time is right on both sides of a change (it ends Sun Nov 1, 2026). Every clock time says "PT".
// - Numbers use the real minus sign U+2212, never a hyphen-minus.
// - Anything missing reads "—", never 0 and never "Not available PT" (DP-8).
// - Virtual Units always read "U" (DP-14); a total never gets a plus sign (DP-5); a spread always names its
//   team (DP-6); Pick'em is spelled one way.

export const MINUS = '−';
export const DASH = '—';
export const EN_DASH = '–';
export const SEP = ' · ';
export const TIME_ZONE = 'America/Los_Angeles';
export const ZONE_LABEL = 'PT';
export const PICKEM = "Pick'em";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An instant as epoch ms from a number, a Date or an ISO string; `null` when missing or invalid. */
export function toMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** A finite number from a number or a numeric string; `null` otherwise (so '' and null never read as 0). */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

let pacificFormat = null;
const pacific = () => {
  pacificFormat ??= new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  return pacificFormat;
};

/** The Pacific wall clock of an instant: `{ year, month (1–12), day, weekday (0 = Sun), hour (0–23), minute, second }`, or `null`. */
export function pacificParts(time) {
  const ms = toMs(time);
  if (ms === null) return null;
  const p = {};
  for (const { type, value } of pacific().formatToParts(new Date(ms))) if (type !== 'literal') p[type] = Number(value);
  const hour = p.hour === 24 ? 0 : p.hour;
  return { year: p.year, month: p.month, day: p.day, weekday: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(), hour, minute: p.minute, second: p.second };
}

const pad2 = n => String(n).padStart(2, '0');
const sameDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;

/** "1:03 PM" (no zone; pair it with a "PT" label, or use fmtWhen). */
export function fmtTime(time) {
  const p = pacificParts(time);
  return p ? `${p.hour % 12 || 12}:${pad2(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}` : DASH;
}

/** "Tue" */
export function fmtDay(time) {
  const p = pacificParts(time);
  return p ? DAY_NAMES[p.weekday] : DASH;
}

/** "Oct 13" */
export function fmtMonthDay(time) {
  const p = pacificParts(time);
  return p ? `${MONTH_NAMES[p.month - 1]} ${p.day}` : DASH;
}

/** "Tue Oct 13" */
export function fmtDate(time) {
  const p = pacificParts(time);
  return p ? `${DAY_NAMES[p.weekday]} ${MONTH_NAMES[p.month - 1]} ${p.day}` : DASH;
}

/** "Tue 1:03 PM PT" */
export function fmtWhen(time) {
  return toMs(time) === null ? DASH : `${fmtDay(time)} ${fmtTime(time)} ${ZONE_LABEL}`;
}

/** "Tue Oct 13, 1:03 PM PT" */
export function fmtFull(time) {
  return toMs(time) === null ? DASH : `${fmtDate(time)}, ${fmtTime(time)} ${ZONE_LABEL}`;
}

/** Feed time: "12:30 PM" on the same Pacific day as `now`, "Tue" within six days, else "Oct 12" ("Oct 12, 2025" in another year). */
export function fmtPostTime(time, now) {
  const at = pacificParts(time);
  const today = pacificParts(now);
  if (!at) return DASH;
  if (!today) return fmtMonthDay(time);
  if (sameDay(at, today)) return fmtTime(time);
  if (Math.abs(toMs(now) - toMs(time)) < 6 * DAY) return DAY_NAMES[at.weekday];
  return at.year === today.year ? fmtMonthDay(time) : `${fmtMonthDay(time)}, ${at.year}`;
}

// Time left until `target`. Above an hour it counts from whole minutes, so it matches a clock that shows minutes.
function remaining(target, now) {
  const t = toMs(target);
  const n = toMs(now);
  if (t === null || n === null) return null;
  const diff = Math.max(0, t - n);
  return diff >= HOUR ? Math.ceil(diff / MINUTE) * MINUTE : diff;
}

/** "2d 4h", "21h 34m", "9m", "45s" until `target`; "—" when either time is missing. */
export function fmtLeft(target, now) {
  const diff = remaining(target, now);
  if (diff === null) return DASH;
  const d = Math.floor(diff / DAY);
  const h = Math.floor((diff % DAY) / HOUR);
  const m = Math.floor((diff % HOUR) / MINUTE);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(diff / 1000)}s`;
}

/**
 * Countdown tiles (prototype C5): more than a day shows days, hours and minutes; an hour to a day shows hours and
 * minutes; under an hour shows minutes and seconds. `pending` is under two hours (the amber digits), `done` at zero.
 * A missing time gives no tiles and `known: false`.
 */
export function countdown(target, now) {
  const diff = remaining(target, now);
  if (diff === null) return { known: false, tiles: [], short: DASH, pending: false, done: false, aria: 'Time not available' };
  const d = Math.floor(diff / DAY);
  const h = Math.floor((diff % DAY) / HOUR);
  const m = Math.floor((diff % HOUR) / MINUTE);
  const s = Math.floor((diff % MINUTE) / 1000);
  const tile = (n, one, many, word) => ({ n, u: n === 1 ? one : many, word: `${n} ${word}${n === 1 ? '' : 's'}` });
  let units;
  if (diff >= DAY) units = [tile(d, 'DAY', 'DAYS', 'day'), tile(h, 'HR', 'HRS', 'hour'), tile(m, 'MIN', 'MIN', 'minute')];
  else if (diff >= HOUR) units = [tile(h, 'HR', 'HRS', 'hour'), tile(m, 'MIN', 'MIN', 'minute')];
  else units = [tile(m, 'MIN', 'MIN', 'minute'), tile(s, 'SEC', 'SEC', 'second')];
  return {
    known: true,
    tiles: units.map((x, i) => ({ n: i === 0 && diff >= DAY ? String(x.n) : pad2(x.n), u: x.u })),
    short: fmtLeft(target, now),
    pending: diff > 0 && diff < 2 * HOUR,
    done: diff === 0,
    aria: units.map(x => x.word).join(' '),
  };
}

// Absolute value rounded to two decimals, and whether a minus sign belongs in front (never "−0").
function magnitude(value) {
  const n = toNumber(value);
  if (n === null) return null;
  const abs = Math.round(Math.abs(n) * 100) / 100;
  return { abs, negative: n < 0 && abs !== 0, positive: n > 0 && abs !== 0 };
}

/** "2.5", "−3", "41"; "—" when missing. */
export function fmtNum(value) {
  const m = magnitude(value);
  return m ? `${m.negative ? MINUS : ''}${m.abs}` : DASH;
}

/** "+3", "−3", "0"; "—" when missing. */
export function fmtSigned(value) {
  const m = magnitude(value);
  if (!m) return DASH;
  return m.abs === 0 ? '0' : `${m.negative ? MINUS : '+'}${m.abs}`;
}

/** A spread guess or line from the home team's spread, as the favorite and margin: "SEA −2.5", "JAX −3", "Pick'em". */
export function fmtSpreadPick(awayCode, homeCode, homeSpread) {
  const m = magnitude(homeSpread);
  if (!m || !awayCode || !homeCode) return DASH;
  if (m.abs === 0) return PICKEM;
  return `${m.negative ? homeCode : awayCode} ${MINUS}${m.abs}`;
}

/** One side of a game: "DEN +3", "SEA −3", "DEN Pick'em", "Over 41.5", "Under 41.5". A missing line reads "DEN —". */
export function fmtSide(awayCode, homeCode, side, homeLine) {
  if (side === 'over' || side === 'under') return `${side === 'over' ? 'Over' : 'Under'} ${fmtNum(homeLine)}`;
  if (side !== 'home' && side !== 'away') return DASH;
  const team = side === 'home' ? homeCode : awayCode;
  if (!team) return DASH;
  const m = magnitude(homeLine);
  if (!m) return `${team} ${DASH}`;
  if (m.abs === 0) return `${team} ${PICKEM}`;
  return `${team} ${fmtSigned(side === 'home' ? toNumber(homeLine) : -toNumber(homeLine))}`;
}

/** "SEA @ DEN" (never a raw game id such as "SEA-DEN", DP-15). */
export function fmtMatchup(awayCode, homeCode) {
  return awayCode && homeCode ? `${awayCode} @ ${homeCode}` : DASH;
}

/** A stake: "1.5U", "2U". */
export function fmtU(value) {
  const m = magnitude(value);
  return m ? `${fmtNum(value)}U` : DASH;
}

/** A won, lost or to-win amount: "+0.85U", "−1U", "+2U", "+1.50U"; `sign: false` drops the plus. */
export function fmtAmt(value, sign = true) {
  const m = magnitude(value);
  if (!m) return DASH;
  const body = Number.isInteger(m.abs) ? String(m.abs) : m.abs.toFixed(2);
  return `${m.negative ? MINUS : m.positive && sign ? '+' : ''}${body}U`;
}

/** Dollars, only for real slips: "$72.80", "$50", "$1,250", "−$5". */
export function fmtUsd(value) {
  const m = magnitude(value);
  if (!m) return DASH;
  const digits = Number.isInteger(m.abs) ? 0 : 2;
  const body = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(m.abs);
  return `${m.negative ? MINUS : ''}$${body}`;
}

/** "52.7%", "−4.5%"; "—" when missing (an ROI before anything settles). */
export function fmtPct(value) {
  const n = toNumber(value);
  if (n === null) return DASH;
  const body = Math.abs(n).toFixed(1);
  return `${n < 0 && Number(body) !== 0 ? MINUS : ''}${body}%`;
}

/** American odds: "−110", "+120", "+100". */
export function fmtOdds(value) {
  const n = toNumber(value);
  if (n === null || Math.round(n) === 0) return DASH;
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${MINUS}${Math.abs(r)}`;
}

/** A record with en dashes: "2–0–0". */
export function fmtRecord(wins, losses, pushes) {
  const parts = [wins, losses, pushes].map(toNumber);
  return parts.some(x => x === null) ? DASH : parts.join(EN_DASH);
}

/** "1 bet", "3 bets", "2 challenges". */
export function plural(count, one, many) {
  const n = toNumber(count);
  return n === null ? DASH : `${n} ${n === 1 ? one : many || `${one}s`}`;
}

// Time past the deadline in the largest two units: [[2, 'h', 'hour'], [5, 'min', 'minute']].
function lateUnits(minutes) {
  const total = Math.floor(minutes);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return h > 0 ? [[d, 'd', 'day'], [h, 'h', 'hour']] : [[d, 'd', 'day']];
  if (h > 0) return m > 0 ? [[h, 'h', 'hour'], [m, 'min', 'minute']] : [[h, 'h', 'hour']];
  return [[m, 'min', 'minute']];
}

/**
 * The Late marker (D-30): "Late · 12 min", "Late · 2 h 5 min", "Late · 2 d 3 h". It is shown in the pending
 * colour plus this text, never colour alone. `minutes` is the stored time past the deadline; without it the
 * marker still reads "Late".
 */
export function fmtLate(minutes) {
  const n = toNumber(minutes);
  if (n === null || n < 0) return 'Late';
  if (n < 1) return `Late${SEP}under 1 min`;
  return `Late${SEP}${lateUnits(n).map(([v, u]) => `${v} ${u}`).join(' ')}`;
}

/** The Late marker for a screen reader: "Late by 2 hours 5 minutes". */
export function fmtLateAria(minutes) {
  const n = toNumber(minutes);
  if (n === null || n < 0) return 'Late';
  if (n < 1) return 'Late by under a minute';
  return `Late by ${lateUnits(n).map(([v, , word]) => `${v} ${word}${v === 1 ? '' : 's'}`).join(' ')}`;
}
