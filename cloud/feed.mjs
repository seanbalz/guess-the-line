// League feed routes (redesign build plan stages 61 to 65; D-35 social ruling, D-36, D-31, D-23). The database decides
// who may see or answer a post (Community membership, a private group's roster, a kickoff post's time); this module
// checks each body, passes the signed-in member and the handler clock, and rebuilds every reply from its known keys only.
//
//   POST /league/react   { postId, reaction }   M-21: set (one of REACTIONS) or take back (null) the member's reaction.
import { UUID_PATTERN } from './lobby.mjs';

export class FeedError extends Error {
  constructor(status, message) { super(message); this.name = 'FeedError'; this.status = status; }
}
/** The six fixed reaction keys (D-35; the prototype's set). The app draws each as its emoji. */
export const REACTIONS = Object.freeze(['thumbs_up', 'fire', 'laughing', 'grimace', 'bullseye', 'clap']);
export const FEED_METHODS = Object.freeze({ '/league/react': ['POST'] });
const ERRORS = Object.freeze({
  GTL_COMMUNITY_INVALID: [400, 'That post is not available. Refresh the feed and try again.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
  // M-21 not applied (PostgREST PGRST202, read as off by the adapter) or GTL_FEATURE_OFF=reactions: nothing was saved.
  GTL_FEATURE_OFF: [503, 'Reactions are not available right now. Nothing was changed.'],
});
export const providerFeedError = message => (Object.hasOwn(ERRORS, message) ? new FeedError(...ERRORS[message]) : new Error('The league feed is unavailable.'));
const invalid = () => { throw providerFeedError('GTL_COMMUNITY_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const count = value => (Number.isInteger(value) && value >= 0 ? value : 0);

/** A reaction summary { counts: { key: n }, total, mine }: known keys only, never a negative or made-up count. */
export function normalizeReactions(raw) {
  const counts = record(raw?.counts) ? raw.counts : {};
  const known = Object.fromEntries(REACTIONS.filter(key => count(counts[key]) > 0).map(key => [key, count(counts[key])]));
  const total = Object.values(known).reduce((sum, n) => sum + n, 0);
  return { counts: known, total, mine: REACTIONS.includes(raw?.mine) ? raw.mine : null };
}

export async function handleFeed({ route, body, user, service, clock = Date.now, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new FeedError(401, 'Sign in to continue.');
  if (!Object.hasOwn(FEED_METHODS, route)) throw new FeedError(404, 'Not found.');
  if (!service?.rpc) throw new Error('The league feed is not configured.');
  if (route === '/league/react') {
    fields(body, ['postId', 'reaction']);
    if (!UUID_PATTERN.test(body.postId || '') || !(body.reaction === null || REACTIONS.includes(body.reaction))) invalid();
    // Gate M off switch: GTL_FEATURE_OFF=reactions stops the writer before the database (cloud/feature-off.mjs).
    if (featureOff.has('reactions')) throw providerFeedError('GTL_FEATURE_OFF');
    const result = await service.rpc('gtl_react_feed', { p_user: user.id, p_post: body.postId, p_reaction: body.reaction, p_now: new Date(clock()).toISOString() });
    if (!record(result) || result.postId !== body.postId || typeof result.changed !== 'boolean') throw new Error('Invalid reaction result.');
    return { postId: body.postId, ...normalizeReactions(result), changed: result.changed };
  }
  throw new FeedError(404, 'Not found.');
}
