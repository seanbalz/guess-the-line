// Bets: this tab's slots (redesign build plan section 3.1).
// Home, the tab bar and the game sheet read other tabs only through these three exports, so each lane edits its own
// folder. Stage 10 starts every slot empty; the stage that fills one adds the test that proves it (section 10, "No
// slot left empty").
//
// - homeTiles: `[{ id, order, Tile }]`, components Home draws in `order` (a Tile reads the shared data itself).
// - counter: `(data) => null | { count, label } | { dot: true, label }`, the tab bar's counter or dot and the words
//   added to the tab's name ("Play, 1 ballot due"); null (or a count of 0) shows nothing.
// - sheetActions: `[{ id, order, label, show(game, data), run(game, shell) }]`, buttons on the game sheet's action bar.
// Bets' counter (challenge updates) and Home tile arrive with the Bets and challenge stages.
export const homeTiles = Object.freeze([]);
export const counter = null;
export const sheetActions = Object.freeze([]);
