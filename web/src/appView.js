// Which app a signed-in member sees: the new app ("next", web/src/next/NextApp.jsx) for everyone (D-60, step 1 of
// retiring the old app). The old app ("classic", GameHub) stays reachable only for what has no new home yet: the
// Menu's "Older records and tools" link and the failure screens open it, and main.jsx falls back to it when the new
// app's code cannot load. Step 2 (D-60, RETIRE-02 to RETIRE-04) removes it once those destinations exist.
//
// - Every plain visit opens the new app. A device's old saved choice (`gtl.app`, from the opt-in years: D-38, D-39)
//   no longer counts; startAppView() forgets it, and leaves every other preference and draft alone.
// - `?app=classic` opens the old app for that address only. It is never saved, so the next plain visit is the new app.
//   No other value of `app` does anything.
// - Moving between the two always loads a new page, so they never mount together. Going back drops `app` from the
//   address and keeps the rest of it.
// - This is a convenience, not a security gate: both apps call the same routes under the same server rules.
//
// main.jsx reads the view once per page load; its outer error boundary calls noteAppFallback() when the new app's
// chunk cannot load, then renders the old app, whose footer says so (TryNewApp.jsx, "Back to the new app").

export const APP_STORAGE_KEY = 'gtl.app';
export const APP_VIEWS = Object.freeze(['classic', 'next']);
export const DEFAULT_APP = 'next';
export const APP_PARAM = 'app';

/** The words both apps use for the way between them. */
export const APP_SWITCH_COPY = Object.freeze({
  olderRecords: 'Older records and tools',
  useOld: 'Use the old app',
  backToNew: 'Back to the new app',
  fellBack: 'The new app couldn’t open, so the old app opened instead. Go back to the new app to try again.',
});

export const isAppView = value => APP_VIEWS.includes(value);

/** localStorage, or null where reading the property itself throws (blocked site data). */
export function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** True when the address asks for the old app (`?app=classic`). */
export function forcesClassic(search = '') {
  try { return new URLSearchParams(search).get(APP_PARAM) === 'classic'; } catch { return false; }
}

/** The view for this address: the old app only on `?app=classic`, otherwise the new app. Never throws. */
export function readAppView({ search = globalThis.location?.search ?? '' } = {}) {
  return forcesClassic(search) ? 'classic' : DEFAULT_APP;
}

/** Forgets a device's old saved choice. Never throws. */
export function clearAppView(storage = browserStorage()) {
  try { storage?.removeItem(APP_STORAGE_KEY); return true; } catch { return false; }
}

/** Called once per page load by main.jsx: the view to render. Also forgets any saved choice from before D-60. */
export function startAppView({ search = globalThis.location?.search ?? '', storage = browserStorage() } = {}) {
  clearAppView(storage);
  return readAppView({ search });
}

/** The address to go back to: this one without `app`, every other parameter and the hash kept. */
export function withoutAppParam(href) {
  const url = new URL(href);
  url.searchParams.delete(APP_PARAM);
  return url.href;
}

/** The address that opens the old app: this one with `app=classic`. */
export function classicUrl(href) {
  const url = new URL(href);
  url.searchParams.set(APP_PARAM, 'classic');
  return url.href;
}

/** Opens the old app for older records and tools (a new page; nothing is saved). */
export function openOldApp({ location = globalThis.location } = {}) {
  location.assign(classicUrl(location.href));
}

/** From the old app, back to the new one (a new page at the same address without `app`). */
export function backToNewApp({ location = globalThis.location } = {}) {
  const target = withoutAppParam(location.href);
  if (target === location.href) location.reload();
  else location.assign(target);
}

// Set by main.jsx's fallback boundary when the new app could not load on this page; read by the old app's footer.
// No reload happens between the two, so module state is enough, and a reload starts clean.
let fellBack = false;
export function noteAppFallback() { fellBack = true; }
export function appFellBack() { return fellBack; }
