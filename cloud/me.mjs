import { UUID_PATTERN } from './lobby.mjs';
import { validBooks, preferenceValue } from '../shared/account-preferences.mjs';
export class MeError extends Error {
  constructor(status, message) { super(message); this.name = 'MeError'; this.status = status; }
}
export const ME_METHODS = Object.freeze({ '/me/preferences': ['POST'], '/me/preferences/save': ['POST'] });
const ERRORS = Object.freeze({
  GTL_PREFERENCES_INVALID: [400, 'Check your preferences and try again.'],
  GTL_PREFERENCES_PROFILE: [403, 'Save your profile before changing preferences.'],
  GTL_PREFERENCES_BOOK: [409, 'A selected sportsbook is no longer supported. Refresh the available books.'],
  GTL_PREFERENCES_CONFLICT: [409, 'Your preferences changed on another screen. Review the saved settings before trying again.'],
  GTL_FEATURE_OFF: [503, 'Preferences are not available yet. Your saved choices are kept.'],
});
export const providerMeError = message => Object.hasOwn(ERRORS, message) ? new MeError(...ERRORS[message]) : new Error('Your preferences are unavailable.');
export async function handleMe({ route, body, user, service, featureOff = new Set() }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new MeError(401, 'Sign in to continue.');
  if (!Object.hasOwn(ME_METHODS, route)) throw new MeError(404, 'Not found.');
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
