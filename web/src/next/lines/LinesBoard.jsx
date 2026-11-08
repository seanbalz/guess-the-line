// Approved Prism Games: day-filtered cards with sourced records, form and zero-based PPG bars. Current quotes
// still come from the gated week reader; unavailable/loading/locked quotes remain distinct. Inline comparison
// loads on demand and Research keeps its stable opener ID, board order, result provenance and native controller.
import { useId, useMemo, useState } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { LINES_COPY, linesBoard } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, Card, DESTINATION_ICONS, GateBanner, Icon, IconButton, InfoButton, MetaLine, Skeleton, TeamMark, useEntrance } from '../ui/index.js';
import { SEP } from '../format.js';
import { useLinesData } from './linesData.js';
import { useWind } from './trendsHooks.js';
import { INFO } from '../info.js';
import { forfeitView } from '../play/forfeit.js';
import './lines.css';
import { useBoardLines } from './useGameLines.js';
import { boardGate, boardQuotes, marketBoard, quoteTime } from './boardMarkets.js';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { matchupRecords, teamOf, lastFive, pointsPerGame, throughText } from '../teams/teamModel.js';
import { TeamForm } from '../teams/TeamForm.jsx';
import { MatchupTeamPerformanceSlot } from '../research/MatchupTeamPerformanceSlot.jsx';
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

function GameRow({ card, records, season, scale, lines, onOpen }) {
  const row = boardRow(card, records);
  const [expanded, setExpanded] = useState(false), detailId = useId();
  const sides = [card.away, card.home].map((side, index) => {
    const team = teamOf(season, side.code);
    return { ...side, team, record: records?.[index ? 'home' : 'away'], ppg: pointsPerGame(team) };
  });
  return <Card className="gx-game-card" data-game-card={card.id} data-expanded={expanded || undefined}>
    <div className="gx-game-time gx-t-meta"><span>{card.time}</span><span>{card.final ? 'Final' : card.started ? 'Kickoff passed' : 'Scheduled'}</span></div>
    <div className="gx-game-matchup">
      {sides.map((side, index) => <div className="gx-game-team" key={side.code}>
        {index ? <span className="gx-game-at gx-t-meta" aria-hidden="true">at</span> : null}
        <TeamMark code={side.code} name={side.name} size={48} decorative/>
        <strong className="gx-t-strong">{side.name}</strong><span className="gx-t-body">{side.record ?? '—'}</span>
        <TeamForm items={lastFive(side.team)} name={side.name}/>
      </div>)}
    </div>
    {card.final?.score ? <p className="gx-n-m">{card.final.score}</p> : null}
    {card.final ? <p className="gx-t-meta gx-c-2">{card.final.provenance}<br/>{card.final.kickoff}</p> : null}
    <div className="gx-game-scoring"><p className="gx-t-meta gx-c-2">Points scored / game</p>
      {sides.map(side => <div className="gx-game-bar" key={side.code}><span className="gx-t-meta">{side.code}</span><span className="gx-game-track" aria-hidden="true"><span style={{ width: side.ppg ? `${100 * Number(side.ppg.scored) / scale}%` : '0%' }}/></span><strong className="gx-t-body">{side.ppg?.scored ?? '—'}</strong></div>)}
    </div>
    <div className="gx-game-quote gx-t-meta"><span>Spread</span><RowValue value={row.value}/><span>{row.word}</span></div>
    <div className="gx-game-actions"><Button variant="secondary" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded(value => !value)}>{expanded ? 'Close stats' : 'Compare stats'}<Icon icon={expanded ? 'minus' : 'plus'} size={16}/></Button>
      <Button variant="secondary" id={gameRowId(card.id)} data-game={card.id} aria-label={row.ariaLabel} onClick={onOpen}>Research<Icon icon="chevronRight" size={16}/></Button></div>
    <div id={detailId} hidden={!expanded} className="gx-game-comparison">{expanded ? <MatchupTeamPerformanceSlot lines={lines} gameId={card.id} sides={sides} season={season}/> : null}</div>
  </Card>;
}

/** One kickoff group: its heading and its rows. Only the board's first list rises in (the first six units). */
function Group({ label, time, cards, season, scale, lines, onOpen, enter }) {
  const id = useId();
  return (
    <section className="gx-l-group" aria-labelledby={id}>
      <div className="gx-l-ghead">
        <h2 className="gx-t-section" id={id}>{label}</h2>
        {time ? <span className="gx-t-meta">{time}</span> : null}
      </div>
      <ol className="gx-game-cards gx-stagger" data-enter={enter} aria-labelledby={id}>
        {cards.map(card => <li key={card.id}><GameRow card={card} lines={lines} season={season.data?.season === season.game ? season.data : null} scale={scale} records={matchupRecords(season.data, card.away.code, card.home.code, season.game)} onOpen={() => onOpen(card.id)}/></li>)}
      </ol>
    </section>
  );
}

export function LinesBoard() {
  const shell = useShell();
  const lines = useLinesData();
  const { app, personal, community, trendsWeek, shown } = lines;
  const enter = useEntrance();
  const [day, setDay] = useState('All');
  const markets = useBoardLines(lines, true);
  const teams = useTeamSeason(), season = { data: teams.data, game: shown?.season ?? null };
  const wind = useWind(shown?.season, shown?.week, Boolean(shown));
  const savedBoard = useMemo(() => (personal.data ? linesBoard({ personal: markets.status === 'ready' ? { ...personal.data, now: new Date(markets.now).toISOString() } : personal.data, community, trends: trendsWeek, wind: wind.wind, windNow: wind.now }) : null),
    [personal.data, community, trendsWeek, wind.wind, wind.now, markets.status, markets.now]);
  const board = savedBoard ? marketBoard(savedBoard, markets) : null;
  const groups = board ? [...board.groups, ...(board.started ? [board.started] : []), ...(board.finals ? [board.finals] : [])] : [];
  const dayOf = card => {
    const game = personal.data?.games?.find(game => game.id === card.id), instant = Date.parse(game?.kickoff);
    return Number.isFinite(instant) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(instant) : 'Time unavailable';
  };
  const cards = groups.flatMap(group => group.cards), days = ['All', ...new Set(cards.map(dayOf))];
  const selectedDay = days.includes(day) ? day : 'All';
  const visibleGroups = groups.map(group => ({ ...group, cards: group.cards.filter(card => selectedDay === 'All' || dayOf(card) === selectedDay) })).filter(group => group.cards.length);
  const scale = Math.max(5, Math.ceil(Math.max(0, ...Object.values(teams.data?.season === shown?.season ? teams.data?.teams ?? {} : {}).map(team => Number(pointsPerGame(team)?.scored) || 0)) / 5) * 5);
  const revealScope = { accountId: app.accountId, season: shown?.season, week: shown?.week };
  const gate = boardGate(markets, forfeitView(community, revealScope)?.canConfirm === true);
  const enterPlay = () => shell.go('play', { section: 'picks', market: gate.market, season: shown.season, week: shown.week });
  // The board's order and its recorded finals, as shown now, travel with the opening (in memory, for the pager).
  const open = gameId => {
    if (board && shown) rememberBoard({ accountId: app.accountId, season: shown.season, week: shown.week,
      ids: visibleGroups.flatMap(group => group.cards.map(card => card.id)),
      now: markets.status === 'ready' ? markets.now : null,
      results: Object.fromEntries((board.finals?.cards ?? []).map(card => [card.id, card.final.record])) });
    openGame(shell, gameId);
  };
  // D-66: the quotes' source and update time are said once, in the one meta line and the ⓘ, not under every card.
  // Quick wins A5 and A20: one meta line ("Week 6 · Due Wed 11:59 PM PT · Quotes 6:26 PM PT") that wraps only between
  // its parts; the full date, year and source stay behind the title's ⓘ.
  const quotes = boardQuotes(board);
  const quotesMeta = !quotes ? null : quotes.updates ? `Quotes from ${quotes.updates} updates` : `Quotes ${quoteTime(quotes.observedAt, markets.now)}`;
  const quotesInfo = !quotes ? [] : [quotes.updates ? 'Market quotes come from more than one update. Each game lists its source, books and times.'
    : `Market quotes: ${quotes.source}, updated ${quotes.observed}. Each game lists its books and times.`];
  const teamInfo = ['Team records, last-five results and points per game count recorded finals only.', throughText(teams.data), teams.data?.source?.credit,
    teams.data?.fallback ? 'Bundled records are shown while detailed team statistics are unavailable.' : teams.data?.stale ? 'The team source may be behind the latest finals.' : null].filter(Boolean);
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
        <InfoButton title={INFO.trends.title} body={[...quotesInfo, ...teamInfo, ...INFO.trends.body]} links={INFO.trends.links}/>
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
        ) : unpublished ? <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.unpublished}</p> : <Skeleton label={LINES_COPY.loading} shape="cards" count={4} className="gx-l-skel"/>}
      </div>
    );
  }
  return (
    <div className="gx-screen gx-games-board">
      {head}
      {markets.status === 'loading' ? <p className="gx-sr-only" role="status">Loading market lines and results…</p>
        : markets.status === 'error' ? <p className="gx-t-body" role="status">Market lines and results are unavailable. Your saved guesses are kept.</p> : null}
      {/* A5: no fine print here; the forfeit dialog behind See picks now already says it is final and what is kept. */}
      <GateBanner gate={gate} onCta={enterPlay} onSkip={() => shell.openDialog('dlg.forfeit', revealScope)}/>
      <div className="gx-game-days" role="group" aria-label="Game day">{days.map(label => <Button key={label} variant="secondary" aria-pressed={selectedDay === label} onClick={() => setDay(label)}>{label}<span>{cards.filter(card => label === 'All' || dayOf(card) === label).length}</span></Button>)}</div>
      <p className="gx-t-meta gx-c-2" role="status">{visibleGroups.reduce((sum, group) => sum + group.cards.length, 0)} games shown{teams.data?.season === shown?.season && throughText(teams.data) ? ` · Records ${throughText(teams.data).toLowerCase()}` : ''}</p>
      {visibleGroups.map((group, i) => <Group key={group.key ?? group.label} label={group.key ? group.label : `${group.label} · ${group.cards.length} ${group.cards.length === 1 ? 'game' : 'games'}`} time={group.time} cards={group.cards} season={season} scale={scale} lines={lines} onOpen={open} enter={i === 0 ? enter : undefined}/>)}
      <p className="gx-t-meta gx-c-2">{scale > 5 ? `Scoring bars share a 0–${scale} points/game scale.` : 'Scoring bars use a shared zero-based scale.'} Missing statistics stay —.</p>
      {/* A5: the weekly research is a row after the last game, so the first game comes first. */}
      <FocusRows label="More research">
        <FocusRow icon={DESTINATION_ICONS.weeklyResearch} title="Weekly research" sub="This week’s shortlist and situations" aria-label="Open weekly research" onClick={() => shell.openSheet('sh.research')}/>
      </FocusRows>
      {!board.groups.length && !board.started && !board.finals ? <p className="gx-empty gx-t-body">{LINES_COPY.unpublished}</p> : null}
    </div>
  );
}
