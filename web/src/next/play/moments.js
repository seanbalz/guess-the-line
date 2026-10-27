// Play's "game feel" (design upgrade): the week progress strip, the lock-in moment and the reveal moment. Pure: no
// React, DOM, network or clock of its own. The server decides every state here; these only read what it sent.
// - Week progress: each game's state for one market, counted ("5 of 14 locked").
// - Lock-in moment: which requested lock-ins a fresh read confirms. Nothing plays on a request alone.
// - Reveal moment: the other players' guesses the server has opened for a game (D-31 as amended by D-39: your lock-in,
//   a sit-out or that game's kickoff), and which of them this device has not shown before (kept under a `gtl.` key).
import { lockConfirmed, lockedAt, number } from './scoring.js';

/** Game states in the order the strip's legend lists them. */
export const GAME_STATES = Object.freeze(['locked', 'draft', 'open', 'kicked', 'skipped', 'notopen']);
/** One word per state, for the legend; the cards keep their own longer words. */
export const STATE_WORDS = Object.freeze({ locked: 'Locked', draft: 'Draft', open: 'Open', kicked: 'Kicked off', skipped: 'Sat out', notopen: 'Not open' });

const instant = value => (typeof value === 'string' || typeof value === 'number' ? Date.parse(value) : NaN);

/**
 * One game's state for one market, from the same facts the card uses: a server lock wins; then a game that kicked
 * off without a lock; then a sit-out; then a week not open yet; then a guess entered but not locked (saved or not); else
 * open. `now` and `openAt` are milliseconds; a missing clock reads as kicked off, so nothing is offered on a guess.
 */
export function gameState(game, { ballot, picks = {}, now, openAt, satOut = false } = {}) {
  if (lockedAt(ballot, game.id)) return 'locked';
  if (!Number.isFinite(now) || !(now < instant(game.kickoff))) return 'kicked';
  if (satOut) return 'skipped';
  if (Number.isFinite(openAt) && now < openAt) return 'notopen';
  return number(picks[game.id]) !== null ? 'draft' : 'open';
}

/**
 * The week strip for one market: `{ total, locked, counts, games: [{ id, game, state }], next, summary }`. Games keep
 * the order the server sent them (kickoff order). `next` is the first game still to lock (a draft or an open game).
 */
export function weekProgress({ games = [], ballot, picks = {}, now, openAt, satOut = false } = {}) {
  const rows = games.map(game => ({ id: game.id, game, state: gameState(game, { ballot, picks, now, openAt, satOut }) }));
  const counts = Object.fromEntries(GAME_STATES.map(state => [state, rows.filter(row => row.state === state).length]));
  const next = rows.find(row => row.state === 'draft' || row.state === 'open') ?? null;
  return { total: rows.length, locked: counts.locked, counts, games: rows, next, summary: `${counts.locked} of ${rows.length} locked` };
}

/** The legend: one entry per state with at least one game, `{ state, count, word }`, in GAME_STATES order. */
export function progressLegend(progress) {
  return GAME_STATES.filter(state => progress.counts[state] > 0).map(state => ({ state, count: progress.counts[state], word: STATE_WORDS[state] }));
}

/**
 * The lock-ins a fresh read confirms for this request: every requested game is locked with the requested value
 * (lockConfirmed), or nothing. A refusal, a lost reply or a lock made with another value elsewhere confirms nothing.
 */
export function confirmedLockIns(latest, request) {
  if (!request?.lockIn?.length || !lockConfirmed(latest, request)) return [];
  return request.lockIn.filter(id => lockedAt(latest.ballots?.[request.mode], id));
}

const PICK_STATUSES = new Set(['in', 'late', 'not_yet', 'sat_out']);

/**
 * Another player's guesses for one game from `/community/picks`, only as far as the server opened them:
 * `{ open, rows: [{ id, name, pick, late, removed }], waiting, satOut }` or null when the game is not in the reply.
 * A row shows only when the game is open to the viewer, the guess is locked in (in or late), the server did not hide
 * it and sent a number. The viewer's own row never shows here (the card already has it). `waiting` counts the other
 * players not locked in, `satOut` those sitting out.
 */
export function revealRows(reply, viewer, members, gameId) {
  const game = Array.isArray(reply?.games) ? reply.games.find(row => row?.gameId === gameId) : null;
  if (!game) return null;
  const me = String(viewer ?? '').toLowerCase();
  const names = new Map((members ?? []).filter(member => typeof member?.id === 'string').map(member => [member.id.toLowerCase(), member.displayName]));
  const others = (Array.isArray(game.rows) ? game.rows : []).filter(row => typeof row?.userId === 'string' && PICK_STATUSES.has(row.status) && row.userId.toLowerCase() !== me);
  const open = game.open === true;
  const rows = open ? others.filter(row => ['in', 'late'].includes(row.status) && row.lockedIn !== false && row.hidden !== true && number(row.pick) !== null).map(row => ({
    id: row.userId, name: names.get(row.userId.toLowerCase()) || (row.removed ? 'Former member' : 'Community player'),
    pick: row.pick, late: row.status === 'late' ? (row.late ?? {}) : null, removed: row.removed === true,
  })) : [];
  return { open, rows, waiting: others.filter(row => row.status === 'not_yet').length, satOut: others.filter(row => row.status === 'sat_out').length };
}

/**
 * The "Where everyone landed" strip (ui/Strip) for an opened game: each shown guess along the axis from the lowest to
 * the highest, yours with the lime ring, and the line as the tick only when the caller passes one the player may see
 * (their saved scoring line). `{ items, linePct, low, high }`; with no guesses, null.
 */
export function landing(rows, own, line) {
  const people = [...(own && number(own.pick) !== null ? [{ id: own.id, name: own.name, pick: own.pick, you: true }] : []), ...rows];
  if (!people.length) return null;
  const values = [...people.map(person => person.pick), ...(number(line) !== null ? [line] : [])];
  const low = Math.min(...values), high = Math.max(...values), span = high - low;
  const pct = value => (span > 0 ? ((value - low) / span) * 100 : 50);
  return { items: people.map(person => ({ id: person.id, name: person.name, pct: pct(person.pick), you: person.you === true })), linePct: number(line) !== null ? pct(line) : null, low, high };
}

// ---------- "seen" state for the reveal: which guesses this device has already drawn ----------

export const SEEN_PREFIX = 'gtl.play.reveal-seen.v1.';
export const seenKey = accountId => `${SEEN_PREFIX}${accountId}`;
/** One game and market in one week: "2026-8-guess_spread-SEA-DEN". */
export const revealScope = ({ season, week, mode, gameId }) => `${season}-${week}-${mode}-${gameId}`;

/** The stored map `{ scope: [userId] }`; anything unreadable is an empty map (the rows then simply animate once more). */
export function readSeen(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, ids]) => Array.isArray(ids) && ids.every(id => typeof id === 'string')));
  } catch { return {}; }
}

/** The ids in `ids` this device has not drawn for `scope`. */
export function unseen(seen, scope, ids) {
  const known = new Set(seen?.[scope] ?? []);
  return ids.filter(id => !known.has(id));
}

/**
 * `seen` with `ids` added to `scope`, keeping only the scopes of the same season and week (`keep`, "2026-8-"), so the
 * stored map never grows past one week of games.
 */
export function markSeen(seen, scope, ids, keep) {
  const next = Object.fromEntries(Object.entries(seen ?? {}).filter(([name]) => !keep || name.startsWith(keep)));
  next[scope] = [...new Set([...(next[scope] ?? []), ...ids])];
  return next;
}

/** Writes the map; a full or blocked storage keeps the reveal working, it only animates again next time. */
export function writeSeen(storage, key, seen) {
  try { storage?.setItem(key, JSON.stringify(seen)); return true; } catch { return false; }
}

/** The stagger step for the reveal: rows after the sixth start together, so the whole reveal stays inside `big`. */
export const REVEAL_STAGGER_CAP = 6;
export const staggerIndex = i => Math.min(Math.max(0, i), REVEAL_STAGGER_CAP);
