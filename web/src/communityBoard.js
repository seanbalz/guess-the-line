// Redesign stage 17 (D-39 per-game lock-in, D-31 kickoff, D-36, DP-1, DP-2): the old Community screens' reading of the
// per-game reveal and of the board. Pure, so the node tests check it without a browser; CommunityHome.jsx renders it.
//
// - The board: Spread and Total are ranked apart, each by its own season points; their points are never added together
//   (D-36: the old board's hidden Spread + Total sort was a display defect, DP-2). A member with no submitted ballot has
//   no number (null from the server once M-01 is applied, or no row at all) and goes last; the screen shows "—" (DP-1).
// - A feed post: the server opens another member's picks game by game (M-01's gate: the viewer's own lock-in, a sit-out,
//   or that game's kickoff) and names the games it withheld. Before M-01 a hidden post names none (`hiddenGames` null):
//   the whole post is hidden, as before.
// - The picks-due card knows four states; anything else, such as a state a later gtl-api adds, reads as closed.

export const MARKET_MODES = Object.freeze(['guess_spread', 'guess_total']);

/** Highest points first; a member without a number (null or no row) goes last. */
export const byPoints = (x, y) => (typeof x === 'number' && typeof y === 'number' ? y - x : typeof x === 'number' ? -1 : typeof y === 'number' ? 1 : 0);

/**
 * One market's board: every member, with that market's standing row (or null), ordered by that market's season points, then
 * by name. `name` maps a member id to the name the screen shows.
 */
export function boardRows(feed, mode, name = id => id) {
  const members = Array.isArray(feed?.members) ? feed.members : [], standings = Array.isArray(feed?.standings) ? feed.standings : [];
  return members.map(m => ({ id: m.id, removed: m.removed === true, standing: standings.find(s => s.userId === m.id && s.mode === mode) || null }))
    .sort((a, b) => byPoints(a.standing?.seasonPoints, b.standing?.seasonPoints) || String(name(a.id)).localeCompare(String(name(b.id))));
}

/** A feed post's picks as the screen shows them: the games shown, how many are withheld, and whether the whole post is hidden. */
export function postPicksView(post) {
  if (post?.kind !== 'ballot_submitted') return null;
  const shown = post.picks && typeof post.picks === 'object' ? Object.entries(post.picks).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)) : [];
  const hidden = Array.isArray(post.hiddenGames) ? post.hiddenGames.length : 0;
  return { shown, hidden, allHidden: post.picksHidden === true && !shown.length, perGame: Array.isArray(post.hiddenGames) };
}

/** The picks-due card's state: null when there is no card, one of the four it knows, or 'closed' for anything else. */
const DUE_STATES = ['not_open', 'due', 'urgent', 'closed'];
export const dueState = due => (!due || ['none', 'done'].includes(due.state) ? null : DUE_STATES.includes(due.state) ? due.state : 'closed');
