// Guess the Points screens (D-56 spec section 5; ballot card option D, the D-56 addendum): pure helpers that turn the
// /points/read reply into words. They decide no rule: the server's reply already holds only what this viewer may see
// (cloud/points.mjs applies the reveal gate again), so nothing here hides or opens a guess. "—" is missing, never 0.
import { GUESS_MAX, GUESS_MIN } from '../../../../../shared/points-scoring.mjs';
import { ordinal } from '../../league/rankMoment.js';

export { GUESS_MAX, GUESS_MIN };
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

/** `{ away: "PIT", home: "CLE" }` from the nflverse game key (2026_07_PIT_CLE), for the marks (D-62); null for another form. */
export function matchupCodes(slot) {
  const match = /^\d{4}_\d{2}_([A-Z]{2,3})_([A-Z]{2,3})$/.exec(slot?.gameKey || '');
  return match ? { away: match[1], home: match[2] } : null;
}

/** "PIT @ CLE" (text-only places), or the player's team alone when the key has another form. */
export function matchupText(slot) {
  const codes = matchupCodes(slot);
  return codes ? `${codes.away} @ ${codes.home}` : slot?.team || '—';
}

/** Whether the viewer can still save or lock this slot: the week is open, the game has not kicked off, it is not locked. */
export const editable = (read, slot) => read?.status === 'open' && slot.closed !== true && slot.own?.locked !== true;

/**
 * The card's one status word (spec 5): To pick, Draft, Locked in, Closed, Void · inactive, Pending stats, and for a scored
 * slot the week's PROVISIONAL or FINAL (decision 2A, D-56 addendum of October 23).
 */
export function slotStatus(slot, weekStatus = null) {
  if (slot.state === 'void') return 'Void · inactive';
  if (slot.state === 'scored' && weekStatus) return weekStatus;
  if (slot.closed && slot.state === 'pending' && slot.own?.locked) return 'Pending stats';
  if (slot.own?.locked) return 'Locked in';
  if (slot.closed) return 'Closed';
  if (slot.own) return 'Draft';
  return 'To pick';
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

/** The earliest kickoff among the slots the viewer can still save or lock, or null when none is left. */
export const nextLock = read => (read?.slots ?? []).filter(slot => editable(read, slot)).map(slot => slot.kickoff).sort()[0] ?? null;

/** D-69 "Guess the Points exact": a scored slot whose locked guess (a whole number) is its actual (10 of 10). */
export const isExact = slot => slot?.state === 'scored' && slot.own?.locked === true && Number.isInteger(slot.own.guess) && slot.actual === slot.own.guess;

/**
 * One slot tile on the week card (P4A): `{ code, word, name, value, number, label }`. `value` is the tile's one value
 * line: "You 18" once locked, "Draft 14" for a draft, "Locks Sun 10:00 AM PT" while still to pick, "6.6 / 10" once
 * scored, "— no guess" after kickoff with nothing locked, "No points" when void. `number` says the line is a number (the
 * number style). `label` is the tile's whole accessible name, in words.
 */
export function slotTile(slot, weekStatus = null) {
  const word = slotStatus(slot, weekStatus), locked = slot.own?.locked === true;
  const line = (value, said = value, number = true) => ({ value, said, number });
  const shown = slot.state === 'void' ? line('No points', 'void, no points', false)
    : slot.state === 'scored' ? (locked ? line(`${pts(slot.own.points)} / 10`, `${pts(slot.own.points)} of 10 points`) : line('— no guess', 'no guess', false))
    : locked ? line(`You ${pts(slot.own.guess)}`)
    : slot.closed ? line('— no guess', 'no guess', false)
    : slot.own ? line(`Draft ${pts(slot.own.guess)}`)
    : line(`Locks ${kickoffText(slot.kickoff)}`, `locks ${kickoffText(slot.kickoff)}`, false);
  return { code: slot.slot, word, name: slot.name, value: shown.value, number: shown.number,
    label: `${SLOT_NAMES[slot.slot] ?? slot.slot}, ${slot.name}, ${matchupText(slot)}, ${kickoffText(slot.kickoff)}, ${word}, ${shown.said}` };
}

/**
 * The week card's five-part bar, one part per slot in the read's order: `{ parts: [{ slot, state }], label }`. A state is
 * 'locked', 'draft', 'open' (to pick) or 'closed' (kicked off, or void, with nothing locked); `label` says it in words.
 */
export function weekBar(read) {
  const slots = read?.slots ?? [];
  const parts = slots.map(slot => ({ slot: slot.slot, state: slot.own?.locked ? 'locked' : slot.closed || slot.state === 'void' ? 'closed' : slot.own ? 'draft' : 'open' }));
  const count = state => parts.filter(part => part.state === state).length, drafts = count('draft');
  return { parts, label: `${count('locked')} of ${slots.length} slots locked${drafts ? `, ${drafts} ${drafts === 1 ? 'draft' : 'drafts'}` : ''}` };
}

/** The week card's one meta line: "2 of 5 locked · next locks Sun 10:00 AM PT" while a slot can be locked, then the week's "You 24.6 of 50 · PROVISIONAL". */
export function weekLine(read) {
  const slots = read?.slots ?? [];
  const locked = slots.filter(slot => slot.own?.locked).length, next = nextLock(read);
  if (next) return `${locked} of ${slots.length} locked · next locks ${kickoffText(next)}`;
  return read?.result?.status ? summaryLine(read) : `${locked} of ${slots.length} locked`;
}

/** The week card's sixth tile, the Points board: the viewer's season rank ("3rd", "of 9" ranked), or "—" before one. */
export function boardTile(read, viewer) {
  const { members } = boardRows(read, viewer);
  const me = members.find(row => row.you), ranked = members.filter(row => row.rank !== null).length;
  if (!me || me.rank === null) return { big: '—', sub: 'No rank yet', label: 'Points board, no rank yet' };
  const place = ordinal(me.rank);
  return { big: place, sub: `of ${ranked}${me.tied ? ' · tied' : ''}`, label: `Points board, ${place} of ${ranked}${me.tied ? ', tied' : ''}` };
}

/**
 * The Play landing's Guess the Points tile (P1B): `{ big, sub, tone, label }`. While a week is open `big` is "2 / 5"
 * (locked of five) and `sub` the next lock ("Next locks Sun 10:00 AM PT"), "All locked" (tone good) or "slots guessed";
 * otherwise `big` is "—". A 404 keeps today's "Points is coming soon" (comingSoon).
 */
export function pointsTile(read, error) {
  const plain = (sub, said) => ({ big: '—', sub, tone: 'plain', label: `Guess the Points, ${said}` });
  if (comingSoon(error)) return plain('Coming soon', 'Points is coming soon');
  if (error) return plain('Could not load', 'Points could not be loaded');
  if (!read) return plain('Loading…', 'loading');
  if (read.status !== 'open') return plain('Opens Tuesday', 'opens Tuesdays at 12:00 AM PT');
  const slots = read.slots || [];
  const locked = slots.filter(slot => slot.own?.locked).length, next = nextLock(read);
  const all = slots.length > 0 && locked === slots.length;
  const sub = all ? 'All locked' : next ? `Next locks ${kickoffText(next)}` : 'slots guessed';
  return { big: `${locked} / ${slots.length}`, sub, tone: all ? 'good' : 'plain', label: `Guess the Points, ${locked} of ${slots.length} locked, ${sub}` };
}

/**
 * The number line after the gate opens (decision 5B). The scale runs from 0 to max(30, the highest guess or House estimate
 * rounded up to 10). Each member is a marker at their guess (the viewer's is "You"); markers closer than a third of the scale
 * share no lane, so overlapping faces are offset vertically: the slot layer's line is at least 170px wide at 320, where a
 * third keeps two 44px faces apart. The House is a tick with its own label.
 */
export function numberLine(slot, viewer) {
  const rows = everyone(slot, viewer);
  const house = typeof slot.house?.estimate === 'number' ? slot.house.estimate : null;
  const values = [...rows.map(row => row.guess), ...(house === null ? [] : [house])];
  const max = Math.max(30, Math.ceil(Math.max(0, ...values) / 10) * 10);
  const gap = max / 3, lanes = [];
  const markers = [...rows].sort((a, b) => a.guess - b.guess || (a.you ? -1 : 1)).map(row => {
    let lane = lanes.findIndex(last => row.guess - last >= gap);
    if (lane < 0) { lane = lanes.length; lanes.push(row.guess); } else lanes[lane] = row.guess;
    return { ...row, lane, pct: (row.guess / max) * 100 };
  });
  return { max, lanes: Math.max(1, lanes.length), markers, house: house === null ? null : { value: house, points: slot.house?.points ?? null, pct: (house / max) * 100 } };
}

/** Exact values in words for a number line, for an accessible name: "You 22, Troy Fixture 24, House 19.4". */
export const lineWords = line => [...line.markers.map(m => `${m.name} ${pts(m.guess)}`), ...(line.house ? [`House ${pts(line.house.value)}`] : [])].join(', ');

/** Clamp a stepper move (±1, or ±5 while held) to 0 … 60; from nothing, every move starts at 0. */
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

const weekOf = value => Number.isInteger(value?.season) && Number.isInteger(value?.week) ? { season: value.season, week: value.week } : null;
/**
 * The week the commissioner's "Publish now" checks (POST /points/slate, cloud/points.mjs), or null. An unopened read names
 * its week, or none when no week was ever published: then the Community's current week (`/community/read` `week`). An open
 * read is the newest published week, so a later current week may hold a draft waiting for its Tuesday open: that one.
 */
export function publishTarget(read, current) {
  const now = weekOf(current);
  if (read?.status === 'unopened') return weekOf(read) ?? now;
  const shown = read?.status === 'open' ? weekOf(read) : null;
  return shown && now && (now.season > shown.season || now.season === shown.season && now.week > shown.week) ? now : null;
}

/**
 * The sentence for a refused preview or publish. gtl-api sends these refusals' sentences without their codes, so the status
 * decides: 403 GTL_POINTS_FORBIDDEN, 404 GTL_POINTS_NO_SLATE, 409 GTL_POINTS_TOO_LATE; anything else keeps the server's own.
 * Publishing is idempotent (a published slate replays), so an unconfirmed publish is safe to send again.
 */
export function publishProblem(error, { week, action = 'publish' } = {}) {
  if (error?.uncertain) return action === 'publish' ? 'We could not confirm the publish. Check again; publishing twice is safe.' : 'The slate could not be checked. Try again.';
  if (!error?.status) return 'No connection. Reconnect and try again.';
  if (error.code === 'GTL_POINTS_OFF') return 'Points is coming soon.';
  if (error.status === 403) return 'Only the commissioner can publish the Points slate.';
  if (error.status === 404) return 'This week’s slate hasn’t been drafted yet — projections are still loading.';
  if (error.status === 409) return `Week ${week}’s first game has kicked off, so this slate can no longer be published.`;
  return typeof error.message === 'string' && error.message.trim() ? error.message : 'The Points slate is unavailable. Try again.';
}

/**
 * The drafted slate's rows for the commissioner's preview: slot, player, matchup (text, and `codes` for the marks or
 * null) and kickoff. Never the House estimate.
 */
export const previewRows = slate => (Array.isArray(slate?.slots) ? slate.slots : []).filter(row => typeof row?.slot === 'string')
  .map(row => ({ slot: row.slot, name: typeof row.name === 'string' && row.name ? row.name : '—', matchup: matchupText(row), codes: matchupCodes(row), kickoff: kickoffText(row.kickoff) }));
