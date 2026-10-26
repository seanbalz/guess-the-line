// The League feed's pure view model (redesign build plan stages 64 and 65; the approved prototype's league feed; D-35,
// D-36, D-23). No React, no fetching, no clock of its own: the feed, its sheets and tests/next-feed-model.test.mjs read
// these helpers.
//
// Rules kept here:
// - Folding (review D4): friends' ballot posts of the same Pacific day fold into one digest card. A post someone reacted
//   to or commented on never folds, your own ballot never folds, and a digest keeps every post it holds, so "Show each
//   post" always reaches each one (D-23: nothing hidden).
// - Reactions: one per person; the row shows at most three, most first, and always keeps yours in view.
// - Times are Pacific through Intl (web/src/next/format.js), never a fixed offset.
import { DASH, fmtLate, fmtMatchup, fmtNum, fmtSpreadPick, fmtWhen, pacificParts, plural } from '../format.js';

/** The six reactions (D-35), in the prototype's order. Glyphs render only inside a data-emoji-ok element. */
export const REACTION_SET = Object.freeze([
  Object.freeze({ key: 'thumbs_up', emoji: '\u{1F44D}', name: 'Thumbs up' }),
  Object.freeze({ key: 'fire', emoji: '\u{1F525}', name: 'Fire' }),
  Object.freeze({ key: 'laughing', emoji: '\u{1F602}', name: 'Laughing' }),
  Object.freeze({ key: 'grimace', emoji: '\u{1F62C}', name: 'Grimace' }),
  Object.freeze({ key: 'bullseye', emoji: '\u{1F3AF}', name: 'Bullseye' }),
  Object.freeze({ key: 'clap', emoji: '\u{1F44F}', name: 'Clap' }),
]);
const REACTION = Object.fromEntries(REACTION_SET.map(r => [r.key, r]));
export const reactionOf = key => REACTION[key] ?? null;
export const COMMENT_MAX = 500;
export const COMMENT_COUNTER_FROM = 450;
export const MARKET = Object.freeze({ guess_spread: 'Spread', guess_total: 'Total' });

/** A game id ("SEA-DEN") split into its codes. */
export const codes = gameId => {
  const [away, home] = typeof gameId === 'string' ? gameId.split('-') : [];
  return { away: away || '', home: home || '' };
};
/** "SEA @ DEN" from a game id (never the raw id, DP-15). */
export const gameName = gameId => { const { away, home } = codes(gameId); return fmtMatchup(away, home); };
/** A guess as the app writes it everywhere: "SEA −2.5", "Pick'em" or a total "41.5" (DP-6, DP-25). */
export function guessText(mode, gameId, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH;
  const { away, home } = codes(gameId);
  return mode === 'guess_total' ? fmtNum(value) : fmtSpreadPick(away, home, value);
}

/** A Pacific calendar day key ("2026-10-26") for an instant; '' when it is not one. */
export function ptDay(iso) {
  const p = pacificParts(iso);
  return p ? `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}` : '';
}

/** A kickoff time slot's name from its Pacific day and hour: "Thursday night", "Sunday early games", "Sunday afternoon". */
export function kickoffSlot(iso, games = 1) {
  const p = pacificParts(iso);
  const many = games > 1;
  if (!p) return many ? 'Games' : 'Game';
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][p.weekday];
  if (day === 'Sunday') {
    if (p.hour < 9) return many ? 'Sunday morning games' : 'Sunday morning game';
    if (p.hour < 12) return many ? 'Sunday early games' : 'Sunday early game';
    if (p.hour < 16) return 'Sunday afternoon';
    return 'Sunday night';
  }
  if (p.hour >= 16) return `${day} night`;
  return many ? `${day} games` : `${day} game`;
}

/** At most three reaction chips, most first (ties in the set's order); yours always stays in view. */
export function reactionChips(reactions) {
  const counts = reactions?.counts ?? {}, mine = reactions?.mine ?? null;
  let list = REACTION_SET.filter(r => (counts[r.key] ?? 0) > 0).sort((a, b) => counts[b.key] - counts[a.key] || REACTION_SET.indexOf(a) - REACTION_SET.indexOf(b));
  if (list.length > 3) {
    const keep = list.slice(0, 3);
    if (mine && REACTION[mine] && !keep.some(r => r.key === mine)) keep[2] = REACTION[mine];
    list = keep;
  }
  return list.map(r => ({ ...r, count: counts[r.key], mine: r.key === mine,
    label: `${r.name}, ${plural(counts[r.key], 'reaction')}${r.key === mine ? ', you reacted' : ''}` }));
}

/** A reaction change shown at once, before the server answers: one per person, so the old one leaves as the new one comes. */
export function withReaction(reactions, next) {
  const counts = { ...(reactions?.counts ?? {}) }, mine = reactions?.mine ?? null;
  if (mine) counts[mine] = Math.max(0, (counts[mine] ?? 0) - 1);
  if (next) counts[next] = (counts[next] ?? 0) + 1;
  for (const key of Object.keys(counts)) if (!counts[key]) delete counts[key];
  return { counts, total: Object.values(counts).reduce((sum, n) => sum + n, 0), mine: next ?? null };
}

const engaged = post => (post.reactions?.total ?? 0) > 0 || (post.commentCount ?? 0) > 0;
/**
 * `[{ type: 'post', post } | { type: 'digest', key, posts }]`, newest first. Friends' ballot posts of one Pacific day fold
 * together; your own, one with reactions or comments, and a day's single post stay posts.
 */
export function foldPosts(posts, viewer) {
  const items = [], days = new Map();
  for (const post of posts) {
    if (post.kind !== 'ballot_submitted' || post.actorId === viewer || engaged(post)) { items.push({ type: 'post', post }); continue; }
    const day = ptDay(post.createdAt), group = days.get(day);
    if (group) { group.posts.push(post); continue; }
    const item = { type: 'digest', key: `digest:${day}:${post.id}`, posts: [post] };
    days.set(day, item); items.push(item);
  }
  return items.map(item => (item.type === 'digest' && item.posts.length === 1 ? { type: 'post', post: item.posts[0] } : item));
}

/** "Avery, Blake and Casey"; "Avery, Blake and 3 more". */
export function namesLine(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** System posts (the week opened, a kickoff) lead with the Guess The Line mark, not the publisher's face. */
export const systemPost = post => post.kind === 'kickoff' || post.kind === 'week_published';
export const realSlipPost = post => post.kind === 'bet_posted' || post.kind === 'bet_settled';

/** The words after the actor's name ("locked in Week 6 Spread picks"); a system post's whole line. */
export function postLine(post) {
  const week = post.week ? `Week ${post.week} ` : '';
  const market = MARKET[post.mode] ?? '';
  switch (post.kind) {
    case 'joined': return 'joined Guess The Line';
    case 'week_published': return `${week}is open`.trim();
    case 'ballot_submitted': return `locked in ${week}${market} picks`.replace(/\s+/g, ' ').trim();
    case 'bet_posted': return 'posted a real slip';
    case 'bet_settled': return 'settled a real slip';
    case 'points_played': return `is playing ${week}Points`.replace(/\s+/g, ' ').trim();
    case 'points_final': return `${(post.embed?.winners?.length ?? 0) > 1 ? 'tied for the win in' : 'won'} ${week}Points`.replace(/\s+/g, ' ').trim();
    case 'result_shared': return post.embed?.visible && post.embed.points === 10 ? 'hit a Bullseye' : `shared a ${market} result`.replace(/\s+/g, ' ');
    case 'kickoff': return `${kickoffSlot(post.embed?.kickoff ?? post.createdAt, post.embed?.games?.length ?? 1)} kicked off`;
    default: return 'posted an update';
  }
}

/** The meta line under a post, or '' ("9 games · picks due Thu 5:15 PM PT", "Late · 12 min"). */
export function postMeta(post) {
  if (post.kind === 'week_published') {
    const games = post.embed?.games ? plural(post.embed.games, 'game') : '';
    const due = post.embed?.deadline ? `picks due ${fmtWhen(post.embed.deadline)}` : '';
    return [games, due].filter(Boolean).join(' · ');
  }
  if (post.kind === 'points_final') {
    const winner = post.embed?.winners?.[0];
    return winner ? `${fmtNum(winner.points)} pts · House ${fmtNum(post.embed.house)} · FINAL` : '';
  }
  return '';
}
/** The Late marker's words on a ballot post (D-30), or ''. */
export const lateWords = post => (post.kind === 'ballot_submitted' && post.embed?.late ? fmtLate(post.embed.late.minutes) : '');

/** The comment button: "Comment", "3", or "Game thread · 3" on a kickoff post, with its accessible name. */
export function commentButton(post) {
  const n = post.commentCount ?? 0;
  if (post.kind === 'kickoff') return { text: n ? `Game thread · ${n}` : 'Game thread', label: `Game thread, ${plural(n, 'comment')}` };
  return n ? { text: String(n), label: `${plural(n, 'comment')}. Open comments` } : { text: 'Comment', label: 'Comment' };
}

/** A typed comment: 1 to 500 characters after trimming posts; the counter shows from 450 ("462 of 500"). */
export function commentDraft(text) {
  const value = String(text ?? '');
  return { ok: value.trim().length >= 1 && value.length <= COMMENT_MAX, counter: value.length >= COMMENT_COUNTER_FROM ? `${value.length} of ${COMMENT_MAX}` : '' };
}

/** The new-posts dot is per device: the newest post time this device showed, per account and league. */
export const seenKey = (account, league) => `gtl.next.feedSeen.v1.${account}.${league ?? 'community'}`;
export function readSeen(key, storage = globalThis.localStorage) { try { return storage?.getItem(key) ?? null; } catch { return null; } }
export function writeSeen(key, iso, storage = globalThis.localStorage) { try { if (iso) storage?.setItem(key, iso); } catch { /* A device that blocks storage shows no dot. */ } }
/** True when someone else posted after the newest post this device showed (never on a device that has shown none). */
export function hasNewPosts(posts, viewer, seen) {
  const newest = (posts ?? []).find(post => post.actorId !== viewer);
  if (!newest || !seen) return false;
  return Date.parse(newest.createdAt) > Date.parse(seen);
}
