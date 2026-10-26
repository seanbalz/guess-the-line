// League feed routes (redesign build plan stages 61 to 65; D-35 social ruling, D-36, D-31 as amended by D-39, D-50, D-23).
// The database decides who may see or answer a post (Community membership, a private group's roster, a kickoff post's
// time) and gates every detail per viewer; this module checks each body, passes the signed-in member and the handler
// clock, and rebuilds every reply from its known keys only, gating a second time: a number under a withheld game, or a
// hidden result's guess or points, never passes, whatever the provider returned.
//
//   POST /league/react          { postId, reaction }                         M-21: set (one of REACTIONS) or take back (null).
//   POST /league/feed           { leagueId?, before?: { at, id }, limit? }   M-22: one page of a league's feed, newest first.
//   POST /league/comments       { postId, before?: { at, id }, limit? }      M-22: a visible post's comments, a page at a time.
//   POST /league/reactors       { postId }                                   M-22: who reacted to a visible post, and with what.
//   POST /league/share-result   { requestId, leagueId?, season, week, mode, gameId }   M-22: share your own scored guess.
import { UUID_PATTERN } from './lobby.mjs';
import { pointsFinal } from './community.mjs';

export class FeedError extends Error {
  constructor(status, message) { super(message); this.name = 'FeedError'; this.status = status; }
}
/** The six fixed reaction keys (D-35; the prototype's set). The app draws each as its emoji. */
export const REACTIONS = Object.freeze(['thumbs_up', 'fire', 'laughing', 'grimace', 'bullseye', 'clap']);
/** Every post kind the feed knows (M-13's final list). A post of another kind is dropped, never guessed at. */
export const FEED_KINDS = Object.freeze(['joined', 'ballot_submitted', 'bet_posted', 'bet_settled', 'week_published', 'points_played', 'points_final',
  'bet_shared', 'challenge_offered', 'challenge_matched', 'challenge_settled', 'kickoff', 'bets_week_settled', 'badge_earned', 'streak_milestone',
  'weekly_recap', 'result_shared', 'season_champion']);
export const FEED_METHODS = Object.freeze(Object.fromEntries(['react', 'feed', 'comments', 'reactors', 'share-result'].map(action => [`/league/${action}`, ['POST']])));
const ERRORS = Object.freeze({
  GTL_COMMUNITY_INVALID: [400, 'That post is not available. Refresh the feed and try again.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
  GTL_LEAGUE_MEMBER: [403, 'You no longer have access to that league.'],
  GTL_RESULT_UNAVAILABLE: [409, 'That result is not scored yet, so nothing was posted.'],
  // A migration not applied (PostgREST PGRST202, read as off by the adapter) or GTL_FEATURE_OFF: nothing was saved.
  GTL_FEATURE_OFF: [503, 'This part of the feed is not available right now. Nothing was changed.'],
});
export const providerFeedError = message => (Object.hasOwn(ERRORS, message) ? new FeedError(...ERRORS[message]) : new Error('The league feed is unavailable.'));
const invalid = () => { throw providerFeedError('GTL_COMMUNITY_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const count = value => (Number.isInteger(value) && value >= 0 ? value : 0);
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const instant = value => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null);
const MODES = ['guess_spread', 'guess_total'];
const GAME_ID = /^[A-Z]{2,4}-[A-Z]{2,4}$/;
const LEAGUE_ID = /^(?:sean-troy-luke|g_[0-9a-f]{32})$/;
const uuid = value => (typeof value === 'string' && UUID_PATTERN.test(value) ? value : null);

/** A reaction summary { counts: { key: n }, total, mine }: known keys only, never a negative or made-up count. */
export function normalizeReactions(raw) {
  const counts = record(raw?.counts) ? raw.counts : {};
  const known = Object.fromEntries(REACTIONS.filter(key => count(counts[key]) > 0).map(key => [key, count(counts[key])]));
  const total = Object.values(known).reduce((sum, n) => sum + n, 0);
  return { counts: known, total, mine: REACTIONS.includes(raw?.mine) ? raw.mine : null };
}
const late = raw => (record(raw) && finite(raw.minutes) !== null ? { deadline: instant(raw.deadline), minutes: raw.minutes } : null);
const gameIds = value => (Array.isArray(value) ? [...new Set(value.filter(g => typeof g === 'string' && GAME_ID.test(g)))].sort() : []);
const comment = c => (record(c) && uuid(c.id) && uuid(c.userId) && typeof c.body === 'string' && instant(c.createdAt)
  ? { id: c.id, userId: c.userId, body: c.body, createdAt: c.createdAt } : null);

/**
 * A post's details for this viewer, by kind; anything else from the provider is dropped. The second gate: a ballot post's
 * picks pass only for games the database did not withhold, and a shared result passes its guess and points only when it
 * says visible.
 */
export function normalizeEmbed(kind, raw) {
  const e = record(raw) ? raw : {};
  if (kind === 'ballot_submitted') {
    const hidden = gameIds(e.hiddenGames), withheld = new Set(hidden);
    const picks = record(e.picks) ? Object.fromEntries(Object.entries(e.picks).filter(([gameId, value]) => GAME_ID.test(gameId) && !withheld.has(gameId) && finite(value) !== null)) : {};
    return { picks, hiddenGames: hidden, late: late(e.late) };
  }
  if (kind === 'result_shared') {
    const gameId = typeof e.gameId === 'string' && GAME_ID.test(e.gameId) ? e.gameId : null;
    return e.visible === true && gameId ? { gameId, visible: true, pick: finite(e.pick), points: finite(e.points) } : { gameId, visible: false };
  }
  if (kind === 'kickoff') {
    const games = (Array.isArray(e.games) ? e.games : []).filter(g => record(g) && GAME_ID.test(g.gameId ?? ''))
      .map(g => ({ gameId: g.gameId, in: (Array.isArray(g.in) ? g.in : []).filter(id => uuid(id)), bets: count(g.bets) }));
    return { kickoff: instant(e.kickoff), games };
  }
  if (kind === 'bet_posted' || kind === 'bet_settled') return { entryId: typeof e.entryId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(e.entryId) ? e.entryId : null };
  if (kind === 'week_published') return { games: count(e.games), deadline: instant(e.deadline) };
  if (kind === 'points_final') return pointsFinal(e) ?? {};
  return {};
}

function normalizePost(p) {
  if (!record(p) || !uuid(p.id) || !uuid(p.actorId) || !FEED_KINDS.includes(p.kind) || !instant(p.createdAt)) return null;
  if (p.kind === 'points_final' && !pointsFinal(p.embed)) return null;
  return {
    id: p.id, actorId: p.actorId, kind: p.kind, season: Number.isInteger(p.season) ? p.season : null, week: Number.isInteger(p.week) ? p.week : null,
    mode: MODES.includes(p.mode) ? p.mode : null, leagueId: typeof p.leagueId === 'string' && LEAGUE_ID.test(p.leagueId) ? p.leagueId : null,
    createdAt: p.createdAt, reactions: normalizeReactions(p.reactions), commentCount: count(p.commentCount),
    comments: (Array.isArray(p.comments) ? p.comments : []).map(comment).filter(Boolean).slice(-2),
    embed: normalizeEmbed(p.kind, p.embed),
  };
}

/** /league/feed's reply: names, the group's roster, the page of posts and the cursor for the next page (null at the end). */
export function normalizeFeed(raw, viewer, leagueId, limit) {
  if (!record(raw) || raw.viewer !== viewer || (raw.leagueId ?? null) !== leagueId || !Array.isArray(raw.members) || !Array.isArray(raw.posts)) throw new Error('Invalid league feed.');
  const members = raw.members.filter(m => record(m) && uuid(m.id)).map(m => ({ id: m.id, displayName: String(m.displayName ?? ''), removed: m.removed === true }));
  const posts = raw.posts.map(normalizePost).filter(Boolean);
  const last = raw.posts.at(-1);
  return { viewer, leagueId, now: instant(raw.now), members, roster: leagueId && Array.isArray(raw.roster) ? raw.roster.filter(id => uuid(id)) : null, posts,
    next: raw.posts.length >= limit && record(last) && uuid(last.id) && instant(last.createdAt) ? { at: last.createdAt, id: last.id } : null };
}

const cursor = value => {
  if (value === undefined) return [null, null];
  if (!record(value) || Object.keys(value).some(key => !['at', 'id'].includes(key)) || !instant(value.at) || !uuid(value.id)) invalid();
  return [value.at, value.id];
};
const limitOf = (value, max, fallback) => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) invalid();
  return value;
};
const leagueOf = value => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !LEAGUE_ID.test(value)) invalid();
  return value;
};

export async function handleFeed({ route, body, user, service, clock = Date.now, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new FeedError(401, 'Sign in to continue.');
  if (!Object.hasOwn(FEED_METHODS, route)) throw new FeedError(404, 'Not found.');
  if (!service?.rpc) throw new Error('The league feed is not configured.');
  const now = new Date(clock()).toISOString();
  if (route === '/league/react') {
    fields(body, ['postId', 'reaction']);
    if (!uuid(body.postId) || !(body.reaction === null || REACTIONS.includes(body.reaction))) invalid();
    // Gate M off switch: GTL_FEATURE_OFF=reactions stops the writer before the database (cloud/feature-off.mjs).
    if (featureOff.has('reactions')) throw providerFeedError('GTL_FEATURE_OFF');
    const result = await service.rpc('gtl_react_feed', { p_user: user.id, p_post: body.postId, p_reaction: body.reaction, p_now: now });
    if (!record(result) || result.postId !== body.postId || typeof result.changed !== 'boolean') throw new Error('Invalid reaction result.');
    return { postId: body.postId, ...normalizeReactions(result), changed: result.changed };
  }
  // Gate M off switch: GTL_FEATURE_OFF=feed stops M-22's readers and its writer before the database.
  if (featureOff.has('feed')) throw providerFeedError('GTL_FEATURE_OFF');
  if (route === '/league/feed') {
    fields(body, ['leagueId', 'before', 'limit']);
    const leagueId = leagueOf(body.leagueId), [beforeAt, beforeId] = cursor(body.before), limit = limitOf(body.limit, 50, 30);
    const raw = await service.rpc('gtl_read_league_feed', { p_user: user.id, p_league: leagueId, p_before_at: beforeAt, p_before_id: beforeId, p_limit: limit, p_now: now });
    return normalizeFeed(raw, user.id, leagueId, limit);
  }
  if (route === '/league/comments') {
    fields(body, ['postId', 'before', 'limit']);
    if (!uuid(body.postId)) invalid();
    const [beforeAt, beforeId] = cursor(body.before), limit = limitOf(body.limit, 100, 50);
    const raw = await service.rpc('gtl_read_post_comments', { p_user: user.id, p_post: body.postId, p_before_at: beforeAt, p_before_id: beforeId, p_limit: limit, p_now: now });
    if (!record(raw) || raw.postId !== body.postId || !Array.isArray(raw.comments)) throw new Error('Invalid comments.');
    const comments = raw.comments.map(comment).filter(Boolean);
    return { postId: body.postId, total: count(raw.total), comments, next: raw.comments.length >= limit && comments.length ? { at: comments[0].createdAt, id: comments[0].id } : null };
  }
  if (route === '/league/reactors') {
    fields(body, ['postId']);
    if (!uuid(body.postId)) invalid();
    const raw = await service.rpc('gtl_read_post_reactors', { p_user: user.id, p_post: body.postId, p_now: now });
    if (!record(raw) || raw.postId !== body.postId || !Array.isArray(raw.reactors)) throw new Error('Invalid reactors.');
    return { postId: body.postId, reactors: raw.reactors.filter(r => record(r) && uuid(r.userId) && REACTIONS.includes(r.reaction) && instant(r.reactedAt))
      .map(r => ({ userId: r.userId, reaction: r.reaction, reactedAt: r.reactedAt })) };
  }
  // /league/share-result
  fields(body, ['requestId', 'leagueId', 'season', 'week', 'mode', 'gameId']);
  const leagueId = leagueOf(body.leagueId);
  if (!uuid(body.requestId) || !Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25
    || !MODES.includes(body.mode) || typeof body.gameId !== 'string' || !GAME_ID.test(body.gameId)) invalid();
  const result = await service.rpc('gtl_share_result', { p_user: user.id, p_request_id: body.requestId, p_league: leagueId, p_season: body.season, p_week: body.week,
    p_mode: body.mode, p_game: body.gameId, p_now: now });
  if (!record(result) || !uuid(result.postId) || typeof result.replayed !== 'boolean') throw new Error('Invalid share result.');
  return { postId: result.postId, replayed: result.replayed };
}
