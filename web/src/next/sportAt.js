// Which sport an address shows (pure, so node tests can read it; NbaApp.jsx's SportEntry is its caller).
import { nbaFragment, nbaRoute } from './nba/route.js';
import { eplFragment, eplRoute } from './epl/route.js';

/**
 * NBA and EPL routes open their sport; while one of them shows, its in-page anchors (#nba-main, #epl-main) keep it.
 * Anything else, including a cold anchor, is NFL. EPL access is checked by SportEntry, not here (eplGate).
 */
export function sportAt(hash, current = 'nfl') {
  if (nbaRoute(hash)) return 'nba';
  if (eplRoute(hash)) return 'epl';
  if (current === 'nba' && nbaFragment(hash)) return 'nba';
  if (current === 'epl' && eplFragment(hash)) return 'epl';
  return 'nfl';
}
