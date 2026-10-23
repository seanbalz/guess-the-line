// Guess the Points screens (D-56 spec section 5; ballot card option D, the D-56 addendum): pure helpers that turn the
// /points/read reply into words. They decide no rule: the server's reply already holds only what this viewer may see
// (cloud/points.mjs applies the reveal gate again), so nothing here hides or opens a guess. "—" is missing, never 0.
import { GUESS_MAX, GUESS_MIN } from '../../../../../shared/points-scoring.mjs';

export { GUESS_MAX, GUESS_MIN };
/** The sheet's chip rail: 0, 5 … 40, and More for 45 … 60 (spec 5). */
export const QUICK_GUESSES = Object.freeze([0, 5, 10, 15, 20, 25, 30, 35, 40]);
export const MORE_GUESSES = Object.freeze([45, 50, 55, 60]);
export const SLOT_NAMES = Object.freeze({ QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', FLEX: 'Flex' });

/** The read failed because Points is not hosted yet: gtl-api's coming-soon 404 (GTL_POINTS_OFF) or its own "Not found.". */
export const comingSoon = error => error?.status === 404;

/** One decimal for tenths, whole numbers as they are, "—" for missing. */
export function pts(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const KICKOFF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' });
/** "Sun 10:00 AM PT". */
export function kickoffText(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? `${KICKOFF.format(new Date(time))} PT` : '—';
}

/** "PIT @ CLE" from the nflverse game key (2026_07_PIT_CLE), or the player's team alone when the key has another form. */
export function matchupText(slot) {
  const match = /^\d{4}_\d{2}_([A-Z]{2,3})_([A-Z]{2,3})$/.exec(slot?.gameKey || '');
  return match ? `${match[1]} @ ${match[2]}` : slot?.team || '—';
}

/** Whether the viewer can still save or lock this slot: the week is open, the game has not kicked off, it is not locked. */
export const editable = (read, slot) => read?.status === 'open' && slot.closed !== true && slot.own?.locked !== true;

/** The card's one status word (spec 5): To pick, Draft, Locked in, Closed, Void · inactive, Pending stats. */
export function slotStatus(slot) {
  if (slot.state === 'void') return 'Void · inactive';
  if (slot.closed && slot.state === 'pending' && slot.own?.locked) return 'Pending stats';
  if (slot.own?.locked) return 'Locked in';
  if (slot.closed) return 'Closed';
  if (slot.own) return 'Draft';
  return 'To pick';
}

/** The card that glows (at most two glow cards in view, D-55): the next slot to pick, else the first slot. */
export function heroSlot(read) {
  const slots = read?.slots || [];
  return (slots.find(slot => editable(read, slot)) ?? slots[0])?.slot ?? null;
}

/** "You 24.6 of 50 · PROVISIONAL" (spec 5); before any stats, "You — of 50". */
export function summaryLine(read) {
  const result = read?.result;
  if (!result) return '';
  return `You ${pts(result.points)} of ${pts(result.maximum)}${result.status ? ` · ${result.status}` : ''}`;
}

/** Everyone's locked guess for a revealed slot, the viewer first: `[{ userId, name, guess, points, you }]`. */
export function everyone(slot, viewer) {
  const own = slot.own?.locked ? [{ userId: viewer, name: 'You', guess: slot.own.guess, points: slot.own.points, you: true }] : [];
  return [...own, ...(slot.guesses || []).filter(row => row.userId !== viewer).map(row => ({ userId: row.userId, name: row.displayName, guess: row.guess, points: row.points, you: false }))];
}

/** The results line naming the closest member (option D): "Troy was closest", "You and Luke were closest"; null before stats. */
export function closestLine(slot, viewer) {
  if (slot.state !== 'scored' || typeof slot.actual !== 'number') return null;
  const rows = everyone(slot, viewer);
  if (!rows.length) return null;
  const off = row => Math.round(Math.abs(row.guess * 10 - slot.actual * 10));
  const best = Math.min(...rows.map(off));
  const names = rows.filter(row => off(row) === best).map(row => row.name);
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${list} ${names.length === 1 && names[0] !== 'You' ? 'was' : 'were'} closest`;
}

/** The three result tiles (option D): You / Actual / Points, each "—" when missing. */
export function resultTiles(slot) {
  const locked = slot.own?.locked === true;
  return [
    { label: 'You', value: locked ? pts(slot.own.guess) : '—' },
    { label: 'Actual', value: slot.state === 'scored' ? pts(slot.actual) : '—' },
    { label: 'Points', value: locked && slot.state === 'scored' ? pts(slot.own.points) : '—' },
  ];
}

/** The Play landing's Points status line (spec 5). `read` is the reply or null; `error` the failed read. */
export function landingStatus(read, error) {
  if (comingSoon(error)) return 'Points is coming soon';
  if (error) return 'Points could not be loaded';
  if (!read) return 'Loading Points…';
  if (read.status !== 'open') return 'Opens Tuesdays at 12:00 PM PT';
  const slots = read.slots || [];
  const locked = slots.filter(slot => slot.own?.locked).length;
  const next = slots.filter(slot => editable(read, slot)).map(slot => slot.kickoff).sort()[0];
  if (next) return `${locked} of ${slots.length} locked · next locks ${kickoffText(next)}`;
  return `Week ${read.week} · ${summaryLine(read)}`;
}

/** Clamp a −1 / +1 step to 0 … 60; from nothing, −1 and +1 both start at 0. */
export function step(value, by) {
  if (!Number.isInteger(value)) return GUESS_MIN;
  return Math.min(GUESS_MAX, Math.max(GUESS_MIN, value + by));
}

/** Board rows (spec 5): the week and season standings joined by member, ranked by season, and the unranked House row. */
export function boardRows(read, viewer) {
  const week = new Map((read?.standings?.week || []).map(row => [row.userId, row]));
  const season = read?.standings?.season || [];
  const ids = [...season.map(row => row.userId), ...[...week.keys()].filter(id => !season.some(row => row.userId === id))];
  const members = ids.map(id => {
    const s = season.find(row => row.userId === id), w = week.get(id);
    return { userId: id, name: (s ?? w).displayName, you: id === viewer, week: w?.points ?? null, season: s?.points ?? null,
      rank: s?.rank ?? null, tied: s?.tied === true, provisional: s?.provisional === true, beatHouse: s?.beatHouse ?? null, weeksPlayed: s?.weeksPlayed ?? null };
  });
  return { members, house: { week: read?.result?.house?.complete ? read.result.house.points ?? null : null } };
}
