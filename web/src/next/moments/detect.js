// Which moments are new, and which play now (D-69 section 4.2). Pure: candidates come from fresh server reads only
// (rule 1); the caller never builds one from a request that is still pending.
import { sizeOf } from './catalog.js';

/** Small moments wait this long after one another. */
export const SMALL_GAP_MS = 240;

const valid = c => c && typeof c.id === 'string' && c.id && typeof c.kind === 'string' && typeof c.title === 'string'
  && Array.isArray(c.scopes) && c.scopes.length > 0 && c.scopes.every(s => typeof s === 'string' && s);

/**
 * `seen` null means this device has no record for the account: everything is seeded, nothing plays (a first sighting
 * shows the result as it is). Otherwise `fresh` holds the unseen moments that can play (big or small) and `seed` the
 * unseen quiet ones, remembered at once.
 */
export function freshMoments(candidates, seen) {
  const unique = [...new Map((candidates ?? []).filter(valid).map(c => [c.id, c])).values()];
  if (seen === null) return { fresh: [], seed: unique.map(c => c.id) };
  const unseen = unique.filter(c => !seen.has(c.id));
  return { fresh: unseen.filter(c => sizeOf(c.kind) !== 'quiet'), seed: unseen.filter(c => sizeOf(c.kind) === 'quiet').map(c => c.id) };
}

/**
 * What plays now. A pending moment plays when one of its scopes is open and either it arrived after the launch
 * (`late`, it plays in place) or that scope was opened after the launch ('settled': the member opened the card). A
 * scope open since the launch never plays what waited, so nothing plays on page load.
 */
export function planMoments({ pending, open }) {
  const plays = c => c.scopes.some(s => open.has(s) && (c.late || open.get(s) === 'settled'));
  const now = pending.filter(plays);
  return { big: now.filter(c => sizeOf(c.kind) === 'big'), small: now.filter(c => sizeOf(c.kind) === 'small'), keep: pending.filter(c => !plays(c)) };
}
