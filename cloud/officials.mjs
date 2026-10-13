// Game referees for situational trends (Sean's October 12, 2026 trends ruling, option A).
// The community commissioner sets each published game's referee from a dropdown once crews are
// announced; every signed-in community member reads the week's assignments, and the trend panel
// shows that referee's records ("Referee not assigned yet" otherwise). Public game facts only.
// Separate from cloud/community.mjs so the community routes and their tests stay untouched.
import { UUID_PATTERN } from './lobby.mjs';
import { GAME_ID, canonicalReferee } from '../shared/referees.mjs';

export class OfficialsError extends Error {
  constructor(status, message) { super(message); this.name = 'OfficialsError'; this.status = status; }
}
export const OFFICIALS_METHODS = Object.freeze({ '/officials/read': ['POST'], '/officials/set': ['POST'] });
const ERRORS = {
  GTL_OFFICIALS_INVALID: [400, 'Check the game and the referee name, then try again.'],
  GTL_OFFICIALS_UNKNOWN_GAME: [409, 'That game is not on the published schedule for that week. Nothing was changed.'],
  GTL_OFFICIALS_FORBIDDEN: [403, 'Only the commissioner can set game referees.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name to join the community.'],
};
export const providerOfficialsError = message => (ERRORS[message] ? new OfficialsError(...ERRORS[message]) : new Error('Game referees are unavailable.'));
const invalid = () => { throw providerOfficialsError('GTL_OFFICIALS_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const scope = body => {
  if (!Number.isInteger(body.season) || body.season < 2000 || body.season > 2200 || !Number.isInteger(body.week) || body.week < 1 || body.week > 25) invalid();
};
const time = value => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null);
/** A stored name is shown only when it is a valid canonical referee name; anything else reads as not assigned. */
const storedName = value => (typeof value === 'string' ? canonicalReferee(value) ?? null : null);

function normalizeRead(raw, season, week) {
  if (!record(raw) || !record(raw.assignments)) throw new Error('Invalid referee assignments.');
  const assignments = {};
  for (const [gameId, row] of Object.entries(raw.assignments).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!GAME_ID.test(gameId) || !record(row)) continue;
    assignments[gameId] = { referee: storedName(row.referee), setAt: time(row.setAt), revision: Number.isInteger(row.revision) ? row.revision : null };
  }
  return { season, week, assignments };
}

/**
 * POST /officials/read { season, week } → { season, week, assignments: { [gameId]: { referee, setAt, revision } } }
 * POST /officials/set { season, week, gameId, referee: string | null } (commissioner only) → { season, week, gameId, referee, setAt, revision, changed }
 */
export async function handleOfficials({ route, body = {}, user, service }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new OfficialsError(401, 'Sign in to continue.');
  if (!service?.rpc) throw new Error('Game referees are not configured.');
  if (!Object.hasOwn(OFFICIALS_METHODS, route)) invalid();
  if (route === '/officials/read') {
    fields(body, ['season', 'week']); scope(body);
    return normalizeRead(await service.rpc('gtl_read_game_officials', { p_user: user.id, p_season: body.season, p_week: body.week }), body.season, body.week);
  }
  fields(body, ['season', 'week', 'gameId', 'referee']); scope(body);
  if (typeof body.gameId !== 'string' || !GAME_ID.test(body.gameId) || !Object.hasOwn(body, 'referee')) invalid();
  const referee = canonicalReferee(body.referee);
  if (referee === undefined) invalid();
  // The commissioner check runs before the write, as Publish Week does; the RPC checks again.
  if (!(await service.rpc('gtl_community_admin', { p_user: user.id }))) throw providerOfficialsError('GTL_OFFICIALS_FORBIDDEN');
  const result = await service.rpc('gtl_set_game_official', { p_user: user.id, p_season: body.season, p_week: body.week, p_game: body.gameId, p_referee: referee });
  if (!record(result) || result.gameId !== body.gameId || (result.referee !== null && storedName(result.referee) !== result.referee)) throw new Error('Invalid referee result.');
  return { season: body.season, week: body.week, gameId: body.gameId, referee: result.referee, setAt: time(result.setAt),
    revision: Number.isInteger(result.revision) ? result.revision : null, changed: result.changed === true };
}
