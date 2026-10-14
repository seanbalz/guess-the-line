// The signed-in account as the new app's data layer reads it (redesign build plan stage 11). Pure.

/** The display name the account saved on `/lobby`, trimmed; '' until the name step is done. */
export function profileName(lobby) {
  const name = lobby?.profile?.displayName;
  return typeof name === 'string' ? name.trim() : '';
}

/**
 * How this account signs in, for "Sign in again" after a 401: `{ password, google }`, from the Supabase user's
 * `app_metadata` (`provider` and `providers`). An account with no known provider is offered the password, as the
 * sign-in page does; a Google-only account is offered Google only.
 */
export function signInMethods(user) {
  const meta = user?.app_metadata ?? {};
  const providers = [meta.provider, ...(Array.isArray(meta.providers) ? meta.providers : [])].filter(value => typeof value === 'string');
  const google = providers.includes('google');
  return { password: providers.includes('email') || !google, google };
}
