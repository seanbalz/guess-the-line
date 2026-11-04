// The moments map (D-69, Sean on November 2, 2026: "Use PICK column"): every moment the app can play and its size.
// BRAND_GUIDE Motion: saves get a small moment, verified wins a big one, losses stay quiet. Pure.

/** Moment kind to size. Anything not listed is quiet: an unknown kind never celebrates. */
export const MOMENTS = Object.freeze({
  lockIn: 'small', weekLocked: 'small', bullseye: 'big', weekFinal: 'big', rankUp: 'small', rankFirst: 'big',
  pointsExact: 'big', badge: 'big', award: 'big', streak: 'small', betWin: 'small', loss: 'quiet',
});

/** 'big' | 'small' | 'quiet'. */
export const sizeOf = kind => (typeof kind === 'string' && Object.hasOwn(MOMENTS, kind) ? MOMENTS[kind] : 'quiet');

/** The cards that hold moments. A moment plays when one of its scopes is open (see detect.js). D-69 step 1 adds the
 * Play cards that hold their own moments: Your score (Bullseye, Week final), the picks (Whole week locked) and Guess
 * the Points (Points exact). */
export const SCOPES = Object.freeze({ home: 'home', play: 'play', league: 'league', features: 'features', score: 'score', picks: 'picks', points: 'points' });
/** The picks card of one market ('guess_spread', 'guess_total'): Whole week locked waits on its own market's card, so
 * opening the Spread card never spends the Total one ("picks:guess_total"). */
export const picksScope = mode => `${SCOPES.picks}:${mode}`;
/** Your score of one market ('guess_spread', 'guess_total'), D-69 step 2: a Community rank move waits on its market's
 * Your score card as well as on League, so Home's rank tile that opens it plays it there ("score:guess_total"). */
export const scoreScope = mode => `${SCOPES.score}:${mode}`;
