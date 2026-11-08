import { useId, useMemo } from 'react';
import { playerProfile, MAX_COMPARE } from '../../../../shared/fantasy-tools.mjs';
import { formatFantasyNumber as number, POSITION_OPTIONS } from '../../../../shared/fantasy-rankings.mjs';
import { MiniArea } from '../charts/TrendRow.jsx';
import { Button, Card, TeamMark } from '../ui/index.js';
import { PlayerToolButtons } from './FantasyTools.jsx';

/** An unranked browse of recorded production. Pace estimates never enter this list or its curves. */
export function ObservedPlayers({ snapshot, settings, filters, onFilter, compareIds, onProfile, onCompare, limit = 6, onLimit }) {
  const searchId = useId(), positionId = useId();
  const profiles = useMemo(() => snapshot.players.map(player => playerProfile(snapshot, player.id, settings))
    .filter(profile => profile.summary.season.points.games > 0)
    .sort((a, b) => a.player.name.localeCompare(b.player.name) || a.player.id.localeCompare(b.player.id)), [snapshot, settings.scoring, settings.passingTds]);
  const query = filters.search.trim().toLocaleLowerCase('en-US');
  const matching = profiles.filter(({ player }) => (filters.position === 'ALL' || player.position === filters.position || filters.position === 'FLEX' && ['RB', 'WR', 'TE'].includes(player.position))
    && `${player.name} ${player.team} ${player.position}`.toLocaleLowerCase('en-US').includes(query));
  const update = (name, value) => { onFilter(name, value); onLimit?.(6); };
  return <section className="gx-vstack gx-gap-16" aria-label="Player research">
    <div className="gx-fantasy-browse-filters">
      <div className="gx-fantasy-field"><label htmlFor={searchId}>Find a player</label><input id={searchId} type="search" placeholder="Name, team or position" value={filters.search} onChange={e => update('search', e.target.value)}/></div>
      <div className="gx-fantasy-field"><label htmlFor={positionId}>Position</label><select id={positionId} value={filters.position} onChange={e => update('position', e.target.value)}>{POSITION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.value === 'ALL' ? 'All' : option.label}</option>)}</select></div>
    </div>
    <p className="gx-t-meta gx-c-2" role="status">{Math.min(limit, matching.length)} of {matching.length} players with recorded points</p>
    <ul className="gx-fantasy-observed-list" aria-label="Players with recorded points">{matching.slice(0, limit).map(profile => {
      const { player, weeks, summary } = profile;
      const values = weeks.filter(week => week.status === 'played' && Number.isFinite(week.points)).map(week => week.points);
      const description = weeks.map(week => `Week ${week.week}: ${week.status === 'bye' ? 'bye' : week.status === 'none' ? 'no recorded stats' : Number.isFinite(week.points) ? `${number(week.points)} points` : 'points unavailable'}`).join('; ');
      return <li key={player.id}><Card as="article" className="gx-fantasy-observed gx-vstack gx-gap-12" data-observed-player={player.id}>
        <div className="gx-fantasy-observed-head"><TeamMark code={player.team} size={48} decorative/><div className="gx-grow"><h3 className="gx-t-strong">{player.name}</h3><p className="gx-t-meta gx-c-2">{player.position}</p></div><p className="gx-fantasy-observed-average"><strong className="gx-n-m">{number(summary.season.points.value)}</strong><span className="gx-t-meta gx-c-2">pts / game</span></p></div>
        <div className="gx-fantasy-observed-spark" role="img" aria-label={`${player.name}, actual fantasy points in recorded games. ${description}.`}>{values.length > 1 ? <MiniArea values={values}/> : <p className="gx-t-meta gx-c-2">{values.length ? 'One recorded points observation' : 'Points unavailable'}</p>}</div>
        <p className="gx-t-meta gx-c-2">Observed production · {summary.season.points.games} recorded points {summary.season.points.games === 1 ? 'game' : 'games'}</p>
        <dl className="gx-fantasy-observed-averages"><div><dt>Season</dt><dd>{number(summary.season.points.value)} <span className="gx-t-meta">· {summary.season.points.games} games</span></dd></div><div><dt>Last 3 weeks</dt><dd>{number(summary.recent.points.value)} <span className="gx-t-meta">· {summary.recent.points.games} games</span></dd></div></dl>
        <PlayerToolButtons player={player} compared={compareIds.includes(player.id)} full={compareIds.length >= MAX_COMPARE} onProfile={onProfile} onCompare={onCompare}/>
      </Card></li>;
    })}</ul>
    {!matching.length ? <p className="gx-t-body gx-c-2">No recorded players match these filters.</p> : null}
    {matching.length > limit ? <Button variant="secondary" onClick={() => onLimit(limit + 6)}>Show more recorded players ({matching.length - limit} left)</Button> : null}
  </section>;
}
