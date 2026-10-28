// The only app a signed-in member sees is the new app (web/src/next/NextApp.jsx). The old app (GameHub) is gone: on
// October 28, 2026 the request was to "only show the new version" and "remove access to the old version entirely", which
// completes D-60 step 2 (RETIRE-02) ahead of its checklist.
//
// - Every visit opens the new app. A device's old saved choice (`gtl.app`, from the opt-in years: D-38, D-39) is
//   forgotten; every other preference and draft is left alone.
// - An old `?app=classic` bookmark opens the new app too: startAppView() drops `app` from the address in place (no
//   new page), keeping every other parameter and the hash.
// - Failure screens offer "Reload the app" where they once offered the old app; nothing ever mounts the old UI.

export const APP_STORAGE_KEY = 'gtl.app';
export const APP_PARAM = 'app';

/** The words the failure screens use for their way out. */
export const APP_RELOAD_COPY = Object.freeze({
  reload: 'Reload the app',
  failed: 'The app couldn’t open. Your picks and bets are safe.',
});

/** localStorage, or null where reading the property itself throws (blocked site data). */
export function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Forgets a device's old saved choice. Never throws. */
export function clearAppView(storage = browserStorage()) {
  try { storage?.removeItem(APP_STORAGE_KEY); return true; } catch { return false; }
}

/** The address without `app`, every other parameter and the hash kept. */
export function withoutAppParam(href) {
  const url = new URL(href);
  url.searchParams.delete(APP_PARAM);
  return url.href;
}

/** Called once per page load by main.jsx: forgets any saved choice and drops a stale `app` parameter. Never throws. */
export function startAppView({ location = globalThis.location, history = globalThis.history, storage = browserStorage() } = {}) {
  clearAppView(storage);
  try {
    if (!location?.href || !new URL(location.href).searchParams.has(APP_PARAM)) return;
    history?.replaceState(history.state, '', withoutAppParam(location.href));
  } catch { /* an address that cannot be rewritten still opens the new app */ }
}

/** Loads the page again (the failure screens' way out). */
export function reloadApp({ location = globalThis.location } = {}) {
  location.reload();
}
