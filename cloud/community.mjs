// D-21 community feed. One community of every profile; Guess picks inside posts are
// already withheld by the database until the viewer submits the same ballot or sits
// out that week's mode (D-23). Nothing else is hidden, including removed members' data.
import { UUID_PATTERN } from './lobby.mjs';
import { buildSlate } from '../shared/nfl-schedule.mjs';

export class CommunityError extends Error {
  constructor(status, message) { super(message); this.name = 'CommunityError'; this.status = status; }
}
export const COMMUNITY_METHODS = Object.fromEntries(['read', 'like', 'comment', 'member', 'publish-preview', 'publish', 'interest', 'sit-out'].map(action => [`/community/${action}`, ['POST']]));
const ERRORS = {
  GTL_COMMUNITY_INVALID: [400, 'Check the post and try again.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
  GTL_COMMUNITY_FORBIDDEN: [403, 'Only the commissioner can change community membership.'],
  GTL_COMMUNITY_CLOSED: [409, 'Picks for that week are closed. Sitting out is no longer possible.'],
  GTL_SLATE_CONFLICT: [409, 'A different schedule is already published for that week. Nothing was changed.'],
  GTL_COMMUNITY_RETRY_CONFLICT: [409, 'This request was already used for a different comment. Refresh before posting again.'],
};
export const providerCommunityError = message => ERRORS[message] ? new CommunityError(...ERRORS[message]) : new Error('The community feed is unavailable.');
const invalid = () => { throw providerCommunityError('GTL_COMMUNITY_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const MODES = ['guess_spread', 'guess_total'];
// D-22: coming-soon leagues. NFL is the only live league.
export const COMING_SOON_LEAGUES = ['nba', 'mlb', 'nhl', 'cfb', 'cbb'];
const KINDS = ['joined', 'ballot_submitted', 'bet_posted', 'bet_settled', 'week_published'];

function normalize(raw) {
  if (!record(raw) || !Array.isArray(raw.members) || !Array.isArray(raw.posts) || !Array.isArray(raw.due) || !Array.isArray(raw.submissions)) throw new Error('Invalid community feed.');
  const members = raw.members.map(m => ({ id: String(m.id), displayName: String(m.displayName), removed: m.removed === true }));
  const posts = raw.posts.filter(p => KINDS.includes(p.kind)).map(p => ({
    id: String(p.id), actorId: String(p.actorId), kind: p.kind, season: p.season ?? null, week: p.week ?? null,
    mode: MODES.includes(p.mode) ? p.mode : null, createdAt: p.createdAt,
    likes: Number(p.likes) || 0, likedByMe: p.likedByMe === true,
    comments: (Array.isArray(p.comments) ? p.comments : []).map(c => ({ id: String(c.id), userId: String(c.userId), body: String(c.body), createdAt: c.createdAt })),
    ...(p.kind === 'ballot_submitted' ? { picksHidden: p.picksHidden === true, picks: p.picksHidden === true || !record(p.picks) ? null : p.picks } : {}),
    ...(p.kind.startsWith('bet_') ? { entryId: typeof p.payload?.entryId === 'string' ? p.payload.entryId : null } : {}),
    ...(p.kind === 'week_published' ? { games: Number(p.payload?.games) || 0, deadline: p.payload?.deadline ?? null } : {}),
  }));
  const week = record(raw.week) ? { season: raw.week.season, week: raw.week.week, deadline: raw.week.deadline, games: raw.week.games } : null;
  const due = raw.due.filter(d => MODES.includes(d.mode)).map(d => ({ mode: d.mode, submitted: d.submitted === true, satOut: d.satOut === true, filled: Number(d.filled) || 0, games: Number(d.games) || 0 }));
  const standings = (Array.isArray(raw.standings) ? raw.standings : []).filter(x => MODES.includes(x.mode)).map(x => ({ userId: String(x.userId), mode: x.mode,
    weekPoints: Number(x.weekPoints) || 0, weekScored: Number(x.weekScored) || 0, seasonPoints: Number(x.seasonPoints) || 0, seasonScored: Number(x.seasonScored) || 0, weeksSubmitted: Number(x.weeksSubmitted) || 0, satOut: x.satOut === true }));
  const submissions = raw.submissions.filter(s => MODES.includes(s.mode)).map(s => ({ userId: String(s.userId), mode: s.mode, submittedAt: s.submittedAt ?? null, satOut: s.satOut === true }));
  const optOuts = (Array.isArray(raw.optOuts) ? raw.optOuts : []).filter(m => MODES.includes(m));
  const interests = COMING_SOON_LEAGUES.filter(league => Array.isArray(raw.interests) && raw.interests.includes(league));
  const counts = record(raw.interestCounts) ? raw.interestCounts : {};
  const interestCounts = Object.fromEntries(COMING_SOON_LEAGUES.map(league => [league, Math.max(0, Number(counts[league]) || 0)]));
  return { viewer: String(raw.viewer), admin: raw.admin === true, members, week, optOuts, due, submissions, standings, posts, interests, interestCounts };
}

/** Picks due for the viewer: "urgent" inside two hours of the deadline, "closed" after it. A sat-out mode is never due. */
export function picksDue(feed, now) {
  if (!feed.week) return { state: 'none', modes: [] };
  const deadline = Date.parse(feed.week.deadline);
  const open = feed.due.filter(d => !d.submitted && !d.satOut);
  if (!open.length) return { state: 'done', modes: [] };
  const state = now >= deadline ? 'closed' : deadline - now <= 2 * 3_600_000 ? 'urgent' : 'due';
  return { state, deadline: feed.week.deadline, week: feed.week.week, modes: open };
}

export async function handleCommunity({ route, body = {}, user, service, clock = Date.now }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new CommunityError(401, 'Sign in to continue.');
  if (!service?.rpc) throw new Error('The community feed is not configured.');
  if (!Object.hasOwn(COMMUNITY_METHODS, route)) invalid();
  if (route === '/community/read') {
    fields(body, ['before', 'limit']);
    if (body.before !== undefined && !Number.isFinite(Date.parse(body.before))) invalid();
    if (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 100)) invalid();
    const now = clock();
    const feed = normalize(await service.rpc('gtl_read_community', { p_user: user.id, p_before: body.before ?? null, p_limit: body.limit ?? 30, p_now: new Date(now).toISOString() }));
    return { ...feed, picksDue: picksDue(feed, now) };
  }
  if (route === '/community/like') {
    fields(body, ['postId', 'like']);
    if (!UUID_PATTERN.test(body.postId || '') || typeof body.like !== 'boolean') invalid();
    const result = await service.rpc('gtl_like_feed', { p_user: user.id, p_post: body.postId, p_like: body.like });
    return { likes: Number(result?.likes) || 0, likedByMe: result?.likedByMe === true };
  }
  if (route === '/community/comment') {
    fields(body, ['requestId', 'postId', 'body']);
    if (!UUID_PATTERN.test(body.requestId || '') || !UUID_PATTERN.test(body.postId || '') || typeof body.body !== 'string') invalid();
    const text = body.body.trim();
    if (!text || text.length > 500 || /[\x00-\x08\x0b-\x1f\x7f]/.test(text)) invalid();
    const result = await service.rpc('gtl_comment_feed', { p_user: user.id, p_request_id: body.requestId, p_post: body.postId, p_body: text });
    if (!UUID_PATTERN.test(result?.id || '')) throw new Error('Invalid comment result.');
    return { id: result.id, replayed: result.replayed === true };
  }
  if (route === '/community/publish-preview' || route === '/community/publish') {
    fields(body, ['season', 'week']);
    if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid();
    if (!(await service.rpc('gtl_community_admin', { p_user: user.id }))) throw providerCommunityError('GTL_COMMUNITY_FORBIDDEN');
    if (typeof service.schedule !== 'function') throw new Error('The schedule source is not configured.');
    let slate;
    try { slate = buildSlate(await service.schedule(), body.season, body.week); }
    catch (error) { throw new CommunityError(422, `The public schedule could not be used: ${error.message}`); }
    if (route === '/community/publish-preview') return slate;
    const result = await service.rpc('gtl_publish_week', { p_user: user.id, p_season: slate.season, p_week: slate.week,
      p_games: slate.games.map(({ neutral, ...game }) => game), p_deadline: slate.deadline, p_source: slate.source });
    return { ...slate, published: result?.published === true };
  }
  if (route === '/community/sit-out') {
    fields(body, ['season', 'week', 'mode']);
    if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25 || !MODES.includes(body.mode)) invalid();
    const result = await service.rpc('gtl_sit_out_week', { p_user: user.id, p_season: body.season, p_week: body.week, p_mode: body.mode, p_now: new Date(clock()).toISOString() });
    if (result?.satOut !== true) throw new Error('Invalid sit-out result.');
    return { season: body.season, week: body.week, mode: body.mode, satOut: true, replayed: result.replayed === true };
  }
  if (route === '/community/interest') {
    fields(body, ['league', 'notify']);
    if (!COMING_SOON_LEAGUES.includes(body.league) || typeof body.notify !== 'boolean') invalid();
    const result = await service.rpc('gtl_set_league_interest', { p_user: user.id, p_league: body.league, p_notify: body.notify });
    if (result?.league !== body.league) throw new Error('Invalid interest result.');
    return { league: body.league, notify: result.notify === true, count: Math.max(0, Number(result.count) || 0) };
  }
  fields(body, ['userId', 'member']);
  if (!UUID_PATTERN.test(body.userId || '') || body.userId === user.id || typeof body.member !== 'boolean') invalid();
  const result = await service.rpc('gtl_set_community_member', { p_user: user.id, p_target: body.userId, p_member: body.member });
  return { userId: String(result?.userId), member: result?.member === true };
}
