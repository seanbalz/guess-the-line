// `sh.game`, one game read-only (redesign build plan stage 13; prototype spec 3.5; DASH-7). The header with the
// kickoff and the team records in words (DP-16), "You on this game", the top three trends for this game in plain
// words (each with its record and sample size, strongest first, a line trend locked with its market), then the
// weather and wind row and the referee row (each hidden with no data, a 404 included) and "All trends", which opens
// its own sheet over this one. The current line arrives with stage 33 ("Line now arrives in a later update.").
//
// The kickoff wind forecast (`/wind/read`, D-34) and the referee assignments (`/officials/read`) are read only once this
// sheet opens, through the old app's loaders, so the app makes no more wind requests than the old trends panel does
// (one per week, reused for five minutes by every open sheet). Nothing here writes.
import { useId, useMemo } from 'react';
import { LINES_COPY, gameSheet, refereeRow, weatherRow } from '../../../../shared/lines-view.mjs';
import { TRENDS_FOOTNOTE, WIND_CARD, refereeRows, shortCard } from '../../../../shared/trends-view.mjs';
import { useOfficials, useWind } from './trendsHooks.js';
import { useShell } from '../shell/context.js';
import { Card, Icon, List, Pill, Row, Sheet } from '../ui/index.js';
import { useLinesData } from './linesData.js';
import { Credits, Expander, TrendList, WeatherDetail } from './parts.jsx';
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
  const { personal, community, trends, trendsWeek, records, shown } = useLinesData();
  const view = useMemo(() => (personal.data ? gameSheet({ personal: personal.data, community, trends: trendsWeek, trendsStatus: trends.status, records, gameId: args.game }) : null),
    [personal.data, community, trendsWeek, trends.status, records, args.game]);
  const officials = useOfficials(shown?.season, shown?.week, Boolean(view));
  const wind = useWind(shown?.season, shown?.week, Boolean(view));
  if (!view) {
    return (
      <Sheet title={LINES_COPY.title} onClose={shell.closeSheet} className="gx-l-sheet">
        <Missing text={personal.data ? 'This game isn’t on this week’s board.' : LINES_COPY.loading}/>
      </Sheet>
    );
  }
  const weather = weatherRow({ game: view, trendsGame: view.trendsGame, entry: wind.wind?.games?.[view.id] ?? null, now: wind.now, loading: wind.loading,
    season: shown?.season, week: shown?.week, windCard: trendsWeek?.cards?.[WIND_CARD] ?? null });
  const referee = view.trendsGame ? refereeRow(trendsWeek, view.id, officials) : null;
  const refereeCards = referee ? refereeRows(trendsWeek, referee.name, view.trendsGame, { total: view.access.total ? view.saved.total : null })
    .map(row => shortCard(trendsWeek, { id: row.id }, { game: view.trendsGame, access: view.access }))
    .filter(Boolean).map(card => (card.locked ? card : { ...card, title: card.title.replace(/^Referee [^,]+, /, '').replace(/^./, c => c.toUpperCase()) })) : [];
  const t = view.trends;
  return (
    <Sheet title={view.title} onClose={shell.closeSheet} tall className="gx-l-sheet">
      <div className="gx-vstack gx-gap-2">
        <p className="gx-t-meta">{view.when}</p>
        {view.records ? <p className="gx-t-meta">{view.records.text}{view.records.asOf ? ` · ${view.records.asOf}` : ''}</p> : null}
      </div>

      <section className="gx-vstack gx-gap-8" aria-labelledby={youId}>
        <h3 className="gx-t-section" id={youId}>{LINES_COPY.youOnGame}</h3>
        <YouRows rows={view.you}/>
      </section>

      <section className="gx-vstack gx-gap-8" aria-labelledby={trendsId} data-section="trends">
        <h3 className="gx-t-section" id={trendsId}>{LINES_COPY.trends}</h3>
        {t.status === 'loading' || t.status === 'idle' ? <Missing text={LINES_COPY.trendsLoading}/>
          : t.status === 'error' ? <Missing text={LINES_COPY.trendsFailed}/>
            : t.status === 'missing' || t.status === 'none' ? <Missing text={t.missing}/>
              : t.top.length ? <TrendList cards={t.top} rules={view.rules} label="Top trends for this game"/>
                : <Card><p className="gx-t-body gx-c-2">{t.empty}</p></Card>}
        {t.status === 'ready' && t.top.length ? <p className="gx-t-meta">{TRENDS_FOOTNOTE}</p> : null}
      </section>

      {weather || referee || t.status === 'ready' ? (
        <Card variant="flush">
          <List label="More about this game">
            {weather ? (
              <Expander key="weather" title={weather.title} summary={weather.summary} data-row="weather">
                <WeatherDetail row={weather}/>
              </Expander>
            ) : null}
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
      ) : null}

      <Credits footer={view.footer}/>
    </Sheet>
  );
}
