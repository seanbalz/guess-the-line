// Detail-only content is loaded when a game sheet opens; the frame and pager stay in GameSheet.
import { useId } from 'react';
import { LINES_COPY, refereeRow, sheetWeatherRow } from '../../../../shared/lines-view.mjs';
import { WIND_CARD, refereeRows, shortCard } from '../../../../shared/trends-view.mjs';
import { useOfficials, useWind } from './trendsHooks.js';
import { useShell } from '../shell/context.js';
import { Card, Icon, InfoButton, List, Pill, Row, Skeleton } from '../ui/index.js';
import { Expander, TrendList, TrendAvailability, TrendRefresh, WeatherDetail } from './parts.jsx';
import { INFO } from '../info.js';
import { GameNote } from './GameNote.jsx';
import { MatchupResearch } from '../research/MatchupResearch.jsx';
import { EveryoneGuesses } from './EveryoneGuesses.jsx';
import { MarketDetails } from './MarketDetails.jsx';
import { TeamMatchup } from '../teams/TeamMatchup.jsx';
import { recordsThroughText } from '../teams/teamModel.js';
import { useTeamSeason } from '../teams/teamsData.js';
import { RecordedResult } from './RecordedResult.jsx';
import { useGameLines } from './useGameLines.js';

function YouRows({ rows, onOpen }) {
  return (
    <Card variant="flush">
      <List label={LINES_COPY.youOnGame}>
        {rows.map(row => (
          <Row
            key={row.market}
            onClick={onOpen ? () => onOpen(row.market) : undefined}
            chevron={Boolean(onOpen)}
            aria-label={onOpen ? `Open your ${row.label} pick. ${row.main}. ${row.sub}${row.late ? `. ${row.late}` : ''}` : undefined}
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

/** A status in words; while something is still loading, skeleton blocks in its place (the words stay for screen readers). */
function Missing({ text, loading = false, shape = 'rows', count = 3 }) {
  return loading ? <Skeleton label={text} shape={shape} count={count}/> : <p className="gx-t-body gx-c-2" role="status">{text}</p>;
}

export default function GameDetails({ lines, view, result }) {
  const shell = useShell();
  const youId = useId(), trendsId = useId();
  const { app, trends, trendsWeek, shown } = lines;
  const markets = useGameLines(lines, view.id);
  const officials = useOfficials(shown?.season, shown?.week, true);
  const wind = useWind(shown?.season, shown?.week, true);
  const teams = useTeamSeason();
  const sameWeek = wind.wind?.season === shown?.season && wind.wind?.week === shown?.week;
  const weather = sheetWeatherRow({ game: view, trendsGame: view.trendsGame, entry: sameWeek ? wind.wind?.games?.[view.id] ?? null : null, now: wind.now, loading: wind.loading,
    season: shown?.season, week: shown?.week, windCard: trendsWeek?.cards?.[WIND_CARD] ?? null });
  const referee = view.trendsGame ? refereeRow(trendsWeek, view.id, officials) : null;
  const refereeCards = referee ? refereeRows(trendsWeek, referee.name, view.trendsGame, { total: view.access.total ? view.saved.total : null })
    .map(row => shortCard(trendsWeek, { id: row.id }, { game: view.trendsGame, access: view.access }))
    .filter(Boolean).map(card => (card.locked ? card : { ...card, title: card.title.replace(/^Referee [^,]+, /, '').replace(/^./, c => c.toUpperCase()) })) : [];
  const t = view.trends;
  return <>
      <div className="gx-vstack gx-gap-8 gx-l-head">
        <p className="gx-t-meta">{view.when}</p>
        <TeamMatchup away={view.away.code} home={view.home.code} season={shown?.season ?? null} from={view.title}/>
        {recordsThroughText(teams.data) && teams.data.season === shown?.season ? <p className="gx-t-meta gx-c-2 gx-l-through">{recordsThroughText(teams.data)}</p> : null}
      </div>

      <RecordedResult key={`${app.accountId}:${shown?.season}:${shown?.week}`} lines={lines} game={markets.status === 'ready' ? { ...view, started: markets.data.game.started === true } : view} snapshot={result}/>

      <section className="gx-vstack gx-gap-8" aria-labelledby={youId}>
        <h3 className="gx-t-section" id={youId}>{LINES_COPY.youOnGame}</h3>
        <YouRows rows={view.you} onOpen={app.accountId && shown ? market => shell.openSheet('sh.yourPick', { game: view.id, market, accountId: app.accountId, season: shown.season, week: shown.week }) : null}/>
      </section>

      <MarketDetails read={markets} gameId={view.id}/>

      {app.accountId && shown && <Card variant="flush"><Expander key={`${app.accountId}:${shown.season}:${shown.week}:${view.id}`} title="Everyone’s guesses" summary="Community · Spread and Total">
        <EveryoneGuesses lines={lines} game={{ id: view.id, awayCode: view.away.code, homeCode: view.home.code }} onGuess={market => shell.go('play', { section: 'picks', market, season: shown.season, week: shown.week })}/>
      </Expander></Card>}

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
        <MatchupResearch lines={lines} gameId={view.id} trends={<><TrendAvailability week={trendsWeek}/><TrendRefresh read={trends}/>{t.notice ? <Missing text={t.notice} loading={t.notice === LINES_COPY.trendsLoading}/>
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
  </>;
}
