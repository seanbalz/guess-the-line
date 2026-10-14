// Off switches (redesign build plan, Gate M step 9). A migration that only adds functions has no rollback file
// (supabase/rollback/README.md); when its feature writes rows, or opens a new reader, the release card names an off
// switch instead, and a switch never drops or deletes anything (D-23).
//
// The switch is the gtl-api secret GTL_FEATURE_OFF: a comma-separated list of the feature names below. A listed
// feature's writer refuses with GTL_FEATURE_OFF (503, "nothing you saved is lost"); its reads keep working and every
// stored row stays. A listed new reader refuses the same way (503), and every older route keeps answering. Unknown names
// are ignored, never an error, so a typo cannot take gtl-api down. Setting or clearing the secret is a hosted change that
// needs Sean's OK; it changes no code and no database row.

/** Feature name → the route it stops. A stage that adds a switchable writer or reader adds its name here. */
export const FEATURES = Object.freeze({
  notes: 'POST /personal/note: private game notes (M-09, redesign stage 27)',
  picks: 'POST /community/picks: everyone\'s Guess picks, game by game (M-08, redesign stage 26)',
});

/** The set of known feature names the secret turns off (empty when it is unset or names nothing known). */
export function parseFeatureOff(value) {
  if (typeof value !== 'string') return new Set();
  return new Set(value.split(',').map(name => name.trim().toLowerCase()).filter(name => Object.hasOwn(FEATURES, name)));
}
