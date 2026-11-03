// "Never on page load" (D-69 section 4.2, rule 3): the app counts as settled only after the member's own first press or
// key inside it. Until then every number shows its final value and no moment plays. Module state: one app per page.
let settled = false;
const listeners = new Set();

export const isSettled = () => settled;

/** Marks the launch over and tells each listener once. */
export function markSettled() {
  if (settled) return;
  settled = true;
  for (const fn of [...listeners]) { listeners.delete(fn); fn(); }
}

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

/** A new sign-in (and tests): the next screen is a launch again. */
export function resetLaunch() { settled = false; listeners.clear(); }
