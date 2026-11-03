// D-69 Play › Your score (spec section 6, mockup Q1-B) and one game's layer under it (P2B, Sean on November 3, 2026).
// One read, the season's history, feeds both. Points come from the SQL scorer, never a latest-market calculation, and
// the game layer shows only your own guess and its saved line (D-31). The list is the `score` layer; a game is the
// `score:game:<id>` layer at the `scoreGame` address key, so a reload or a shared link reopens it and Back closes it.
// A newly scored Bullseye and a final week are big moments in the score scope, reported from a fresh read only.
import { useRef } from 'react';
import { communityApi } from '../../api.js';
import { show } from '../../communityFormat.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, InfoButton, Matchup, Move, Pill, Segmented, Skeleton, cx, matchupWords } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { useMomentScope } from '../moments/MomentsProvider.jsx';
import { SCOPES } from '../moments/catalog.js';
import { INFO } from '../info.js';
import { fmtFull } from '../format.js';
import { FilterToggle } from './FilterToggle.jsx';
import { PlayLayer } from './PlayLayer.jsx';
import { PlayEmpty, PlayFailure } from './PlayStates.jsx';
import { receiptDetails } from './ScoreReceipt.jsx';
import { WeekChips } from './WeekChips.jsx';
import { SCORE_MARKETS, modeOf, ownEntry, scoreRows, scoreSummary } from './scoring.js';
import { useScoreMoments, useSeasonRanks } from './scoreHooks.js';
import { weekFinal } from './scoreMoments.js';
import { gameView, heroModel, layerMeta, rowView, scoreFinePrint } from './yourScore.js';
import './scores.css';
import './yourScore.css';

export function WeeklyScore() {
  const app = useAppData(), shell = useShell(), view = shell.state.views.play;
  useMomentScope(SCOPES.score);
  const season = Number.isInteger(view.season) ? view.season : null;
  const key = `${app.accountId}:score:${season ?? 'latest'}`;
  const read = useLeagueRead(key, signal => communityApi('history', season ? { season } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); });
  useScoreMoments(read);
  // Spec section 7: a failed or repeated read keeps the last good copy on screen (it never plays a moment).
  const kept = useRef(null);
  if (read.data) kept.current = { key, data: read.data };
  const copy = kept.current?.key === key ? kept.current.data : null;
  const data = read.data ?? copy;
  const ranks = useSeasonRanks(app);
  // The rank chip is this season's board rank: shown only beside a week of that season.
  const rank = data && ranks.season !== null && data.season === ranks.season ? ranks[modeOf(view.market)] : null;
  return <WeeklyScoreContent data={data} view={view} rank={rank} loading={!data && read.loading} error={read.error} stale={!read.data && !!copy}
    onRetry={read.retry} onChange={patch => shell.setView('play', patch)} onRefresh={read.retry} onPicks={patch => shell.setView('play', { ...patch, section: 'picks' })}/>;
}

/** The "About this score" lines for one game: today's receipt (lock-in, saved line, source, observed time, rule note). */
export function gameDetails({ row, mode, entry }) {
  return row?.locked ? receiptDetails({ game: row.game, mode, row, guess: row.guess, lockedAt: row.pick?.lockedAt || entry?.submittedAt }) : [];
}

/**
 * Both layers in one frame (one Nest), so a data load or a move between the list and a game never remounts the card.
 * `data` null with `loading` draws placeholders in the layer; with `error`, one sentence and Try again. `stale` (a kept
 * copy beside a failed read) adds one status sentence over the copy.
 */
export function WeeklyScoreContent({ data, view, rank = null, loading = false, error = null, stale = false, onRetry, onChange, onRefresh, onPicks }) {
  const mode = modeOf(view.market), gameId = typeof view.scoreGame === 'string' && view.scoreGame ? view.scoreGame : null;
  const weeks = (data?.weeks || []).slice().sort((a, b) => b.week - a.week);
  const weekNumber = Number.isInteger(view.week) ? view.week : weeks[0]?.week;
  const week = weeks.find(item => item.week === weekNumber) ?? null;
  const entry = data ? ownEntry(week, data.viewer, mode) : null;
  const all = scoreRows(week, entry);
  const filters = { team: view.team || '', matchup: view.matchup || '' }, filtered = Boolean(filters.team || filters.matchup);
  const rows = scoreRows(week, entry, filters);
  const row = gameId ? all.find(item => item.game.id === gameId) ?? null : null;
  const frame = gameId
    ? { label: row ? matchupWords(row.game.awayCode, row.game.homeCode) : 'Your score', layer: `score:game:${gameId}`,
      parents: [{ key: 'score', label: 'Your score', open: () => onChange({ scoreGame: undefined }) }],
      title: row ? <Matchup away={row.game.awayCode} home={row.game.homeCode} size={24}/> : 'Your score',
      info: row?.locked ? <InfoButton title="About this score" body={gameDetails({ row, mode, entry })}/> : null }
    : { label: 'Your score', layer: 'score', parents: [], title: 'Your score',
      info: <InfoButton title={INFO.scores.title} body={[...INFO.scores.body, ...scoreFinePrint({ entry, summary: scoreSummary(rows), filtered })]}/> };
  let body;
  if (!data) body = error ? <PlayFailure what="Your score" error={error} onRetry={onRetry}/> : loading ? <Skeleton label="Loading your score…" shape="rows" count={4}/> : null;
  else if (gameId) body = <GameBody row={row} mode={mode} week={weekNumber}/>;
  else body = <ScoreList data={data} mode={mode} weeks={weeks} weekNumber={weekNumber} week={week} entry={entry} all={all} rows={rows} filters={filters} filtered={filtered}
    rank={rank} onChange={onChange} onRefresh={onRefresh} onPicks={onPicks}/>;
  return <div className="gx-screen" data-play="score">
    <PlayLayer className="gx-ys" {...frame}>
      {data && error && stale ? <p className="gx-t-body" role="status">Your score could not refresh. Showing the last loaded copy. <Button variant="ghost" onClick={onRetry}>Try again</Button></p> : null}
      {body}
    </PlayLayer>
  </div>;
}

function ScoreList({ data, mode, weeks, weekNumber, week, entry, all, rows, filters, filtered, rank, onChange, onRefresh, onPicks }) {
  const hero = heroModel({ mode, week: weekNumber, entry, rows, filtered });
  const now = Date.parse(data.now ?? '');
  return <>
    <p className="gx-t-meta gx-c-2 gx-ys-meta">{layerMeta({ week: weekNumber, known: !!week, summary: scoreSummary(all), final: weekFinal(week, entry, now) })}</p>
    <WeekChips label="Week" weeks={weeks.map(item => item.week).sort((a, b) => a - b)} week={weekNumber} onWeek={n => onChange({ week: n, matchup: '' })}
      seasons={data.seasons || []} season={data.season} onSeason={year => onChange({ season: year, week: null, matchup: '' })}/>
    <Segmented label="Score market" options={SCORE_MARKETS} value={mode} onChange={market => onChange({ market })}/>
    <FilterToggle label="Filter games" active={filtered}><ScoreFilters week={week} filters={filters} onChange={onChange}/></FilterToggle>
    <ScoreHero hero={hero} rank={filtered ? null : rank} account={data.viewer} figure={`score.${mode}.${data.season}.${weekNumber}`}/>
    {!week ? <PlayEmpty>No scoring record for this week. Choose another week.</PlayEmpty>
      : !rows.length ? <PlayEmpty>No games match both filters. Clear filters to see this week.</PlayEmpty>
        : <ul className="gx-ys-rows" aria-label={`Week ${weekNumber} games`}>{rows.map(item => <ScoreRow key={`${week.season}:${week.week}:${mode}:${item.game.id}`} row={item} mode={mode} onOpen={() => onChange({ scoreGame: item.game.id })}/>)}</ul>}
    <div className="gx-score-navigation">
      <Button onClick={onRefresh}>Refresh scores</Button>
      {week && <Button onClick={() => onPicks({ season: week.season, week: week.week, market: mode })}>View this week’s picks</Button>}
      <Button variant="ghost" onClick={() => onChange({ section: 'compare' })}>Compare players</Button>
    </div>
  </>;
}

/** The week's hero (Q1-B): the total counting up from what this device last showed, the season rank chip, the bar. */
function ScoreHero({ hero, rank, account, figure }) {
  return <section className="gx-ys-hero" aria-label="Personal score summary">
    <div className="gx-ys-hero-top">
      <div className="gx-ys-hero-head">
        <h3 className="gx-t-micro gx-c-2">{hero.eyebrow}</h3>
        <p className="gx-ys-total">
          {hero.points === null ? <span className="gx-n-xl gx-c-3">—</span>
            : hero.count ? <CountUp className="gx-n-xl" value={hero.points} account={account} figure={figure}/> : <span className="gx-n-xl">{show(hero.points)}</span>}
          {' '}<span className="gx-t-body gx-c-2">points</span>
        </p>
      </div>
      {rank ? <p className="gx-ys-rank"><span className="gx-t-micro gx-c-2">Season</span> <span className="gx-n-s">{rank.label}</span>{rank.move ? <> <Move by={rank.move}/></> : null}</p> : null}
    </div>
    {hero.bar !== null ? <span className="gx-ys-meter" role="img" aria-label={hero.meterLabel}><span style={{ width: `${hero.bar}%` }}></span></span> : null}
    {hero.line ? <p className="gx-t-meta gx-c-2">{hero.line}</p> : null}
    {hero.note ? <p className="gx-t-body">{hero.note}</p> : null}
  </section>;
}

/** One picture row (Q1-B): the matchup as marks, BULLSEYE, the points pill, "Line · You · off by" and the bar. */
function ScoreRow({ row, mode, onOpen }) {
  const v = rowView(row, mode);
  return <li>
    <button type="button" className="gx-ys-row" data-game={row.game.id} onClick={onOpen}>
      <span className="gx-ys-row-top">
        <Matchup away={row.game.awayCode} home={row.game.homeCode} size={24}/>
        {v.bullseye ? <span className="gx-t-micro gx-ys-bull">Bullseye</span> : null}
        <span className={cx('gx-ys-pill', v.pill.number ? 'gx-n-s' : 'gx-t-micro')} data-tier={v.pill.tier}>{v.pill.text}</span>
      </span>
      <span className="gx-t-meta gx-c-2 gx-ys-row-meta">{v.meta}</span>
      {v.share !== null ? <span className="gx-ys-bar" data-tier={v.pill.tier} aria-hidden="true"><span style={{ width: `${Math.round(v.share * 1000) / 10}%` }}></span></span> : null}
    </button>
  </li>;
}

/** The filters behind the filter button: Team (either side) AND Matchup, and Clear filters. */
export function ScoreFilters({ week, filters, onChange }) {
  const teams = [...new Set((week?.games || []).flatMap(game => [game.awayCode, game.homeCode]))].sort();
  return <div className="gx-vstack gx-gap-12 gx-ys-filters">
    <label className="gx-t-body">Team<select className="gx-input" value={filters.team} onChange={event => onChange({ team: event.target.value })}><option value="">All teams</option>{filters.team && !teams.includes(filters.team) && <option value={filters.team}>{filters.team} · not this week</option>}{teams.map(team => <option key={team} value={team}>{team}</option>)}</select></label>
    <label className="gx-t-body">Matchup<select className="gx-input" value={filters.matchup} onChange={event => onChange({ matchup: event.target.value })}><option value="">All matchups</option>{(week?.games || []).map(game => <option key={game.id} value={game.id}>{game.awayCode} at {game.homeCode}</option>)}</select></label>
    <Button disabled={!filters.team && !filters.matchup} onClick={() => onChange({ team: '', matchup: '' })}>Clear filters</Button>
  </div>;
}

/** One game's layer (P2B): the points, BULLSEYE, one sentence, the number line, the rule and the kickoff. */
function GameBody({ row, mode, week }) {
  if (!row) return <PlayEmpty>This game is not in this week.</PlayEmpty>;
  const v = gameView({ row, mode, week });
  return <>
    <p className="gx-t-meta gx-c-2 gx-ys-meta">{v.meta}</p>
    {v.scored || v.late ? <div className="gx-ys-game-top">
      {v.scored ? <p className="gx-ys-points"><span className="gx-n-xl">{show(v.points)}</span>{' '}<span className="gx-t-body gx-c-2">/ 10 points</span></p> : null}
      {v.bullseye ? <span className="gx-t-micro gx-ys-bull">Bullseye</span> : null}
      {v.late ? <Pill tone="pending">{v.late}</Pill> : null}
    </div> : null}
    {v.sentence ? <p className="gx-t-strong">{v.sentence}</p> : null}
    {v.line ? <NumberLine line={v.line}/> : v.you ? <p className="gx-t-body">You · {v.you}</p> : null}
    {v.line ? <p className="gx-t-meta gx-c-2">Each half point off costs 1 point.</p> : null}
    <p className="gx-t-meta gx-c-2">Kickoff {fmtFull(row.game.kickoff)}</p>
  </>;
}

/** The saved line as a sky tick, your guess as a lime dot and the gap between them (it grows on open, scaleX only). */
function NumberLine({ line }) {
  const at = value => `${value}%`;
  return <figure className="gx-ys-line">
    <div className="gx-ys-axis" role="img" aria-label={line.aria}>
      <span className="gx-t-meta gx-ys-axis-label gx-ys-axis-label--line" data-align={line.line.align} style={{ left: at(line.line.pct) }}>{line.line.label}</span>
      <span className="gx-ys-axis-track"></span>
      {line.gap ? <span className="gx-ys-axis-gap" style={{ left: at(line.gap.left), width: at(line.gap.width), transformOrigin: `${line.gap.origin} center` }}></span> : null}
      <span className="gx-ys-axis-tick" style={{ left: at(line.line.pct) }}></span>
      <span className="gx-ys-axis-you" style={{ left: at(line.you.pct) }}></span>
      <span className="gx-t-meta gx-ys-axis-label gx-ys-axis-label--you" data-align={line.you.align} style={{ left: at(line.you.pct) }}>{line.you.label}</span>
      {line.ticks.map(tick => <span key={tick.value} className="gx-t-meta gx-tnum gx-c-3 gx-ys-axis-num" style={{ left: at(tick.pct) }}>{tick.label}</span>)}
    </div>
    <figcaption className="gx-t-meta gx-c-3 gx-ys-caption">{line.caption}</figcaption>
  </figure>;
}
