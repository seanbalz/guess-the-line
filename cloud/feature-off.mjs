// Off switches (redesign build plan, Gate M step 9). A migration that only adds functions has no rollback file
// (supabase/rollback/README.md); when its feature writes rows, or opens data a player could not read before, the release
// card names an off switch instead, and a switch never drops or deletes anything (D-23).
//
// The switch is the gtl-api secret GTL_FEATURE_OFF: a comma-separated list of the feature names below. A listed
// feature's writer refuses with GTL_FEATURE_OFF (503, "nothing you saved is lost"); its reads keep working and every
// stored row stays (M-03's forfeit: the writer refuses, /community/read keeps reporting the stored forfeit with open
// false, and every sit-out it wrote keeps counting). A listed reader that opens data (M-06's lines readers, M-08's everyone's picks) refuses with a 503
// too and reads nothing. Unknown names are ignored, never an error, so a typo cannot take gtl-api down. Setting or
// clearing the secret is a hosted change that needs Sean's OK; it changes no code and no database row.

/** Feature name → the writer or reader it stops. A stage that adds a switchable route adds its name here. */
export const FEATURES = Object.freeze({
  trends: 'POST /trends/week: authenticated public historical weekly trends',
  comparisons: 'POST /league/comparison: scoped score comparisons',
  preferences: 'POST /me/preferences/save: account settings writes',
  notes: 'POST /personal/note: private game notes (M-09, redesign stage 27)',
  lines: 'POST /lines/read and /lines/game: the gated lines readers (M-06, redesign stage 23)',
  research: 'POST /lines/research: descriptive historical research and reviewed-source reads',
  picks: 'POST /community/picks: everyone\'s Guess picks, game by game (M-08, redesign stage 26)',
  'lock-in': 'POST /personal/ballot with lockIn: the per-game lock-in on a draft (M-02, redesign stage 18); a whole-market send keeps working',
  forfeit: 'POST /community/forfeit: "Skip this week\'s Guess the Line" and "See picks now" (M-03, redesign stage 19)',
  recommendations: 'POST /bets/recommendations and /bets/recommendations/place: current-account recommendation reads and new Virtual Units picks',
  bets: 'POST /bets/read: account-level Virtual Units reads and other players’ gated saved terms (M-10, redesign stage 40)',
});

/** The set of known feature names the secret turns off (empty when it is unset or names nothing known). */
export function parseFeatureOff(value) {
  if (typeof value !== 'string') return new Set();
  return new Set(value.split(',').map(name => name.trim().toLowerCase()).filter(name => Object.hasOwn(FEATURES, name)));
}
