// Research Games board: current quotes come from the gated week reader. While the week loads, skeleton rows stand in
// for the board; while the quotes load, a skeleton bar stands in each open market (the "Loading…" words stay for screen
// readers). D-62: each team's record (this weekend's finals, from the shared team read) is the row's meta line.
// D-69 step 3: each game is a picture row (marks, matchup, records, the consensus Spread over its word) that opens the
// game's layer; the row's spoken name keeps what the card said.
import { useId, useMemo } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { LINES_COPY, linesBoard } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, DESTINATION_ICONS, GateBanner, Icon, IconButton, InfoButton, MetaLine, PictureRow, Skeleton, TeamMark, useEntrance } from '../ui/index.js';
import { SEP } from '../format.js';
import { useLinesData } from './linesData.js';
import { useWind } from './trendsHooks.js';
import { INFO } from '../info.js';
import { forfeitView } from '../play/forfeit.js';
import './lines.css';
import { useBoardLines } from './useGameLines.js';
import { boardGate, boardQuotes, marketBoard, quoteTime } from './boardMarkets.js';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { matchupRecords } from '../teams/teamModel.js';
import { useTeamSeason } from '../teams/teamsData.js';
import { boardRow } from './boardRows.js';
import { rememberBoard } from './boardContext.js';
import { RESEARCH_NAMES, gameRowId, openGame } from '../research/researchNav.js';

/** A spread row's right side: a lock while closed (never "—"), a skeleton bar while quotes load, else the quote or "—". */
function RowValue({ value }) {
  if (value.lock) return <span className="gx-l-lock" data-cell="locked"><Icon icon="lock" size={16}/></span>;
  if (value.loading) return <span className="gx-l-wait" data-cell="loading" aria-hidden="true"><span className="gx-skel-bar gx-l-wait-bar"></span></span>;
  return <span data-cell={value.line ? 'line' : 'none'}>{value.text}</span>;
}

function GameRow({ card, records, onOpen }) {
  const row = boardRow(card, records);
  return <PictureRow id={gameRowId(card.id)} data-game={card.id} ariaLabel={row.ariaLabel} onClick={onOpen}
    picture={<><TeamMark code={card.away.code} name={card.away.name} size={24} decorative/><TeamMark code={card.home.code} name={card.home.name} size={24} decorative/></>}
    title={row.title} meta={row.meta.length ? <MetaLine as="span" className="" parts={row.meta}/> : null}
    value={<RowValue value={row.value}/>} word={row.word} tone={row.tone}/>;
}

/** One kickoff group: its heading and its rows. Only the board's first list rises in (the first six units). */
function Group({ label, time, cards, season, onOpen, enter }) {
  const id = useId();
  return (
    <section className="gx-l-group" aria-labelledby={id}>
      <div className="gx-l-ghead">
        <h2 className="gx-t-section" id={id}>{label}</h2>
        {time ? <span className="gx-t-meta">{time}</span> : null}
      </div>
      <ol className="gx-prows gx-stagger" data-enter={enter} aria-labelledby={id}>
        {cards.map(card => <li key={card.id}><GameRow card={card} records={matchupRecords(season.data, card.away.code, card.home.code, season.game)} onOpen={() => onOpen(card.id)}/></li>)}
      </ol>
    </section>
  );
}

export function LinesBoard() {
  const shell = useShell();
  const lines = useLinesData();
  const { app, personal, community, trendsWeek, shown } = lines;
  const enter = useEntrance();
  const markets = useBoardLines(lines, true);
  const teams = useTeamSeason(), season = { data: teams.data, game: shown?.season ?? null };
  const wind = useWind(shown?.season, shown?.week, Boolean(shown));
  const savedBoard = useMemo(() => (personal.data ? linesBoard({ personal: markets.status === 'ready' ? { ...personal.data, now: new Date(markets.now).toISOString() } : personal.data, community, trends: trendsWeek, wind: wind.wind, windNow: wind.now }) : null),
    [personal.data, community, trendsWeek, wind.wind, wind.now, markets.status, markets.now]);
  const board = savedBoard ? marketBoard(savedBoard, markets) : null;
  const revealScope = { accountId: app.accountId, season: shown?.season, week: shown?.week };
  const gate = boardGate(markets, forfeitView(community, revealScope)?.canConfirm === true);
  const enterPlay = () => shell.go('play', { section: 'picks', market: gate.market, season: shown.season, week: shown.week });
  // The board's order and its recorded finals, as shown now, travel with the opening (in memory, for the pager).
  const open = gameId => {
    if (board && shown) rememberBoard({ accountId: app.accountId, season: shown.season, week: shown.week,
      ids: [...board.groups.flatMap(group => group.cards), ...(board.started?.cards ?? []), ...(board.finals?.cards ?? [])].map(card => card.id),
      now: markets.status === 'ready' ? markets.now : null,
      results: Object.fromEntries((board.finals?.cards ?? []).map(card => [card.id, card.final.record])) });
    openGame(shell, gameId);
  };
  // D-66: the quotes' source and update time are said once, in the one meta line and the ⓘ, not under every card.
  // Quick wins A5 and A20: one meta line ("Week 6 · Due Wed 11:59 PM PT · Quotes 6:26 PM PT") that wraps only between
  // its parts; the full date, year and source stay behind the title's ⓘ.
  const quotes = boardQuotes(board);
  const quotesMeta = !quotes ? null : quotes.updates ? `Quotes from ${quotes.updates} updates` : `Quotes ${quoteTime(quotes.observedAt, markets.now)}`;
  const quotesInfo = !quotes ? [] : [quotes.updates ? 'Market quotes come from more than one update. Each game’s sheet lists its source, books and times.'
    : `Market quotes: ${quotes.source}, updated ${quotes.observed}. Each game’s sheet lists its books and times.`];
  // The shared board joins its week name and deadline with the app's separator; each becomes its own part.
  const meta = [...(board?.meta ? board.meta.split(SEP) : []), quotesMeta];
  // A5: the refresh is an icon beside the ⓘ. It keeps its name, says Retry after a failure and is busy while quotes load.
  const refresh = board ? <IconButton icon="refresh" label={markets.status === 'error' ? 'Retry market lines' : 'Refresh market lines'}
    aria-busy={markets.status === 'loading' || undefined} onClick={markets.reload}/> : null;
  const head = (
    <div className="gx-vstack gx-gap-2">
      <div className="gx-l-sechead">
        <h1 className="gx-t-title gx-grow">{RESEARCH_NAMES.games}</h1>
        {refresh}
        <InfoButton title={INFO.trends.title} body={[...quotesInfo, ...INFO.trends.body]} links={INFO.trends.links}/>
      </div>
      <MetaLine parts={meta} data-board-quotes={quotes ? (quotes.updates ? 'mixed' : 'one') : undefined}/>
    </div>
  );
  if (!board) {
    const unpublished = personal.error?.status === 404;
    const failed = personal.status === 'error' && !unpublished;
    return (
      <div className="gx-screen">
        {head}
        {failed ? (
          <section className="gx-empty" role="alert" aria-label={LINES_COPY.failed}>
            <p className="gx-t-strong">{LINES_COPY.failed}</p>
            <p className="gx-t-body gx-c-2">{LINES_COPY.failedHelp}</p>
            <Button variant="secondary" block onClick={() => app.refresh({ only: ['personal'] })}>{LINES_COPY.tryAgain}</Button>
            <Button variant="ghost" onClick={shell.reload}>{APP_RELOAD_COPY.reload}</Button>
          </section>
        ) : unpublished ? <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.unpublished}</p> : <Skeleton label={LINES_COPY.loading} shape="rows" count={4} className="gx-l-skel"/>}
      </div>
    );
  }
  return (
    <div className="gx-screen">
      {head}
      {markets.status === 'loading' ? <p className="gx-sr-only" role="status">Loading market lines and results…</p>
        : markets.status === 'error' ? <p className="gx-t-body" role="status">Market lines and results are unavailable. Your saved guesses are kept.</p> : null}
      {/* A5: no fine print here; the forfeit dialog behind See picks now already says it is final and what is kept. */}
      <GateBanner gate={gate} onCta={enterPlay} onSkip={() => shell.openDialog('dlg.forfeit', revealScope)}/>
      {board.groups.map((group, i) => <Group key={group.key} label={group.label} time={group.time} cards={group.cards} season={season} onOpen={open} enter={i === 0 ? enter : undefined}/>)}
      {board.started ? <Group label={`${board.started.label} · ${board.started.count} ${board.started.count === 1 ? 'game' : 'games'}`} cards={board.started.cards} season={season} onOpen={open} enter={board.groups.length ? undefined : enter}/> : null}
      {board.finals ? <Group label={`${board.finals.label} · ${board.finals.count} ${board.finals.count === 1 ? 'game' : 'games'}`} cards={board.finals.cards} season={season} onOpen={open}/> : null}
      {/* A5: the weekly research is a row after the last game, so the first game comes first. */}
      <FocusRows label="More research">
        <FocusRow icon={DESTINATION_ICONS.weeklyResearch} title="Weekly research" sub="This week’s shortlist and situations" aria-label="Open weekly research" onClick={() => shell.openSheet('sh.research')}/>
      </FocusRows>
      {!board.groups.length && !board.started && !board.finals ? <p className="gx-empty gx-t-body">{LINES_COPY.unpublished}</p> : null}
    </div>
  );
}
