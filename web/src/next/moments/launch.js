// "Never on page load" (D-69 section 4.2, rule 3). Two signals, module state (one app per page):
// - Settled: the member's own first press or key inside the app. It means "the member is here", so a result that
//   arrives after it plays in place. A scroll touch settles the launch.
// - Navigated: the member's first navigation after settling (a tab change, `go`, Back, a restore, or opening a sheet,
//   page or dialog; Shell.jsx decides). Until then the member is still on the launch screen: a card that shows there
//   is a launch card, whatever was pressed, so every number shows its final value and nothing waiting plays.
let settled = false;
let navigated = false;
const listeners = new Set();

export const isSettled = () => settled;
export const hasNavigated = () => navigated;
/** True until the member's first navigation: what a card showing now counts as a launch. */
export const onLaunchScreen = () => !hasNavigated();

/** Marks the launch over and tells each listener once. */
export function markSettled() {
  if (settled) return;
  settled = true;
  for (const fn of [...listeners]) { listeners.delete(fn); fn(); }
}

/** Ends the launch screen (Shell.jsx calls it on the member's first navigation after settling). */
export function markNavigated() { navigated = true; }

/** Calls `fn` when the launch settles (at once if it has). Returns an unsubscribe. */
export function onSettled(fn) {
  if (settled) { fn(); return () => {}; }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Listens on `target` (the window) for the member's trusted presses or keys. Listeners stay until the returned disarm. */
export function armLaunch(target) {
  const fire = event => { if (event?.isTrusted !== false) markSettled(); };
  const options = { capture: true };
  function disarm() { target.removeEventListener('pointerdown', fire, options); target.removeEventListener('keydown', fire, options); }
  target.addEventListener('pointerdown', fire, options);
  target.addEventListener('keydown', fire, options);
  return disarm;
}

/** A new sign-in (and tests): the next screen is a launch, and a launch screen, again. */
export function resetLaunch() { settled = false; navigated = false; listeners.clear(); }
