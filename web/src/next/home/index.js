// Home: this tab's slots (redesign build plan section 3.1).
// The tab bar and the game sheet read other tabs only through these three exports, so each lane edits its own folder.
// Stage 10 starts every slot empty; the stage that fills one adds the test that proves it (section 10, "No slot left
// empty").
//
// - homeTiles: `[{ id, order, Tile }]`, components a tab offers Home in `order` (a Tile reads the shared data itself).
// - counter: `(data) => null | { count, label } | { dot: true, label }`, the tab bar's counter or dot and the words
//   added to the tab's name ("Play, 1 ballot due"); null (or a count of 0) shows nothing.
// - sheetActions: `[{ id, order, label, show(game, data), run(game, shell) }]`, buttons on the game sheet's action bar.
// D-69 step 2 (H1A): Home.jsx draws everything on Home itself (the next-move card, the six tiles and This week) and no
// longer draws the other tabs' homeTiles (flagged for cleanup: Play's ScoreHomeTile slot is now read only by tests).
// Home's own slots stay empty, and it never has a counter (prototype spec 1.2).
export const homeTiles = Object.freeze([]);
export const counter = null;
export const sheetActions = Object.freeze([]);
