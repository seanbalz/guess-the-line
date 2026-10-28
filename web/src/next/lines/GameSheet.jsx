// Keep the scoped title, board-order pager and action slots available while game details download.
// Detail-only readers mount inside GameDetails after that code and its styles are ready. Closing or
// paging retains the existing confirmation and focus-return behavior, including private-note guards.
import { useMemo } from 'react';
import { LINES_COPY, gameSheet } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Sheet, Skeleton } from '../ui/index.js';
import { useLinesData } from './linesData.js';
import { actionsForGame, GameActions } from './GameActions.jsx';
import { openedBoardOrder, openedBoardResult, gamePager } from './gameOrder.js';
import { GameDetailsSlot } from './GameDetailsSlot.jsx';
import './lines.css';

export function GameSheet({ args }) {
  const shell = useShell();
  const lines = useLinesData();
  const { app, personal, community, trends, trendsWeek, records, shown } = lines;
  const close = () => { if (shell.confirmLeave()) shell.closeSheet(); };
  const view = useMemo(() => (personal.data ? gameSheet({ personal: personal.data, community, trends: trendsWeek, trendsStatus: trends.status, records, gameId: args.game }) : null),
    [personal.data, community, trendsWeek, trends.status, records, args.game]);
  const order = useMemo(() => openedBoardOrder(personal.data, app.accountId, args.boardOrder), [personal.data, app.accountId, args.boardOrder]);
  const result = openedBoardResult(personal.data, app.accountId, args.boardOrder, args.game);
  if (!view) {
    return <Sheet title={LINES_COPY.title} onClose={close} className="gx-l-sheet">
      {!personal.data ? <Skeleton label={LINES_COPY.loading} shape="panels" count={3}/> : <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.notOnBoard}</p>}
    </Sheet>;
  }
  const place = gamePager(order, view.id);
  const pager = place ? { ...place, onMove: step => {
    const target = step < 0 ? place.prev : place.next;
    if (target && shell.confirmLeave()) shell.setSheetArgs({ game: target });
  } } : null;
  const actionGame = { ...view, season: shown?.season, week: shown?.week };
  const actions = actionsForGame(actionGame, { accountId: app.accountId, personal: personal.data });
  return <Sheet title={view.title} onClose={close} tall className="gx-l-sheet" pager={pager}
    footer={actions.length > 0 && <GameActions game={actionGame} actions={actions} shell={shell}/>}>
    <GameDetailsSlot lines={lines} view={view} result={result}/>
  </Sheet>;
}
