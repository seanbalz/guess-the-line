// A light haptic tick for primary actions (design upgrade, "game feel"): one 10ms vibration where the device offers
// one (Android Chrome), nothing where it does not (iPhone Safari has no Vibration API, desktops ignore it). Used
// sparingly: the kit's primary Button calls it on a press, never every tap. A refusal or a missing API is not an error.

export const HAPTIC_MS = 10;

/** Vibrates once for `HAPTIC_MS` when the device can; true when the browser accepted it. */
export function lightHaptic(nav = typeof navigator === 'undefined' ? undefined : navigator) {
  try {
    return typeof nav?.vibrate === 'function' ? nav.vibrate(HAPTIC_MS) === true : false;
  } catch {
    return false;
  }
}
