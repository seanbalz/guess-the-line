// Redesign stage 15: the old app's screens follow the server's live rules for sent Spread and Total picks (build plan
// section 3.4; D-37 as amended by D-39). /community/read, /personal and /state carry `rules` (cloud/live-rules.mjs).
// While `rules.sentFinal` is false (today, D-16) a submitted pick can still change until the deadline, and every screen
// keeps its Edit and "Save changes". Once M-02 (stage 18) makes gtl_live_rules() report `sentFinal: true`, a locked-in
// pick is final: the screens say "Submitted · final" and offer no edit for it. The server is the authority (M-02 refuses
// any change to a locked-in pick through every writer); this file only keeps the screens honest about that rule.
//
// Lock-in is per game and market (D-39). Today the old app sends a market as one submission, so a pick is locked in
// when it is a pick in a submitted ballot: the same reading as M-01's gtl_guess_locked_in and the new app's rules.js.
// When M-02 records per-game lock-ins, `lockedIn` below reads that record, and every old-app screen follows it.

/** The status a final ballot shows (build plan stage 15). */
export const FINAL_LABEL = 'Submitted · final';
/** One short line beside a Submit button while lock-in is final. */
export const FINAL_SHORT = 'Submitted picks are final.';
/** The rule in a sentence, for review panels and the rules modal. */
export const FINAL_RULE = "Submitted picks are final: once you submit, you can't change them.";

/** Whether the server's live rules make a locked-in pick final. Anything but `true` reads as today's rules. */
export const sentFinal = rules => rules?.sentFinal === true;

/** Whether one game's pick is locked in: a number in a submitted ballot (`{ submittedAt, picks }`). */
export const lockedIn = (ballot, gameId) => Boolean(ballot?.submittedAt) && Number.isFinite(ballot?.picks?.[gameId]);

/** Whether one game's pick is final: locked in, under live rules that make it final. */
export const pickFinal = (rules, ballot, gameId) => sentFinal(rules) && lockedIn(ballot, gameId);

/** Whether every game of the market is final, so nothing on the ballot can change. False for an empty slate. */
export const ballotFinal = (rules, ballot, gameIds) => Array.isArray(gameIds) && gameIds.length > 0 && gameIds.every(id => pickFinal(rules, ballot, id));
