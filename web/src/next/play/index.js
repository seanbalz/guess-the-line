// Play (Guess the Line): this tab's slots (redesign build plan section 3.1).
// Home, the tab bar and the game sheet read other tabs only through these three exports, so each lane edits its own
// folder. Stage 10 starts every slot empty; the stage that fills one adds the test that proves it (section 10, "No
// slot left empty").
//
// - homeTiles: `[{ id, order, Tile }]`, components Home draws in `order` (a Tile reads the shared data itself).
// - counter: `(data) => null | { count, label } | { dot: true, label }`, the tab bar's counter or dot and the words
//   added to the tab's name ("Play, 1 ballot due"); null (or a count of 0) shows nothing.
// - sheetActions: `[{ id, order, label, show(game, data), run(game, shell) }]`, buttons on the game sheet's action bar.
import { lazy } from 'react';
import { perGameReady } from './scoring.js';
const ScoreHomeTile = lazy(() => import('./ScoreHomeTile.jsx').then(module => ({ default: module.ScoreHomeTile })));
export const homeTiles = Object.freeze([{ id: 'play.weekly-score', order: 10, Tile: ScoreHomeTile }]);

/**
 * Stage 11 (prototype spec 1.2): ballots still due this week, 0, 1 or 2, from the server's own `picksDue` on
 * `/community/read` (the old app's Picks tab counts the same field): the Spread and Total ballots neither submitted
 * nor sat out while the week is open ("due", or "urgent" inside two hours). Nothing before the week opens, after it
 * closes, or when the Community could not be read. `data` is the shared reads, `{ lobby, community }`.
 */
export function counter(data) {
  const due = data?.community?.picksDue;
  if (!due || !['due', 'urgent', 'late'].includes(due.state) || !Array.isArray(due.modes)) return null;
  const count = due.state === 'late' ? due.modes.filter(mode => Number.isInteger(mode.openGames) && mode.openGames > 0).length : due.modes.length;
  if (count < 1) return null;
  return { count, label: count === 1 ? '1 ballot due' : `${count} ballots due` };
}

// Navigation only: the destination retains its existing lock-in and draft protections.
export const sheetActions = Object.freeze(['spread', 'total'].map((market, order) => Object.freeze({
  id: `play.${market}`, order: 10 + order, label: market === 'spread' ? 'Spread' : 'Total',
  show: (game, data) => Boolean(data?.accountId && perGameReady(data?.personal?.rules)
    && data.personal.games?.some(row => row.id === game?.id)
    && Number.isInteger(game?.season) && Number.isInteger(game?.week)),
  run: (game, shell) => shell.go('play', { section: 'picks', market, season: game.season, week: game.week, pickGame: game.id }),
})));
