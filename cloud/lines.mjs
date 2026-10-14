// Lines route group for the redesign (build plan, sections 3.1 and 3.3). Stage 4 wires it into
// cloud/handler.mjs once; it serves no route yet. Stage 23 adds POST /lines/read and /lines/game: the
// only safe way to read current lines, gated per game and market in SQL (D-36, D-39). A lines stage
// edits this file and scripts/boundary/lines.mjs, not the handler.
import { UUID_PATTERN } from './lobby.mjs';

export class LinesError extends Error {
  constructor(status, message) { super(message); this.name = 'LinesError'; this.status = status; }
}
/** Route → allowed methods. Group routes take POST JSON bodies; the handler allows them no query parameters. */
export const LINES_METHODS = Object.freeze({});
/** Database refusal code → [status, sentence]. A code is mapped here, and deployed, before the SQL can raise it. */
const ERRORS = Object.freeze({});
export const providerLinesError = message => (Object.hasOwn(ERRORS, message) ? new LinesError(...ERRORS[message]) : new Error('Lines are unavailable.'));

/** The handler calls this only for a route in LINES_METHODS, after sign-in and email confirmation. */
export async function handleLines({ route, user, service }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new LinesError(401, 'Sign in to continue.');
  if (!Object.hasOwn(LINES_METHODS, route)) throw new LinesError(404, 'Not found.');
  if (!service?.rpc) throw new Error('Lines are not configured.');
  throw new LinesError(404, 'Not found.');
}
