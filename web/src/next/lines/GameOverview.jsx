import { Card, TeamMark } from '../ui/index.js';
import { matchupRecords, recordsThroughText } from '../teams/teamModel.js';
import { useTeamSeason } from '../teams/teamsData.js';

/** The compact native game header uses the same season-scoped record source as the team panels. */
export function GameOverview({ view, season, week, onTeam }) {
  const teams = useTeamSeason(), records = matchupRecords(teams.data, view.away.code, view.home.code, season);
  return <Card as="section" className="gx-game-overview gx-vstack gx-gap-12" aria-label="Game overview">
    <div className="gx-game-overview-heading"><h3 className="gx-t-section">Game overview</h3><p className="gx-t-meta gx-c-2">Week {week ?? '—'}</p></div>
    <div className="gx-game-overview-teams">{[view.away, view.home].map((team, index) => <span className="gx-game-overview-side" key={team.code}>
      {index ? <span className="gx-game-overview-at gx-t-meta gx-c-2" aria-hidden="true">at</span> : null}
      <button type="button" onClick={() => onTeam(team.code)} aria-label={`${team.name}${records?.[index ? 'home' : 'away'] ? `, ${records[index ? 'home' : 'away']}` : ''}. Open team`}>
        <TeamMark code={team.code} size={48} decorative/><span className="gx-t-strong">{team.nick ?? team.name ?? team.code}</span><span className="gx-t-meta gx-c-2">{records?.[index ? 'home' : 'away'] ?? '—'}</span>
      </button>
    </span>)}</div>
    <p className="gx-t-meta gx-c-2">{view.when}</p>
    {teams.data?.season === season && recordsThroughText(teams.data) ? <p className="gx-t-meta gx-c-2">{recordsThroughText(teams.data)}</p> : null}
  </Card>;
}
