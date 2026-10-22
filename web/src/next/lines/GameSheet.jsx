// `sh.game`, one game read-only (redesign build plan stage 13; prototype spec 3.5; DASH-7). The header with the
// kickoff and the team records in words (DP-16), "You on this game", the top three trends for this game in plain
// words (each with its record and sample size, strongest first, a line trend locked with its market), then the
// weather row on every game (D-45: the kickoff forecast, "Indoors" or "No current forecast"), the referee row (hidden
// until a referee is known, a 404 included) and "All trends", which opens its own sheet over this one. The current line
// arrives with stage 33 ("Line now arrives in a later update.").
//
// The kickoff wind forecast (`/wind/read`, D-34) comes through the old app's loaders and their 5-minute cache, so the
// sheet reuses the board's read; while open it re-reads at the D-47 due points, as the board and the old trends panel
// do. The referee assignments (`/officials/read`) are read once this sheet opens. Stage 35 adds the owner's private game note.
import { useId, useMemo } from 'react';
import { LINES_COPY, gameSheet, refereeRow, sheetWeatherRow } from '../../../../shared/lines-view.mjs';
import { WIND_CARD, refereeRows, shortCard } from '../../../../shared/trends-view.mjs';
import { useOfficials, useWind } from './trendsHooks.js';
import { useShell } from '../shell/context.js';
import { Card, Icon, InfoButton, List, Pill, Row, Sheet } from '../ui/index.js';
import { useLinesData } from './linesData.js';
import { Expander, TrendList, TrendAvailability, WeatherDetail } from './parts.jsx';
import { INFO } from '../info.js';
import { GameNote } from './GameNote.jsx';
import { MatchupResearch } from '../research/ResearchSheet.jsx';
import './lines.css';

function YouRows({ rows }) {
  return (
    <Card variant="flush">
      <List label={LINES_COPY.youOnGame}>
        {rows.map(row => (
          <Row
            key={row.market}
            title={row.main}
            start={<span className="gx-t-micro gx-c-2 gx-l-ylab">{row.label}</span>}
            end={row.late ? <Pill tone="pending">{row.late}</Pill> : null}
          >
            {row.sub ? (
              <span className="gx-row-sub gx-l-ysub">
                {row.locked ? <Icon icon="lock" size={12}/> : null}
                <span>{row.sub}</span>
              </span>
            ) : null}
          </Row>
        ))}
      </List>
    </Card>
  );
}

function Missing({ text }) {
  return <p className="gx-t-body gx-c-2" role="status">{text}</p>;
}

export function GameSheet({ args }) {
  const shell = useShell();
  const youId = useId(), trendsId = useId();
  const lines = useLinesData();
  const { app, personal, community, trends, trendsWeek, records, shown } = lines;
  const close = () => { if (shell.confirmLeave()) shell.closeSheet(); };
  const view = useMemo(() => (personal.data ? gameSheet({ personal: personal.data, community, trends: trendsWeek, trendsStatus: trends.status, records, gameId: args.game }) : null),
    [personal.data, community, trendsWeek, trends.status, records, args.game]);
  const officials = useOfficials(shown?.season, shown?.week, Boolean(view));
  const wind = useWind(shown?.season, shown?.week, Boolean(view));
  if (!view) {
    return (
      <Sheet title={LINES_COPY.title} onClose={close} className="gx-l-sheet">
        <Missing text={personal.data ? LINES_COPY.notOnBoard : LINES_COPY.loading}/>
      </Sheet>
    );
  }
  const sameWeek = wind.wind?.season === shown?.season && wind.wind?.week === shown?.week;
  const weather = sheetWeatherRow({ game: view, trendsGame: view.trendsGame, entry: sameWeek ? wind.wind?.games?.[view.id] ?? null : null, now: wind.now, loading: wind.loading,
    season: shown?.season, week: shown?.week, windCard: trendsWeek?.cards?.[WIND_CARD] ?? null });
  const referee = view.trendsGame ? refereeRow(trendsWeek, view.id, officials) : null;
  const refereeCards = referee ? refereeRows(trendsWeek, referee.name, view.trendsGame, { total: view.access.total ? view.saved.total : null })
    .map(row => shortCard(trendsWeek, { id: row.id }, { game: view.trendsGame, access: view.access }))
    .filter(Boolean).map(card => (card.locked ? card : { ...card, title: card.title.replace(/^Referee [^,]+, /, '').replace(/^./, c => c.toUpperCase()) })) : [];
  const t = view.trends;
  return (
    <Sheet title={view.title} onClose={close} tall className="gx-l-sheet">
      <div className="gx-vstack gx-gap-2">
        <p className="gx-t-meta">{view.when}</p>
        {view.records ? <p className="gx-t-meta">{view.records.text}{view.records.asOf ? ` · ${view.records.asOf}` : ''}</p> : null}
      </div>

      <section className="gx-vstack gx-gap-8" aria-labelledby={youId}>
        <h3 className="gx-t-section" id={youId}>{LINES_COPY.youOnGame}</h3>
        <YouRows rows={view.you}/>
      </section>

      <Card variant="flush"><List label="Kickoff weather">
          {weather.detail ? (
            <Expander key="weather" title={weather.title} summary={weather.summary} data-row="weather" data-kind={weather.state}>
              <WeatherDetail row={weather}/>
            </Expander>
          ) : <Row key="weather" title={weather.title} sub={weather.summary} data-row="weather" data-kind={weather.state}/>}
      </List></Card>

      <section className="gx-vstack gx-gap-8" aria-labelledby={trendsId} data-section="trends">
        <div className="gx-l-sechead">
          <h3 className="gx-t-section gx-grow" id={trendsId}>{LINES_COPY.trends}</h3>
          <InfoButton title={INFO.trends.title} body={INFO.trends.body} links={INFO.trends.links}/>
        </div>
        <MatchupResearch lines={lines} gameId={view.id} trends={<><TrendAvailability week={trendsWeek}/>{t.notice ? <Missing text={t.notice}/>
          : t.top.length ? <TrendList cards={t.top} rules={view.rules} label="Top trends for this game" openFirst/>
            : <Card><p className="gx-t-body gx-c-2">{t.empty}</p></Card>}</>}/>
      </section>

      <Card variant="flush">
        <List label="More about this game">
          {referee ? (
            <Expander key="referee" title={LINES_COPY.referee} summary={referee.name} data-row="referee">
              <p className="gx-t-meta">{referee.source}</p>
              {refereeCards.length ? <TrendList cards={refereeCards} rules={view.rules} label={`${referee.name}’s records`} variant="s2"/> : <p className="gx-t-body gx-c-2">No referee records for {referee.name} in this file.</p>}
            </Expander>
          ) : null}
          {t.status === 'ready' ? (
            <Row key="all" title={LINES_COPY.allTrends} sub={t.count ? `${t.count} ${t.count === 1 ? 'trend fits' : 'trends fit'} this game · every record` : 'Every record for this game'} chevron
              onClick={() => shell.openSheet('sh.allTrends', { game: view.id })}/>
          ) : null}
        </List>
      </Card>

      {app.accountId && shown && <GameNote key={`${app.accountId}:${shown.season}:${shown.week}:${view.id}`} accountId={app.accountId} season={shown.season} week={shown.week} gameId={view.id} requestSignIn={app.requestSignIn} onSaved={() => app.refresh({ only: ['personal'] })}/>}
    </Sheet>
  );
}
