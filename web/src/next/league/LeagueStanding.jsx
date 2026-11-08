import { Card } from '../ui/Card.jsx';
import { fmtNum } from '../format.js';

/** The approved two-column standing uses this board's shared season figures only. */
export function LeagueStanding({ row, mode }) {
  const market = mode === 'guess_total' ? 'Total' : mode === 'guess_points' ? 'Season' : 'Spread';
  return <Card as="section" variant="tint" className="gx-league-standing" aria-label="Your season standing">
    <div><span className="gx-t-meta gx-c-2">Your rank</span><strong>{row?.rank ? `${row.tied ? 'T-' : ''}${row.rank}` : '—'}</strong></div>
    <div><span className="gx-t-meta gx-c-2">{market} points</span><strong>{Number.isFinite(row?.points) ? fmtNum(row.points) : '—'}</strong></div>
    <p className="gx-t-meta gx-c-2">{mode === 'guess_points' ? 'Points scores separately from Spread and Total.' : 'Shared season standings · points enter at each game’s kickoff.'}</p>
  </Card>;
}
