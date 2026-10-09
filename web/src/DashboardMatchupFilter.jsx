import { useId } from 'react';
import { ChevronDown, ListFilter } from 'lucide-react';
import { normalizeDashboardMatchupFilter } from './dashboardPreferences';
import './dashboardMatchupFilter.css';

export default function DashboardMatchupFilter({ games = [], season, week, value, onChange, storageAvailable = true }) {
  const id = useId();
  const filter = normalizeDashboardMatchupFilter(value, games);
  const selected = new Set(filter.selectedIds);
  const count = filter.mode === 'all' ? games.length : selected.size;
  const setMode = mode => onChange({ ...filter, mode });
  const reset = () => onChange({ version: 1, mode: 'all', selectedIds: [] });
  function toggle(gameId, checked) {
    const next = new Set(selected);
    if (checked) next.add(gameId); else next.delete(gameId);
    onChange({ ...filter, mode: 'selected', selectedIds: games.filter(game => next.has(game.id)).map(game => game.id) });
  }
  return <details className="dashboard-matchup-filter panel">
    <summary><ListFilter size={20} aria-hidden="true"/><span><strong>Choose dashboard games</strong><small>{filter.mode === 'all' ? `All ${games.length} games` : `${count} of ${games.length} games selected`} · Week {week}</small></span><ChevronDown size={20} aria-hidden="true"/></summary>
    <div className="dashboard-matchup-filter-body">
      <p className="dashboard-matchup-help" id={`${id}-help`}>Choose games for matchup differences and line history. Ballots, submission requirements and full-week accuracy scores stay unchanged.</p>
      <fieldset aria-describedby={`${id}-help`}><legend>Games to display</legend><div className="dashboard-matchup-modes">
        <label className={filter.mode === 'all' ? 'is-selected' : ''}><input type="radio" name={`${id}-mode`} checked={filter.mode === 'all'} onChange={() => setMode('all')}/><span>All games</span></label>
        <label className={filter.mode === 'selected' ? 'is-selected' : ''}><input type="radio" name={`${id}-mode`} checked={filter.mode === 'selected'} onChange={() => setMode('selected')}/><span>Selected games</span></label>
      </div></fieldset>
      {filter.mode === 'selected' && <>
        <div className="dashboard-matchup-selection-summary" role="status">{count ? `${count} matchup${count === 1 ? '' : 's'} selected.` : 'No games selected. Choose a matchup below or show all games.'}</div>
        {games.length ? <fieldset className="dashboard-matchup-choices"><legend>Matchups for {season} · Week {week}</legend><div>{games.map(game => <label key={game.id} className={selected.has(game.id) ? 'is-selected' : ''}>
          <input type="checkbox" checked={selected.has(game.id)} onChange={event => toggle(game.id, event.target.checked)} aria-label={`Show ${game.awayCode} at ${game.homeCode}`}/>
          <span><strong>{game.awayCode} <span>at</span> {game.homeCode}</strong><small>{game.away} at {game.home}</small></span>
        </label>)}</div></fieldset> : <p className="dashboard-matchup-help">No scheduled matchups are available for this week.</p>}
        <div className="dashboard-matchup-actions"><button type="button" className="secondary" disabled={!count} onClick={() => onChange({ ...filter, selectedIds: [] })}>Clear selection</button><button type="button" className="secondary" onClick={reset}>Show all games</button></div>
      </>}
      <p className="dashboard-matchup-storage">{storageAvailable ? `Saved for ${season} Week ${week} in this browser only. This display filter is not account Favorites and does not sync to other devices.` : 'Browser storage is unavailable. This filter applies to this tab until it closes.'}</p>
    </div>
  </details>;
}
