// Me route group for the redesign (build plan, sections 3.1 and 3.3). Stage 4 wires it into
// cloud/handler.mjs once; it serves no route yet. Stage 72 adds the History reads (POST /me/changes,
// /me/records) and stage 75 the export (POST /me/export); a player's private records go only to their
// owner. The old /personal routes stay in cloud/personal.mjs. A Me stage edits this file and
// scripts/boundary/me.mjs, not the handler.
import { UUID_PATTERN } from './lobby.mjs';

export class MeError extends Error {
  constructor(status, message) { super(message); this.name = 'MeError'; this.status = status; }
}
/** Route → allowed methods. Group routes take POST JSON bodies; the handler allows them no query parameters. */
export const ME_METHODS = Object.freeze({});
/** Database refusal code → [status, sentence]. A code is mapped here, and deployed, before the SQL can raise it. */
const ERRORS = Object.freeze({});
export const providerMeError = message => (Object.hasOwn(ERRORS, message) ? new MeError(...ERRORS[message]) : new Error('Your records are unavailable.'));

/** The handler calls this only for a route in ME_METHODS, after sign-in and email confirmation. */
export async function handleMe({ route, user, service }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new MeError(401, 'Sign in to continue.');
  if (!Object.hasOwn(ME_METHODS, route)) throw new MeError(404, 'Not found.');
  if (!service?.rpc) throw new Error('Your records are not configured.');
  throw new MeError(404, 'Not found.');
}
