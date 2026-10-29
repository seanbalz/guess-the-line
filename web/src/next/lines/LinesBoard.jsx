// Research Lines board: saved guesses stay as tags; current quotes come from the gated week reader. While the week
// loads, skeleton game cards stand in for the board; while the quotes load, a skeleton bar stands in each open market
// (the "Loading…" words stay for screen readers). D-62: each team's record (this weekend's finals, from the shared team
// read) sits beside its name in text-2 numbers; the row stays one button that opens the game sheet.
import { useId, useMemo, useRef } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { LINES_COPY, linesBoard } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, CardButton, GateBanner, Icon, InfoButton, Pill, Skeleton, Tag, TeamMark } from '../ui/index.js';
import { useLinesData } from './linesData.js';
import { useWind } from './trendsHooks.js';
import { INFO } from '../info.js';
import { forfeitView } from '../play/forfeit.js';
import './lines.css';
import { useBoardLines } from './useGameLines.js';
import { boardGate, boardQuotes, marketBoard } from './boardMarkets.js';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { matchupRecords } from '../teams/teamModel.js';
import { useTeamSeason } from '../teams/teamsData.js';

/** A lock while closed, current/latest quote when permitted, and an explicit missing/loading state. */
function MarketValue({ cell, className }) {
  if (!cell.open) return <span className={`gx-l-lock ${className ?? ''}`} data-cell="locked"><Icon icon="lock" size={16}/></span>;
  // Still loading: a skeleton bar where the line will be, never "—" (which means missing); the card's name says Loading.
  if (cell.loading) return <span className={`gx-vstack gx-l-wait ${className ?? ''}`} data-cell="loading" aria-hidden="true"><span className="gx-skel-bar gx-l-wait-bar"></span></span>;
  if (!cell.line) return <span className={`gx-vstack ${className ?? ''}`} data-cell="none"><span className="gx-n-m gx-c-3">—</span><span className="gx-t-meta">{cell.label}</span></span>;
  return (
    <span className={`gx-vstack ${className ?? ''}`} data-cell="line">
      <span className="gx-n-s">{cell.line}</span>
      <span className="gx-t-meta gx-c-2">{cell.label}</span>
    </span>
  );
}

/** The card's sentence with the records said after the matchup: "Seahawks at Broncos, Sun 1:05 PM PT. Records: Seahawks 4–2, Broncos 3–3. …". */
export function withRecords(aria, card, records) {
  const words = [['away', card.away], ['home', card.home]].filter(([key]) => records?.[key]).map(([key, side]) => `${side.nick} ${records[key]}`);
  if (!words.length) return aria;
  const at = aria.indexOf('. '), said = `Records: ${words.join(', ')}`;
  return at < 0 ? `${aria}. ${said}` : `${aria.slice(0, at)}. ${said}${aria.slice(at)}`;
}

function GameCard({ card, records, onOpen, focusScope }) {
  const team = (side, row, record) => (
    <span className={row === 2 ? 'gx-l-team gx-l-team--2' : 'gx-l-team'}>
      <TeamMark code={side.code} name={side.name} size={32} decorative/>
      <span className="gx-t-strong gx-truncate">{side.nick}</span>
      {record ? <span className="gx-l-rec">{record}</span> : null}
    </span>
  );
  return (
    <CardButton className="gx-l-card" aria-label={withRecords(card.aria, card, records)} data-game={card.id} data-focus-return={`${focusScope}:${card.id}`} onClick={onOpen}>
      {card.status ? <span className={`${card.final ? 'gx-t-strong' : 'gx-t-meta'} gx-l-chead`}>{card.status}</span> : null}
      {card.final ? <span className="gx-l-observation gx-t-meta gx-c-2">{card.final.provenance}</span> : null}
      {card.showTime ? <span className="gx-t-meta gx-l-chead">{card.final?.kickoff ?? card.time}</span> : null}
      <span className="gx-l-teams">
        {team(card.away, 1, records?.away)}
        {team(card.home, 2, records?.home)}
        {card.tags.away ? <Tag k={card.tags.away.k} className="gx-l-tag1">{card.tags.away.text}</Tag> : null}
        {card.tags.home ? <Tag k={card.tags.home.k} className="gx-l-tag2">{card.tags.home.text}</Tag> : null}
        <MarketValue cell={card.spread} className="gx-l-val"/>
      </span>
      <span className="gx-l-cfoot">
        <span className="gx-hstack gx-gap-8">
          <span className="gx-t-micro gx-c-2">Total</span>
          <MarketValue cell={card.total}/>
        </span>
        <span className="gx-hstack gx-gap-8">
          {card.late ? <Pill tone="pending">{card.late.text}</Pill> : null}
          {card.tags.total ? <Tag k={card.tags.total.k}>{card.tags.total.text}</Tag> : null}
        </span>
      </span>
      {card.chip ? (
        <span className="gx-l-trend" data-chip={card.chip.kind}>
          {card.chip.kind === 'trend' ? <Icon icon="diamond" size={16} fill className="gx-c-data"/> : null}
          <span className="gx-t-label gx-c-2">{card.chip.tier ? `${card.chip.text} · ${card.chip.tier}` : card.chip.text}</span>
        </span>
      ) : null}
    </CardButton>
  );
}

function Group({ label, time, cards, season, onOpen, focusScope }) {
  const id = useId();
  return (
    <section className="gx-l-group" aria-labelledby={id}>
      <div className="gx-l-ghead">
        <h2 className="gx-t-section" id={id}>{label}</h2>
        {time ? <span className="gx-t-meta">{time}</span> : null}
      </div>
      {cards.map(card => <GameCard key={card.id} focusScope={focusScope} card={card} records={matchupRecords(season.data, card.away.code, card.home.code, season.game)} onOpen={() => onOpen(card.id)}/>)}
    </section>
  );
}

const TRENDS_INTRO = 'Choose a matchup to see its available trends, sample sizes and sources. Hidden markets stay locked.';

export function LinesBoard({ trendsOnly = false }) {
  const shell = useShell();
  const lines = useLinesData();
  const { app, personal, community, trendsWeek, shown } = lines;
  const openerId = useId(), openerScope = useRef({ account: null, week: null, generation: 0 });
  const weekKey = shown ? `${shown.season}:${shown.week}` : null;
  // An opaque key survives refresh/reparenting, but never follows a different account or resolved week.
  if (openerScope.current.account !== app.accountId || (weekKey && openerScope.current.week !== weekKey)) {
    openerScope.current = { account: app.accountId, week: weekKey, generation: openerScope.current.generation + 1 };
  }
  const focusScope = `${openerId}:${openerScope.current.generation}`;
  const markets = useBoardLines(lines, !trendsOnly);
  const teams = useTeamSeason(), season = { data: teams.data, game: shown?.season ?? null };
  const wind = useWind(shown?.season, shown?.week, Boolean(shown));
  const savedBoard = useMemo(() => (personal.data ? linesBoard({ personal: markets.status === 'ready' ? { ...personal.data, now: new Date(markets.now).toISOString() } : personal.data, community, trends: trendsWeek, wind: wind.wind, windNow: wind.now }) : null),
    [personal.data, community, trendsWeek, wind.wind, wind.now, markets.status, markets.now]);
  const board = savedBoard && !trendsOnly ? marketBoard(savedBoard, markets) : savedBoard;
  const revealScope = { accountId: app.accountId, season: shown?.season, week: shown?.week };
  const gate = boardGate(markets, forfeitView(community, revealScope)?.canConfirm === true);
  const enter = () => shell.go('play', { section: 'picks', market: gate.market, season: shown.season, week: shown.week });
  const open = gameId => shell.openSheet(trendsOnly ? 'sh.allTrends' : 'sh.game', {
    game: gameId,
    ...(!trendsOnly && board && shown ? { boardOrder: { accountId: app.accountId, season: shown.season, week: shown.week,
      ids: [...board.groups.flatMap(group => group.cards), ...(board.started?.cards ?? []), ...(board.finals?.cards ?? [])].map(card => card.id),
      now: markets.status === 'ready' ? markets.now : null,
      results: Object.fromEntries((board.finals?.cards ?? []).map(card => [card.id, card.final.record])) } } : {}),
  });
  // D-66: the quotes' source and update time are said once, in the one meta line and the ⓘ, not under every card.
  const quotes = trendsOnly ? null : boardQuotes(board);
  const quotesMeta = !quotes ? null : quotes.updates ? `Quotes from ${quotes.updates} updates` : `Quotes updated ${quotes.observed}`;
  const quotesInfo = !quotes ? [] : [quotes.updates ? 'Market quotes come from more than one update. Each game’s sheet lists its source, books and times.'
    : `Market quotes: ${quotes.source}, updated ${quotes.observed}. Each game’s sheet lists its books and times.`];
  const meta = [board?.meta, quotesMeta].filter(Boolean).join(' · ');
  const head = (
    <div className="gx-vstack gx-gap-2">
      <div className="gx-l-sechead">
        <h1 className="gx-t-title gx-grow">{trendsOnly ? 'Trends' : LINES_COPY.title}</h1>
        <InfoButton title={INFO.trends.title} body={trendsOnly ? [TRENDS_INTRO, ...INFO.trends.body] : [...quotesInfo, ...INFO.trends.body]} links={INFO.trends.links}/>
      </div>
      {meta ? <p className="gx-t-meta" data-board-quotes={quotes ? (quotes.updates ? 'mixed' : 'one') : undefined}>{meta}</p> : null}
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
        ) : unpublished ? <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.unpublished}</p> : <Skeleton label={LINES_COPY.loading} shape="cards" count={3}/>}
      </div>
    );
  }
  return (
    <div className="gx-screen">
      {head}
      <Button variant="secondary" onClick={() => shell.openSheet('sh.research')}>Open weekly research</Button>
      {!trendsOnly && <>
        {markets.status === 'loading' ? <p className="gx-sr-only" role="status">Loading market lines and results…</p>
          : markets.status === 'error' ? <p className="gx-t-body" role="status">Market lines and results are unavailable. Your saved guesses are kept.</p> : null}
        <GateBanner gate={gate} onCta={enter} onSkip={() => shell.openDialog('dlg.forfeit', revealScope)} note="See picks now requires a final sit-out confirmation. Locked guesses count; drafts are kept."/>
        <Button variant="ghost" onClick={markets.reload}>{markets.status === 'error' ? 'Retry market lines' : 'Refresh market lines'}</Button>
      </>}
      {trendsOnly ? <><FocusRows label="Matchup trends">{[...board.groups.flatMap(group => group.cards), ...(board.started?.cards ?? []), ...(board.finals?.cards ?? [])].map(card => <FocusRow key={card.id} icon="chart" title={`${card.away.code} at ${card.home.code}`} sub={card.chip?.text ?? 'Open available trends'} onClick={() => open(card.id)}/>)}</FocusRows></> : <>
        {board.groups.map(group => <Group key={group.key} label={group.label} time={group.time} cards={group.cards} season={season} onOpen={open} focusScope={focusScope}/>)}
        {board.started ? <Group label={`${board.started.label} · ${board.started.count} ${board.started.count === 1 ? 'game' : 'games'}`} cards={board.started.cards} season={season} onOpen={open} focusScope={focusScope}/> : null}
        {board.finals ? <Group label={`${board.finals.label} · ${board.finals.count} ${board.finals.count === 1 ? 'game' : 'games'}`} cards={board.finals.cards} season={season} onOpen={open} focusScope={focusScope}/> : null}
      </>}
      {!board.groups.length && !board.started && !board.finals ? <p className="gx-empty gx-t-body">{LINES_COPY.unpublished}</p> : null}
    </div>
  );
}
