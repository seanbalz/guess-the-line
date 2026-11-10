// Completed public production for the actual published slot; never the gated House estimate.
import { fantasyWeekKey, useFantasySnapshot } from '../../../fantasyData.js';
import { playerProfile } from '../../../../../shared/fantasy-tools.mjs';
import { MiniArea } from '../../charts/TrendRow.jsx';
import { contextNumber } from './pointsContext.js';
import { pts } from './pointsModel.js';

export function PointsWeekContext({ data, children }) {
  const fantasy = useFantasySnapshot(fantasyWeekKey(data.season, data.week));
  return children(fantasy);
}

export function PointsObserved({ snapshot: state, slot, settings, compact = false }) {
  if (state?.status !== 'ready' || !state.snapshot) return compact ? null : <p className="gx-t-meta gx-pt-sub">Observed points unavailable.</p>;
  const profile = playerProfile(state.snapshot, slot.playerId, settings);
  const weeks = profile?.weeks.filter(week => week.status === 'played' && typeof week.points === 'number' && Number.isFinite(week.points)) ?? [];
  if (!weeks.length) return compact ? null : <p className="gx-t-meta gx-pt-sub">No recorded completed games.</p>;
  return <span className={compact ? 'gx-pt-observed gx-pt-observed--compact' : 'gx-pt-observed'}>
    <span className="gx-pt-spark" role="img" aria-label={`Observed fantasy points, recorded completed games: ${weeks.map(week => `Week ${week.week}: ${pts(week.points)}`).join(', ')}`}><MiniArea values={weeks.map(week => week.points)}/></span>
    <span className="gx-t-meta gx-pt-sub">{contextNumber(profile.summary.season.points.value)} per game · {profile.summary.season.games} recorded games</span>
  </span>;
}
