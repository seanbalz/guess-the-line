// Whether the sign-in screen has to wait for Supabase before showing the form: a saved session may exist
// (`sb-<project>-auth-token` in local storage) or the address carries a sign-in return (OAuth `code` or `error`,
// or the token, error or recovery fields in the hash). Otherwise the form shows at once, so the card never
// swaps a "Checking your sign-in…" line for the whole form and jumps (Lighthouse CLS 0.63 on October 23, 2026).
// When storage can't be read, it waits, as before.
export function signInMayBePending({ storage = globalThis.localStorage, location = globalThis.location } = {}) {
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch { return true; }
  const query = new URLSearchParams(location?.search ?? ''), hash = new URLSearchParams((location?.hash ?? '').slice(1));
  return query.has('code') || query.has('error') || ['access_token', 'refresh_token', 'error', 'type'].some(field => hash.has(field));
}
