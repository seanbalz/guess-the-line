// Research › Games (D-69 step 3): the board, and one game as its own layer over it. The board stays mounted under the
// layer (KeptParent), as it stayed under the game sheet: no second read of the week's lines on Back, its scroll kept,
// and the shell returns focus to the row that opened the game.
import { researchLayerOf } from '../shell/state.js';
import { useShell } from '../shell/context.js';
import { KeptParent } from '../ui/index.js';
import { GameLayer } from './GameLayer.jsx';
import { LinesBoard } from './LinesBoard.jsx';

export function GamesScreen() {
  const open = researchLayerOf('games', useShell().state.views.lines);
  return <KeptParent layer={open ? <GameLayer id={open.item}/> : null}><LinesBoard/></KeptParent>;
}
