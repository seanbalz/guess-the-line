import { useEffect, useRef, useState } from 'react';
import { normalizeNbaTicket } from '../../../../shared/nba-bets.mjs';
import { Button, Card } from '../ui/index.js';
import { nbaApi } from './api.js';
import { displayUnits, recoverOperation, today } from './route.js';
const blankLeg = game => ({ gameId: game?.id || `NBA:manual:${crypto.randomUUID()}`, fixedMatchup: Boolean(game), matchup: game ? `${game.away.abbreviation} at ${game.home.abbreviation}` : '', market: 'moneyline', team: '', side: 'over', line: '' });
const matchupKey = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
const seasonFor = date => { const year = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0); return `${year}-${String((year + 1) % 100).padStart(2, '0')}`; };
function initialDraft(ticket, game, selectedDate) {
  const date = ticket?.eventDate || selectedDate || today();
  return { id: ticket?.id || crypto.randomUUID(), season: ticket?.season || seasonFor(date), eventDate: date,
    kind: ticket?.kind || 'single', label: ticket?.label || '', legs: ticket?.legs.map(leg => ({ ...blankLeg(), ...leg })) || [blankLeg(game)],
    priceInput: ticket?.priceInput || { format: 'american', value: ticket?.odds ?? '' }, stakeUnits: ticket?.stakeUnits ?? '', outcome: ticket?.outcome || 'pending' };
}
export function BetEditor({ ticket = null, game, selectedDate, onDirty, onCancel, onSaved, api = nbaApi }) {
  const [draft, setDraft] = useState(() => initialDraft(ticket, game, selectedDate)), [reason, setReason] = useState('');
  const [review, setReview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [retry, setRetry] = useState(false), [conflict, setConflict] = useState(false), [latest, setLatest] = useState(null);
  const operation = useRef(null), revision = useRef(ticket?.revision || 0), alive = useRef(true), request = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  const change = patch => { setDraft(old => ({ ...old, ...patch })); setReview(null); setError(''); onDirty(true); };
  const legChange = (index, patch) => {
    const leg = draft.legs[index];
    if (patch.matchup !== undefined && !leg.fixedMatchup && !ticket) {
      const matching = draft.legs.find((other, i) => i !== index && matchupKey(other.matchup) === matchupKey(patch.matchup) && patch.matchup.trim());
      const shared = draft.legs.some((other, i) => i !== index && other.gameId === leg.gameId);
      patch = { ...patch, gameId: matching?.gameId || (shared ? `NBA:manual:${crypto.randomUUID()}` : leg.gameId) };
    }
    change({ legs: draft.legs.map((value, i) => i === index ? { ...value, ...patch } : value) });
  };
  function validate(event) {
    event.preventDefault(); setError('');
    try {
      const payload = { ...draft, stakeUnits: draft.stakeUnits === '' ? NaN : Number(draft.stakeUnits), priceInput: { ...draft.priceInput, value: draft.priceInput.value === '' ? NaN : Number(draft.priceInput.value) }, legs: draft.legs.map(leg => ({ gameId: leg.gameId, ...(leg.matchup ? { matchup: leg.matchup } : {}), market: leg.market, ...(leg.market === 'total' ? { side: leg.side, line: leg.line === '' ? NaN : Number(leg.line) } : { team: leg.team, ...(leg.market === 'spread' ? { line: leg.line === '' ? NaN : Number(leg.line) } : {}) }) })) };
      normalizeNbaTicket(payload);
      if (revision.current > 0 && !reason.trim()) throw new Error('reason');
      setReview(payload); onDirty(true);
    } catch { setError('Enter every selection, valid odds, a positive stake, and a reason for any correction. Lines use half points. American prices must be ±100 or greater (maximum ±1000000); probability must be between 0% and 100%.'); }
  }
  async function save() {
    if (busy || uncertain && !retry) return;
    operation.current ||= { operationId: crypto.randomUUID(), ticket: review, expectedRevision: revision.current, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    setBusy(true); setError(''); request.current = new AbortController();
    try { const result = await api('save', operation.current, { signal: request.current.signal }); if (alive.current) { onDirty(false); onSaved(result.ticket); } }
    catch (failure) { if (alive.current) { setError(failure.message); setUncertain(Boolean(failure.uncertain)); setRetry(false); if (failure.status === 409) setConflict(true); else if (!failure.uncertain) operation.current = null; } }
    finally { if (alive.current) setBusy(false); }
  }
  async function recover() {
    if (busy) return; setBusy(true); setError(''); request.current = new AbortController();
    try {
      const saved = await recoverOperation(operation.current, api, { signal: request.current.signal });
      if (!alive.current) return;
      if (saved) { onDirty(false); onSaved(saved); }
      else { setRetry(true); setError('No matching receipt found. Retry sends the same ticket and operation IDs with the same reviewed terms.'); }
    } catch (failure) { if (alive.current) setError(`Could not check saved data. ${failure.message}`); }
    finally { if (alive.current) setBusy(false); }
  }
  async function refreshConflict() {
    setBusy(true); request.current = new AbortController();
    try { const data = await api('read', { ticketId: draft.id }, { signal: request.current.signal }); if (alive.current) { setLatest(data.tickets[0] || null); setError(data.tickets.length ? 'Review the latest saved terms before reconciling your draft.' : 'Ticket is unavailable. Your draft is retained.'); } }
    catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }
  const locked = busy || uncertain || conflict;
  return <section className="gx-nba-stack" aria-label="NBA ticket editor"><h1 className="gx-t-title">{ticket ? 'Edit NBA ticket' : 'Track NBA bet'}</h1><p className="gx-c-2">Record a ticket placed elsewhere. Scores never settle it automatically.</p>
    <form className="gx-nba-stack" onSubmit={validate}><fieldset disabled={locked} className="gx-nba-stack">
      <label className="gx-nba-field">Ticket label<input required maxLength={500} value={draft.label} onChange={event => change({ label: event.target.value })}/></label>
      <div className="gx-nba-grid"><label className="gx-nba-field">Event date<input required type="date" value={draft.eventDate} onChange={event => change({ eventDate: event.target.value, season: seasonFor(event.target.value) })}/></label><label className="gx-nba-field">Season<input required pattern="[0-9]{4}-[0-9]{2}" value={draft.season} onChange={event => change({ season: event.target.value })}/></label></div>
      <label className="gx-nba-field">Ticket type<select value={draft.kind} onChange={event => { if (event.target.value === 'single' && draft.legs.length > 1 && !window.confirm('Remove extra legs from this draft?')) return; change({ kind: event.target.value, legs: event.target.value === 'single' ? draft.legs.slice(0, 1) : [...draft.legs, blankLeg()] }); }}><option value="single">Single</option><option value="parlay">Parlay</option></select></label>
      {draft.legs.map((leg, index) => <Card key={index} className="gx-nba-stack"><h2 className="gx-t-section">Leg {index + 1}</h2><label className="gx-nba-field">Matchup {index + 1}<input required={!ticket} readOnly={Boolean(ticket) || leg.fixedMatchup} placeholder="Matchup unavailable" value={leg.matchup} maxLength={200} onChange={event => legChange(index, { matchup: event.target.value })}/></label><label className="gx-nba-field">Market {index + 1}<select value={leg.market} onChange={event => legChange(index, { market: event.target.value })}><option value="moneyline">Moneyline</option><option value="spread">Spread</option><option value="total">Game total</option></select></label>{leg.market === 'total' ? <label className="gx-nba-field">Selection {index + 1}<select value={leg.side} onChange={event => legChange(index, { side: event.target.value })}><option value="over">Over</option><option value="under">Under</option></select></label> : <label className="gx-nba-field">Team {index + 1}<input required maxLength={100} value={leg.team} onChange={event => legChange(index, { team: event.target.value })}/></label>}{leg.market !== 'moneyline' && <label className="gx-nba-field">Line {index + 1}<input required type="number" step="0.5" value={leg.line} onChange={event => legChange(index, { line: event.target.value })}/></label>}{draft.kind === 'parlay' && draft.legs.length > 2 && <Button onClick={() => change({ legs: draft.legs.filter((_, i) => i !== index) })}>Remove leg {index + 1}</Button>}</Card>)}
      {draft.kind === 'parlay' && draft.legs.length < 20 && <Button onClick={() => change({ legs: [...draft.legs, blankLeg()] })}>Add leg</Button>}
      <label className="gx-nba-field">Odds format<select value={draft.priceInput.format} onChange={event => change({ priceInput: { format: event.target.value, value: '' } })}><option value="american">American</option><option value="probability">Novig implied probability (%)</option></select></label>
      <label className="gx-nba-field">{draft.kind === 'parlay' ? 'Quoted combined price' : 'Ticket price'}<input required type="number" step="any" value={draft.priceInput.value} onChange={event => change({ priceInput: { ...draft.priceInput, value: event.target.value } })}/></label>
      {draft.kind === 'parlay' && <p className="gx-t-meta">Enter the combined price actually quoted. Leg prices are never multiplied.</p>}
      <label className="gx-nba-field">Stake (Units)<input required type="number" step="any" value={draft.stakeUnits} onChange={event => change({ stakeUnits: event.target.value })}/></label>
      <label className="gx-nba-field">Owner-confirmed result<select value={draft.outcome} onChange={event => change({ outcome: event.target.value })}>{['pending', 'win', 'loss', 'push', 'void'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label className="gx-nba-field">{revision.current > 0 ? 'Correction reason (required)' : 'Entry note (optional)'}<textarea required={revision.current > 0} maxLength={500} value={reason} onChange={event => { setReason(event.target.value); setReview(null); onDirty(true); }}/></label>
      <Button type="submit">Review ticket</Button>
    </fieldset></form>
    {review && <Card className="gx-nba-stack" aria-label="Review ticket"><h2 className="gx-t-section">Review your ticket</h2><p>{review.label} · {review.eventDate} · {review.kind}</p>{review.legs.map((leg, index) => <p key={index}>{leg.matchup || 'Matchup unavailable'} · {leg.market} · {leg.team || leg.side} {leg.line ?? ''}</p>)}<p>{review.kind === 'parlay' ? 'Combined price' : 'Price'}: {normalizeNbaTicket(review).odds} American · {review.stakeUnits} U · {review.outcome}</p><p>Net: {displayUnits(normalizeNbaTicket(review).netUnits)} U</p><Button variant="primary" disabled={busy || conflict || uncertain && !retry} onClick={save}>{busy ? 'Saving…' : retry ? 'Retry same save' : 'Save ticket'}</Button></Card>}
    {error && <p role="alert">{error}</p>}
    {uncertain && <Button disabled={busy} onClick={recover}>Check saved ticket</Button>}
    {conflict && <><Button disabled={busy} onClick={refreshConflict}>Load latest saved ticket</Button>{latest && <Card className="gx-nba-stack"><p>Latest revision {latest.revision}: {latest.label}, {latest.odds}, {latest.stakeUnits} U, {latest.outcome}, net {displayUnits(latest.netUnits)} U</p>{latest.legs.map((leg, index) => <p key={index}>{leg.matchup || 'Matchup unavailable'} · {leg.market} · {leg.team || leg.side} {leg.line ?? ''}</p>)}<Button onClick={() => { revision.current = latest.revision; operation.current = null; setConflict(false); setReview(null); setError('Draft retained. Review your changes and correction reason against the latest revision.'); }}>Reconcile my draft with this revision</Button></Card>}</>}
    <Button disabled={busy} onClick={onCancel}>Cancel editor</Button>
  </section>;
}
