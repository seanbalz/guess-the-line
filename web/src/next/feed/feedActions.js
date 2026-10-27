// The feed's writes and the one channel its screens share (redesign build plan stages 64 and 65). The feed list, the
// reactions popover and the comments, reactors and picks sheets are separate layers, so a change one of them saves reaches
// the others through `feedChanged` events instead of a refetch. Writes never retry by themselves (section 3.3): a lost
// answer asks the feed to read again, so the screen shows what is really saved.
import { leagueApi } from '../../api.js';
import { writeProblem } from '../data/store.js';
import { withReaction } from './feedModel.js';

const channel = typeof EventTarget === 'function' ? new EventTarget() : null;
/** `{ type: 'reactions', postId, reactions }`, `{ type: 'comment', postId, comment }` or `{ type: 'reload' }`. */
export function feedChanged(detail) { channel?.dispatchEvent(new CustomEvent('feed', { detail })); }
export function onFeedChange(listener) {
  if (!channel) return () => {};
  const handle = event => listener(event.detail);
  channel.addEventListener('feed', handle);
  return () => channel.removeEventListener('feed', handle);
}

/**
 * Sets (a key) or takes back (null) the member's reaction on a post. The change shows at once; the server's summary
 * replaces it, a refusal puts the old one back with a toast, and a lost answer reads the feed again.
 */
export async function react({ postId, current, next, toast }) {
  feedChanged({ type: 'reactions', postId, reactions: withReaction(current, next) });
  try {
    const saved = await leagueApi('react', { postId, reaction: next });
    feedChanged({ type: 'reactions', postId, reactions: { counts: saved.counts, total: saved.total, mine: saved.mine } });
    return { ok: true };
  } catch (error) {
    const problem = writeProblem(error);
    if (problem.kind === 'uncertain') feedChanged({ type: 'reload' });
    else feedChanged({ type: 'reactions', postId, reactions: current });
    toast?.(problem.kind === 'refused' && problem.message ? problem.message : 'Couldn’t save your reaction. Try again.', { tone: 'error' });
    return { ok: false, ...problem };
  }
}

/** Shares your own scored guess for one game to the league showing (the Community when `leagueId` is null). */
export async function shareResult({ requestId, leagueId, season, week, mode, gameId }) {
  try {
    const saved = await leagueApi('share-result', { requestId, ...(leagueId ? { leagueId } : {}), season, week, mode, gameId });
    feedChanged({ type: 'reload' });
    return { ok: true, postId: saved.postId, replayed: saved.replayed === true };
  } catch (error) { return { ok: false, ...writeProblem(error) }; }
}
