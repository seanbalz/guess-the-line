// "DEN @ MIN" with each team's official logo in its own glass circle (D-85). The badges carry the full team names; the
// visible codes and "@" are hidden from assistive technology, which reads "Denver Nuggets at Minnesota Timberwolves".
import { NbaTeamBadge } from './NbaTeamBadge.jsx';

export function NbaMatchup({ away, home, size = 24, className }) {
  return <span className={`gx-nba-matchup ${className ?? ''}`.trim()}>
    <NbaTeamBadge code={away} size={size}/><b aria-hidden="true">{away}</b>
    <span aria-hidden="true" className="gx-nba-at">@</span><span className="gx-sr-only">at</span>
    <NbaTeamBadge code={home} size={size}/><b aria-hidden="true">{home}</b>
  </span>;
}
