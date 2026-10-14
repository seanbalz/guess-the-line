// League route group for the redesign (build plan, sections 3.1 and 3.3). Stage 4 wires it into
// cloud/handler.mjs once; it serves no route yet. Stage 57 adds the boards, my leagues and members
// (POST /league/list, /league/members, /league/board); later League stages add the feed, reactions and
// the player sheet. The old /community/* routes stay in cloud/community.mjs. A league stage edits this
// file and scripts/boundary/league.mjs, not the handler.
import { UUID_PATTERN } from './lobby.mjs';

export class LeagueError extends Error {
  constructor(status, message) { super(message); this.name = 'LeagueError'; this.status = status; }
}
/** Route → allowed methods. Group routes take POST JSON bodies; the handler allows them no query parameters. */
export const LEAGUE_METHODS = Object.freeze({});
/** Database refusal code → [status, sentence]. A code is mapped here, and deployed, before the SQL can raise it. */
const ERRORS = Object.freeze({});
export const providerLeagueError = message => (Object.hasOwn(ERRORS, message) ? new LeagueError(...ERRORS[message]) : new Error('League data is unavailable.'));

/** The handler calls this only for a route in LEAGUE_METHODS, after sign-in and email confirmation. */
export async function handleLeague({ route, user, service }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new LeagueError(401, 'Sign in to continue.');
  if (!Object.hasOwn(LEAGUE_METHODS, route)) throw new LeagueError(404, 'Not found.');
  if (!service?.rpc) throw new Error('League data is not configured.');
  throw new LeagueError(404, 'Not found.');
}
