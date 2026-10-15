// Home: this tab's slots (redesign build plan section 3.1).
// Home, the tab bar and the game sheet read other tabs only through these three exports, so each lane edits its own
// folder. Stage 10 starts every slot empty; the stage that fills one adds the test that proves it (section 10, "No
// slot left empty").
//
// - homeTiles: `[{ id, order, Tile }]`, components Home draws in `order` (a Tile reads the shared data itself).
// - counter: `(data) => null | { count, label } | { dot: true, label }`, the tab bar's counter or dot and the words
//   added to the tab's name ("Play, 1 ballot due"); null (or a count of 0) shows nothing.
// - sheetActions: `[{ id, order, label, show(game, data), run(game, shell) }]`, buttons on the game sheet's action bar.
// Home draws the hero and reads the other tabs' homeTiles; it never has a counter (prototype spec 1.2).
// Stage 12 (Home.jsx) draws the hero (the countdown, the status lines, one action), who's in and the Spread and Total
// rank tiles itself, then the other tabs' tiles in `order`; its own homeTiles stays empty, since Home is the one tab
// that never contributes a tile to Home.
export const homeTiles = Object.freeze([]);
export const counter = null;
export const sheetActions = Object.freeze([]);
