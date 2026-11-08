// D-69 step 3: Research › Games › one game, a nesting card under the Games lip with its own address
// (`#research/games?layer=game&item=SEA-DEN`), in place of the game sheet on Research's paths (spec 4.1). It holds what
// the sheet held, unchanged (lines-view gameSheet and GameDetails: the market lines with the movement chart, your pick,
// everyone's guesses, weather, the trends and the matchup statistics, the referee, your private note, the game's
// actions) and the sheet's paging (LayerPager: the same swipe, the same buttons, the same board-order snapshot). Paging
// swaps the game in place, so the Nest's layer stays "game" (no new entrance, no focus jump) and Back lands on the board.
// A team opens Research › Teams › that team. The game sheet stays for the League feed's kickoff rows (feed/PostCard.jsx).
import { useLayoutEffect, useMemo, useRef } from 'react';
import { LINES_COPY, gameSheet } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, LayerPager, Nest, Skeleton, useLayerFocus } from '../ui/index.js';
import { RESEARCH_NAMES, closeGame, gameName, layerTitle, openTeam, pageGame } from '../research/researchNav.js';
import { actionsForGame, GameActions } from './GameActions.jsx';
import { gamePager, openedBoardOrder, openedBoardResult } from './gameOrder.js';
import { GameDetailsSlot } from './GameDetailsSlot.jsx';
import { rememberedBoard } from './boardContext.js';
import { useLinesData } from './linesData.js';
import './lines.css';
import { hasNavigated } from '../moments/launch.js';

/** The pager names its neighbours as the board's rows do ("Next game, Texans @ Jaguars"). */
const ROW_NAMES = Object.freeze({ title: game => gameName(game.away, game.home) });

function Waiting({ personal, onRetry }) {
  if (personal.status === 'error' && personal.error?.status === 404) return <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.unpublished}</p>;
  if (personal.status === 'error') return <div className="gx-vstack gx-gap-8" role="alert"><p className="gx-t-body">{LINES_COPY.failed}</p>
    <Button variant="secondary" onClick={onRetry}>{LINES_COPY.tryAgain}</Button></div>;
  return <Skeleton label={LINES_COPY.loading} shape="panels" count={3}/>;
}

export function GameLayer({ id }) {
  const shell = useShell(), lines = useLinesData(), root = useRef(null);
  const { app, personal, community, trends, trendsWeek, records, shown } = lines;
  useLayerFocus(root);
  // The graphical board is taller than its detail's initial frame. Its opening scroll must not carry into the
  // new layer and leave navigation controls underneath the fixed header. Paging keeps its existing scroll;
  // the shell still restores the remembered board/game position on Back.
  useLayoutEffect(() => { if (hasNavigated()) window.scrollTo(0, 0); }, []);
  const view = useMemo(() => (personal.data ? gameSheet({ personal: personal.data, community, trends: trendsWeek, trendsStatus: trends.status, records, gameId: id }) : null),
    [personal.data, community, trendsWeek, trends.status, records, id]);
  // The board's order and finals as the row that opened this game saw them (boardContext.js). It is module memory, not
  // state, so it is read again only when the week, the account or the game changes; a reload or a shared link has none
  // (or another account's or week's, which gameOrder.js rejects) and the pager follows the week's own order. Other openers
  // (Trends' Game details) clear it with rememberBoard(null) before they navigate.
  const context = useMemo(() => rememberedBoard(), [personal.data, app.accountId, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = useMemo(() => openedBoardOrder(personal.data, app.accountId, context, ROW_NAMES), [personal.data, app.accountId, context]);
  const result = openedBoardResult(personal.data, app.accountId, context, id);
  // The row's own names ("Seahawks @ Broncos"), not the game sheet's codes: the heading says what the row said.
  const title = view ? gameName(view.away.code, view.home.code) : layerTitle(id);
  const place = view ? gamePager(order, view.id) : null;
  const pager = place ? { ...place, onMove: step => {
    const target = step < 0 ? place.prev : place.next;
    if (target && shell.confirmLeave()) pageGame(shell, target);
  } } : null;
  const actionGame = view ? { ...view, season: shown?.season, week: shown?.week } : null;
  const actions = actionGame ? actionsForGame(actionGame, { accountId: app.accountId, personal: personal.data }) : [];
  const lips = [{ key: 'games', label: RESEARCH_NAMES.games, onOpen: () => closeGame(shell) }];
  return <div ref={root} className="gx-screen" data-research="game" data-game-layer={id}>
    <h1 className="gx-t-title">{RESEARCH_NAMES.games}</h1>
    <Nest label={title} lips={lips} layer="game" title={title}>
      {!personal.data ? <Waiting personal={personal} onRetry={() => app.refresh({ only: ['personal'] })}/>
        : !view ? <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.notOnBoard}</p>
        : <LayerPager title={title} pager={pager} page={view.id}>
            <GameDetailsSlot lines={lines} view={view} result={result} onTeam={code => openTeam(shell, code)}/>
            {actions.length ? <GameActions game={actionGame} actions={actions} shell={shell}/> : null}
          </LayerPager>}
    </Nest>
  </div>;
}
