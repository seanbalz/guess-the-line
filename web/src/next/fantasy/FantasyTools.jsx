// Fantasy player tools (queue Q12–Q14) in the new app: a player profile sheet (usage, actual points, averages with
// samples, GTL's separate pace estimate and opponent context) and a 2–3 player comparison in one scoring format and
// one period. Everything is derived from the loaded public snapshot by shared/fantasy-tools.mjs; missing shows "—".
import { useId, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { SCORING_OPTIONS, formatFantasyNumber as number } from '../../../../shared/fantasy-rankings.mjs';
import { COMPARE_PERIODS, MAX_COMPARE, USAGE_METRICS, comparePlayers, playerProfile, searchPlayers } from '../../../../shared/fantasy-tools.mjs';
import { Button, Card, IconButton, Segmented, Sheet } from '../ui/index.js';

const label = (options, value) => options.find(option => option.value === value)?.label ?? value;
const games = n => `${n} ${n === 1 ? 'game' : 'games'}`;
const weeksText = ([from, to]) => from === to ? `Week ${to}` : `Weeks ${from}–${to}`;
const plural = { QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs' };
function Value({ value, missing = 'not recorded', whole = false }) {
  const text = whole && Number.isInteger(value) ? String(value) : number(value);
  return text === '—' ? <><span aria-hidden="true">—</span><span className="gx-sr-only">{missing}</span></> : text;
}

function CompareToggle({ player, compared, full, onCompare }) {
  return <>
    <Button variant="ghost" icon={compared ? Minus : Plus} aria-pressed={compared ? 'true' : 'false'} disabled={!compared && full}
      onClick={() => onCompare(player.id)} aria-label={`${compared ? 'Remove from compare' : 'Add to compare'}: ${player.name}`}>{compared ? 'Remove from compare' : 'Add to compare'}</Button>
    {!compared && full && <p className="gx-t-meta">Comparison is full ({MAX_COMPARE} players). Remove one to add another.</p>}
  </>;
}

/** The two actions in an opened player card: open the profile, and add to or remove from the comparison. */
export function PlayerToolButtons({ player, compared, full, onProfile, onCompare }) {
  return <div className="gx-fantasy-tool-actions">
    <Button variant="secondary" onClick={() => onProfile(player.id)} aria-label={`Usage & production: ${player.name}`}>Usage &amp; production</Button>
    <CompareToggle player={player} compared={compared} full={full} onCompare={onCompare}/>
  </div>;
}

function WeeklyChart({ weeks }) {
  const top = Math.max(1, ...weeks.map(row => row.points ?? 0));
  const describe = row => row.status === 'bye' ? `Week ${row.week}: bye` : row.status === 'none' ? `Week ${row.week}: no recorded stats`
    : `Week ${row.week}: ${number(row.points) === '—' ? 'points unavailable' : `${number(row.points)} points`}`;
  return <div className="gx-fantasy-chart" role="img" aria-label={`Actual fantasy points by week. ${weeks.map(describe).join('; ')}.`}>
    {weeks.map(row => <span key={row.week} className="gx-fantasy-chart-col" aria-hidden="true">
      <span className="gx-fantasy-chart-track">{row.points !== null && <span className={row.points < 0 ? 'gx-fantasy-chart-bar gx-fantasy-chart-bar--neg' : 'gx-fantasy-chart-bar'} style={{ height: `${Math.max(2, (Math.max(0, row.points) / top) * 100)}%` }}></span>}</span>
      <span className="gx-fantasy-chart-week">{weeks.length <= 9 || row.week % 2 ? row.week : ''}</span>
    </span>)}
  </div>;
}

function Averages({ summary }) {
  const recentLabel = weeksText([summary.recentFrom, summary.through]);
  const rows = [{ key: 'points', label: 'Fantasy points', read: part => part.points }, ...USAGE_METRICS.map(metric => ({ key: metric.key, label: metric.label, read: part => part.usage[metric.key] }))];
  return <div className="gx-fantasy-table-wrap"><table className="gx-fantasy-table">
    <caption className="gx-sr-only">Per-game averages from recorded games, season and last three weeks</caption>
    <thead><tr><th scope="col">Per game</th><th scope="col">Season<span className="gx-fantasy-th-sub">{games(summary.season.games)}</span></th><th scope="col">Last 3 weeks<span className="gx-fantasy-th-sub">{recentLabel} · {games(summary.recent.games)}</span></th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.label}</th>
      {[summary.season, summary.recent].map((part, index) => { const value = row.read(part); return <td key={index}><Value value={value.value}/>{value.games !== part.games && <span className="gx-fantasy-n">n = {value.games}</span>}</td>; })}
    </tr>)}</tbody>
  </table></div>;
}

function Opponent({ profile, scoringLabel }) {
  const { matchup, player, estimate } = profile;
  if (!matchup) return <p className="gx-t-body gx-c-2">{estimate.status === 'bye' ? 'Bye this week: no opponent.'
    : !['QB', 'RB', 'WR', 'TE'].includes(player.position) ? 'Opponent history covers QB, RB, WR and TE.'
    : !profile.byeKnown ? 'Opponent history is not included in this snapshot.' : 'The upcoming opponent is not confirmed.'}</p>;
  return <>
    <p className="gx-t-body">{matchup.home ? 'vs' : '@'} {matchup.defense}: what this defense allowed to {plural[matchup.position]} in its completed games ({scoringLabel}).</p>
    <dl className="gx-fantasy-facts">
      <div><dt>Season per game</dt><dd><Value value={matchup.season.value} missing="no games"/></dd><dd className="gx-fantasy-n">{games(matchup.season.games)}</dd></div>
      <div><dt>Last 3 games</dt><dd><Value value={matchup.recent.value} missing="no games"/></dd><dd className="gx-fantasy-n">{games(matchup.recent.games)}</dd></div>
      <div><dt>All defenses</dt><dd><Value value={matchup.league.value} missing="no games"/></dd><dd className="gx-fantasy-n">{matchup.league.games} team games</dd></div>
    </dl>
    {matchup.games.length > 0 && <div className="gx-fantasy-table-wrap"><table className="gx-fantasy-table">
      <caption className="gx-sr-only">Fantasy points {matchup.defense} allowed to {plural[matchup.position]} by week</caption>
      <thead><tr><th scope="col">Week</th><th scope="col">Offense</th><th scope="col">Pts allowed</th></tr></thead>
      <tbody>{matchup.games.map(game => <tr key={game.week}><th scope="row">{game.week}</th><td>{game.offense}</td><td><Value value={game.points}/></td></tr>)}</tbody>
    </table></div>}
    <p className="gx-t-meta">Descriptive totals of every {matchup.position} on the opposing offense, from the same nflverse statistics as the snapshot. Not a prediction or a matchup grade.</p>
  </>;
}

export function PlayerProfileSheet({ snapshot, playerId, settings, onClose, compare }) {
  const profile = playerProfile(snapshot, playerId, settings);
  if (!profile) return null;
  const { player, weeks, summary, estimate } = profile, scoringLabel = label(SCORING_OPTIONS, settings.scoring);
  const usageCell = (row, key) => <Value value={row.usage[key]} whole/>;
  return <Sheet title={player.name} onClose={onClose} tall className="gx-fantasy-profile">
    <p className="gx-t-meta">{player.team} · {player.position}{player.status ? ` · ${player.status}` : ''}</p>
    <p className="gx-t-meta">{scoringLabel} · {settings.passingTds}-point passing TDs · Stats through Week {snapshot.statsThroughWeek}</p>
    {compare && <div className="gx-fantasy-tool-actions"><CompareToggle player={player} {...compare}/></div>}
    <section className="gx-vstack gx-gap-12" aria-labelledby={`${player.id}-observed`}>
      <h3 className="gx-t-section" id={`${player.id}-observed`}>Observed production</h3>
      <p className="gx-t-meta">Completed games only. {games(summary.season.games)} recorded{profile.byeKnown ? '' : '; byes are not marked in this snapshot'}.</p>
      {weeks.length ? <WeeklyChart weeks={weeks}/> : <p className="gx-t-body">No completed weeks yet.</p>}
      {weeks.length > 0 && <div className="gx-fantasy-table-wrap"><table className="gx-fantasy-table">
        <caption className="gx-sr-only">Usage and actual fantasy points by week</caption>
        <thead><tr><th scope="col">Wk</th>{USAGE_METRICS.map(metric => <th scope="col" key={metric.key}><abbr title={metric.label}>{metric.short}</abbr></th>)}<th scope="col">Pts</th></tr></thead>
        <tbody>{weeks.map(row => <tr key={row.week}><th scope="row">{row.week}</th>
          {row.status === 'played' ? <>{USAGE_METRICS.map(metric => <td key={metric.key}>{usageCell(row, metric.key)}</td>)}<td className="gx-fantasy-pts"><Value value={row.points}/></td></>
            : <td colSpan={USAGE_METRICS.length + 1} className="gx-fantasy-gap">{row.status === 'bye' ? 'Bye' : 'No recorded stats'}</td>}
        </tr>)}</tbody>
      </table></div>}
      <Averages summary={summary}/>
    </section>
    <Card variant="s2" as="section" className="gx-vstack gx-gap-8" aria-labelledby={`${player.id}-estimate`}>
      <h3 className="gx-t-section" id={`${player.id}-estimate`}>GTL pace estimate</h3>
      <p className="gx-t-meta">An estimate from {games(estimate.sampleGames)} of recorded pace, not an observed result or expert projection.</p>
      {estimate.status === 'bye' ? <p className="gx-t-body">Bye in Week {snapshot.week}.</p>
        : estimate.week ? <dl className="gx-fantasy-facts">
          <div><dt>Week {snapshot.week}{estimate.opponent ? ` ${estimate.opponent}` : ''}</dt><dd><Value value={estimate.week.points} missing="unavailable"/></dd><dd className="gx-fantasy-n">est. points</dd></div>
          {USAGE_METRICS.map(metric => <div key={metric.key}><dt>{metric.label}</dt><dd><Value value={estimate.week.usage[metric.key]} missing="unavailable"/></dd></div>)}
        </dl> : <p className="gx-t-body">No Week {snapshot.week} estimate (fewer than two recorded games, an unconfirmed kickoff, or reported Out or Doubtful).</p>}
      {estimate.restOfSeason && <p className="gx-t-body">Rest of season: <strong><Value value={estimate.restOfSeason.points} missing="unavailable"/></strong> est. points over {games(estimate.restOfSeason.games)} scheduled.</p>}
    </Card>
    <section className="gx-vstack gx-gap-8" aria-labelledby={`${player.id}-opponent`}>
      <h3 className="gx-t-section" id={`${player.id}-opponent`}>Opponent context</h3>
      <Opponent profile={profile} scoringLabel={scoringLabel}/>
    </section>
  </Sheet>;
}

function ComparePicker({ snapshot, ids, onChange }) {
  const [query, setQuery] = useState(''), id = useId();
  const matches = ids.length < MAX_COMPARE ? searchPlayers(snapshot, query, ids, 6) : [];
  return <div className="gx-vstack gx-gap-8">
    {ids.length < MAX_COMPARE && <div className="gx-fantasy-field"><label htmlFor={id}>Add a player</label>
      <input id={id} type="search" placeholder="Name, team or position" value={query} onChange={event => setQuery(event.target.value)}/></div>}
    {matches.length > 0 && <ul className="gx-fantasy-pick-list" aria-label="Matching players">{matches.map(player => <li key={player.id}>
      <Button variant="ghost" icon={Plus} onClick={() => { onChange([...ids, player.id]); setQuery(''); }} aria-label={`Add to compare: ${player.name} · ${player.team} ${player.position}`}>{player.name} · {player.team} {player.position}</Button>
    </li>)}</ul>}
    {query.trim() && !matches.length && ids.length < MAX_COMPARE && <p className="gx-t-meta" role="status">No players match.</p>}
  </div>;
}

export function PlayerCompare({ snapshot, ids, onChange, settings, onProfile, initialPeriod = 'season' }) {
  const [scoring, setScoring] = useState(settings.scoring), [period, setPeriod] = useState(initialPeriod);
  const chosen = ids.map(id => snapshot.players.find(player => player.id === id)).filter(Boolean);
  const result = comparePlayers(snapshot, ids, { ...settings, scoring }, period), estimate = period === 'week';
  const scoringLabel = label(SCORING_OPTIONS, scoring);
  const metric = (row, key) => <><Value value={row.usage[key]} missing="unavailable"/>{!estimate && row.usageGames[key] !== row.games && <span className="gx-fantasy-n">n = {row.usageGames[key]}</span>}</>;
  return <Card as="section" className="gx-vstack gx-gap-12 gx-fantasy-compare" aria-labelledby="gx-fantasy-compare-title">
    <h2 className="gx-t-section" id="gx-fantasy-compare-title">Compare players</h2>
    <p className="gx-t-meta">Pick 2–{MAX_COMPARE} players of any position: open a player and choose Compare, or search here.</p>
    {chosen.length > 0 && <ul className="gx-fantasy-chosen" aria-label="Players in comparison">{chosen.map(player => <li key={player.id}>
      <button type="button" className="gx-fantasy-chosen-name" onClick={() => onProfile(player.id)}>{player.name} <span className="gx-t-meta">{player.team} {player.position}</span><span className="gx-sr-only">, usage and production</span></button>
      <IconButton icon={X} size={18} label={`Remove ${player.name} from comparison`} onClick={() => onChange(ids.filter(id => id !== player.id))}/>
    </li>)}</ul>}
    <ComparePicker snapshot={snapshot} ids={ids} onChange={onChange}/>
    {chosen.length >= 2 && <>
      <Segmented label="Comparison scoring" options={SCORING_OPTIONS} value={scoring} onChange={setScoring}/>
      <Segmented label="Comparison period" options={COMPARE_PERIODS} value={period} onChange={setPeriod}/>
      <p className="gx-t-meta" role="status">{scoringLabel} · {settings.passingTds}-point passing TDs · {estimate ? `Week ${snapshot.week} GTL pace estimate, not a result` : `Observed per game · ${period === 'recent' ? 'last 3 weeks, ' : ''}${weeksText(result.weeks)}`}</p>
      <div className="gx-fantasy-table-wrap" role="region" aria-label="Player comparison data" tabIndex={0}><table className="gx-fantasy-table gx-fantasy-compare-table">
        <caption className="gx-sr-only">Player comparison, {scoringLabel}, {estimate ? `Week ${snapshot.week} estimate` : `per game, ${weeksText(result.weeks)}`}</caption>
        <thead><tr><th scope="col"><span className="gx-sr-only">Measure</span></th>{result.rows.map(row => <th scope="col" key={row.id}>{row.name}<span className="gx-fantasy-th-sub">{row.team} {row.position}</span></th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">{estimate ? 'Est. points' : 'Points / game'}</th>{result.rows.map(row => <td key={row.id} className="gx-fantasy-pts">{estimate && row.status === 'bye' ? 'Bye' : <Value value={row.points} missing="unavailable"/>}</td>)}</tr>
          <tr><th scope="row">{estimate ? 'Pace sample' : 'Games'}</th>{result.rows.map(row => <td key={row.id}>{games(row.games)}{!estimate && row.pointsGames !== row.games && <span className="gx-fantasy-n">pts n = {row.pointsGames}</span>}</td>)}</tr>
          {estimate && <tr><th scope="row">Opponent</th>{result.rows.map(row => <td key={row.id}>{row.status === 'bye' ? 'Bye' : row.opponent ?? '—'}</td>)}</tr>}
          {USAGE_METRICS.map(item => <tr key={item.key}><th scope="row">{item.label}</th>{result.rows.map(row => <td key={row.id}>{metric(row, item.key)}</td>)}</tr>)}
        </tbody>
      </table></div>
      <p className="gx-t-meta">{estimate ? 'Estimates extend recorded pace; they are not observed production.' : `Averages of recorded games only; byes and games without stats are not counted as zero.`}</p>
    </>}
  </Card>;
}

/** The screen-level tools under the snapshot summary: the comparison card, and the profile sheet when one is open. */
export function FantasyTools({ snapshot, filters, profileId, onProfile, onCloseProfile, compareIds, onCompareChange, onCompare }) {
  const settings = { scoring: filters.scoring, passingTds: filters.passingTds };
  return <>
    <PlayerCompare key={`${snapshot.season}-${snapshot.week}-${filters.scoring}`} snapshot={snapshot} ids={compareIds} onChange={onCompareChange} settings={settings} onProfile={onProfile}/>
    {profileId && <PlayerProfileSheet snapshot={snapshot} playerId={profileId} settings={settings} onClose={onCloseProfile}
      compare={onCompare ? { compared: compareIds.includes(profileId), full: compareIds.length >= MAX_COMPARE, onCompare } : null}/>}
  </>;
}
