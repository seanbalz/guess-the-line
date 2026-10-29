// D-66 Research › Fantasy as nesting cards (docs/superpowers/specs/2026-10-28-research-nesting-cards-design.md):
// Fantasy (the rankings card) › one player, and Fantasy › the week's report card or the comparison. The ranking engine,
// filters, snapshot reads and gates are the ones the old rankings view used (shared/fantasy-rankings.mjs,
// shared/fantasy-context.mjs, fantasyData.js, fantasyContext.js); only the layout changes. Each row is one tile with one
// big number; the method, scoring rules, sources and long sentences sit behind the card's ⓘ or one layer in.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { DEFAULT_FILTERS, POSITION_OPTIONS, SCOPE_OPTIONS, SCORING_OPTIONS, buildRankings, formatFantasyNumber as number, scoringRules } from '../../../../shared/fantasy-rankings.mjs';
import { MATCHUP_POSITIONS, describePlayerContext, matchupTable } from '../../../../shared/fantasy-context.mjs';
import { MAX_COMPARE } from '../../../../shared/fantasy-tools.mjs';
import { FANTASY_AVAILABLE, FANTASY_INITIAL, useFantasySnapshot } from '../../fantasyData.js';
import { useFantasyGameContext } from '../../fantasyContext.js';
import { FantasyAccuracy } from '../../FantasyAccuracy.jsx';
import { Button, InfoButton, LockLine, Nest, Pill, Segmented, Switch } from '../ui/index.js';
import { PlayerCompare, PlayerProfileSheet, PlayerToolButtons } from './FantasyTools.jsx';

export const FANTASY_PAGE = 50;
const INTRO = 'Weekly and rest-of-season player rankings from recent statistical pace. These are GTL estimates, not expert consensus or injury-adjusted projections.';
const date = value => (!value || !Number.isFinite(Date.parse(value)) ? 'time unavailable'
  : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' }).format(new Date(value)));
const httpLink = value => (/^https?:\/\//.test(value || '') ? value : undefined);
const label = (options, value) => options.find(option => option.value === value)?.label ?? value;

// A label beside its select (not around it), so the select's name is the label alone and never its options' text.
function Field({ name, value, onChange, options }) {
  const id = useId();
  return <div className="gx-fantasy-field"><label htmlFor={id}>{name}</label>
    <select id={id} value={value} onChange={event => onChange(event.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </div>;
}

function FindPlayer({ value, onChange }) {
  const id = useId();
  return <div className="gx-fantasy-field"><label htmlFor={id}>Find a player</label><input id={id} type="search" placeholder="Player name" value={value} onChange={event => onChange(event.target.value)}/></div>;
}

/** One ranked player as one tile: rank, name, team and position, the estimate, and at most two trend tags. */
function PlayerRow({ player, scope, position, context, onOpen }) {
  const trends = player.trendHighlights || [];
  const matchup = player.weekly?.status === 'bye' ? 'Bye this week'
    : context?.pill ?? (player.weekly?.opponent ? `${player.weekly.opponent} · ${date(player.weekly.kickoff)}` : 'Matchup unavailable');
  return <li className="gx-fantasy-player-item">
    <button type="button" className="gx-nest-tile gx-fantasy-row" data-player={player.id} onClick={onOpen}>
      <span className="gx-fantasy-row-top">
        <span className="gx-fantasy-player-rank" aria-label={`${position === 'ALL' ? 'Overall' : position} rank ${player.rank}`}>#{player.rank}</span>
        <span className="gx-fantasy-player-main"><strong>{player.name}</strong>
          <span className="gx-t-meta">{player.team || 'Team unknown'} · {player.position}{player.positionRank ? ` ${player.positionRank}` : ''} · Overall {player.overallRank ?? '—'}</span></span>
        <span className="gx-fantasy-player-points"><strong>{number(player.points)}</strong><span className="gx-t-meta">est. pts</span></span>
      </span>
      <span className="gx-fantasy-row-meta"><span className="gx-t-meta">{matchup}</span>{scope === 'ros' ? <span className="gx-t-meta">{number(player.perGame)} / game · {player.games ?? '—'} scheduled games</span> : null}</span>
      {player.status || trends.length ? <span className="gx-fantasy-trend-tags">
        {player.status ? <span className="gx-fantasy-player-status">{player.status}</span> : null}
        {trends.slice(0, 2).map(trend => <span key={trend.id} className={`gx-fantasy-trend-tag gx-fantasy-trend-${trend.direction}`}>
          {trend.direction === 'up' ? <ArrowUp size={14} aria-hidden="true"/> : <ArrowDown size={14} aria-hidden="true"/>}{trend.label}
        </span>)}
      </span> : null}
    </button>
  </li>;
}

/** The method, scoring rules and sources, one tap away behind the rankings card's ⓘ. */
function methodBody(snapshot, filters, scoringLabel) {
  const rules = scoringRules(filters) || scoringRules(DEFAULT_FILTERS);
  return [INTRO,
    snapshot.method?.description || 'Estimates extend recent recorded statistical pace over the scheduled games remaining.',
    'Sorted by estimated total points. The leading rank follows the selected position; team, player and trend filters keep ranks fixed.',
    'Overall ranks compare estimated fantasy points across positions; they are not draft value or value over replacement. Known Out or Doubtful players have no weekly estimate. Rest-of-season estimates assume a player is healthy for every remaining scheduled game.',
    'Strong trends compare recent games with the earlier sample available before the selected week. Trends describe recorded changes, not a promise about this week.',
    `${scoringLabel} scoring · ${filters.passingTds}-point passing TDs: ${[...(rules.offense || []), ...(rules.kicker || [])].map(rule => `${rule.label} ${rule.points}`).join(', ')}.`,
    `Snapshot generated ${date(snapshot.generatedAt)}. Source updated ${date(snapshot.asOf)}.`];
}
const sourceLinks = snapshot => (snapshot.sources || []).flatMap(source => [
  httpLink(source.url) ? { text: source.name, url: source.url } : null,
  source.license && httpLink(source.licenseUrl) ? { text: `${source.name} · ${source.license}`, url: source.licenseUrl } : null,
].filter(Boolean));

export function FantasyNest({ navigationState, onNavigationState, view = {}, onLayer, profileId, onProfile, compareIds, onCompareChange, onCompare }) {
  const [selection, setSelection] = useState(navigationState?.selection ?? null);
  const [filters, setFilters] = useState(navigationState?.filters ?? { ...DEFAULT_FILTERS });
  const [limit, setLimit] = useState(navigationState?.limit ?? FANTASY_PAGE);
  const changed = useRef(onNavigationState);
  changed.current = onNavigationState;
  useEffect(() => { changed.current?.({ selection, filters, limit }); }, [selection, filters, limit]);
  const state = useFantasySnapshot(selection);
  const snapshot = state?.status === 'ready' ? state.snapshot : null;
  const gameContext = useFantasyGameContext(snapshot?.season, snapshot?.week);
  const now = useMemo(() => Date.now(), [snapshot]); // fixed per snapshot, as freshness is judged once per read
  const rankings = useMemo(() => (snapshot ? buildRankings(snapshot, filters, { now }) : null), [snapshot, filters, now]);
  const matchups = useMemo(() => (snapshot?.matchups ? Object.fromEntries(MATCHUP_POSITIONS.map(p => [p, matchupTable(snapshot, p, filters)])) : null), [snapshot, filters]);
  const scoringLabel = label(SCORING_OPTIONS, filters.scoring);
  const contextFor = player => (filters.scope === 'weekly' ? describePlayerContext(player, { matchups, lines: gameContext?.lines, wind: gameContext?.wind, scoringLabel }) : null);
  const update = (name, value) => { setFilters(f => ({ ...f, [name]: value })); setLimit(FANTASY_PAGE); };
  const reset = () => { setFilters({ ...DEFAULT_FILTERS }); setLimit(FANTASY_PAGE); };
  const entries = state?.weeks?.length ? state.weeks : FANTASY_AVAILABLE;
  const chosen = selection ?? state?.selection ?? FANTASY_INITIAL;
  const [selectedSeason, selectedWeek] = chosen.split('-').map(Number);
  const choose = key => { setSelection(key); setLimit(FANTASY_PAGE); };
  const rows = rankings?.rows || [];
  const settings = { scoring: filters.scoring, passingTds: filters.passingTds };
  const toFantasy = { key: 'fantasy', label: 'Fantasy', onOpen: () => onLayer({ fantasyLayer: null, fantasyPlayer: null }) };
  const profile = snapshot && profileId ? <PlayerProfileSheet snapshot={snapshot} playerId={profileId} settings={settings} onClose={() => onProfile(null)}
    compare={{ compared: compareIds.includes(profileId), full: compareIds.length >= MAX_COMPARE, onCompare }}/> : null;

  // Fantasy › one player.
  const player = snapshot && view.fantasyLayer === 'player' ? rows.find(p => p.id === view.fantasyPlayer) ?? null : null;
  if (player) {
    const context = contextFor(player), trends = player.trendHighlights || [];
    return <section className="gx-fantasy" aria-label="Fantasy Football"><Nest label="Fantasy layers" layer={'player:' + player.id} title={player.name} lips={[toFantasy]}
      info={<InfoButton title={`About ${player.name}’s estimate`} body={[
        `${player.sampleGames ?? '—'} recorded games in the pace estimate. Player availability is not injury-adjusted.`,
        ...trends.map(t => `${t.direction === 'up' ? 'Rising' : 'Falling'} · ${t.label}: ${t.detail}`),
        'Matchup and kickoff context are observed nflverse data, not predictions.']} links={sourceLinks(snapshot)}/>}>
      <p className="gx-t-meta">{player.team || 'Team unknown'} · {player.position}{player.positionRank ? ` ${player.positionRank}` : ''} · Overall {player.overallRank ?? '—'}</p>
      <p className="gx-nest-big"><span className="gx-n-xl">{number(player.points)}</span><span className="gx-t-meta">est. pts · {scoringLabel}</span></p>
      <div className="gx-nest-tags">
        <Pill>{player.weekly?.status === 'bye' ? 'Bye this week' : context?.pill ?? (player.weekly?.opponent ? `${player.weekly.opponent} · ${date(player.weekly.kickoff)}` : 'Matchup unavailable')}</Pill>
        {player.status ? <Pill tone="pending">{player.status}</Pill> : null}
        <Pill>{player.sampleGames ?? '—'} games sampled</Pill>
      </div>
      <PlayerToolButtons player={player} compared={compareIds.includes(player.id)} full={compareIds.length >= MAX_COMPARE} onProfile={onProfile} onCompare={onCompare}/>
      <section className="gx-vstack gx-gap-8" aria-label={`Trends entering Week ${snapshot.week}`}>
        <h3 className="gx-t-label gx-c-2">Trends entering Week {snapshot.week}</h3>
        {trends.length ? <ul className="gx-nest-grid">{trends.map(t => <li key={t.id}><div className="gx-nest-tile" data-trend={t.direction}>
          <span className={`gx-nest-tile-label gx-fantasy-trend-${t.direction}`}>{t.direction === 'up' ? <ArrowUp size={14} aria-hidden="true"/> : <ArrowDown size={14} aria-hidden="true"/>} {t.label}</span>
          <span className="gx-n-m gx-nest-num">{number(t.recent)}</span>
          <span className="gx-t-meta">per game, last {t.recentGames} · was {number(t.baseline)}</span>
        </div></li>)}</ul> : <p className="gx-t-meta">No strong trend meets the thresholds.</p>}
      </section>
      {context ? <details className="gx-tr-details" data-fantasy="context"><summary className="gx-t-strong">This week’s matchup</summary>
        <div className="gx-vstack gx-gap-8">
          {context.matchup ? <p className="gx-t-body">{context.matchup}{context.seasonMatchup ? <span className="gx-t-meta"> · {context.seasonMatchup}</span> : null}</p> : null}
          {context.kickoff ? <p className="gx-t-body">Kickoff: {context.kickoff} · {date(player.weekly.kickoff)}</p> : null}
          {context.weather ? <p className="gx-t-body">{context.weather}{context.weatherCredit ? <> · <a href={httpLink(context.weatherCredit.url)} target="_blank" rel="noreferrer">{context.weatherCredit.text}</a> (<a href={httpLink(context.weatherCredit.licenseUrl)} target="_blank" rel="noreferrer">{context.weatherCredit.license}</a>)</> : null}</p> : null}
          {context.implied ? <p className="gx-t-body">Implied team total {number(context.implied.value)} · median of {context.implied.bookCount} sportsbooks · captured {date(context.implied.capturedAt)}</p>
            : context.lock ? <LockLine>{context.lock}</LockLine> : context.linesNote ? <p className="gx-t-body">{context.linesNote}</p> : null}
        </div>
      </details> : null}
      {profile}
    </Nest></section>;
  }

  // Fantasy › the week's report card.
  if (snapshot && view.fantasyLayer === 'report' && filters.scope === 'weekly' && state.review) {
    return <section className="gx-fantasy" aria-label="Fantasy Football"><Nest label="Fantasy layers" layer="report" title={`Week ${state.review.week} report card`} lips={[toFantasy]}
      info={<InfoButton title="About the report card" body={['A report card for GTL’s statistical pace estimates, not a forecast or betting claim. Each estimate is graded against the recorded result, beside a season-average baseline.']} links={sourceLinks(snapshot)}/>}>
      <FantasyAccuracy theme="next" review={state.review} filters={filters} scoringLabel={scoringLabel} headingLevel={3}/>
    </Nest></section>;
  }

  // Fantasy › compare.
  if (snapshot && view.fantasyLayer === 'compare') {
    return <section className="gx-fantasy" aria-label="Fantasy Football"><Nest label="Fantasy layers" layer="compare" title="Compare players" lips={[toFantasy]}>
      <PlayerCompare key={`${snapshot.season}-${snapshot.week}-${filters.scoring}`} snapshot={snapshot} ids={compareIds} onChange={onCompareChange} settings={settings} onProfile={onProfile}/>
      {profile}
    </Nest></section>;
  }

  // Fantasy: the rankings card.
  const stale = snapshot && Number.isFinite(Date.parse(snapshot.asOf)) && now - Date.parse(snapshot.asOf) > 7 * 86400000;
  const origin = state?.fallback ? `Showing saved Week ${snapshot?.week} · live refresh unavailable`
    : state?.origin === 'hosted' && snapshot ? `Updated ${date(snapshot.generatedAt)}${state.indexStale ? ' · refresh check delayed' : ''}` : null;
  const seasons = [...new Set(entries.map(entry => entry.season))];
  return <section className="gx-fantasy" aria-label="Fantasy Football"><Nest label="Fantasy layers" layer="fantasy" title="Fantasy Football"
    info={snapshot ? <InfoButton title="About Fantasy rankings" body={methodBody(snapshot, filters, scoringLabel)} links={sourceLinks(snapshot)}/> : <InfoButton title="About Fantasy rankings" body={[INTRO]}/>}>
    {snapshot ? <p className="gx-t-meta">Week {snapshot.week} · {filters.scope === 'ros' ? 'Rest of season' : 'Weekly'} · {scoringLabel} · Stats through Week {snapshot.statsThroughWeek ?? '—'}</p> : null}
    {origin ? <p className="gx-t-meta" role="status">{origin}</p> : null}
    {stale ? <p className="gx-fantasy-warning" role="status">Stale snapshot: the source is more than 7 days old.</p> : null}
    {snapshot && !Number.isFinite(Date.parse(snapshot.asOf)) ? <p className="gx-fantasy-warning">Source freshness is unavailable.</p> : null}
    <div className="gx-fantasy-filters" aria-label="Fantasy rankings filters" role="group">
      <Segmented label="Ranking period" options={SCOPE_OPTIONS} value={filters.scope} onChange={value => update('scope', value)}/>
      <div className="gx-fantasy-filter-grid">
        <Field name="Season" value={selectedSeason} onChange={season => choose(entries.find(entry => entry.season === Number(season))?.key)} options={seasons.map(s => ({ value: s, label: s }))}/>
        <Field name="Week" value={chosen} onChange={choose} options={entries.filter(e => e.season === selectedSeason).map(e => ({ value: e.key, label: `Week ${e.week}` }))}/>
        <Field name="Scoring" value={filters.scoring} onChange={value => update('scoring', value)} options={SCORING_OPTIONS}/>
        <Field name="Position" value={filters.position} onChange={value => update('position', value)} options={POSITION_OPTIONS}/>
      </div>
      <details className="gx-tr-details" data-fantasy="more-filters"><summary className="gx-t-strong">More filters</summary>
        <div className="gx-fantasy-filters">
          <div className="gx-fantasy-filter-grid">
            <Field name="Passing touchdowns" value={filters.passingTds} onChange={value => update('passingTds', Number(value))} options={[{ value: 4, label: '4 points' }, { value: 6, label: '6 points' }]}/>
            <Field name="Team" value={filters.team} onChange={value => update('team', value)} options={[{ value: 'ALL', label: 'All teams' }, ...(rankings?.teams || []).map(team => ({ value: team, label: team }))]}/>
          </div>
          <FindPlayer value={filters.search} onChange={value => update('search', value)}/>
          <Switch label="Strong trends only" sub={`Usage or scoring changes entering Week ${selectedWeek}.`} checked={filters.trendsOnly} onChange={value => update('trendsOnly', value)}/>
          <Button variant="secondary" onClick={reset}>Reset filters</Button>
        </div>
      </details>
    </div>
    {state?.status === 'loading' && <p className="gx-t-body" role="status">Loading Week {selectedWeek} rankings…</p>}
    {state?.status === 'missing' && <div className="gx-vstack gx-gap-8"><p className="gx-t-body">No fantasy snapshot is available for {selectedSeason} Week {selectedWeek}.</p><Button variant="secondary" onClick={state.retry}>Check again</Button></div>}
    {state?.status === 'error' && <div className="gx-vstack gx-gap-8"><p className="gx-t-body" role="alert">Week {selectedWeek} rankings could not be loaded.</p><Button variant="secondary" onClick={state.retry}>Try again</Button></div>}
    {snapshot && <>
      <ul className="gx-nest-grid" aria-label="Fantasy tools">
        {filters.scope === 'weekly' && state.review ? <li><button type="button" className="gx-nest-tile" data-fantasy="report" onClick={() => onLayer({ fantasyLayer: 'report', fantasyPlayer: null })}>
          <span className="gx-nest-tile-label">Week {state.review.week} report card</span><span className="gx-n-m gx-nest-num">{state.review.status}</span>
          <span className="gx-t-meta">How close the estimates were</span></button></li> : null}
        <li><button type="button" className="gx-nest-tile" data-fantasy="compare" onClick={() => onLayer({ fantasyLayer: 'compare', fantasyPlayer: null })}>
          <span className="gx-nest-tile-label">Compare players</span><span className="gx-n-m gx-nest-num">{compareIds.length}</span>
          <span className="gx-t-meta">of {MAX_COMPARE} chosen</span></button></li>
      </ul>
      {filters.scope === 'weekly' && state?.origin === 'hosted' && !state.review && snapshot.week > 2 ? <p className="gx-t-meta">Not graded: no estimate was published for Week {snapshot.week - 1}.</p> : null}
      <section className="gx-fantasy-results" aria-label="Player rankings">
        <div className="gx-fantasy-results-heading"><h3 className="gx-t-label gx-c-2">Player rankings</h3><span className="gx-t-meta" role="status" aria-live="polite">{rankings.error ? 'Unavailable' : `${rows.length} players`}</span></div>
        {rankings.error ? <div className="gx-vstack gx-gap-8"><p className="gx-t-body" role="alert">{rankings.error}</p><Button variant="secondary" onClick={state.retry}>Try again</Button></div>
          : rows.length ? <><ol className="gx-nest-list gx-fantasy-players" aria-label="Ranked players">{rows.slice(0, limit).map(p => <PlayerRow key={p.id} player={p} scope={filters.scope} position={filters.position} context={contextFor(p)}
            onOpen={() => onLayer({ fantasyLayer: 'player', fantasyPlayer: p.id })}/>)}</ol>
            {rows.length > limit ? <Button variant="secondary" onClick={() => setLimit(n => n + FANTASY_PAGE)}>Show more players ({rows.length - limit} left)</Button> : null}</>
          : <div className="gx-vstack gx-gap-8"><p className="gx-t-body">{filters.position === 'DST' ? 'Defense and special teams rankings are unavailable: this source does not include a verified scoring model for D/ST.' : snapshot.players.length === 0 ? 'This snapshot has no eligible player statistics yet.' : 'No players match these filters.'}</p><Button variant="secondary" onClick={reset}>Reset filters</Button></div>}
        {!rankings.error ? <p className="gx-t-meta">All positions · {rankings.summary.ranked} ranked · {rankings.summary.byes} bye · {rankings.summary.unavailable} unestimated</p> : null}
      </section>
    </>}
    {profile}
  </Nest></section>;
}
