import { Button } from '../ui/index.js';
import { SLOTS } from '../shell/tabs.js';

/** Slots own their destinations; the sheet only supplies its explicit game and week. */
export const actionsForGame = (game, data) => Object.values(SLOTS).flatMap(slot => slot.sheetActions)
    .filter(action => action.show(game, data)).sort((a, b) => a.order - b.order);

export function GameActions({ game, actions, shell }) {
  return <nav className="gx-l-actions" aria-label="Actions for this game">
    {actions.map(action => <Button key={action.id} aria-label={`Open ${action.label} for ${game.away.code} at ${game.home.code}`}
      onClick={() => action.run(game, shell)}>{action.label}</Button>)}
  </nav>;
}
