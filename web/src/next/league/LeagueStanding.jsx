import { Card } from '../ui/Card.jsx';
import { fmtNum } from '../format.js';

/** Context comes from the same authenticated board as the figures, never another league. */
export function LeagueStanding({ row, rows = [], mode, scope = 'Community', period = 'season', week = null, detail = null }) {
  const market = mode === 'guess_total' ? 'Total' : mode === 'guess_points' ? 'Season' : 'Spread';
  const leader = rows.find(other => other.rank === 1 && Number.isFinite(other.points));
  const second = rows.find(other => other.rank > 1 && Number.isFinite(other.points));
  const chase = !row?.rank || !Number.isFinite(row.points) ? 'No scored result yet.' : row.rank === 1
    ? row.tied ? 'Tied for the lead.' : second ? `You lead by ${fmtNum(row.points - second.points)} points.` : 'You lead.'
    : leader ? `${fmtNum(leader.points - row.points)} points behind ${leader.name}.` : null;
  const context = `${scope} · ${period === 'week' ? `Week ${week ?? '—'}` : 'Season standing'}`;
  return <Card as="section" variant="tint" className="gx-league-standing" aria-label={`Your ${period === 'week' ? 'weekly' : 'season'} standing`}>
    <div><span className="gx-t-meta gx-c-2">Your rank</span><strong>{row?.rank ? `${row.tied ? 'T-' : ''}${row.rank}` : '—'}</strong></div>
    <div><span className="gx-t-meta gx-c-2">{market} points</span><strong>{Number.isFinite(row?.points) ? fmtNum(row.points) : '—'}</strong></div>
    <p className="gx-t-meta gx-c-2">{context}{detail || chase ? ` · ${detail || chase}` : ''}</p>
  </Card>;
}
