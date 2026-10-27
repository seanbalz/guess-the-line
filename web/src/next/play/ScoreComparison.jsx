import { leagueApi } from '../../api.js';
import { pickText, show } from '../../communityFormat.js';
import { buildComparison, comparisonRows } from '../../../../shared/score-comparison.mjs';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { Button, Card, Segmented } from '../ui/index.js';
import { fmtFull } from '../format.js';
import { modeOf, SCORE_MARKETS } from './scoring.js';
import './scores.css';
import './comparison.css';

export function ScoreComparison() {
  const app = useAppData(), shell = useShell(), view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : app.community.data?.week?.season;
  const leagueId = app.league?.community === false ? app.league.id : null;
  const key = `${app.accountId}:comparison:${leagueId ?? 'community'}:${season ?? 'latest'}`;
  const read = useLeagueRead(key, signal => leagueApi('comparison', { ...(season ? { season } : {}), ...(leagueId ? { leagueId } : {}) }, signal), error => { if (error.status === 401) app.requestSignIn(); });
  if (read.loading) return <PlayLoading>Loading comparisons…</PlayLoading>;
  if (read.error) return <PlayFailure what="Comparisons" error={read.error} onRetry={read.retry}/>;
  return <ComparisonContent key={key} data={read.data} currentWeek={season === app.community.data?.week?.season ? app.community.data.week.week : null} scopeName={app.league?.name || 'Community'} view={view}
    onChange={patch => shell.setView('play', patch)} onRefresh={read.retry}/>;
}
export function ComparisonContent({ data, currentWeek, scopeName, view, onChange, onRefresh }) {
  const weeks = [...new Set((data.weeks || []).map(w => w.week))].sort((a,b) => a-b);
  const week = view.week ?? currentWeek ?? weeks.at(-1), mode = modeOf(view.market);
  const period = ['range','season'].includes(view.period) ? view.period : 'week';
  const from = period === 'season' ? null : period === 'range' ? view.from ?? weeks[0] : week;
  const to = period === 'season' ? null : period === 'range' ? view.to ?? currentWeek ?? weeks.at(-1) : week;
  const members = data.members || [], others = members.filter(m => m.id !== data.viewer);
  // A changed private scope cannot reuse selections from outside that roster.
  const ids = (view.players || []).filter(id => others.some(m => m.id === id));
  const all = view.comparisonKind !== 'selected';
  const rows = comparisonRows(data, mode), filters = { season: data.season, from, to, team: view.team || '', matchup: view.matchup || '' };
  const result = buildComparison({ rows, selection: { viewer: data.viewer, kind: all ? 'all' : 'selected', players: ids }, filters });
  const name = id => id === data.viewer ? 'You' : members.find(m => m.id === id)?.displayName || 'Member';
  const teams = [...new Set(rows.flatMap(row => [row.game.awayCode,row.game.homeCode]))].sort();
  const games = [...new Map(rows.map(row => [row.game.id,row.game])).values()];
  const weekOptions = value => [...new Set([...weeks, ...(value ? [value] : [])])].sort((a,b) => a-b).map(w => <option key={w} value={w}>Week {w}</option>);
  return <section className="gx-score gx-vstack gx-gap-16" aria-label="Score comparisons">
    <p className="gx-t-body gx-c-2">{scopeName} · Filtered comparisons, separate from official standings. Spread and Total stay separate. Each guess uses its own saved scoring line.</p>
    <Segmented label="Comparison market" options={SCORE_MARKETS} value={mode} onChange={market => onChange({ market })}/>
    <div className="gx-score-filters">
      <label className="gx-t-body">Season<select className="gx-input" value={data.season ?? ''} onChange={e => onChange({ season: Number(e.target.value), week: null, from: null, to: null, matchup: '' })}>{data.seasons.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <label className="gx-t-body">Period<select className="gx-input" value={period} onChange={e => onChange({ period: e.target.value })}><option value="week">Single week</option><option value="range">Week range</option><option value="season">Full season</option></select></label>
      {period === 'week' && <label className="gx-t-body">Week<select className="gx-input" value={week ?? ''} onChange={e => onChange({ week: Number(e.target.value) })}>{weekOptions(week)}</select></label>}
      {period === 'range' && <><label className="gx-t-body">From week<select className="gx-input" value={from ?? ''} onChange={e => onChange({ from: Number(e.target.value) })}>{weekOptions(from)}</select></label><label className="gx-t-body">Through week<select className="gx-input" value={to ?? ''} onChange={e => onChange({ to: Number(e.target.value) })}>{weekOptions(to)}</select></label></>}
      <label className="gx-t-body">Team<select className="gx-input" value={filters.team} onChange={e => onChange({ team: e.target.value })}><option value="">All teams</option>{teams.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="gx-t-body">Matchup<select className="gx-input" value={filters.matchup} onChange={e => onChange({ matchup: e.target.value })}><option value="">All matchups</option>{games.map(g => <option key={g.id} value={g.id}>{g.awayCode} at {g.homeCode}</option>)}</select></label>
    </div>
    <Segmented label="Compare with" value={all ? 'all' : 'selected'} options={[{ value: 'all', label: 'All players' }, { value: 'selected', label: 'Choose players' }]} onChange={comparisonKind => onChange({ comparisonKind })}/>
    {!all && <fieldset className="gx-compare-members"><legend className="gx-t-strong">Select one or more players</legend>{others.map(member => <label key={member.id} className="gx-t-body"><input type="checkbox" checked={ids.includes(member.id)} onChange={e => onChange({ players: e.target.checked ? [...ids,member.id] : ids.filter(id => id !== member.id) })}/>{member.displayName}{member.removed ? ' · former member' : ''}</label>)}</fieldset>}
    <Card className="gx-vstack gx-gap-8"><h2 className="gx-t-section">Common scored games</h2>
      <p className="gx-t-body">{result.games.length} included · {result.excluded} excluded of {result.considered} games in these filters</p>
      <p className="gx-t-body gx-c-2">{all ? 'You plus at least one other eligible member per game. Contributors can vary.' : 'Only games scored and revealed for you and every selected player.'} Hidden, pending, missing and ineligible scores never count as zero.</p>
      <p className="gx-t-body">Benchmark: {show(result.benchmark)} points per game, including you.</p>
      <p className="gx-t-meta gx-c-2">Each game has equal weight in the benchmark. Games keep their original competition week, including Monday games. These filters never create an official rank. Tables scroll sideways when needed.</p>
    </Card>
    {from !== null && to !== null && from > to && <p className="gx-t-body" role="alert">Choose a through week at or after the from week.</p>}
    {!all && !ids.length ? <PlayEmpty>Select at least one other player.</PlayEmpty> : !result.games.length ? <PlayEmpty>No common scored games yet. Try another week or player.</PlayEmpty> : <>
      <div className="gx-compare-table" role="region" aria-label="Comparison summaries" tabIndex={0}><table><caption className="gx-t-strong">Selected sample · player totals</caption><thead><tr><th scope="col">Player</th><th scope="col">Points</th><th scope="col">Games</th><th scope="col">Points/game</th></tr></thead><tbody>{result.players.map(p => <tr key={p.userId}><th scope="row">{name(p.userId)}</th><td>{show(p.points)}</td><td>{p.games}</td><td>{show(p.average)}</td></tr>)}</tbody></table></div>
      {all && <p className="gx-t-meta gx-c-2">Player sample sizes may differ. Use Choose players for the same games across everyone selected.</p>}
      <Card className="gx-vstack gx-gap-12"><h2 className="gx-t-section">Points per game by week</h2>{result.trend.map(row => <div key={row.week} className="gx-vstack gx-gap-4"><p className="gx-t-body">Week {row.week} · {row.games} common games</p><label className="gx-t-body">You · {show(row.mine)}<meter min="0" max="10" value={row.mine} aria-label={`Week ${row.week}, your average`}/></label><label className="gx-t-body">Benchmark · {show(row.benchmark)}<meter min="0" max="10" value={row.benchmark} aria-label={`Week ${row.week}, benchmark average`}/></label></div>)}</Card>
      {result.games.map(row => <Card key={row.key} as="section" className="gx-vstack gx-gap-8"><h2 className="gx-t-section">Week {row.week} · {row.game.awayCode} at {row.game.homeCode}</h2><p className="gx-t-meta">{row.contributors} contributors including you · benchmark {show(row.benchmark)} points</p>
        <div className="gx-compare-table" role="region" aria-label={`${row.game.id} comparison`} tabIndex={0}><table><caption className="gx-t-meta">Scored, revealed guesses</caption><thead><tr><th scope="col">Player</th><th scope="col">Guess</th><th scope="col">Saved line</th><th scope="col">Points</th></tr></thead><tbody>{row.players.map(p => <tr key={p.userId}><th scope="row">{name(p.userId)}</th><td>{pickText(mode,row.game.awayCode,row.game.homeCode,p.guess)}</td><td>{pickText(mode,row.game.awayCode,row.game.homeCode,p.reference.value)}</td><td>{show(p.points)}</td></tr>)}</tbody></table></div>
        <details className="gx-score-detail"><summary className="gx-t-strong">Saved line sources</summary>{row.players.map(p => <p key={p.userId} className="gx-t-meta">{name(p.userId)} · {p.reference.source || 'Source unavailable'} · {fmtFull(p.reference.observedAt)}</p>)}</details></Card>)}
    </>}
    <Button onClick={onRefresh}>Refresh comparisons</Button>
  </section>;
}
