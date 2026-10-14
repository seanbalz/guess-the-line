// Play (Guess the Line): this tab's slots (redesign build plan section 3.1).
// Home, the tab bar and the game sheet read other tabs only through these three exports, so each lane edits its own
// folder. Stage 10 starts every slot empty; the stage that fills one adds the test that proves it (section 10, "No
// slot left empty").
//
// - homeTiles: `[{ id, order, Tile }]`, components Home draws in `order` (a Tile reads the shared data itself).
// - counter: `(data) => null | { count, label } | { dot: true, label }`, the tab bar's counter or dot and the words
//   added to the tab's name ("Play, 1 ballot due"); null (or a count of 0) shows nothing.
// - sheetActions: `[{ id, order, label, show(game, data), run(game, shell) }]`, buttons on the game sheet's action bar.
export const homeTiles = Object.freeze([]);

/**
 * Stage 11 (prototype spec 1.2): ballots still due this week, 0, 1 or 2, from the server's own `picksDue` on
 * `/community/read` (the old app's Picks tab counts the same field): the Spread and Total ballots neither submitted
 * nor sat out while the week is open ("due", or "urgent" inside two hours). Nothing before the week opens, after it
 * closes, or when the Community could not be read. `data` is the shared reads, `{ lobby, community }`.
 */
export function counter(data) {
  const due = data?.community?.picksDue;
  if (!due || (due.state !== 'due' && due.state !== 'urgent') || !Array.isArray(due.modes)) return null;
  const count = due.modes.length;
  if (count < 1) return null;
  return { count, label: count === 1 ? '1 ballot due' : `${count} ballots due` };
}

export const sheetActions = Object.freeze([]);
