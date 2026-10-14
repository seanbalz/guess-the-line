// Bets route group for the redesign (build plan, sections 3.1 and 3.3). Stage 4 wires it into
// cloud/handler.mjs once; it serves no route yet. Stages 40 to 42 add the account-level Virtual Units
// reads, placement and boards (POST /bets/read, /bets/place, /bets/board, /bets/season). The old
// /virtual-units and /virtual-pick routes stay in cloud/virtual-units.mjs. A bets stage edits this file
// and scripts/boundary/bets.mjs, not the handler.
import { UUID_PATTERN } from './lobby.mjs';

export class BetsError extends Error {
  constructor(status, message) { super(message); this.name = 'BetsError'; this.status = status; }
}
/** Route → allowed methods. Group routes take POST JSON bodies; the handler allows them no query parameters. */
export const BETS_METHODS = Object.freeze({});
/** Database refusal code → [status, sentence]. A code is mapped here, and deployed, before the SQL can raise it. */
const ERRORS = Object.freeze({});
export const providerBetsError = message => (Object.hasOwn(ERRORS, message) ? new BetsError(...ERRORS[message]) : new Error('Bets are unavailable.'));

/** The handler calls this only for a route in BETS_METHODS, after sign-in and email confirmation. */
export async function handleBets({ route, user, service }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new BetsError(401, 'Sign in to continue.');
  if (!Object.hasOwn(BETS_METHODS, route)) throw new BetsError(404, 'Not found.');
  if (!service?.rpc) throw new Error('Bets are not configured.');
  throw new BetsError(404, 'Not found.');
}
