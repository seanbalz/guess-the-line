// The rank-change moment (design lane, "game feel"): when the viewer's League board rank differs from the rank this
// device last saw for that league and market, one toast says so ("You moved up to 2nd", "Down to 3rd") and the board
// draws the kit's up or down arrow (Move) beside the rank. Pure: storage is passed in, and the toast is returned as
// words for the shell's toast queue, which shows one toast at a time and holds it while a celebration shows.
//
// - Per account, league and market on this device (`gtl.next.rank.v1.…`), as `{ rank, from }`: the rank last seen and
//   the one before the last change, so the arrow keeps saying how the last change went until the rank moves again.
// - The first look on a device remembers the rank and says nothing: there is no "last time" to compare with.
// - Unranked ("—") is not a rank: it neither toasts nor forgets the rank last seen.
// - Once per change: the new rank is written as the toast is returned, so the same rank never toasts twice.

export const RANK_PREFIX = 'gtl.next.rank.v1.';
const rankOf = value => (Number.isInteger(value) && value > 0 ? value : null);
const deviceStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The storage key for one account's rank on one league's market board, or null without an account. */
export function rankKey(account, league, mode) {
  if (typeof account !== 'string' || !account || typeof mode !== 'string' || !mode) return null;
  return `${RANK_PREFIX}${encodeURIComponent(account)}.${encodeURIComponent(league || 'community')}.${mode}`;
}

/** `{ rank, from }` this device remembers, or null (nothing saved, storage blocked or a value it cannot read). */
export function readRank(key, storage = deviceStorage()) {
  if (!key || !storage) return null;
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    const rank = rankOf(value?.rank);
    return rank === null ? null : { rank, from: rankOf(value.from) };
  } catch { return null; }
}

export function writeRank(key, value, storage = deviceStorage()) {
  if (!key || !storage || rankOf(value?.rank) === null) return;
  try { storage.setItem(key, JSON.stringify({ rank: value.rank, from: rankOf(value.from) })); } catch { /* No moment next time on this device. */ }
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "102nd". */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** The toast's words and tone for a move from `from` to `to`: up is a small "done" moment, down stays quiet ("plain"). */
export function rankToast(from, to, tied = false) {
  const place = `${ordinal(to)}${tied ? ', tied' : ''}`;
  return to < from ? { text: `You moved up to ${place}`, tone: 'done' } : { text: `Down to ${place}`, tone: 'plain' };
}

/**
 * What the board does with the rank it shows now: `{ write, move, toast }`.
 * - `write`: the `{ rank, from }` to remember, or null when nothing changes.
 * - `move`: places moved at the last change this device saw (positive is up), or null when there is none to show.
 * - `toast`: `{ text, tone }` once, when the rank differs from the one last seen; null otherwise.
 */
export function rankMoment(stored, current) {
  const rank = rankOf(current?.rank);
  const last = rankOf(stored?.rank), before = rankOf(stored?.from);
  if (rank === null) return { write: null, move: null, toast: null };
  if (last === null) return { write: { rank, from: null }, move: null, toast: null };
  if (last === rank) return { write: null, move: before !== null && before !== rank ? before - rank : null, toast: null };
  return { write: { rank, from: last }, move: last - rank, toast: rankToast(last, rank, current?.tied === true) };
}

/** The arrow Home can show without spending the moment (nothing is written; the League board still toasts). */
export function peekMove(stored, current) {
  const rank = rankOf(current?.rank), last = rankOf(stored?.rank), before = rankOf(stored?.from);
  if (rank === null || last === null) return null;
  if (last !== rank) return last - rank;
  return before !== null && before !== rank ? before - rank : null;
}
