// "Continue with Google" (October 12 decision): Google sign-in is how new players sign up and recover access.
// OAuth is a full-page redirect to Supabase Auth and back to this origin, so the pending invitation (held in this tab's
// sessionStorage by invitations.js) survives the round trip without being put in the redirect URL.

export const PROVIDER_DISABLED = 'Google sign-in isn’t switched on yet. Use email for now.';
export const OAUTH_CANCELLED = 'Google sign-in was cancelled. Try again, or use email.';
export const OAUTH_FAILED = 'Google sign-in could not be completed. Try again, or use email.';

/** Plain words for whatever Supabase Auth or Google reported. Raw provider text is never shown. */
export function oauthMessage(raw) {
  const text = String(raw || '').toLowerCase();
  if (/provider is not enabled|unsupported provider|provider_disabled|provider not enabled/.test(text)) return PROVIDER_DISABLED;
  if (/access_denied|cancel/.test(text)) return OAUTH_CANCELLED;
  return OAUTH_FAILED;
}

// An OAuth failure comes back to redirectTo as error parameters in the fragment or query. Read them once, before the
// Supabase client initializes, and remove them from the address bar so a reload does not repeat the message.
function readReturnError() {
  try {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const source = ['error', 'error_code', 'error_description'].some(key => hash.has(key)) ? hash : ['error', 'error_code', 'error_description'].some(key => query.has(key)) ? query : null;
    if (!source) return '';
    const message = oauthMessage([source.get('error'), source.get('error_code'), source.get('error_description')].join(' '));
    for (const key of ['error', 'error_code', 'error_description']) source.delete(key);
    const search = source === query ? query.toString() : window.location.search.slice(1);
    const fragment = source === hash ? hash.toString() : window.location.hash.slice(1);
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${fragment ? `#${fragment}` : ''}`);
    return message;
  } catch { return ''; }
}
/** The plain-words message for an OAuth failure this page load returned with, or an empty string. */
export const oauthReturnError = readReturnError();

/**
 * Starts Google sign-in. Supabase answers a disabled provider with a raw JSON error page after the redirect, so the public
 * Auth settings are checked first; if that check itself fails the redirect still proceeds and any error returns here.
 */
export async function startGoogleSignIn(client, { url, key, fetcher = globalThis.fetch } = {}) {
  if (url && key && fetcher) {
    let settings = null;
    try {
      const response = await fetcher(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: 'no-store' });
      if (response.ok) settings = await response.json();
    } catch { /* The redirect below still reports a failure back to this page. */ }
    if (settings?.external && settings.external.google !== true) throw new Error(PROVIDER_DISABLED);
  }
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw new Error(oauthMessage(`${error.message || ''} ${error.code || ''}`));
}
