import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';
import { DEFAULT_FILTERS, SCORING_OPTIONS, POSITION_OPTIONS, SCOPE_OPTIONS, buildRankings, scoringRules, formatFantasyNumber } from '../../shared/fantasy-rankings.mjs';
import { Button, Card, Segmented, Switch } from './next/ui/index.js';
import { FANTASY_AVAILABLE, FANTASY_INITIAL, useFantasySnapshot } from './fantasyData.js';
import './fantasyFootball.css';

const PAGE_SIZE = 50;
const number = formatFantasyNumber;
const date = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'time unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' }).format(new Date(value));
};
const httpLink = value => /^https?:\/\//.test(value || '') ? value : undefined;
const optionLabel = (options, value) => options.find(option => option.value === value)?.label ?? value;
const nameClass = (theme, name) => `${theme === 'next' ? 'gx-' : ''}fantasy-${name}`;

function Surface({ theme, className, children, ...props }) {
  return theme === 'next' ? <Card className={className} {...props}>{children}</Card>
    : <div className={`panel ${className || ''}`} {...props}>{children}</div>;
}
function Action({ theme, children, ...props }) {
  return theme === 'next' ? <Button variant="secondary" {...props}>{children}</Button>
    : <button type="button" className="secondary" {...props}>{children}</button>;
}
function Select({ theme, label, value, onChange, options, ...props }) {
  const id = useId();
  return <div className={nameClass(theme, 'field')}>
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={event => onChange(event.target.value)} {...props}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>;
}

function PlayerCard({ player, theme, scope, week, position }) {
  const c = name => nameClass(theme, name);
  const trends = player.trendHighlights || [];
  const matchup = player.weekly?.status === 'bye' ? 'Bye this week'
    : player.weekly?.opponent ? `${player.weekly.opponent} · ${date(player.weekly.kickoff)}` : 'Matchup unavailable';
  return <li className={c('player-item')}>
    <Surface theme={theme} className={c('player')}>
      <details>
        <summary className={c('player-summary')}>
          <span className={c('player-rank')} aria-label={`${position === 'ALL' ? 'Overall' : position} rank ${player.rank}`}>#{player.rank}</span>
          <span className={c('player-main')}>
            <strong>{player.name}</strong>
            <span className={c('meta')}>{player.team || 'Team unknown'} · {player.position}{player.positionRank ? ` ${player.positionRank}` : ''} · Overall {player.overallRank ?? '—'}</span>
          </span>
          <span className={c('player-points')}><strong>{number(player.points)}</strong><span className={c('meta')}>est. pts</span></span>
          <ChevronDown size={18} aria-hidden="true" className={c('chevron')}/>
          <span className={c('matchup')}>{matchup}</span>
          {player.status && <span className={c('player-status')}>{player.status}</span>}
          {scope === 'ros' && <span className={c('per-game')}>{number(player.perGame)} / game · {player.games ?? '—'} scheduled games</span>}
          {trends.length > 0 && <span className={c('trend-tags')}>
            {trends.slice(0, 2).map(trend => <span key={trend.id} className={`${c('trend-tag')} ${c(`trend-${trend.direction}`)}`}>
              {trend.direction === 'up' ? <ArrowUp size={14} aria-hidden="true"/> : <ArrowDown size={14} aria-hidden="true"/>}{trend.label}
            </span>)}
          </span>}
          <span className={c('open-hint')}>Player details &amp; trends</span>
        </summary>
        <div className={c('player-detail')}>
          <p>{player.sampleGames ?? '—'} recorded games in the pace estimate. Player availability is not injury-adjusted.</p>
          {player.status && <p>Roster status in source: {player.status}.</p>}
          <strong>Trends entering Week {week}</strong>
          {trends.length ? <ul className={c('trend-details')}>
            {trends.map(trend => <li key={trend.id}>
              <strong className={c(`trend-${trend.direction}`)}>{trend.direction === 'up' ? 'Rising' : 'Falling'} · {trend.label}</strong>
              <p>{trend.detail}</p>
              <p className={c('meta')}>Recent: {number(trend.recent)} / game ({trend.recentGames} games) · Earlier: {number(trend.baseline)} / game ({trend.baselineGames} games)</p>
            </li>)}
          </ul> : <p>No strong trend meets the sample and change thresholds. This does not mean performance is unchanged.</p>}
        </div>
      </details>
    </Surface>
  </li>;
}

/** Shared ranking/filter view for the current app and D-38 shell; the engine supplies all scoring and rank semantics. */
export function FantasyRankingsView({ theme = 'classic', headingLevel = 1, onBack, backLabel = 'Back to Home', state, entries = FANTASY_AVAILABLE, selection = FANTASY_INITIAL, onSelectionChange, filters = DEFAULT_FILTERS, onFiltersChange, limit = PAGE_SIZE, onMore, now = Date.now() }) {
  const c = name => nameClass(theme, name);
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  const SectionHeading = headingLevel === 2 ? 'h3' : 'h2';
  const snapshot = state?.status === 'ready' ? state.snapshot : null;
  const rankings = useMemo(() => snapshot ? buildRankings(snapshot, filters, { now }) : null, [snapshot, filters, now]);
  const update = (name, value) => onFiltersChange?.({ ...filters, [name]: value });
  const seasons = [...new Set(entries.map(entry => entry.season))];
  const [selectedSeason, selectedWeek] = selection.split('-').map(Number);
  const weeks = entries.filter(entry => entry.season === selectedSeason);
  const stale = snapshot && Number.isFinite(Date.parse(snapshot.asOf)) && now - Date.parse(snapshot.asOf) > 7 * 86400000;
  const unknownAge = snapshot && !Number.isFinite(Date.parse(snapshot.asOf));
  const rules = scoringRules(filters) || scoringRules(DEFAULT_FILTERS);
  const rows = rankings?.rows || [];
  const reset = () => onFiltersChange?.({ ...DEFAULT_FILTERS });
  const selectedScoring = optionLabel(SCORING_OPTIONS, filters.scoring);
  return <section className={theme === 'next' ? 'gx-screen gx-fantasy' : 'fantasy-football'} aria-label="Fantasy Football">
    <div className={c('heading')}><Heading className={theme === 'next' ? 'gx-t-title' : undefined}>Fantasy Football</Heading>
      {onBack && <Action theme={theme} onClick={onBack}>{backLabel}</Action>}
    </div>
    <p className={c('intro')}>Weekly and rest-of-season player rankings from recent statistical pace. These are GTL estimates, not expert consensus or injury-adjusted projections.</p>
    <Surface theme={theme} className={c('filters')} aria-label="Fantasy rankings filters">
      {theme === 'next' ? <Segmented label="Ranking period" options={SCOPE_OPTIONS} value={filters.scope} onChange={value => update('scope', value)}/>
        : <div className={c('period')} role="group" aria-label="Ranking period">{SCOPE_OPTIONS.map(option => <button type="button" key={option.value} aria-pressed={filters.scope === option.value} onClick={() => update('scope', option.value)}>{option.label}</button>)}</div>}
      <div className={c('filter-grid')}>
        <Select theme={theme} label="Season" value={selectedSeason} onChange={season => onSelectionChange?.(entries.find(entry => entry.season === Number(season))?.key)} options={seasons.map(season => ({ value: season, label: season }))}/>
        <Select theme={theme} label="Week" value={selection} onChange={onSelectionChange} options={weeks.map(entry => ({ value: entry.key, label: `Week ${entry.week}` }))}/>
        <Select theme={theme} label="Scoring" value={filters.scoring} onChange={value => update('scoring', value)} options={SCORING_OPTIONS}/>
        <Select theme={theme} label="Passing touchdowns" value={filters.passingTds} onChange={value => update('passingTds', Number(value))} options={[{ value: 4, label: '4 points' }, { value: 6, label: '6 points' }]}/>
        <Select theme={theme} label="Position" value={filters.position} onChange={value => update('position', value)} options={POSITION_OPTIONS}/>
        <Select theme={theme} label="Team" value={filters.team} onChange={value => update('team', value)} options={[{ value: 'ALL', label: 'All teams' }, ...(rankings?.teams || []).map(team => ({ value: team, label: team }))]}/>
      </div>
      <label className={c('field')}><span>Find a player</span><input type="search" placeholder="Player name" value={filters.search} onChange={event => update('search', event.target.value)}/></label>
      {theme === 'next' ? <Switch label="Strong trends only" sub={`Usage or scoring changes entering Week ${selectedWeek}.`} checked={filters.trendsOnly} onChange={value => update('trendsOnly', value)}/>
        : <label className={c('toggle')}><input type="checkbox" checked={filters.trendsOnly} onChange={event => update('trendsOnly', event.target.checked)}/><span>Strong trends only</span></label>}
      <Action theme={theme} onClick={reset}>Reset filters</Action>
    </Surface>
    {state?.status === 'loading' && <p className={c('status')} role="status">Loading Week {selectedWeek} rankings…</p>}
    {state?.status === 'missing' && <Surface theme={theme} className={c('empty')}><p>No fantasy snapshot is available for {selectedSeason} Week {selectedWeek}.</p><Action theme={theme} onClick={state.retry}>Check again</Action></Surface>}
    {state?.status === 'error' && <Surface theme={theme} className={c('empty')}><p role="alert">Week {selectedWeek} rankings could not be loaded.</p><Action theme={theme} onClick={state.retry}>Try again</Action></Surface>}
    {snapshot && <>
      <div className={c('source-summary')}>
        <p>{snapshot.season} · Week {snapshot.week} · {filters.scope === 'ros' ? 'Rest of season from this week' : 'Weekly estimates'} · {selectedScoring}</p>
        <p className={c('meta')}>Stats through Week {snapshot.statsThroughWeek ?? '—'} · Source updated {date(snapshot.asOf)}</p>
        {stale && <p className={c('warning')} role="status">Stale snapshot: the source is more than 7 days old. These estimates may miss recent games and roster changes.</p>}
        {unknownAge && <p className={c('warning')}>Source freshness is unavailable.</p>}
      </div>
      <section className={c('results')} aria-label="Player rankings">
        <div className={c('results-heading')}><SectionHeading className={theme === 'next' ? 'gx-t-section' : undefined}>Player rankings</SectionHeading><span className={c('meta')} role="status" aria-live="polite">{rankings.error ? 'Unavailable' : `${rows.length} players`}</span></div>
        <p className={c('meta')}>Sorted by estimated total points. The leading rank follows the selected position; team, player and trend filters keep ranks fixed.</p>
        {!rankings.error && <p className={c('meta')}>All positions: {rankings.summary.ranked} rankable · {rankings.summary.byes} on bye · {rankings.summary.unavailable} without an estimate in this period.</p>}
        {rankings.error ? <Surface theme={theme} className={c('empty')}><p role="alert">{rankings.error}</p><Action theme={theme} onClick={state.retry}>Try again</Action></Surface> : rows.length > 0 ? <><ol className={c('players')} aria-label="Ranked players">{rows.slice(0, limit).map(player => <PlayerCard key={player.id} player={player} theme={theme} scope={filters.scope} week={snapshot.week} position={filters.position}/>)}</ol>
          {rows.length > limit && <Action theme={theme} onClick={onMore}>Show more players ({rows.length - limit} left)</Action>}</>
          : <Surface theme={theme} className={c('empty')}><p>{filters.position === 'DST' ? 'Defense and special teams rankings are unavailable: this source does not include a verified scoring model for D/ST.' : snapshot.players.length === 0 ? 'This snapshot has no eligible player statistics yet.' : 'No players match these filters.'}</p><Action theme={theme} onClick={reset}>Reset filters</Action></Surface>}
      </section>
      <Surface theme={theme} className={c('method')}>
        <details><summary>Method, scoring &amp; sources <ChevronDown size={18} aria-hidden="true"/></summary>
          <div className={c('method-content')}>
            <p>{snapshot.method?.description || 'Estimates extend recent recorded statistical pace over the scheduled games remaining.'}</p>
            <p>Overall ranks compare estimated fantasy points across positions; they are not draft value or value over replacement. Bye weeks and scheduled games affect totals. Known Out or Doubtful players have no weekly estimate. Rest-of-season estimates assume a player is healthy and available for every remaining scheduled game; they do not predict return dates. Depth-chart changes and matchup strength are not forecast.</p>
            <p>Strong trends compare recent games with the earlier sample available before the selected week; expand a player to see the amounts and sample sizes. Trends describe recorded changes, not a promise about this week.</p>
            <strong>{selectedScoring} scoring · {filters.passingTds}-point passing TDs</strong>
            <dl className={c('scoring-rules')}>{[...(rules.offense || []), ...(rules.kicker || [])].map(rule => <div key={rule.key}><dt>{rule.label}</dt><dd>{rule.points} pts</dd></div>)}</dl>
            <p className={c('meta')}>Snapshot generated {date(snapshot.generatedAt)}.</p>
            <ul className={c('sources')}>{(snapshot.sources || []).map((source, index) => <li key={`${source.name}-${index}`}>
              <a href={httpLink(source.url)} target="_blank" rel="noreferrer">{source.name}</a>
              {source.license && <> · <a href={httpLink(source.licenseUrl)} target="_blank" rel="noreferrer">{source.license}</a></>}
              <span className={c('meta')}>Updated {date(source.updatedAt)} · Retrieved {date(source.retrievedAt)}</span>
            </li>)}</ul>
          </div>
        </details>
      </Surface>
    </>}
  </section>;
}

export default function FantasyFootball(props) {
  const [selection, setSelection] = useState(props.navigationState?.selection ?? FANTASY_INITIAL);
  const [filters, setFilters] = useState(props.navigationState?.filters ?? { ...DEFAULT_FILTERS });
  const [limit, setLimit] = useState(props.navigationState?.limit ?? PAGE_SIZE);
  const changed = useRef(props.onNavigationState);
  changed.current = props.onNavigationState;
  useEffect(() => { changed.current?.({ selection, filters, limit }); }, [selection, filters, limit]);
  const state = useFantasySnapshot(selection);
  return <FantasyRankingsView {...props} state={state} selection={selection} onSelectionChange={value => { setSelection(value); setLimit(PAGE_SIZE); }} filters={filters} onFiltersChange={value => { setFilters(value); setLimit(PAGE_SIZE); }} limit={limit} onMore={() => setLimit(value => value + PAGE_SIZE)}/>;
}
