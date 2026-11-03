// The moments map (D-69, Sean on November 2, 2026: "Use PICK column"): every moment the app can play and its size.
// BRAND_GUIDE Motion: saves get a small moment, verified wins a big one, losses stay quiet. Pure.

/** Moment kind to size. Anything not listed is quiet: an unknown kind never celebrates. */
export const MOMENTS = Object.freeze({
  lockIn: 'small', weekLocked: 'small', bullseye: 'big', weekFinal: 'big', rankUp: 'small', rankFirst: 'big',
  pointsExact: 'big', badge: 'big', award: 'big', streak: 'small', betWin: 'small', loss: 'quiet',
});

/** 'big' | 'small' | 'quiet'. */
export const sizeOf = kind => (typeof kind === 'string' && Object.hasOwn(MOMENTS, kind) ? MOMENTS[kind] : 'quiet');

/** The cards that hold moments. A moment plays when one of its scopes is open (see detect.js). */
/** The cards that hold moments. A moment plays when one of its scopes is open (see detect.js). D-69 step 1 adds the
 * Play cards that hold their own moments: Your score (Bullseye, Week final), the picks (Whole week locked) and Guess
 * the Points (Points exact). */
export const SCOPES = Object.freeze({ home: 'home', play: 'play', league: 'league', features: 'features', score: 'score', picks: 'picks', points: 'points' });
