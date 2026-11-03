// The League rank moment (D-69 PICK column: rank up is small, reaching 1st is big, a drop stays quiet). When your board
// rank differs from the rank this device last saw for that league and market, the change is remembered and becomes one
// moment for the engine, which plays it where League opens after the launch, never on page load. Pure: storage is passed in.
// - Per account, league and market on this device (`gtl.next.rank.v1.…`) as `{ rank, from, n }`: the rank last seen, the
//   one before the last change (the arrow keeps saying how it went) and how many changes this device saw (each change is
//   its own moment, so a later move to the same rank plays again). The first look remembers and says nothing; unranked
//   ("—") is not a rank.
import { SCOPES } from '../moments/catalog.js';
import { AWARD_ICONS } from '../features/icons.js';

export const RANK_PREFIX = 'gtl.next.rank.v1.';
const rankOf = value => (Number.isInteger(value) && value > 0 ? value : null);
const countOf = value => (Number.isInteger(value) && value >= 0 ? value : 0);
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
    return rank === null ? null : { rank, from: rankOf(value.from), n: countOf(value.n) };
  } catch { return null; }
}

export function writeRank(key, value, storage = deviceStorage()) {
  if (!key || !storage || rankOf(value?.rank) === null) return;
  try { storage.setItem(key, JSON.stringify({ rank: value.rank, from: rankOf(value.from), n: countOf(value.n) })); } catch { /* No moment next time on this device. */ }
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "102nd". */
export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** What a board read does with the rank: `{ write, move }` (`write` null when nothing changes; `move` positive is up). */
export function rankMoment(stored, current) {
  const rank = rankOf(current?.rank), last = rankOf(stored?.rank), before = rankOf(stored?.from);
  if (rank === null) return { write: null, move: null };
  if (last === null) return { write: { rank, from: null, n: 0 }, move: null };
  if (last === rank) return { write: null, move: before !== null && before !== rank ? before - rank : null };
  return { write: { rank, from: last, n: countOf(stored?.n) + 1 }, move: last - rank };
}

/** The engine's source for one league's market board: the first read of it on a device seeds silently. */
export const rankSource = (league, mode) => `rank:${league || 'community'}:${mode}`;

/** The moment for the last change in `saved` (the record after a read): up is `rankUp`, reaching 1st `rankFirst`; else null. */
export function rankCandidate({ league, mode, saved, tied = false, market }) {
  const rank = rankOf(saved?.rank), from = rankOf(saved?.from);
  if (rank === null || from === null || rank >= from) return null;
  return { id: `${rankSource(league, mode)}:${countOf(saved.n)}`, kind: rank === 1 ? 'rankFirst' : 'rankUp', scopes: [SCOPES.league],
    title: rank === 1 ? (tied ? 'Tied for 1st' : 'You’re 1st') : `Up to ${ordinal(rank)}`, meta: `${market} board · up ${from - rank}`,
    icon: AWARD_ICONS.spread_winner, rarity: 'rare' };
}

/** One board read (spec 4.2 rule 1): null unless `fresh`; else `{ write, move, candidates }`, the same list until the rank moves. */
export function rankReport({ fresh, stored, rank, tied = false, league, mode, market }) {
  if (!fresh) return null;
  const step = rankMoment(stored, { rank });
  const candidate = rankCandidate({ league, mode, saved: step.write ?? stored, tied, market });
  return { write: step.write, move: step.move, candidates: candidate ? [candidate] : [] };
}

/** The arrow Home can show without spending the moment (nothing is written; the League board still toasts). */
export function peekMove(stored, current) {
  const rank = rankOf(current?.rank), last = rankOf(stored?.rank), before = rankOf(stored?.from);
  if (rank === null || last === null) return null;
  if (last !== rank) return last - rank;
  return before !== null && before !== rank ? before - rank : null;
}
