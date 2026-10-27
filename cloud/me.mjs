import { UUID_PATTERN } from './lobby.mjs';
import { validBooks, preferenceValue } from '../shared/account-preferences.mjs';
import { projectChanges, projectRecords } from './me-history.mjs';
export class MeError extends Error {
  constructor(status, message) { super(message); this.name = 'MeError'; this.status = status; }
}
// /me/changes and /me/records: Me › History (redesign build plan stage 72, M-27), your own Guess changes and the older records.
export const ME_METHODS = Object.freeze({ '/me/preferences': ['POST'], '/me/preferences/save': ['POST'], '/me/changes': ['POST'], '/me/records': ['POST'] });
const ERRORS = Object.freeze({
  GTL_PREFERENCES_INVALID: [400, 'Check your preferences and try again.'],
  GTL_PREFERENCES_PROFILE: [403, 'Save your profile before changing preferences.'],
  GTL_PREFERENCES_BOOK: [409, 'A selected sportsbook is no longer supported. Refresh the available books.'],
  GTL_PREFERENCES_CONFLICT: [409, 'Your preferences changed on another screen. Review the saved settings before trying again.'],
  GTL_FEATURE_OFF: [503, 'Preferences are not available yet. Your saved choices are kept.'],
  // M-27 (stage 72): mapped here, and deployed, before the SQL can raise them.
  GTL_ME_PROFILE: [403, 'Save your profile before opening History.'],
  GTL_ME_INVALID: [400, 'Choose a season and week, or neither.'],
});
export const providerMeError = message => Object.hasOwn(ERRORS, message) ? new MeError(...ERRORS[message]) : new Error('Your preferences are unavailable.');
const HISTORY = Object.freeze({ '/me/changes': 'gtl_read_ballot_changes', '/me/records': 'gtl_read_me_records' });
// While M-27 is not applied (or rolled back), PostgREST's PGRST202 arrives as GTL_FEATURE_OFF: History says so, not Preferences.
const HISTORY_OFF = 'History is not available yet. Your records are kept.';
const week = value => Number.isInteger(value) && value >= 1 && value <= 25, season = value => Number.isInteger(value) && value >= 2000 && value <= 2200;

async function history({ route, body, user, service, clock }) {
  const changes = route === '/me/changes';
  const keys = changes ? ['season', 'week'] : [];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))
    || (changes && ((body.season === undefined) !== (body.week === undefined) || (body.season !== undefined && (!season(body.season) || !week(body.week))))))
    throw providerMeError('GTL_ME_INVALID');
  if (!service?.rpc) throw new Error('History is not configured.');
  const now = new Date(clock()).toISOString();
  let raw;
  try {
    raw = await service.rpc(HISTORY[route], changes ? { p_user: user.id, p_season: body.season ?? null, p_week: body.week ?? null, p_now: now } : { p_user: user.id, p_now: now });
  } catch (error) {
    if (error instanceof MeError && error.status === 503) throw new MeError(503, HISTORY_OFF);
    throw error instanceof MeError ? error : new Error('History is unavailable.');
  }
  return changes ? projectChanges(raw, user.id) : projectRecords(raw, user.id);
}

export async function handleMe({ route, body, user, service, clock = Date.now, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new MeError(401, 'Sign in to continue.');
  if (!Object.hasOwn(ME_METHODS, route)) throw new MeError(404, 'Not found.');
  if (Object.hasOwn(HISTORY, route)) return history({ route, body, user, service, clock });
  const save = route === '/me/preferences/save';
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !(save ? ['revision','sportsbooks','guidanceCollapsed'] : []).includes(key))
    || (save && (!Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= 9007199254740990 || !validBooks(body.sportsbooks) || typeof body.guidanceCollapsed !== 'boolean')))
    throw providerMeError('GTL_PREFERENCES_INVALID');
  if (save && featureOff.has('preferences')) throw providerMeError('GTL_FEATURE_OFF');
  if (!service?.rpc) throw new Error('Your preferences are not configured.');
  const raw = await service.rpc(save ? 'gtl_save_account_preferences' : 'gtl_read_account_preferences', { p_user: user.id, ...(save ? { p_revision: body.revision, p_value: preferenceValue(body) } : {}) });
  if (raw?.ownerId !== user.id || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || !validBooks(raw.sportsbooks) || !validBooks(raw.supportedBooks) || typeof raw.guidanceCollapsed !== 'boolean') throw new Error('Invalid preferences.');
  return { ownerId: user.id, revision: raw.revision, ...preferenceValue(raw), supportedBooks: [...raw.supportedBooks].sort() };
}
