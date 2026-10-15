import React, { useEffect, useRef, useState } from 'react';
import { cloudApi, signed } from './api';

// This edits the existing private forecast record, never a competition ballot.
export default function RecommendationForecastEditor({ personal, virtual, onSaved, onDirty, onBusy, onSignInAgain, disabled = false }) {
  const games = personal.games || [];
  const [gameId, setGameId] = useState(games[0]?.id || '');
  const [market, setMarket] = useState('spread');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(null);
  const alive = useRef(false), request = useRef(null);
  const scope = `${personal.ownerId}/${personal.season}/${personal.week}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const saved = personal.forecasts?.find(row => row.gameId === gameId && row.market === market);
  const hasRevision = Number.isSafeInteger(personal.personalRevision) && personal.personalRevision >= 0;
  const dirty = value !== '' || Boolean(pending);
  const blocked = disabled || busy || Boolean(pending) || conflict || !hasRevision || !virtual.current;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { onBusy?.(busy || Boolean(pending)); return () => onBusy?.(false); }, [busy, pending, onBusy]);
  const stillHere = () => alive.current && currentScope.current === scope;
  const reset = () => { setValue(''); setRevision(null); setConflict(false); setError(''); setNotice(''); request.current = null; };
  const select = change => {
    if (dirty && !window.confirm('Discard this unsaved personal forecast?')) return;
    reset(); change();
  };
  async function save(event) {
    event.preventDefault();
    if (blocked || value.trim() === '') return;
    const body = { season: personal.season, week: personal.week, gameId, market, value: Number(value), revision: revision ?? personal.personalRevision };
    if (!Number.isFinite(body.value) || body.value * 2 !== Math.trunc(body.value * 2) || body.value < (market === 'spread' ? -100 : 0) || body.value > (market === 'spread' ? 100 : 200)) {
      setError('Enter a valid forecast in half-point increments.'); return;
    }
    const serialized = JSON.stringify(body);
    if (request.current?.serialized !== serialized) request.current = { serialized, requestId: crypto.randomUUID() };
    const attempt = { ...body, requestId: request.current.requestId };
    setBusy(true); setError(''); setNotice('');
    let acknowledged = false;
    try {
      await cloudApi('personal/forecast', attempt, { save: true });
      acknowledged = true;
      if (!stillHere()) return;
      await onSaved();
      if (!stillHere()) return;
      reset(); setNotice('Personal forecast saved. Your scored guess is unchanged.');
    } catch (e) {
      if (!stillHere()) return;
      if (e.status === 401) onSignInAgain?.();
      if (e.uncertain || acknowledged) {
        setPending(attempt);
        setError(acknowledged ? 'Your forecast was saved, but the updated view did not load. Check the saved forecast before continuing.' : 'The save reply was lost. Check the saved forecast before continuing.');
      } else {
        setError(e.message);
        if (e.status === 409) setConflict(true);
      }
    } finally { if (stillHere()) setBusy(false); }
  }
  async function check() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const data = await cloudApi('bets/recommendations', { season: personal.season, week: personal.week });
      if (!stillHere()) return;
      if (data.personal?.ownerId !== personal.ownerId || data.personal?.season !== personal.season || data.personal?.week !== personal.week || !Number.isSafeInteger(data.personal?.personalRevision)) throw new Error('Could not verify this account and week. Reload and try again.');
      const found = data.personal.forecasts?.find(row => row.gameId === gameId && row.market === market);
      await onSaved();
      if (!stillHere()) return;
      if (pending && found?.value === pending.value) {
        reset(); setPending(null); setNotice('Saved forecast value confirmed. Your scored guess is unchanged.');
      } else {
        setPending(null); setConflict(false); setRevision(data.personal.personalRevision); request.current = null;
        setNotice(found ? `Latest saved forecast: ${market === 'spread' ? signed(found.value) : found.value}. Your entered value is kept; review it before saving again.` : 'No saved forecast was found. Your entered value is kept; review it before saving again.');
      }
    } catch (e) {
      if (stillHere()) { setError(e.message); if (e.status === 401) onSignInAgain?.(); }
    } finally { if (stillHere()) setBusy(false); }
  }
  return <details className="recommendation-forecast-editor">
    <summary>Your personal forecast</summary>
    <p className="muted">Your own estimate of the game outcome. This is separate from guessing the sportsbook line. Suggestions appear after you submit that market’s guess.</p>
    {!hasRevision && <p role="status">Reload to enable forecast editing with the latest account version.</p>}
    <form onSubmit={save} className="personal-form">
      <label>Forecast game<select value={gameId} disabled={blocked} onChange={event => select(() => setGameId(event.target.value))}>{games.map(game => <option key={game.id} value={game.id}>{game.awayCode} at {game.homeCode}</option>)}</select></label>
      <label>Forecast market<select value={market} disabled={blocked} onChange={event => select(() => setMarket(event.target.value))}><option value="spread">Home spread</option><option value="total">Total points</option></select></label>
      <label>Your forecast<input type="number" inputMode="decimal" step="0.5" min={market === 'spread' ? -100 : 0} max={market === 'spread' ? 100 : 200} value={value} disabled={blocked} onChange={event => { if (revision === null) setRevision(personal.personalRevision); setValue(event.target.value); setNotice(''); }}/></label>
      <p className="muted">{market === 'spread' ? 'Use the home team’s perspective: −7 means you expect the home team to win by 7.' : 'Enter the combined points you expect both teams to score.'} Saved: {saved ? (market === 'spread' ? signed(saved.value) : saved.value) : 'None'}.</p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <div className="personal-actions">
        <button className="primary" disabled={blocked || value.trim() === '' || !gameId}>Save personal forecast</button>
        {dirty && !pending && <button className="secondary" type="button" disabled={busy} onClick={reset}>Cancel forecast</button>}
        {(pending || conflict) && <button className="secondary" type="button" disabled={busy} onClick={check}>{pending ? 'Check saved forecast' : 'Review latest saved forecast'}</button>}
      </div>
    </form>
  </details>;
}
