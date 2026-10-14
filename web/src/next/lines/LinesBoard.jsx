// The Lines tab, read-only (redesign build plan stage 13; prototype spec 3.4): every game of the week by kickoff group,
// your own picks as tags beside the market they belong to ("YOU −3" on the favored team's row, "YOU 41" on the Total
// row), a lock icon on every market still closed to you (never "—"), your own line at the guess once a market is open,
// and at most three trend lines on the whole board (one chip per card at most). No current line until the lines readers
// arrive ("Line now arrives in a later update."). Tapping a card opens its game sheet. Nothing here writes.
import { useId, useMemo } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { LINES_COPY, linesBoard } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, CardButton, Icon, Pill, Tag, TeamMark } from '../ui/index.js';
import { useLinesData } from './linesData.js';
import { Credits } from './parts.jsx';
import './lines.css';

/** A market's value on a card: a lock icon while closed, your line at the guess once open, else "—". */
function MarketValue({ cell, className }) {
  if (!cell.open) return <span className={`gx-l-lock ${className ?? ''}`} data-cell="locked"><Icon icon="lock" size={16}/></span>;
  if (!cell.line) return <span className={`gx-n-m gx-c-3 ${className ?? ''}`} data-cell="none">—</span>;
  return (
    <span className={`gx-vstack ${className ?? ''}`} data-cell="line">
      <span className="gx-n-s">{cell.line}</span>
      <span className="gx-t-micro gx-c-2">{LINES_COPY.atYourGuess}</span>
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
      {card.chip ? (
        <span className="gx-l-trend" data-chip={card.chip.kind}>
          <Icon icon="diamond" size={16} fill className="gx-c-data"/>
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

export function LinesBoard() {
  const shell = useShell();
  const { app, personal, community, trendsWeek } = useLinesData();
  const board = useMemo(() => (personal.data ? linesBoard({ personal: personal.data, community, trends: trendsWeek }) : null), [personal.data, community, trendsWeek]);
  const open = gameId => shell.openSheet('sh.game', { game: gameId });
  const head = (
    <div className="gx-vstack gx-gap-2">
      <h1 className="gx-t-title">{LINES_COPY.title}</h1>
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
      {board.groups.map(group => <Group key={group.key} label={group.label} time={group.time} cards={group.cards} onOpen={open}/>)}
      {board.started ? <Group label={`${board.started.label} · ${board.started.count} ${board.started.count === 1 ? 'game' : 'games'}`} cards={board.started.cards} onOpen={open}/> : null}
      {!board.groups.length && !board.started ? <p className="gx-empty gx-t-body">{LINES_COPY.unpublished}</p> : null}
      <Credits footer={board.footer}/>
    </div>
  );
}
