import React, { useEffect, useId, useState } from 'react';
import { LoaderCircle, Scale, TriangleAlert } from 'lucide-react';
import { officialsApi } from './api';
import { rememberOfficial, useTrendWeek } from './trendsData.js';
import { refereeFor } from '../../shared/trends-view.mjs';
import './trends.css';

const plain = e => (e?.status ? e.message : 'No connection. Reconnect and try again.');

/**
 * Commissioner only: each published game's referee, chosen from the referees in this week's trends
 * file once the NFL announces crews. Saved for every member through gtl-api (append-only history);
 * a game left on "Not assigned yet" shows "Referee not assigned yet" in every trends panel.
 */
export default function RefereeAssignments({ season, week }) {
  const [open, setOpen] = useState(false);
  const trends = useTrendWeek(season, week, open);
  const [hosted, setHosted] = useState(null), [state, setState] = useState('idle'), [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const headingId = useId();
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setState('loading');
    officialsApi('read', { season, week })
      .then(result => { if (live) { setHosted(result); setState('ready'); } })
      .catch(e => { if (live) { setState(e?.status === 404 ? 'not_deployed' : 'error'); setError(e?.status === 404 ? '' : plain(e)); } });
    return () => { live = false; };
  }, [open, season, week]);
  const games = trends.week?.games || [], options = trends.week?.refereeOptions || [];
  const current = gameId => refereeFor(trends.week, gameId, hosted).name || '';
  const changed = games.filter(g => Object.hasOwn(drafts, g.id) && drafts[g.id] !== current(g.id));
  async function save() {
    if (busy || !changed.length || state !== 'ready') return;
    setBusy(true); setError(''); setNotice('');
    const saved = [];
    try {
      for (const game of changed) {
        const result = await officialsApi('set', { season, week, gameId: game.id, referee: drafts[game.id] || null });
        const row = { referee: result.referee, setAt: result.setAt, revision: result.revision };
        setHosted(h => ({ season, week, assignments: { ...(h?.assignments || {}), [game.id]: row } }));
        rememberOfficial(season, week, game.id, row);
        saved.push(`${game.away} at ${game.home}: ${result.referee || 'not assigned'}`);
      }
      setDrafts({});
      setNotice(`Referees saved for everyone. ${saved.join('; ')}.`);
    } catch (e) {
      setError(`${plain(e)}${saved.length ? ` Saved before the error: ${saved.join('; ')}.` : ''} Unsaved choices stay selected.`);
    } finally { setBusy(false); }
  }
  return <details className="panel referee-assignments" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Scale size={18} aria-hidden="true"/><span id={headingId}>Game referees (commissioner)</span></summary>
    <div className="referee-assignments-body">
      <p className="muted small">Pick each game’s referee once the NFL announces crews. Every member’s trends panel then shows that referee’s records; a game left on “Not assigned yet” reads “Referee not assigned yet”. Changes are kept with their history, never deleted.</p>
      {trends.status === 'loading' && <p role="status"><LoaderCircle className="spin" size={16} aria-hidden="true"/>Loading Week {week} games…</p>}
      {trends.status === 'missing' && <p role="status">The Week {week} trends file is not published yet, so there is no game list or referee list to choose from. It publishes after the previous Monday night’s final.</p>}
      {trends.status === 'error' && <div className="error-banner" role="alert"><TriangleAlert size={18} aria-hidden="true"/><span>The Week {week} games could not load.</span><button type="button" className="text-button" onClick={trends.retry}>Retry</button></div>}
      {state === 'not_deployed' && <p className="auth-notice" role="status">Saving referees for everyone needs the next gtl-api deploy and the game officials migration. Until then, the weekly trends file can carry them (scripts/trends.mjs --referees).</p>}
      {state === 'error' && error && <div className="error-banner" role="alert"><TriangleAlert size={18} aria-hidden="true"/><span>{error}</span></div>}
      {trends.status === 'ready' && <form className="referee-assignment-list" aria-labelledby={headingId} onSubmit={event => { event.preventDefault(); save(); }}>
        {games.map(game => {
          const value = Object.hasOwn(drafts, game.id) ? drafts[game.id] : current(game.id), selectId = `${headingId}-${game.id}`;
          const extra = value && !options.includes(value) ? [value] : [];
          return <div className="referee-assignment" key={game.id}>
            <label htmlFor={selectId}>Referee for {game.away} at {game.home}</label>
            <select id={selectId} value={value} disabled={state !== 'ready'} aria-disabled={busy || undefined} onChange={event => { if (!busy) setDrafts(d => ({ ...d, [game.id]: event.target.value })); }}>
              <option value="">Not assigned yet</option>
              {[...extra, ...options].map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>;
        })}
        {state === 'ready' && error && <div className="error-banner" role="alert"><TriangleAlert size={18} aria-hidden="true"/><span>{error}</span></div>}
        <p className="auth-notice" role="status" aria-live="polite">{notice}</p>
        <button type="submit" className="primary" aria-disabled={busy || !changed.length || state !== 'ready' || undefined}>{busy ? 'Saving…' : changed.length ? `Save ${changed.length} ${changed.length === 1 ? 'referee' : 'referees'}` : 'Save referees'}</button>
      </form>}
    </div>
  </details>;
}
