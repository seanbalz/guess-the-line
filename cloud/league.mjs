import { UUID_PATTERN } from './lobby.mjs';
import { normalizeHistory } from './community.mjs';
const LEAGUE_ID = /^(?:sean-troy-luke|g_[0-9a-f]{32})$/;
export class LeagueError extends Error {
  constructor(status, message) { super(message); this.name = 'LeagueError'; this.status = status; }
}
export const LEAGUE_METHODS = Object.freeze({ '/league/comparison': ['POST'] });
const ERRORS = Object.freeze({
  GTL_COMPARISON_INVALID: [400, 'Choose a valid season and league.'],
  GTL_COMPARISON_MEMBER: [403, 'You no longer have access to that league.'],
  GTL_COMMUNITY_MEMBER: [403, 'Save your profile to open comparisons.'],
  GTL_FEATURE_OFF: [503, 'Comparisons are not available yet. Try again later.'],
});
export const providerLeagueError = message => Object.hasOwn(ERRORS, message) ? new LeagueError(...ERRORS[message]) : new Error('League data is unavailable.');
export async function handleLeague({ route, body, user, service, clock = Date.now, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new LeagueError(401, 'Sign in to continue.');
  if (!Object.hasOwn(LEAGUE_METHODS, route)) throw new LeagueError(404, 'Not found.');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['season','leagueId'].includes(key))
    || (body.season !== undefined && (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200))
    || (body.leagueId !== undefined && (typeof body.leagueId !== 'string' || !LEAGUE_ID.test(body.leagueId)))) throw providerLeagueError('GTL_COMPARISON_INVALID');
  if (featureOff.has('comparisons')) throw providerLeagueError('GTL_FEATURE_OFF');
  if (!service?.rpc) throw new Error('League data is not configured.');
  const raw = await service.rpc('gtl_read_score_comparison', { p_user: user.id, p_season: body.season ?? null, p_league: body.leagueId ?? null, p_now: new Date(clock()).toISOString() });
  if (raw?.viewer !== user.id || raw?.leagueId !== (body.leagueId ?? null)) throw new Error('Invalid comparison scope.');
  const data = normalizeHistory(raw, user.id), roster = new Set(data.members.map(member => member.id));
  return { ...data, leagueId: raw.leagueId, weeks: data.weeks.map(week => ({ ...week, entries: week.entries.filter(entry => roster.has(entry.userId)) })) };
}
