import { communityApi } from '../../api.js';
import { pickText, show } from '../../communityFormat.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, Segmented, TeamMark } from '../ui/index.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { fmtFull } from '../format.js';
import { SCORE_MARKETS, lateLabel, modeOf, number, ownEntry, scoreRows, scoreSummary } from './scoring.js';
import './scores.css';

export function WeeklyScore() {
  const app = useAppData(), shell = useShell(), view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : null;
  const read = useLeagueRead(`${app.accountId}:score:${season ?? 'latest'}`, signal => communityApi('history', season ? { season } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); });
  if (read.loading) return <PlayLoading>Loading your weekly score…</PlayLoading>;
  if (read.error) return <PlayFailure what="Your weekly score" error={read.error} onRetry={read.retry}/>;
  return <WeeklyScoreContent data={read.data} view={view} onChange={patch => shell.setView('play', patch)} onRefresh={read.retry} onPicks={patch => shell.setView('play', { ...patch, section: 'picks' })}/>;
}

export function WeeklyScoreContent({ data, view, onChange, onRefresh, onPicks }) {
  const weeks = (data.weeks || []).slice().sort((a, b) => b.week - a.week);
  const weekNumber = Number.isInteger(view.week) ? view.week : weeks[0]?.week;
  const week = weeks.find(item => item.week === weekNumber), mode = modeOf(view.market), entry = ownEntry(week, data.viewer, mode);
  const filters = { team: view.team || '', matchup: view.matchup || '' }, filtered = Boolean(filters.team || filters.matchup);
  const rows = scoreRows(week, entry, filters), summary = scoreSummary(rows);
  const teams = [...new Set((week?.games || []).flatMap(game => [game.awayCode, game.homeCode]))].sort();
  const index = weeks.findIndex(item => item.week === weekNumber);
  const points = entry?.eligible === false ? null : filtered ? summary.points : number(entry?.weekPoints);
  const immediate = entry?.scoreTiming === 'immediate';
  return <section className="gx-score gx-vstack gx-gap-16" aria-label="Your weekly score">
    <Button onClick={() => onChange({ section: 'compare' })}>Compare players</Button>
    <div className="gx-score-filters">
      <label className="gx-t-body">Season<select className="gx-input" value={data.season ?? ''} onChange={event => onChange({ season: Number(event.target.value), week: null, matchup: '' })}>{(data.seasons || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="gx-t-body">Week<select className="gx-input" value={weekNumber ?? ''} onChange={event => onChange({ week: Number(event.target.value), matchup: '' })}>{Number.isInteger(weekNumber) && !week && <option value={weekNumber}>Week {weekNumber} · no record</option>}{weeks.map(item => <option key={item.week} value={item.week}>Week {item.week}</option>)}</select></label>
    </div>
    <div className="gx-score-navigation"><Button disabled={index < 0 || index === weeks.length - 1} onClick={() => onChange({ week: weeks[index + 1].week, matchup: '' })}>Previous week</Button><Button disabled={index <= 0} onClick={() => onChange({ week: weeks[index - 1].week, matchup: '' })}>Next week</Button></div>
    <Segmented label="Score market" options={SCORE_MARKETS} value={mode} onChange={market => onChange({ market })}/>
    <Card as="section" className="gx-vstack gx-gap-12" aria-label="Personal score summary">
      <h2 className="gx-t-section">{filtered ? 'Selected games' : 'Your weekly points'}</h2>
      <p className="gx-n-l" aria-live="polite">{points === null ? '—' : show(points)}<span className="gx-t-body"> points</span></p>
      <p className="gx-t-body gx-c-2">{summary.scored} scored · {summary.locked} locked · {summary.remaining} not locked{filtered ? ' in this selection' : ''}</p>
      <p className="gx-t-meta gx-c-2">{summary.pending} waiting for a line · {summary.ineligible} ineligible</p>
      {!entry && <p className="gx-t-body">No saved {mode === 'guess_total' ? 'Total' : 'Spread'} guesses for this week.</p>}
      {entry && <p className="gx-t-body gx-c-2">{immediate ? 'Your eligible locked guesses count immediately.' : 'This saved history uses the scoring timing active for that week.'}</p>}
      {filtered && <p className="gx-t-meta gx-c-2">A filtered subset. Filters do not change the whole-week standings or create a new rank.</p>}
    </Card>
    {entry && !filtered && <details className="gx-score-detail"><summary className="gx-t-strong">Standings · games started</summary><div className="gx-vstack gx-gap-8"><p className="gx-t-body">{show(entry.standingsPoints ?? (immediate ? null : entry.weekPoints))} points in shared standings</p>{immediate && <p className="gx-t-body">{show(entry.awaitingKickoffPoints)} personal points waiting for kickoff</p>}<p className="gx-t-body gx-c-2">Every player, including you, uses the same games that have started. A week in progress is not a final weekly win.</p></div></details>}
    <details className="gx-score-detail" open={filtered}><summary className="gx-t-strong">Filter games{filtered ? ' · active' : ''}</summary><div className="gx-vstack gx-gap-12">
      <label className="gx-t-body">Team<select className="gx-input" value={filters.team} onChange={event => onChange({ team: event.target.value })}><option value="">All teams</option>{filters.team && !teams.includes(filters.team) && <option value={filters.team}>{filters.team} · not this week</option>}{teams.map(team => <option key={team} value={team}>{team}</option>)}</select></label>
      <label className="gx-t-body">Matchup<select className="gx-input" value={filters.matchup} onChange={event => onChange({ matchup: event.target.value })}><option value="">All matchups</option>{(week?.games || []).map(game => <option key={game.id} value={game.id}>{game.awayCode} at {game.homeCode}</option>)}</select></label>
      <Button disabled={!filtered} onClick={() => onChange({ team: '', matchup: '' })}>Clear filters</Button>
    </div></details>
    {!week ? <PlayEmpty>No scoring record for this week. Choose another week.</PlayEmpty> : !rows.length ? <PlayEmpty>No games match both filters. Clear filters to see this week.</PlayEmpty> : rows.map(row => <details className="gx-score-detail" key={`${week.season}:${week.week}:${mode}:${row.game.id}`} open={view.scoreGame === row.game.id} onToggle={event => { if (event.newState === 'open' && view.scoreGame !== row.game.id) onChange({ scoreGame: row.game.id }); }}>
      <summary><span className="gx-score-matchup"><TeamMark code={row.game.awayCode} size={24} decorative/><span className="gx-t-strong">{row.game.awayCode} at {row.game.homeCode}</span><TeamMark code={row.game.homeCode} size={24} decorative/></span><span className="gx-t-body">{row.points === null ? row.status : `${show(row.points)} / 10 points`}</span></summary>
      <div className="gx-vstack gx-gap-8"><p className="gx-t-meta gx-c-2">Kickoff {fmtFull(row.game.kickoff)}</p><p className="gx-t-body">Your guess · {row.hidden ? 'Hidden' : pickText(mode, row.game.awayCode, row.game.homeCode, row.guess)}</p>
        {row.locked && <p className="gx-t-meta gx-c-2">Locked in {fmtFull(row.pick?.lockedAt || entry?.submittedAt)}{row.pick?.late ? ` · ${lateLabel(row.pick.late)}` : ''}</p>}
        {row.reference && <><p className="gx-t-body">Saved line · {pickText(mode, row.game.awayCode, row.game.homeCode, row.reference.value)}</p><p className="gx-t-meta gx-c-2">{row.reference.source || 'Source unavailable'}{row.reference.observedAt ? ` · ${fmtFull(row.reference.observedAt)}` : ''}</p>{number(row.reference.value) !== null && row.guess !== null && <p className="gx-t-body">Missed by {show(Math.abs(row.guess - row.reference.value))} points</p>}</>}
        <p className="gx-t-body">{row.status}</p>{row.reference?.reason && <p className="gx-t-meta gx-c-2">{row.reference.reason}</p>}
      </div>
    </details>)}
    <div className="gx-score-navigation"><Button onClick={onRefresh}>Refresh scores</Button>{week && <Button onClick={() => onPicks({ season: week.season, week: week.week, market: mode })}>View this week’s picks</Button>}</div>
  </section>;
}
