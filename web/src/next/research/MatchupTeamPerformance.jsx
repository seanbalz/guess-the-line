import { useState } from 'react';
import { Button, Card, InfoButton, Skeleton, TeamMark } from '../ui/index.js';
import { MarginChart } from '../teams/MarginChart.jsx';
import { pointsPerGame, teamOf, teamView } from '../teams/teamModel.js';
import { useAssessments } from './useAssessments.js';
import { ResearchTime } from './ResearchCards.jsx';
import './research.css';
import '../teams/teams.css';

/** Native team comparison, using the existing account/week/reveal-scoped observed-statistics read. */
export function MatchupTeamPerformance({ lines, gameId, sides, season, status }) {
  const [selected, setSelected] = useState(sides[0].code);
  const code = sides.some(side => side.code === selected) ? selected : sides[0].code;
  const read = useAssessments({ ...lines, gameId });
  const observed = read.data?.playStatistics?.find(game => game.gameId === gameId)?.teams.find(team => team.team === code);
  const view = teamView(season, code), ppg = pointsPerGame(teamOf(season, code));
  return <div className="gx-vstack gx-gap-16">
    <div className="gx-game-team-choice" role="group" aria-label="Team statistics">{sides.map(side => <Button key={side.code} data-team-choice={side.code} variant="secondary" aria-pressed={code === side.code} onClick={() => setSelected(side.code)}><TeamMark code={side.code} size={24} decorative/>{side.name ?? side.code}</Button>)}</div>
    <div className="gx-team-view gx-vstack gx-gap-16" data-team={code}>
      <div className="gx-r-context"><p className="gx-t-meta gx-c-2 gx-grow">{view?.through ?? 'Team record coverage unavailable'}</p><InfoButton title="About team performance" body={['Records and scoring averages count recorded finals only.', season?.source?.credit, season?.stale ? 'This copy may be behind the latest finals.' : null, season?.fallback ? 'Bundled records are shown; detailed game statistics are unavailable.' : null].filter(Boolean)} links={season?.source?.url ? [{ text: 'nflverse team records', url: season.source.url }] : []}/></div>
      {status === 'loading' ? <p className="gx-t-meta gx-c-2" role="status">Updating team records…</p> : null}
      <dl className="gx-r-team-stats">{[['Record', view?.record], ['Points scored / game', ppg?.scored], ['Points allowed / game', ppg?.allowed]].map(([label, value]) => <Card as="div" key={label}><dt className="gx-t-meta gx-c-2">{label}</dt><dd className="gx-n-m">{value ?? '—'}</dd></Card>)}</dl>
      <Card as="section" className="gx-vstack gx-gap-12" aria-label="Game-by-game margins"><h3 className="gx-t-section">Game-by-game margins</h3>
        {view?.margins.length ? <MarginChart key={code} series={view.margins} extent={view.extent}/> : <p className="gx-t-body gx-c-2">Game-by-game results are unavailable right now.</p>}
      </Card>
    </div>
    <Card as="section" className="gx-r-observed" aria-label="Observed play statistics">
      <h3 className="gx-t-section">Observed play statistics</h3>
      {read.status === 'loading' ? <Skeleton label="Loading observed play statistics…" shape="lines" count={3}/>
        : read.status === 'error' ? <div className="gx-vstack gx-gap-8"><p className="gx-t-body" role="status">Observed play statistics are unavailable right now.</p><Button variant="secondary" onClick={read.reload}>Retry play statistics</Button></div>
          : observed ? <>
            <p className="gx-t-meta gx-c-2">{observed.sampleGames ?? '—'} observed games · {observed.from ?? '—'} to {observed.to ?? '—'}</p>
            {observed.metrics.filter(metric => metric.id !== 'observed-sacks').map(metric => <div className="gx-r-observed-row" key={metric.id}>
              <span className="gx-grow"><strong className="gx-t-body">{metric.title}</strong><span className="gx-t-meta gx-c-2">Sample {metric.sample}</span></span>
              <strong className="gx-n-xs">{!Number.isFinite(metric.value) ? '—' : metric.unit === 'share' ? `${(metric.value * 100).toFixed(1)}%` : metric.value.toFixed(2)}</strong>
              <InfoButton title={`About ${metric.title}`} body={[metric.definition, `Sample ${metric.sample}; excluded ${metric.excluded}.`]}/>
            </div>)}
            <p className="gx-t-meta gx-c-2">Data through <ResearchTime value={observed.asOf}/></p>
            {observed.sourceUrl ? <a className="gx-r-link gx-t-meta" href={observed.sourceUrl} target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0</a> : null}
          </> : <p className="gx-t-body gx-c-2">Play statistics are unavailable here. Both game markets must be open, with observed completed plays available.</p>}
    </Card>
  </div>;
}
export default MatchupTeamPerformance;
