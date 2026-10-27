// Research Lines board: saved guesses stay as tags; current quotes come from the gated week reader.
import { useId, useMemo } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { LINES_COPY, linesBoard } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, CardButton, GateBanner, Icon, InfoButton, Pill, Tag, TeamMark } from '../ui/index.js';
import { useLinesData } from './linesData.js';
import { useWind } from './trendsHooks.js';
import { INFO } from '../info.js';
import { forfeitView } from '../play/forfeit.js';
import './lines.css';
import { useBoardLines } from './useGameLines.js';
import { boardGate, marketBoard } from './boardMarkets.js';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';

/** A lock while closed, current/latest quote when permitted, and an explicit missing/loading state. */
function MarketValue({ cell, className }) {
  if (!cell.open) return <span className={`gx-l-lock ${className ?? ''}`} data-cell="locked"><Icon icon="lock" size={16}/></span>;
  if (!cell.line) return <span className={`gx-vstack ${className ?? ''}`} data-cell="none"><span className="gx-n-m gx-c-3">—</span><span className="gx-t-meta">{cell.label}</span></span>;
  return (
    <span className={`gx-vstack ${className ?? ''}`} data-cell="line">
      <span className="gx-n-s">{cell.line}</span>
      <span className="gx-t-meta gx-c-2">{cell.label}</span>
    </span>
  );
}

function GameCard({ card, onOpen }) {
  const team = (side, row) => (
    <span className={row === 2 ? 'gx-l-team gx-l-team--2' : 'gx-l-team'}>
      <TeamMark code={side.code} name={side.name} size={32} decorative/>
      <span className="gx-t-strong gx-truncate">{side.nick}</span>
    </span>
  );
  return (
    <CardButton className="gx-l-card" aria-label={card.aria} data-game={card.id} onClick={onOpen}>
      {card.status ? <span className="gx-t-meta gx-l-chead">{card.status}</span> : null}
      {card.showTime ? <span className="gx-t-meta gx-l-chead">{card.time}</span> : null}
      <span className="gx-l-teams">
        {team(card.away, 1)}
        {team(card.home, 2)}
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
      {['spread', 'total'].map(market => card[market].open && card[market].source ? <span key={market} className="gx-l-observation gx-t-meta">{market === 'spread' ? 'Spread' : 'Total'} · {card[market].source} · Updated {card[market].observed}</span> : null)}
      {card.chip ? (
        <span className="gx-l-trend" data-chip={card.chip.kind}>
          {card.chip.kind === 'trend' ? <Icon icon="diamond" size={16} fill className="gx-c-data"/> : null}
          <span className="gx-t-label gx-c-2">{card.chip.tier ? `${card.chip.text} · ${card.chip.tier}` : card.chip.text}</span>
        </span>
      ) : null}
    </CardButton>
  );
}

function Group({ label, time, cards, onOpen }) {
  const id = useId();
  return (
    <section className="gx-l-group" aria-labelledby={id}>
      <div className="gx-l-ghead">
        <h2 className="gx-t-section" id={id}>{label}</h2>
        {time ? <span className="gx-t-meta">{time}</span> : null}
      </div>
      {cards.map(card => <GameCard key={card.id} card={card} onOpen={() => onOpen(card.id)}/>)}
    </section>
  );
}

const TRENDS_INTRO = 'Choose a matchup to see its available trends, sample sizes and sources. Hidden markets stay locked.';

export function LinesBoard({ trendsOnly = false }) {
  const shell = useShell();
  const lines = useLinesData();
  const { app, personal, community, trendsWeek, shown } = lines;
  const markets = useBoardLines(lines, !trendsOnly);
  const wind = useWind(shown?.season, shown?.week, Boolean(shown));
  const savedBoard = useMemo(() => (personal.data ? linesBoard({ personal: markets.status === 'ready' ? { ...personal.data, now: new Date(markets.now).toISOString() } : personal.data, community, trends: trendsWeek, wind: wind.wind, windNow: wind.now }) : null),
    [personal.data, community, trendsWeek, wind.wind, wind.now, markets.status, markets.now]);
  const board = savedBoard && !trendsOnly ? marketBoard(savedBoard, markets) : savedBoard;
  const revealScope = { accountId: app.accountId, season: shown?.season, week: shown?.week };
  const gate = boardGate(markets, forfeitView(community, revealScope)?.canConfirm === true);
  const enter = () => shell.go('play', { section: 'picks', market: gate.market, season: shown.season, week: shown.week });
  const open = gameId => shell.openSheet(trendsOnly ? 'sh.allTrends' : 'sh.game', { game: gameId });
  const head = (
    <div className="gx-vstack gx-gap-2">
      <div className="gx-l-sechead">
        <h1 className="gx-t-title gx-grow">{trendsOnly ? 'Trends' : LINES_COPY.title}</h1>
        <InfoButton title={INFO.trends.title} body={trendsOnly ? [TRENDS_INTRO, ...INFO.trends.body] : INFO.trends.body} links={INFO.trends.links}/>
      </div>
      {board?.meta ? <p className="gx-t-meta">{board.meta}</p> : null}
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
            <Button variant="ghost" onClick={shell.toOldApp}>{APP_SWITCH_COPY.useOld}</Button>
          </section>
        ) : (
          <p className="gx-t-body gx-c-2" role="status">{unpublished ? LINES_COPY.unpublished : LINES_COPY.loading}</p>
        )}
      </div>
    );
  }
  return (
    <div className="gx-screen">
      {head}
      <Button variant="secondary" onClick={() => shell.openSheet('sh.research')}>Open weekly research</Button>
      {!trendsOnly && <>
        {markets.status === 'loading' ? <p className="gx-t-body" role="status">Loading market lines…</p>
          : markets.status === 'error' ? <p className="gx-t-body" role="status">Market lines are unavailable. Your saved guesses are kept.</p> : null}
        <GateBanner gate={gate} onCta={enter} onSkip={() => shell.openDialog('dlg.forfeit', revealScope)} note="See picks now requires a final sit-out confirmation. Locked guesses count; drafts are kept."/>
        <Button variant="ghost" onClick={markets.reload}>{markets.status === 'error' ? 'Retry market lines' : 'Refresh market lines'}</Button>
      </>}
      {trendsOnly ? <><FocusRows label="Matchup trends">{[...board.groups.flatMap(group => group.cards), ...(board.started?.cards ?? [])].map(card => <FocusRow key={card.id} icon="chart" title={`${card.away.code} at ${card.home.code}`} sub={card.chip?.text ?? 'Open available trends'} onClick={() => open(card.id)}/>)}</FocusRows></> : <>
        {board.groups.map(group => <Group key={group.key} label={group.label} time={group.time} cards={group.cards} onOpen={open}/>)}
        {board.started ? <Group label={`${board.started.label} · ${board.started.count} ${board.started.count === 1 ? 'game' : 'games'}`} cards={board.started.cards} onOpen={open}/> : null}
      </>}
      {!board.groups.length && !board.started ? <p className="gx-empty gx-t-body">{LINES_COPY.unpublished}</p> : null}
    </div>
  );
}
