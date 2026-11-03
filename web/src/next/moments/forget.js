// D-69 sections 7 and 8: what the moments remember on this device goes at the account boundary (sign-out, or the
// signed-in account changing to another or to none, the drafts' rule), so the next account starts with no seen record,
// no remembered count-up values and a fresh launch.
import { clearCountUpSeen } from './countUp.js';
import { resetLaunch } from './launch.js';
import { clearMomentSeen } from './seen.js';

/** Clears every account's seen record and count-up values (`storage` defaults to localStorage) and resets the launch. */
export function forgetMomentsDevice(storage) {
  clearMomentSeen(storage);
  clearCountUpSeen(storage);
  resetLaunch();
}
