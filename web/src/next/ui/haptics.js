// A light haptic tick and a win buzz (design upgrade, "game feel"; D-69 section 4.6): one short vibration where the
// device offers one (Android Chrome), nothing where it does not (iPhone Safari has no Vibration API, desktops ignore
// it) and nothing under reduced motion. The tick is for primary actions and a confirmed lock-in; the win is for big
// moments. A refusal or a missing API is not an error.

export const HAPTIC_MS = 10;
export const WIN_MS = 20;

function buzz(nav, ms, reduced) {
  if (reduced) return false;
  try {
    return typeof nav?.vibrate === 'function' ? nav.vibrate(ms) === true : false;
  } catch {
    return false;
  }
}
const device = () => (typeof navigator === 'undefined' ? undefined : navigator);

/** One HAPTIC_MS tick when the device can and motion is not reduced; true when the browser accepted it. */
export const lightHaptic = (nav = device(), reduced = false) => buzz(nav, HAPTIC_MS, reduced);
/** One WIN_MS buzz for a big moment, on the same terms. */
export const winHaptic = (nav = device(), reduced = false) => buzz(nav, WIN_MS, reduced);
