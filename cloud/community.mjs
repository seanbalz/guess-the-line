// D-21 community feed. One community of every profile; Guess picks inside posts are
// already withheld by the database until the viewer submits the same ballot.
import { UUID_PATTERN } from './lobby.mjs';
import { buildSlate, weekOpenAt } from '../shared/nfl-schedule.mjs';

export class CommunityError extends Error {
  constructor(status, message) { super(message); this.name = 'CommunityError'; this.status = status; }
}
export const COMMUNITY_METHODS = Object.fromEntries(['read', 'like', 'comment', 'member', 'publish-preview', 'publish', 'week-open'].map(action => [`/community/${action}`, ['POST']]));
const ERRORS = {
  GTL_COMMUNITY_INVALID: [400, 'Check the post and try again.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
  GTL_COMMUNITY_FORBIDDEN: [403, 'Only the commissioner can change community membership.'],
  GTL_SLATE_CONFLICT: [409, 'A different schedule is already published for that week. Nothing was changed.'],
  GTL_COMMUNITY_RETRY_CONFLICT: [409, 'This request was already used for a different comment. Refresh before posting again.'],
};
export const providerCommunityError = message => ERRORS[message] ? new CommunityError(...ERRORS[message]) : new Error('The community feed is unavailable.');
const invalid = () => { throw providerCommunityError('GTL_COMMUNITY_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const MODES = ['guess_spread', 'guess_total'];
const KINDS = ['joined', 'ballot_submitted', 'bet_posted', 'bet_settled', 'week_published'];

function normalize(raw) {
  if (!record(raw) || !Array.isArray(raw.members) || !Array.isArray(raw.posts) || !Array.isArray(raw.due) || !Array.isArray(raw.submissions)) throw new Error('Invalid community feed.');
  const members = raw.members.map(m => ({ id: String(m.id), displayName: String(m.displayName) }));
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
  const due = raw.due.filter(d => MODES.includes(d.mode)).map(d => ({ mode: d.mode, submitted: d.submitted === true, filled: Number(d.filled) || 0, games: Number(d.games) || 0 }));
  const standings = (Array.isArray(raw.standings) ? raw.standings : []).filter(x => MODES.includes(x.mode)).map(x => ({ userId: String(x.userId), mode: x.mode,
    weekPoints: Number(x.weekPoints) || 0, weekScored: Number(x.weekScored) || 0, seasonPoints: Number(x.seasonPoints) || 0, seasonScored: Number(x.seasonScored) || 0, weeksSubmitted: Number(x.weeksSubmitted) || 0 }));
  const submissions = raw.submissions.filter(s => MODES.includes(s.mode)).map(s => ({ userId: String(s.userId), mode: s.mode, submittedAt: s.submittedAt }));
  return { viewer: String(raw.viewer), admin: raw.admin === true, members, week, due, submissions, standings, posts };
}

/**
 * Picks due for the viewer: "not_open" before the week's Monday 00:00 PT open (D-24),
 * "urgent" inside two hours of the deadline, "closed" after it.
 */
export function picksDue(feed, now) {
  if (!feed.week) return { state: 'none', modes: [] };
  const deadline = Date.parse(feed.week.deadline), opensAt = weekOpenAt(deadline);
  const open = feed.due.filter(d => !d.submitted);
  if (!open.length) return { state: 'done', modes: [] };
  const state = now < Date.parse(opensAt) ? 'not_open' : now >= deadline ? 'closed' : deadline - now <= 2 * 3_600_000 ? 'urgent' : 'due';
  return { state, opensAt, deadline: feed.week.deadline, week: feed.week.week, modes: open };
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
  if (route === '/community/week-open') {
    // D-24 scheduler status for the commissioner's Publish panel; reference only, never a credential.
    fields(body, []);
    const raw = await service.rpc('gtl_read_week_open_schedule', { p_user: user.id });
    if (!record(raw)) throw new Error('Invalid week open status.');
    const week = record(raw.currentWeek) ? { season: raw.currentWeek.season, week: raw.currentWeek.week, openAt: raw.currentWeek.openAt, deadline: raw.currentWeek.deadline } : null;
    return { configured: raw.configured === true, enabled: raw.enabled === true, season: raw.season ?? null, timeZone: 'America/Los_Angeles', localTime: '00:00', weekday: 'Monday',
      utcCrons: Array.isArray(raw.utcCrons) ? raw.utcCrons.map(String) : [], lastRunAt: raw.lastRunAt ?? null, lastFinishedAt: raw.lastFinishedAt ?? null,
      lastStatus: raw.lastStatus ?? null, lastReason: raw.lastReason ?? null, currentWeek: week };
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
  fields(body, ['userId', 'member']);
  if (!UUID_PATTERN.test(body.userId || '') || body.userId === user.id || typeof body.member !== 'boolean') invalid();
  const result = await service.rpc('gtl_set_community_member', { p_user: user.id, p_target: body.userId, p_member: body.member });
  return { userId: String(result?.userId), member: result?.member === true };
}
