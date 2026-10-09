import { applySocialMutation, emptySocialState, socialView, SocialError } from '../shared/social-bets.mjs';
import { UUID_PATTERN } from './lobby.mjs';
export { SocialError } from '../shared/social-bets.mjs';

export const SOCIAL_METHODS = Object.fromEntries(['read', 'create', 'tail', 'settle', 'include', 'correct', 'follow'].map(action => [`/social/${action}`, ['POST']]));
const ERRORS = {
  GTL_SOCIAL_INVALID: [400, 'Check the shared bet fields and try again.'],
  GTL_SOCIAL_PROFILE: [400, 'Open My games and save your display name first.'],
  GTL_SOCIAL_SLATE: [404, 'This week’s verified schedule is not available.'],
  GTL_SOCIAL_FORBIDDEN: [403, 'Only the owner can change this shared bet.'],
  GTL_SOCIAL_CONFLICT: [409, 'Shared bets changed on another device. Refresh and review before saving again.'],
  GTL_SOCIAL_RETRY_CONFLICT: [409, 'This request was already used for different content. Refresh before saving again.'],
  GTL_SOCIAL_LIMIT: [409, 'This week has reached the pilot’s shared bet capacity. Existing history has been preserved.'],
};
export const providerSocialError = message => ERRORS[message] ? new SocialError(...ERRORS[message]) : new Error('Shared bets are unavailable.');
const invalid = () => { throw providerSocialError('GTL_SOCIAL_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
function scope(body) {
  if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid();
}
function validateFilters(filters) {
  fields(filters, ['playerId', 'kind', 'market', 'outcome', 'origin', 'following', 'team', 'counts', 'includeParlays', 'includeTailed', 'includeTracked']);
  for (const key of ['following', 'includeParlays', 'includeTailed', 'includeTracked']) if (filters[key] !== undefined && typeof filters[key] !== 'boolean') invalid();
  const enums = { kind: ['all', 'single', 'parlay'], market: ['all', 'spread', 'total', 'prop'], outcome: ['all', 'pending', 'win', 'loss', 'push', 'void'], origin: ['all', 'tracked', 'virtual', 'tailed'], counts: ['all', 'included', 'excluded'] };
  for (const [key, values] of Object.entries(enums)) if (filters[key] !== undefined && !values.includes(filters[key])) invalid();
  if (filters.playerId !== undefined && filters.playerId !== 'all' && !UUID_PATTERN.test(filters.playerId)) invalid();
  if (filters.team !== undefined && (typeof filters.team !== 'string' || filters.team.length > 100 || /[\x00-\x1f\x7f]/.test(filters.team))) invalid();
}
function canonicalGames(games, season, week) {
  if (!Array.isArray(games)) throw new Error('Invalid social schedule.');
  return games.map(g => {
    const kickoff = typeof g.kickoff === 'number' ? new Date(g.kickoff * 1000).toISOString() : g.kickoff;
    if (typeof g.id !== 'string' || typeof g.home !== 'string' || typeof g.away !== 'string' || !Number.isFinite(Date.parse(kickoff))) throw new Error('Invalid social schedule.');
    return { id: g.id, away: g.away, home: g.home, kickoff, season, week };
  });
}
function normalizeRead(raw) {
  if (!record(raw) || !Array.isArray(raw.weeks) || !raw.weeks.length || !Array.isArray(raw.profiles) || !Array.isArray(raw.availableWeeks) || !Array.isArray(raw.following)) throw new Error('Invalid social workspace.');
  return {
    season: raw.season, week: raw.week,
    profiles: raw.profiles.map(p => {
      if (!UUID_PATTERN.test(p.id || '') || typeof p.displayName !== 'string') throw new Error('Invalid public profile.');
      return { id: p.id, displayName: p.displayName };
    }),
    availableWeeks: raw.availableWeeks.map(w => { scope(w); return { season: w.season, week: w.week }; }),
    following: raw.following.filter(id => UUID_PATTERN.test(id)),
    weeks: raw.weeks.map(w => {
      scope(w); if (!revision(w.revision) || !record(w.state)) throw new Error('Invalid social revision.');
      return { season: w.season, week: w.week, revision: w.revision, state: w.state, games: canonicalGames(w.games, w.season, w.week) };
    }),
  };
}
async function call(service, name, args) {
  try { return await service.rpc(name, args); }
  catch (error) {
    if (error instanceof SocialError) throw error;
    throw providerSocialError(error?.message);
  }
}
function project(raw, actorId, filters = {}, allHistory = false, now = Date.now()) {
  const data = normalizeRead(raw);
  const state = emptySocialState();
  state.entries = data.weeks.flatMap(w => w.state.entries);
  state.audit = data.weeks.flatMap(w => w.state.audit);
  const games = data.weeks.flatMap(w => w.games);
  return {
    ...socialView(state, { actorId, profiles: data.profiles, games,
      ...(allHistory ? {} : { season: data.season, week: data.week }), filters, following: data.following, now }),
    profiles: data.profiles, actorId, season: allHistory ? null : data.season, week: allHistory ? null : data.week,
    weekRevision: allHistory ? null : data.weeks[0].revision,
    availableWeeks: data.availableWeeks, games, following: data.following,
    historyScope: allHistory ? 'all' : 'week', capacity: { entriesPerWeek: 2000 },
  };
}
const CREATE = ['notes', 'kind', 'origin', 'legs', 'odds', 'stakeUnits', 'source', 'quotedAt', 'placedAt', 'countsForRecord'];
const ACTION_FIELDS = {
  create: CREATE,
  tail: ['notes', 'sourceEntryId', 'origin', 'odds', 'stakeUnits', 'source', 'quotedAt', 'placedAt', 'countsForRecord'],
  settle: ['entryId', 'revision', 'outcome', 'actualReturnUnits', 'reason'],
  include: ['entryId', 'revision', 'countsForRecord', 'reason'],
  correct: ['entryId', 'revision', 'reason', ...CREATE],
};

// Called only after verified authentication by createCloudHandler. The duplicate
// identity check also makes this module fail closed when used independently.
export async function handleSocial({ route, body = {}, user, service, clock = Date.now }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new SocialError(401, 'Sign in to continue.');
  if (!service?.rpc) throw new Error('Shared bets are not configured.');
  if (!Object.hasOwn(SOCIAL_METHODS, route)) invalid();
  const actor = { p_user: user.id };
  const read = (season, week, all = false) => call(service, 'gtl_read_social', { ...actor, p_season: season ?? null, p_week: week ?? null, p_all: all });
  if (route === '/social/read') {
    fields(body, ['season', 'week', 'filters', 'allHistory']);
    if (body.season !== undefined || body.week !== undefined) scope(body);
    if (body.allHistory !== undefined && typeof body.allHistory !== 'boolean') invalid();
    if (body.allHistory && (body.season !== undefined || body.week !== undefined)) invalid();
    if (body.filters !== undefined) validateFilters(body.filters);
    return project(await read(body.season, body.week, body.allHistory ?? false), user.id, body.filters ?? {}, body.allHistory ?? false, clock());
  }
  if (route === '/social/follow') {
    fields(body, ['requestId', 'targetUserId', 'following']);
    if (!UUID_PATTERN.test(body.requestId || '') || !UUID_PATTERN.test(body.targetUserId || '') || body.targetUserId === user.id || typeof body.following !== 'boolean') invalid();
    const result = await call(service, 'gtl_follow_social', { ...actor, p_request_id: body.requestId, p_target: body.targetUserId, p_following: body.following });
    if (!Array.isArray(result?.following) || result.following.some(id => !UUID_PATTERN.test(id))) throw new Error('Invalid follow result.');
    return { following: result.following, replayed: result.replayed === true };
  }
  const action = route.slice('/social/'.length);
  fields(body, ['season', 'week', 'weekRevision', 'requestId', ...ACTION_FIELDS[action]]);
  scope(body);
  if (body.origin === 'virtual') throw new SocialError(409, 'Virtual units require a verified named-book quote receipt. Track an external bet here.');
  if (!UUID_PATTERN.test(body.requestId || '') || !revision(body.weekRevision)) invalid();
  const raw = await read(body.season, body.week);
  const data = normalizeRead(raw);
  const selected = data.weeks.find(w => w.season === body.season && w.week === body.week);
  if (!selected || data.weeks.length !== 1) throw new Error('Invalid social scope.');
  const { weekRevision, ...payload } = body;
  const next = applySocialMutation(selected.state, { actorId: user.id, action, body: payload, games: selected.games, now: clock() });
  const committed = await call(service, 'gtl_commit_social', { ...actor, p_season: body.season, p_week: body.week,
    p_expected_revision: weekRevision, p_request_id: body.requestId, p_action: action, p_body: body, p_state: next });
  if (!revision(committed?.revision) || typeof committed.replayed !== 'boolean') throw new Error('Invalid shared bet commit.');
  return { ...project(await read(body.season, body.week), user.id, {}, false, clock()), replayed: committed.replayed };
}
