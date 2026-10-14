// Which app a signed-in member sees on this device: the old app ("classic", GameHub) or the new app ("next",
// web/src/next/NextApp.jsx). Redesign build plan, stage 9 (section 3.2); D-38 (the new app is built beside the
// old one) and D-39 (every signed-in member may opt in from the first look).
//
// - The choice is per device, in localStorage under `gtl.app`. DEFAULT_APP stays 'classic' until stage 80.
// - Anything but a valid saved value (nothing saved, an unknown value, storage that throws) is the default.
// - `?app=classic` always forces the old app, and saves 'classic' as this device's choice, so the escape hatch
//   still holds on the next plain visit. No other value of `app` does anything.
// - Every switch reloads the page, so the two apps never mount together. A switch also drops `app` from the
//   address, so "Try the new app" works after a `?app=classic` visit.
// - The switch is a convenience, not a security gate: both apps call the same routes under the same server rules.
//
// main.jsx reads the view once per page load; its outer error boundary calls clearAppView() and noteAppFallback()
// when the new app's chunk cannot load, then renders the old app, whose footer says so (TryNewApp.jsx).

export const APP_STORAGE_KEY = 'gtl.app';
export const APP_VIEWS = Object.freeze(['classic', 'next']);
export const DEFAULT_APP = 'classic';
export const APP_PARAM = 'app';

/** The two buttons, shared so both apps name the switch the same way. */
export const APP_SWITCH_COPY = Object.freeze({
  tryNew: 'Try the new app',
  useOld: 'Use the old app',
  storageBlocked: 'This browser isn’t saving settings, so the new app can’t open here. The current app keeps working.',
  fellBack: 'The new app couldn’t open, so you’re back in the current app. You can try again later.',
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

/** The device's saved choice, or DEFAULT_APP. Never throws. */
export function readAppView({ search = globalThis.location?.search ?? '', storage = browserStorage() } = {}) {
  if (forcesClassic(search)) return 'classic';
  try {
    const value = storage?.getItem(APP_STORAGE_KEY);
    return isAppView(value) ? value : DEFAULT_APP;
  } catch { return DEFAULT_APP; }
}

/** Saves the device's choice. True only when it was written and reads back. Never throws. */
export function saveAppView(view, storage = browserStorage()) {
  if (!isAppView(view) || !storage) return false;
  try {
    storage.setItem(APP_STORAGE_KEY, view);
    return storage.getItem(APP_STORAGE_KEY) === view;
  } catch { return false; }
}

/** Forgets the device's choice, so the default applies. Never throws. */
export function clearAppView(storage = browserStorage()) {
  try { storage?.removeItem(APP_STORAGE_KEY); return true; } catch { return false; }
}

/** Called once per page load by main.jsx: the view to render. `?app=classic` also saves 'classic'. */
export function startAppView({ search = globalThis.location?.search ?? '', storage = browserStorage() } = {}) {
  if (forcesClassic(search)) { saveAppView('classic', storage); return 'classic'; }
  return readAppView({ search, storage });
}

/** The address to reload into: this one without `app`, every other parameter and the hash kept. */
export function withoutAppParam(href) {
  const url = new URL(href);
  url.searchParams.delete(APP_PARAM);
  return url.href;
}

/** The address that forces the old app: this one with `app=classic`. */
export function classicUrl(href) {
  const url = new URL(href);
  url.searchParams.set(APP_PARAM, 'classic');
  return url.href;
}

/**
 * Switches this device to `view` and reloads. Returns false, without reloading, when the choice cannot be saved.
 * Going back to the old app never fails: when storage refuses, the page reloads with `?app=classic` instead.
 */
export function switchApp(view, { storage = browserStorage(), location = globalThis.location } = {}) {
  if (!isAppView(view)) return false;
  if (!saveAppView(view, storage)) {
    if (view !== 'classic') return false;
    location.replace(classicUrl(location.href));
    return true;
  }
  if (new URL(location.href).searchParams.has(APP_PARAM)) location.replace(withoutAppParam(location.href));
  else location.reload();
  return true;
}

// Set by main.jsx's fallback boundary when the new app could not load on this page; read by the old app's footer.
// No reload happens between the two, so module state is enough, and a reload starts clean.
let fellBack = false;
export function noteAppFallback() { fellBack = true; }
export function appFellBack() { return fellBack; }
