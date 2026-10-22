import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BarChart3, Check, ChevronDown, Copy, Filter, History, Layers3, Lock, Plus, RefreshCw, ShieldCheck, Trash2, TrendingUp, UserPlus, Users, X } from 'lucide-react';
import { socialApi, date, signed } from './api';
import { lockSentence } from './lineLock';
import { BookChoices, ChoiceButtons, MatchupChoices, NumberChoices, SpreadChoices } from './BetEntryControls';
import './socialBetTracker.css';

const units = value => Number.isFinite(value) ? `${Number(value.toFixed(3))}u` : 'Unknown';
const number = value => Number.isFinite(value) ? Number(value.toFixed(2)).toLocaleString('en-US') : '—';
const american = value => Number.isFinite(value) ? (value > 0 ? `+${value}` : `−${Math.abs(value)}`) : 'Odds unknown';
const percent = value => Number.isFinite(value) ? `${number(value)}%` : '—';
const nullable = value => value === '' || value === undefined || value === null ? null : Number(value);
const iso = value => value ? new Date(value).toISOString() : null;
const localTime = value => { const parsed = value ? new Date(value) : new Date(); return Number.isNaN(parsed.valueOf()) ? '' : new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const emptyLeg = () => ({ gameId: '', market: 'spread', side: '', line: '', selection: '' });
const defaultFilters = { playerId: '', kind: '', market: '', outcome: '', origin: '', team: '', following: false, counts: 'all', includeParlays: true, includeTailed: true, includeTracked: true };

function Alert({ children }) { return children ? <p className="social-alert" role="alert">{children}</p> : null; }
// Redesign stage 21 (M-04; D-36 as amended by D-39): the server sends another player's spread or total leg without its line
// (`locked: true`) until this player locks in their Guess the Line pick for that game and market, sits it out, or the game
// kicks off. A locked leg shows a lock, never "—" or a number. The player's own slips always come back whole.
const legLabel = leg => leg.locked ? `${leg.selection || 'Line'} · line locked` : leg.selection || `${leg.side} ${leg.line ?? ''}`;
function Selection({ leg, games }) {
  const game = games.find(item => item.id === leg.gameId);
  const side = leg.side === 'home' ? game?.home : leg.side === 'away' ? game?.away : leg.side;
  const label = leg.selection || (leg.market === 'spread' ? `${side || 'Team'} ${signed(leg.line)}` : leg.market === 'total' ? `${side || 'Total'} ${leg.line ?? '—'}` : 'Player prop');
  const where = <small>{game ? `${game.away} @ ${game.home}` : `Matchup ${leg.gameId}`} · {leg.market}{game?.kickoff ? ` · ${date(game.kickoff)} PT` : ''}</small>;
  if (leg.locked) return <span className="social-selection social-selection-locked" data-locked="true"><strong><Lock size={16} aria-hidden="true"/>{leg.selection || side || 'Line'}<span className="social-locked-tag">Line locked</span></strong>{where}</span>;
  return <span className="social-selection"><strong>{label}</strong>{where}</span>;
}

function Modal({ title, onClose, busy, children }) {
  const ref = useRef(null), id = useId();
  useEffect(() => { const previous = document.activeElement; ref.current?.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="social-modal" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}><div className="social-modal-head"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Close editor" onClick={onClose} disabled={busy}><X size={22}/></button></div>{children}</dialog>;
}

function BetEditor({ entry, action, fromRecommendation, games, season, week, busy, error, recovery, unconfirmed, onSave, onClose, onDirty }) {
  const isTail = action === 'tail', isCorrect = action === 'correct';
  const selectionLocked = isTail || (isCorrect && Boolean(entry?.sourceEntryId));
  const [draft, setDraft] = useState(() => ({ kind: entry?.kind || 'single', origin: 'tracked', legs: entry?.legs?.map(leg => ({ ...leg, line: leg.line ?? '' })) || [emptyLeg()], odds: isTail ? '' : entry?.odds ?? '', stakeUnits: entry && !isTail ? entry.stakeUnits ?? '' : '', source: isTail ? '' : entry?.source || '', quotedAt: isTail ? '' : entry?.quotedAt ? localTime(entry.quotedAt) : '', placedAt: isTail ? localTime() : entry?.placedAt ? localTime(entry.placedAt) : '', countsForRecord: entry?.countsForRecord !== false, notes: isTail ? '' : entry?.notes || '', reason: '' }));
  const [confirmed, setConfirmed] = useState(false), [dirty, setDirty] = useState(false), [quoteTimeEdited, setQuoteTimeEdited] = useState(false);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  const change = patch => { setDraft(value => ({ ...value, ...patch })); if (Object.hasOwn(patch, 'quotedAt')) setQuoteTimeEdited(true); setDirty(true); };
  const legChange = (index, patch) => change({ legs: draft.legs.map((leg, i) => i === index ? { ...leg, ...patch } : leg) });
  const close = () => { if (unconfirmed || !dirty || window.confirm('Discard your unsaved bet draft?')) onClose(); };
  const sourceLabel = typeof draft.source === 'string' ? draft.source : draft.source?.name || '';
  const selectionReady = selectionLocked || draft.legs.every(leg => games.some(game => game.id === leg.gameId) && (leg.market === 'prop'
    ? leg.side.trim() && leg.selection.trim().length >= 2
    : leg.side && leg.line !== '' && Number.isFinite(Number(leg.line))));
  const tailReady = !isTail || (draft.odds !== '' && draft.stakeUnits !== '' && sourceLabel.trim().length >= 2 && draft.quotedAt && draft.placedAt && confirmed);
  const ticketReady = !fromRecommendation || confirmed;
  const ticketDetails = <div className="social-ticket-detail-fields">
    <label>Quote observed (your local time)<input type="datetime-local" required={isTail} value={draft.quotedAt} disabled={busy} onChange={event => change({ quotedAt: event.target.value })}/><button className="social-entry-option" type="button" disabled={busy} onClick={() => change({ quotedAt: localTime() })}>Quote observed now</button></label>
    <label>Bet placed (your local time)<input type="datetime-local" required={isTail} value={draft.placedAt} disabled={busy} onChange={event => change({ placedAt: event.target.value })}/><button className="social-entry-option" type="button" disabled={busy} onClick={() => change({ placedAt: localTime() })}>Bet placed now</button></label>
    <label className="social-wide">Ticket notes (optional)<input maxLength={500} placeholder="Cash stake, payout, boost or missing details" value={draft.notes} disabled={busy} onChange={event => change({ notes: event.target.value })}/></label>
  </div>;
  async function submit(event) {
    event.preventDefault();
    if (busy || !selectionReady || !tailReady || !ticketReady) return;
    const body = { season, week, kind: draft.kind, origin: draft.origin, legs: draft.legs.map(leg => ({ ...leg, line: nullable(leg.line) })), odds: nullable(draft.odds), stakeUnits: nullable(draft.stakeUnits), source: sourceLabel.trim(), quotedAt: !isTail && entry?.quotedAt && !quoteTimeEdited ? entry.quotedAt : iso(draft.quotedAt), placedAt: iso(draft.placedAt), countsForRecord: draft.countsForRecord, notes: draft.notes.trim(), ...(isCorrect ? { reason: draft.reason.trim() } : {}) };
    if (isTail) { delete body.kind; delete body.legs; }
    await onSave(body);
  }
  return <Modal title={isTail ? `Tail ${entry.ownerName || 'this player'}` : isCorrect ? 'Correct saved bet' : fromRecommendation ? 'Review recommended bet' : 'Add a tracked bet'} onClose={close} busy={busy && !unconfirmed}>
    <form className="social-form" onSubmit={submit}>
      <p className="social-audience"><Users size={18}/>Visible to all signed-in players. Counts toward records by default.</p>
      <p className="social-help">Save a bet you placed elsewhere. This records your selection; it does not place a wager or move money.</p>
      {fromRecommendation && <p className="social-help">The recommendation’s quote is filled in for review. Check the selection, price and book against your actual ticket. Your stake and placement time are not assumed.</p>}
      <Alert>{error}</Alert>{recovery}
      {selectionLocked ? <div className="social-tail-source"><strong>{isTail ? 'Original selection' : 'Saved tailed selections'}</strong>{draft.legs.map((leg, index) => <Selection key={index} leg={leg} games={games}/>)}<p>{isTail ? `Original price: ${american(entry.odds)}. Choose your own confirmed price and stake below. Original terms are not copied into your return.` : 'A tailed ticket keeps its original selections. You can correct your own saved stake, price and source below.'}</p>{entry.notes && <p>Original ticket note: {entry.notes}</p>}</div> : <>
        <ChoiceButtons label="Bet type" options={[{ value: 'single', label: 'Single' }, { value: 'parlay', label: 'Parlay' }]} value={draft.kind} disabled={busy || isCorrect} onChange={kind => change({ kind, legs: kind === 'single' ? draft.legs.slice(0, 1) : draft.legs.length > 1 ? draft.legs : [...draft.legs, emptyLeg()] })}/>
        {draft.legs.map((leg, index) => {
          const game = games.find(item => item.id === leg.gameId);
          return <fieldset className="social-leg-editor" key={index}><legend>{draft.kind === 'parlay' ? `Leg ${index + 1}` : 'Selection'}</legend><div className="social-ticket-detail-fields">
            <MatchupChoices games={games} value={leg.gameId} disabled={busy} onChange={gameId => legChange(index, { gameId, side: '', line: '', selection: '' })}/>
            {game && <>
              <ChoiceButtons label="Market" options={[{ value: 'spread', label: 'Spread' }, { value: 'total', label: 'Total' }, { value: 'prop', label: 'Player prop' }]} value={leg.market} disabled={busy} onChange={market => legChange(index, { market, side: '', selection: '', line: '' })}/>
              {leg.market !== 'prop' && <ChoiceButtons label={leg.market === 'spread' ? 'Team' : 'Direction'} options={leg.market === 'spread' ? [{ value: 'away', label: game.away }, { value: 'home', label: game.home }] : [{ value: 'over', label: 'Over' }, { value: 'under', label: 'Under' }]} value={leg.side} disabled={busy} onChange={side => legChange(index, { side })}/>}
              {leg.market === 'spread' ? <SpreadChoices value={leg.line} disabled={busy} onChange={line => legChange(index, { line })}/> : leg.market === 'total' ? <NumberChoices label="Exact total" value={leg.line} onChange={line => legChange(index, { line })} presets={[37.5, 40.5, 42.5, 44.5, 47.5, 49.5, 51.5, 54.5]} disabled={busy} required step="0.5" min={0} max={200} adjust="total"/> : <><label>Player name<input required maxLength={120} value={leg.side} disabled={busy} onChange={event => legChange(index, { side: event.target.value })}/></label><label>Player and exact selection<input required maxLength={200} placeholder="Player name · over 53.5 rushing yards" value={leg.selection} disabled={busy} onChange={event => legChange(index, { selection: event.target.value })}/></label></>}
            </>}
          </div>{draft.kind === 'parlay' && draft.legs.length > 2 && <button type="button" className="text-button" disabled={busy} onClick={() => change({ legs: draft.legs.filter((_, i) => i !== index) })}><Trash2 size={16}/>Remove leg {index + 1}</button>}</fieldset>;
        })}
        {draft.kind === 'parlay' && <button type="button" className="secondary" disabled={busy || draft.legs.length >= 20} onClick={() => change({ legs: [...draft.legs, emptyLeg()] })}><Plus size={18}/>Add parlay leg</button>}
      </>}
      <p className="social-help">Choose the exact terms on your ticket. These shortcuts are not sportsbook quotes.</p>
      <NumberChoices label={draft.kind === 'parlay' ? 'Combined American odds' : 'American odds'} presets={draft.kind === 'parlay' ? [150, 200, 300, 400, 500, 1000, 1400, 2100] : [-120, -115, -110, -105, 100, 110, 120, 150, 200]} format={american} value={draft.odds} onChange={odds => change({ odds })} disabled={busy} required={isTail} allowUnknown={!isTail}/>
      <NumberChoices label="Units risked" presets={[0.5, 1, 1.5, 2, 2.5, 3]} format={units} value={draft.stakeUnits} onChange={stakeUnits => change({ stakeUnits })} disabled={busy} required={isTail} allowUnknown={!isTail} min={0.01} max={10000}/>
      <BookChoices value={sourceLabel} onChange={source => change({ source })} disabled={busy} required={isTail}/>
      {isTail ? ticketDetails : <details className="social-ticket-details" open={isCorrect || undefined}><summary>Ticket details (optional)</summary>{ticketDetails}</details>}
      {!isTail && <p className="social-help">Leave unavailable odds, units and times blank. Unknown prices never become −110, and incomplete returns stay out of ROI. A parlay is one bet and one stake.</p>}
      {isCorrect && <label>Reason for correction<input required minLength={3} maxLength={300} value={draft.reason} disabled={busy} onChange={event => change({ reason: event.target.value })}/></label>}
      <label className="social-check"><input type="checkbox" checked={draft.countsForRecord} disabled={busy} onChange={event => change({ countsForRecord: event.target.checked })}/><span>Include in my records and Unit Betting qualification</span></label>
      {isTail && <label className="social-check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => { setConfirmed(event.target.checked); setDirty(true); }}/><span>I reviewed my own price, source, quote time and stake. These terms may differ from the original bet.</span></label>}
      {fromRecommendation && <label className="social-check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => { setConfirmed(event.target.checked); setDirty(true); }}/><span>I placed this bet elsewhere and checked these ticket terms.</span></label>}
      {!selectionReady && <p className="social-help">Choose a matchup and complete each selection.</p>}
      <div className="social-form-footer"><button className="primary" disabled={busy || !games.length || !selectionReady || !tailReady || !ticketReady}><Check size={18}/>{unconfirmed ? 'Save awaiting confirmation' : busy ? 'Saving…' : isTail ? 'Save my tailed bet' : isCorrect ? 'Save correction' : 'Save tracked bet'}</button><button type="button" className="secondary" disabled={busy} onClick={close}>Cancel</button></div>
    </form>
  </Modal>;
}

function ResultEditor({ entry, busy, error, recovery, unconfirmed, onClose, onSave, onDirty }) {
  const [outcome, setOutcome] = useState(entry.outcome === 'pending' ? 'win' : entry.outcome), [returned, setReturned] = useState(entry.actualReturnUnits ?? ''), [source, setSource] = useState(''), [dirty, setDirty] = useState(false);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  function close() { if (unconfirmed || !dirty || window.confirm('Discard your unsaved result?')) onClose(); }
  return <Modal title="Report this bet’s result" onClose={close} busy={busy && !unconfirmed}><form className="social-form" onSubmit={event => { event.preventDefault(); onSave({ outcome, actualReturnUnits: nullable(returned), reason: source.trim() }); }}>
    <p className="social-help">This is a player-reported result, visible in its audit. Report the ticket’s full return, including returned stake. A sportsbook or automated result feed has not verified it.</p><Alert>{error}</Alert>{recovery}
    <label>Outcome<select value={outcome} disabled={busy} onChange={event => { setOutcome(event.target.value); if (event.target.value === 'pending') setReturned(''); setDirty(true); }}><option value="win">Win</option><option value="loss">Loss</option><option value="push">Push</option><option value="void">Void</option><option value="pending">Return to pending</option></select></label>
    <label>Actual total return in units (optional)<input type="number" min="0" step="0.0001" inputMode="decimal" value={returned} disabled={busy || outcome === 'pending'} onChange={event => { setReturned(event.target.value); setDirty(true); }}/></label>
    <p className="social-help">Use the actual return for boosts, partial voids and repriced parlays. Without it, a complete ticket uses its saved odds. Unknown stake or odds keeps ROI incomplete.</p>
    <label>Result source / note<input required minLength={3} maxLength={300} value={source} disabled={busy} placeholder="Settled ticket at your sportsbook" onChange={event => { setSource(event.target.value); setDirty(true); }}/></label>
    <div className="social-form-footer"><button className="primary" disabled={busy}>{unconfirmed ? 'Save awaiting confirmation' : busy ? 'Saving…' : 'Save reported result'}</button><button className="secondary" type="button" onClick={close} disabled={busy}>Cancel</button></div>
  </form></Modal>;
}

function BetCard({ entry, games, actorId, following, busy, onAction, onFollow, rules }) {
  const own = entry.ownerId === actorId;
  const source = typeof entry.source === 'string' ? entry.source : entry.source?.name;
  const audit = entry.audit || entry.history || [];
  return <article className={`social-bet-card social-outcome-${entry.outcome || 'pending'}`}>
    <div className="social-card-head"><div className="social-player"><span className="social-avatar" aria-hidden="true">{(entry.ownerName || '?').slice(0, 1)}</span><div><strong>{entry.ownerName || 'Player'}{own && <small>YOU</small>}</strong><span>{entry.season} · Week {entry.week} · {entry.origin === 'virtual' ? 'Virtual pick' : 'Tracked bet'}</span></div></div>{!own && <button className="social-follow" aria-label={`${following.includes(entry.ownerId) ? 'Unfollow' : 'Follow'} ${entry.ownerName}`} aria-pressed={following.includes(entry.ownerId)} disabled={busy} onClick={() => onFollow(entry.ownerId)}><UserPlus size={16}/>{following.includes(entry.ownerId) ? 'Following' : 'Follow'}</button>}</div>
    <div className="social-card-title"><span className="social-kind">{entry.kind === 'parlay' ? <Layers3 size={18}/> : <Activity size={18}/>} {entry.kind === 'parlay' ? `${entry.legs.length}-leg parlay` : 'Single'}</span><span className={`social-status ${entry.outcome}`}>{entry.outcome || 'pending'}</span></div>
    {entry.kind === 'parlay' ? <details className="social-parlay"><summary><span>{entry.legs.slice(0, 2).map(legLabel).join(' · ')}{entry.legs.length > 2 ? ` · +${entry.legs.length - 2} more` : ''}</span><ChevronDown size={18}/></summary><ol>{entry.legs.map((leg, index) => <li key={index}><Selection leg={leg} games={games}/></li>)}</ol></details> : <Selection leg={entry.legs[0]} games={games}/>}
    {entry.sourceEntryId && <p className="social-lineage"><Copy size={15}/>Tailed from {entry.sourceOwnerName || entry.sourceOwnerId || 'another player'} · Original bet <span className="mono">{entry.sourceEntryId.slice(0, 8)}</span></p>}
    <dl className="social-bet-numbers"><div><dt>Risk</dt><dd>{units(entry.stakeUnits)}</dd></div><div><dt>{entry.kind === 'parlay' ? 'Combined odds' : 'Odds'}</dt><dd>{american(entry.odds)}</dd></div><div><dt>{entry.outcome === 'pending' ? 'Potential profit' : 'Net units'}</dt><dd>{units(entry.outcome === 'pending' ? entry.potentialProfitUnits : entry.netUnits)}</dd></div></dl>
    <p className="social-return">{entry.outcome === 'pending' ? `Potential total return: ${units(entry.potentialReturnUnits)}` : `Result: ${entry.origin === 'virtual' ? 'verified feed required' : 'player reported'}${Number.isFinite(entry.actualReturnUnits) ? ` · Actual return ${units(entry.actualReturnUnits)}` : ''}`}</p>
    {entry.notes && <p className="social-ticket-note">{entry.notes}</p>}
    {!own && entry.locked && <div className="social-lock" data-locked="true">{(entry.lockedMarkets || []).map(market => <p key={market}><Lock size={15} aria-hidden="true"/>{lockSentence(market, rules)}</p>)}{entry.noteHidden && <p className="social-lock-note">The ticket note shows with the line.</p>}</div>}
    {!own && !entry.locked && entry.noteHidden && <p className="social-lock-note social-lock-note-alone">The ticket note shows once every line on this ticket is open to you.</p>}
    {entry.lateEntry && <p className="social-late">Recorded after kickoff · timing is not verified by a ticket feed</p>}
    <div className="social-card-source"><span>{source || 'Sportsbook unknown'}</span><span>Quote: {entry.quotedAt ? `${date(entry.quotedAt)} PT` : 'time unknown'}</span><span>Placed: {entry.placedAt ? `${date(entry.placedAt)} PT` : 'time unknown'}</span></div>
    <div className="social-card-actions"><span className={`social-count-label ${entry.countsForRecord === false ? 'excluded' : ''}`}>{entry.countsForRecord === false ? 'Excluded from records' : 'Counts toward records'}</span>{!own && <button className="primary" disabled={busy || !entry.canTail} onClick={() => onAction('tail', entry)}><Copy size={16}/>Tail{entry.tailCount ? ` · ${entry.tailCount}` : ''}</button>}{!own && !entry.canTail && <small>{entry.locked ? 'Tail opens with the line.' : 'Tailing closed or terms unavailable'}</small>}</div>
    <details className="social-audit"><summary>Details & history<ChevronDown size={16}/></summary><div><p>Saved {date(entry.recordedAt)} PT · Revision {entry.revision ?? 0}</p><p>Bet ID: <span className="mono">{entry.id}</span></p>{entry.settledAt && <p>Reported {date(entry.settledAt)} PT · {entry.settlementSource === 'user_reported' ? 'Player reported' : typeof entry.settlementSource === 'string' ? entry.settlementSource : 'Source recorded in audit'}</p>}{entry.origin === 'virtual' && <p>Virtual picks await a verified automatic final-score feed. Player reporting is unavailable.</p>}{audit.length ? <ol>{audit.map((event, index) => <li key={index}><strong>{event.action || event.type || 'Revision'}</strong> · {date(event.at || event.recordedAt || event.timestamp)} PT{event.reason ? ` · ${event.reason}` : ''}{event.after?.countsForRecord !== undefined ? ` · ${event.after.countsForRecord ? 'Included' : 'Excluded'}` : ''}{event.before && <details><summary>Review saved change</summary><dl className="social-audit-change">{['odds', 'stakeUnits', 'countsForRecord', 'outcome', 'actualReturnUnits'].filter(key => event.before[key] !== event.after?.[key]).map(key => <div key={key}><dt>{key}</dt><dd>{String(event.before[key] ?? 'unknown')} → {String(event.after?.[key] ?? 'unknown')}</dd></div>)}</dl>{JSON.stringify(event.before.legs) !== JSON.stringify(event.after?.legs) && <p>Selections: {(event.before.legs || []).map(legLabel).join(' · ')} → {(event.after?.legs || []).map(legLabel).join(' · ')}</p>}</details>}</li>)}</ol> : <p>No additional changes recorded.</p>}{own && <div className="social-owner-actions">{entry.origin !== 'virtual' && <>{entry.outcome === 'pending' && <button className="secondary" disabled={busy} onClick={() => onAction('correct', entry)}>Correct ticket</button>}<button className="secondary" disabled={busy} onClick={() => onAction('settle', entry)}>Report result</button></>}<button className="secondary" disabled={busy} onClick={() => onAction('include', entry)}>{entry.countsForRecord === false ? 'Include in records' : 'Exclude from records'}</button></div>}</div></details>
  </article>;
}

function Metrics({ summary = {} }) { return <div className="social-metrics" aria-label="Filtered included bet records"><div><span>W–L–P record</span><strong>{summary.record || '0–0–0'}</strong><small>{summary.pending || 0} pending · {summary.voids || 0} void</small></div><div><span>Net units</span><strong className={summary.netUnits > 0 ? 'social-positive' : summary.netUnits < 0 ? 'social-negative' : ''}>{summary.roiSampleCount ? units(summary.netUnits) : '—'}</strong><small>Settled bets with complete returns</small></div><div><span>ROI</span><strong>{percent(summary.roiPercent)}</strong><small>{units(summary.settledStakeUnits)} settled risk · {summary.roiSampleCount || 0} tickets</small></div><div><span>Win rate</span><strong>{percent(summary.winRatePercent)}</strong><small>Wins ÷ wins + losses</small></div></div>; }

function NetChart({ points = [] }) {
  const id = useId();
  const values = points.filter(point => Number.isFinite(point.cumulativeNetUnits));
  const minimum = Math.min(0, ...values.map(point => point.cumulativeNetUnits)), maximum = Math.max(0, ...values.map(point => point.cumulativeNetUnits));
  const range = maximum - minimum || 1;
  const y = value => 148 - (value - minimum) / range * 120;
  const groups = [...new Set(values.map(point => point.ownerId))].map(ownerId => ({ ownerId, name: values.find(point => point.ownerId === ownerId)?.ownerName || 'Player', points: values.filter(point => point.ownerId === ownerId) }));
  const colors = ['var(--cyan)', 'var(--primaryForeground,var(--primary))', 'var(--pending)', 'var(--tie)', 'var(--win)', 'var(--loss)'];
  const first = Math.min(...values.map(point => new Date(point.at).valueOf())), last = Math.max(...values.map(point => new Date(point.at).valueOf()));
  const x = point => 70 + (new Date(point.at).valueOf() - first) / (last - first || 1) * 438;
  return <section className="social-chart panel"><h3><TrendingUp size={20}/>Net unit history</h3><p>Each player’s cumulative net from complete, settled tickets matching these filters. Pending and void stakes are excluded.</p>{values.length ? <><div className="social-chart-legend">{groups.map((group, index) => <span key={group.ownerId}><i style={{ background: colors[index % colors.length] }}/>{group.name}: {units(group.points.at(-1).cumulativeNetUnits)}</span>)}</div><svg viewBox="0 0 550 184" role="img" aria-labelledby={id}><title id={id}>Cumulative net units by player: {groups.map(group => `${group.name}, ${units(group.points.at(-1).cumulativeNetUnits)}`).join('; ')}</title><line x1="48" y1={y(0)} x2="518" y2={y(0)} className="social-chart-zero"/><text x="6" y="31">{number(maximum)}u</text><text x="6" y="151">{number(minimum)}u</text>{groups.map((group, index) => <g key={group.ownerId}><polyline points={[`48,${y(0)}`, ...group.points.map(point => `${x(point)},${y(point.cumulativeNetUnits)}`)].join(' ')} className="social-chart-line" style={{ stroke: colors[index % colors.length], strokeDasharray: index % 2 ? '6 3' : 'none' }}/>{group.points.map((point, pointIndex) => <circle key={pointIndex} cx={x(point)} cy={y(point.cumulativeNetUnits)} r="4" style={{ fill: colors[index % colors.length] }}><title>{group.name} · {date(point.at)}: {units(point.cumulativeNetUnits)} cumulative</title></circle>)}</g>)}<text x="48" y="176">First settlement</text><text x="518" y="176" textAnchor="end">Latest</text></svg><details><summary>View chart data</summary><div className="social-table-scroll" tabIndex={0} role="region" aria-label="Net history data"><table><caption>Filtered cumulative net units, calculated separately per player</caption><thead><tr><th>Player</th><th>Settled</th><th>Bet net</th><th>Cumulative</th></tr></thead><tbody>{values.map((point, index) => <tr key={index}><td>{point.ownerName}</td><td>{date(point.at)} PT</td><td>{units(point.netUnits)}</td><td>{units(point.cumulativeNetUnits)}</td></tr>)}</tbody></table></div></details></> : <div className="social-chart-empty">Your first complete settled bet will start this chart.</div>}</section>;
}

function Selections({ rows = [], summary = {} }) {
  const maximum = Math.max(1, ...rows.map(row => row.count));
  const recordTotal = (summary.wins || 0) + (summary.losses || 0) + (summary.pushes || 0);
  return <section className="social-chart panel"><h3><BarChart3 size={20}/>Selection & record breakdown</h3><p>Leg counts show where players are picking. A parlay still counts once in records and ROI.</p><div className="social-record-bar" role="img" aria-label={`${summary.wins || 0} wins, ${summary.losses || 0} losses, ${summary.pushes || 0} pushes`}>{[['win', summary.wins], ['loss', summary.losses], ['push', summary.pushes]].map(([key, count]) => count > 0 && <span key={key} className={key} style={{ flex: count / (recordTotal || 1) }}/>)}</div><div className="social-record-key"><span>W {summary.wins || 0}</span><span>L {summary.losses || 0}</span><span>P {summary.pushes || 0}</span></div>{rows.length ? <ul className="social-selection-bars">{rows.map((row, index) => <li key={index}><div><span>{row.label}</span><strong>{row.count}</strong></div><span className="social-bar-track" aria-hidden="true"><i style={{ width: `${row.count / maximum * 100}%` }}/></span></li>)}</ul> : <div className="social-chart-empty">Selection patterns appear when bets are added.</div>}</section>;
}

function Leaderboard({ rows, actorId, following, busy, onFollow, onSelect, allHistory }) {
  const [sort, setSort] = useState('netUnits');
  const sorted = useMemo(() => [...rows].sort((a, b) => (Number.isFinite(b[sort]) ? b[sort] : -Infinity) - (Number.isFinite(a[sort]) ? a[sort] : -Infinity)), [rows, sort]);
  return <section className="panel social-leaderboard"><div className="social-section-heading"><div><h2>Compare players</h2><p>{allHistory ? 'Overall records include unqualified weeks.' : 'Weekly qualification: at least 3 included bets OR 3 units risked. Unqualified players retain their records.'}</p></div><label>Sort by<select value={sort} onChange={event => setSort(event.target.value)}><option value="netUnits">Net units</option><option value="roiPercent">ROI</option><option value="winRatePercent">Win rate</option><option value="bets">Bet count</option></select></label></div><div className="social-table-scroll" role="region" aria-label="Player comparison table" tabIndex={0}><table><caption>Included records and return coverage for the selected filters</caption><thead><tr><th scope="col">Player</th><th scope="col">Record</th><th scope="col">Net units</th><th scope="col">ROI</th><th scope="col">Settled risk</th><th scope="col">ROI sample</th><th scope="col">Weekly status</th><th scope="col">Follow</th></tr></thead><tbody>{sorted.map(row => <tr key={row.ownerId}><th scope="row"><button className="text-button" onClick={() => onSelect(row.ownerId)}>{row.displayName}{row.ownerId === actorId ? ' · You' : ''}</button></th><td>{row.record}</td><td>{row.roiSampleCount ? units(row.netUnits) : '—'}</td><td>{percent(row.roiPercent)}</td><td>{units(row.settledStakeUnits)}</td><td>{row.roiSampleCount || 0} complete · {row.incompleteCount || 0} incomplete</td><td>{allHistory ? 'Overall history' : row.qualified ? 'Qualified' : `${row.qualificationBets || 0} bets · ${units(row.qualificationUnits)} / pending qualification`}</td><td>{row.ownerId !== actorId ? <button className="secondary" disabled={busy} aria-pressed={following.includes(row.ownerId)} onClick={() => onFollow(row.ownerId)}>{following.includes(row.ownerId) ? 'Following' : 'Follow'}</button> : 'You'}</td></tr>)}</tbody></table></div>{!rows.length && <p className="social-empty">No player records match these filters yet.</p>}</section>;
}

export default function SocialBetTracker({ player, initialView = 'feed', onDirty, onSaved, onSignInAgain, embedded = false, compactTickets = false, TicketRow, MetricsView, ticketRequest, onTicketConsumed, initialOutcome = '', initialAllHistory = false, autoCreate = false, navigationState, onNavigationState }) {
  const [tab, setTab] = useState(ticketRequest ? 'mybets' : navigationState?.tab ?? (initialView === 'mybets' ? 'mybets' : initialView === 'units' ? 'myweek' : 'feed'));
  // DP-3 (redesign stage 21): the tracker opens on the current published week. Until the player picks a week, the read names
  // none and the server answers with the newest published week (the week /community/read shows), never a fixed Week 5.
  const [selectedWeek, setSelectedWeek] = useState(() => ticketRequest ? { season: ticketRequest.ticket.season, week: ticketRequest.ticket.week } : navigationState?.selectedWeek ?? null), [currentWeek, setCurrentWeek] = useState(null);
  const shownWeek = selectedWeek ?? currentWeek;
  const [filters, setFilters] = useState(() => ({ ...defaultFilters, outcome: initialOutcome, ...navigationState?.filters })), [storedData, setStoredData] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [editor, setEditor] = useState(null), [editorError, setEditorError] = useState(''), [allHistory, setAllHistory] = useState(ticketRequest || autoCreate ? false : navigationState?.allHistory ?? initialAllHistory);
  const [editorDirty, setEditorDirty] = useState(false), [uncertain, setUncertain] = useState(false), [reviewed, setReviewed] = useState(false), [checking, setChecking] = useState(false);
  const pendingSave = useRef(null);
  const consumedTicket = useRef(null), createOpened = useRef(false);
  const [createAfterRead, setCreateAfterRead] = useState(false);
  const navigationChange = useRef(onNavigationState);
  navigationChange.current = onNavigationState;
  useEffect(() => { navigationChange.current?.({ tab, selectedWeek, filters, allHistory }); }, [tab, selectedWeek, filters, allHistory]);
  const request = useRef(null), requestSignature = useRef(''), requestEnvelope = useRef(null), refreshId = useRef(0);
  const [resolvedActor, setResolvedActor] = useState(null);
  const suppliedPlayerId = typeof player === 'string' ? player : player?.id;

  // Hosted players already have UUIDs; local preview slugs must be resolved by the reader first.
  const actorId = (resolvedActor && resolvedActor.playerId === suppliedPlayerId ? resolvedActor.actorId : null) || (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suppliedPlayerId || '') ? suppliedPlayerId : null);
  const ownView = tab === 'myweek' || tab === 'mybets';
  const weekPlayerId = ownView ? actorId || '' : undefined;
  const effectiveFilters = useMemo(() => Object.fromEntries(Object.entries({ ...filters, ...(weekPlayerId !== undefined ? { playerId: weekPlayerId } : {}), ...(tab === 'mybets' ? { origin: 'tracked' } : {}) }).filter(([, value]) => value !== '' && value !== undefined)), [filters, weekPlayerId, tab]);
  const queryKey = JSON.stringify([suppliedPlayerId, allHistory, selectedWeek, effectiveFilters]);
  const activeQuery = useRef(queryKey), readGeneration = useRef(0);
  activeQuery.current = queryKey;
  const data = storedData?.queryKey === queryKey ? storedData.data : null;
  const filtered = Object.entries(filters).some(([key, value]) => value !== defaultFilters[key] && !(ownView && key === 'playerId') && !(tab === 'mybets' && key === 'origin'));
  const load = useCallback(async signal => {
    // A mutation may finish after navigation. Its captured loader must not supersede the active read.
    if (activeQuery.current !== queryKey || signal?.aborted) return;
    const generation = ++readGeneration.current;
    const current = () => !signal?.aborted && activeQuery.current === queryKey && readGeneration.current === generation;
    let result;
    try { result = await socialApi('read', { ...(allHistory ? { allHistory: true } : selectedWeek ?? {}), filters: effectiveFilters }, player, signal); }
    catch (failure) { if (!current()) return; if (failure.status === 401 && !failure.uncertain) onSignInAgain?.(); if (failure.status === 403 || failure.status === 404) setStoredData(null); throw failure; }
    if (current()) {
      setResolvedActor({ playerId: suppliedPlayerId, actorId: result.actorId });
      // Resolving a local identity triggers the filtered read; never draw Everyone as My week.
      if (weekPlayerId === undefined || weekPlayerId === result.actorId) setStoredData({ queryKey, data: result });
      if (!allHistory && !selectedWeek && Number.isInteger(result?.season) && Number.isInteger(result?.week)) setCurrentWeek({ season: result.season, week: result.week });
    }
    return result;
  }, [selectedWeek, effectiveFilters, allHistory, player, onSignInAgain, weekPlayerId, suppliedPlayerId, queryKey]);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); load(controller.signal).catch(failure => { if (!controller.signal.aborted && activeQuery.current === queryKey && failure.name !== 'AbortError') setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [load]);
  const previousInitialView = useRef(initialView);
  useEffect(() => { if (previousInitialView.current !== initialView) { previousInitialView.current = initialView; setTab(initialView === 'mybets' ? 'mybets' : initialView === 'units' ? 'myweek' : 'feed'); } }, [initialView]);
  useEffect(() => { onDirty?.(editorDirty || busy || uncertain); }, [editorDirty, busy, uncertain, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => {
    if (!ticketRequest || consumedTicket.current === ticketRequest.id || !data || loading) return;
    if (ticketRequest.accountId !== data.actorId || data.season !== ticketRequest.ticket.season || data.week !== ticketRequest.ticket.week) return;
    consumedTicket.current = ticketRequest.id;
    if (!ticketRequest.ticket.legs.every(leg => data.games.some(game => game.id === leg.gameId))) {
      setError('That recommendation’s matchup is unavailable. Refresh recommendations to review it again.');
    } else {
      setEditor({ action: 'create', entry: ticketRequest.ticket, fromRecommendation: true });
    }
    onTicketConsumed?.();
  }, [ticketRequest, data, loading, onTicketConsumed]);
  useEffect(() => {
    if (!(autoCreate || createAfterRead) || createOpened.current || loading || !data?.games?.length || !shownWeek) return;
    createOpened.current = true;
    setCreateAfterRead(false);
    action('create');
  }, [autoCreate, createAfterRead, loading, data, shownWeek]);
  async function refresh() { if (loading) return; const id = ++refreshId.current; setLoading(true); setError(''); try { await load(); } catch (failure) { setError(failure.message); } finally { if (refreshId.current === id) setLoading(false); } }
  async function mutate(action, body, entry) {
    if (busy) return;
    setBusy(true); setUncertain(false); setReviewed(false); setEditorError(''); setError(''); setNotice('');
    pendingSave.current = { action, body, entry };
    const signature = JSON.stringify({ action, body, entryId: entry?.id, revision: entry?.revision });
    if (requestSignature.current !== signature) request.current = null;
    requestSignature.current = signature;
    if (!request.current) { requestEnvelope.current = null; request.current = crypto.randomUUID(); }
    try {
      if (!requestEnvelope.current) {
      let current = data;
      if (action !== 'follow' && (allHistory || entry && (entry.season !== shownWeek?.season || entry.week !== shownWeek?.week))) current = await socialApi('read', { season: entry?.season || shownWeek.season, week: entry?.week || shownWeek.week }, player);
      requestEnvelope.current = action === 'follow' ? { requestId: request.current, ...body } : { season: entry?.season || shownWeek.season, week: entry?.week || shownWeek.week, weekRevision: current.weekRevision, requestId: request.current, ...(entry && ['settle', 'include', 'correct'].includes(action) ? { entryId: entry.id, revision: entry.revision } : {}), ...body };
      }
      await socialApi(action, requestEnvelope.current, player);
      request.current = null; requestEnvelope.current = null; setEditor(null); setEditorDirty(false); setNotice(action === 'tail' ? 'Your tailed bet is saved in the shared feed and your Unit Betting week.' : action === 'follow' ? 'Following preference saved.' : 'Saved. The shared feed and weekly records use this same bet.');
      onSaved?.();
      try { await load(); } catch { setError('Your change was saved, but the feed could not refresh. Refresh to load the latest records.'); }
    } catch (failure) {
      if (failure.status === 401 && !failure.uncertain) onSignInAgain?.();
      if (failure.uncertain) setUncertain(true);
      if (editor) setEditorError(failure.message); else setError(failure.message);
      if (failure.status === 409 && !failure.uncertain) { request.current = null; try { const latest = await load(); if (editor?.entry) { const updated = latest.entries.find(item => item.id === editor.entry.id); if (updated) setEditor(current => current ? { ...current, entry: updated } : current); } } catch { /* Preserve draft and original save error. */ } }
    } finally { setBusy(false); }
  }
  function action(type, entry) {
    if (uncertain) return;
    request.current = null; setEditorError('');
    if (type === 'include') return mutate('include', { countsForRecord: entry.countsForRecord === false, reason: entry.countsForRecord === false ? 'Player included bet in records' : 'Player excluded bet from records' }, entry);
    setEditor({ action: type, entry });
  }
  function setFilter(key, value) { setFilters(current => ({ ...current, [key]: value })); }
  function switchTab(next) { setTab(next); if (next === 'mybets') setFilter('following', false); if (next === 'myweek') { setAllHistory(false); setFilter('following', false); } if (next === 'history') setAllHistory(true); }
  const entries = data?.entries || [], profiles = data?.profiles || [], following = data?.following || [], games = data?.games || [];
  const availableWeeks = data?.availableWeeks?.length ? data.availableWeeks : shownWeek ? [shownWeek] : [];
  function createTicket() {
    if (shownWeek) return action('create');
    const latest = [...availableWeeks].sort((a, b) => b.season - a.season || b.week - a.week)[0];
    if (!latest) return;
    setSelectedWeek(latest);
    setAllHistory(false);
    createOpened.current = false;
    setCreateAfterRead(true);
  }
  const allGames = data?.allGames || games;
  const summary = data?.summary || {};
  async function checkSaved() {
    setChecking(true);
    try { await load(); setReviewed(true); }
    catch (failure) { if (editor) setEditorError(failure.message); else setError(failure.message); }
    finally { setChecking(false); }
  }
  const recovery = uncertain ? <div className="social-recovery" role="status"><p>{reviewed ? 'Saved bets refreshed. Retry this exact request to confirm its result; it cannot create a duplicate.' : 'Your entered values are preserved. Check saved bets before confirming this request.'}</p><button type="button" className="secondary" disabled={checking} onClick={checkSaved}>{checking ? 'Checking…' : 'Check saved bets'}</button><button type="button" className="secondary" disabled={!reviewed || checking} onClick={() => { const pending = pendingSave.current; if (pending) mutate(pending.action, pending.body, pending.entry); }}>Retry same save</button></div> : null;
  const Heading = embedded ? 'h2' : 'h1';
  const overview = <> <p className="social-help">{filtered ? "Filtered summary · matching bets only" : "Summary · selected week scope"}</p>{MetricsView && tab === 'mybets' ? <MetricsView summary={summary} points={data?.chart || []} player={actorId}/> : <Metrics summary={summary}/>}{tab === 'myweek' && !allHistory && <p className="social-week-qualification"><ShieldCheck size={18}/><span><strong>{summary.qualified ? 'Qualified for this week' : 'Weekly qualification in progress'}</strong> · {summary.qualificationBets || 0} included bets · {units(summary.qualificationUnits)} risked. Qualify with at least 3 bets OR 3 units. Your record is retained either way.</span></p>}<p className="social-data-note">{summary.excludedCount || 0} excluded · {summary.incompleteCount || 0} incomplete return records. ROI = net units ÷ risk on settled, complete bets. Tracked outcomes are player reported.</p> </>;
  return <div className={compactTickets ? 'social-tracker gx-ticket-tracker' : 'social-tracker'}>
    <header className="social-heading"><div>{initialView !== 'mybets' && <p className="social-eyebrow"><Users size={16}/>THE SHARED BETTING BOARD</p>}{compactTickets ? <label>View<select aria-label="Bet tracker view" value={tab} onChange={event => switchTab(event.target.value)}>{[['mybets', 'My bets'], ['feed', 'All bets'], ['myweek', 'My week'], ['compare', 'Compare'], ['history', 'History']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : <Heading>{initialView === 'mybets' ? (ownView ? 'My bets' : 'Shared bets') : embedded ? 'Tracked bets' : initialView === 'units' ? 'Unit Betting' : 'Bet Tracker'}</Heading>}{initialView !== 'mybets' && <p>Follow the picks. Tail with your own terms. See the whole record.</p>}</div><button className="primary" disabled={busy || uncertain || loading || !games.length || (!shownWeek && !availableWeeks.length)} onClick={createTicket}><Plus size={19}/>Add bet</button></header>
    {initialView !== 'mybets' && <p className="social-visibility"><ShieldCheck size={17}/>Shared with all signed-in players · New bets count by default · One bet record across feed and Unit Betting</p>}
    {!compactTickets && <div className="social-tabs" role="group" aria-label="Bet tracker view">{[...(initialView === 'mybets' ? [['mybets', Activity, 'My bets']] : []), ['feed', Users, 'All bets'], ['myweek', Activity, 'My week'], ['compare', BarChart3, 'Compare'], ['history', History, 'History']].map(([key, Icon, label]) => <button key={key} aria-pressed={tab === key} onClick={() => switchTab(key)}><Icon size={18}/>{label}</button>)}</div>}
    <div className="social-toolbar"><label>Competition week<select value={allHistory ? 'all' : shownWeek ? `${shownWeek.season}:${shownWeek.week}` : ''} disabled={busy} onChange={event => { if (event.target.value === 'all') { setAllHistory(true); if (tab === 'myweek') { setTab('history'); setFilter('playerId', data?.actorId || ''); } } else if (event.target.value) { const [nextSeason, nextWeek] = event.target.value.split(':').map(Number); setSelectedWeek({ season: nextSeason, week: nextWeek }); setAllHistory(false); } }}>{!allHistory && !shownWeek && <option value="">Current week</option>}<option value="all">All weeks</option>{availableWeeks.map(item => <option key={`${item.season}:${item.week}`} value={`${item.season}:${item.week}`}>{item.season} · Week {item.week}</option>)}</select></label>{tab !== 'mybets' && <label>Player<select value={ownView ? actorId || '' : filters.playerId} disabled={ownView || busy} onChange={event => setFilter('playerId', event.target.value)}><option value="">Everyone</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>}{tab !== 'mybets' && <button disabled={ownView} className={`secondary ${filters.following ? 'social-selected' : ''}`} aria-pressed={filters.following} onClick={() => setFilter('following', !filters.following)}><UserPlus size={17}/>Following</button>}<button className="icon-button" aria-label="Refresh bet tracker" disabled={busy || loading} onClick={refresh}><RefreshCw size={19} className={loading ? 'spin' : ''}/></button></div>
    {initialView === 'mybets' && <div className="social-ticket-detail-fields"><ChoiceButtons label="Result filter" value={filters.outcome} options={[{value:'',label:'All'},{value:'pending',label:'Pending'},{value:'settled',label:'Settled'}]} onChange={value => setFilter('outcome', value)}/>{!compactTickets && <ChoiceButtons label="Market filter" value={filters.market} options={[{value:'',label:'All markets'},{value:'spread',label:'Spreads'},{value:'total',label:'Totals'},{value:'prop',label:'Props'}]} onChange={value => setFilter('market', value)}/>}</div>}
    <details className="social-filters panel"><summary><Filter size={18}/><span>Filter bets & record settings</span><ChevronDown size={18}/></summary><div className="social-filter-body">{compactTickets && <ChoiceButtons label="Market filter" value={filters.market} options={[{value:'',label:'All markets'},{value:'spread',label:'Spreads'},{value:'total',label:'Totals'},{value:'prop',label:'Props'}]} onChange={value => setFilter('market', value)}/>}<div className="social-filter-grid"><label>Bet type<select value={filters.kind} onChange={event => setFilter('kind', event.target.value)}><option value="">Singles & parlays</option><option value="single">Singles</option><option value="parlay">Parlays</option></select></label><label>Market<select value={filters.market} onChange={event => setFilter('market', event.target.value)}><option value="">All markets</option><option value="spread">Spread</option><option value="total">Total</option><option value="prop">Player props</option></select></label><label>Result<select value={filters.outcome} onChange={event => setFilter('outcome', event.target.value)}><option value="">All results</option>{['pending', 'settled', 'win', 'loss', 'push', 'void'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Origin<select disabled={tab === 'mybets'} value={tab === 'mybets' ? 'tracked' : filters.origin} onChange={event => setFilter('origin', event.target.value)}><option value="">All origins</option><option value="tracked">Tracked tickets</option><option value="virtual">Virtual picks</option><option value="tailed">Tailed bets</option></select></label><label>Record inclusion<select value={filters.counts} onChange={event => setFilter('counts', event.target.value)}><option value="all">Show all bets</option><option value="included">Included only</option><option value="excluded">Excluded only</option></select></label><label>Team<select value={filters.team} onChange={event => setFilter('team', event.target.value)}><option value="">All teams</option>{[...new Set(allGames.flatMap(game => [game.away, game.home]))].filter(Boolean).sort().map(team => <option key={team} value={team}>{team}</option>)}</select></label></div><div className="social-scope"><strong>Comparison options</strong>{[['includeParlays', 'Include parlays'], ['includeTailed', 'Include tailed bets'], ['includeTracked', 'Include tracked tickets']].map(([key, label]) => <label className="social-check" key={key}><input type="checkbox" checked={filters[key]} onChange={event => setFilter(key, event.target.checked)}/><span>{label}</span></label>)}</div><p className="social-help">These filters change this comparison. Bet owners can include or exclude their own tickets in Details & history; every change is audited.</p><button className="text-button" onClick={() => setFilters(defaultFilters)}>Reset filters</button></div></details>
    <Alert>{error}</Alert>{!editor && recovery}{error && !editor && !uncertain && <button className="secondary" onClick={refresh} disabled={busy || loading}>Try again</button>}{notice && <p className="social-notice" role="status">{notice}</p>}{loading && <p className="social-loading" role="status">Loading saved bets and records…</p>}
    {data && <div className={loading ? 'social-content social-refreshing' : 'social-content'} aria-busy={loading}>
      {!(compactTickets && tab === 'mybets' && !MetricsView) && overview}
      {(tab === 'compare' || tab === 'history') && <Leaderboard rows={data.leaderboard || []} actorId={actorId} following={following} busy={busy || uncertain} allHistory={allHistory} onFollow={id => { request.current = null; mutate('follow', { targetUserId: id, following: !following.includes(id) }); }} onSelect={id => { setFilter('playerId', id); setTab('history'); setAllHistory(true); }}/>}
      {(tab === 'compare' || tab === 'history') && <div className="social-charts"><NetChart points={data.chart || []}/><Selections rows={data.selectionBreakdown || []} summary={summary}/></div>}

      <div className="social-section-heading"><div><h2>{tab === 'mybets' ? 'Your bets' : tab === 'myweek' ? 'Your weekly bet card' : tab === 'history' ? 'Bet history' : 'The bet feed'}</h2><p>{entries.length} {entries.length === 1 ? 'bet' : 'bets'} · {allHistory ? 'All available weeks' : shownWeek ? `${shownWeek.season}, Week ${shownWeek.week}` : 'Current week'}</p></div><span className="social-help">Newest first</span></div>
      {entries.length ? <div className="social-feed">{entries.map(entry => { const entryGames = allGames.filter(game => (game.season == null || game.season === entry.season) && (game.week == null || game.week === entry.week)); const card = <BetCard key={entry.id} entry={entry} games={entryGames} actorId={actorId} following={following} busy={busy || uncertain || loading} rules={data.rules} onAction={action} onFollow={id => { request.current = null; mutate('follow', { targetUserId: id, following: !following.includes(id) }); }}/>; return compactTickets && tab === 'mybets' && TicketRow ? <TicketRow key={entry.id} entry={entry} games={entryGames}>{card}</TicketRow> : card; })}</div> : <section className="panel social-empty"><Layers3 size={32}/><h2>{filtered ? 'No bets match these filters.' : filters.following ? 'Your following feed is ready.' : 'Every record starts with a bet.'}</h2><p>{filters.following ? 'Follow a player from All bets or Compare to see their selections here.' : 'Add a single or parlay, or adjust your filters to explore saved bets.'}</p>{filtered ? <button className="secondary" onClick={() => setFilters(defaultFilters)}>Clear filters</button> : <button className="secondary" disabled={busy || uncertain || loading || !games.length || (!shownWeek && !availableWeeks.length)} onClick={createTicket}>Add your first bet<ArrowUpRight size={17}/></button>}</section>}
      {compactTickets && tab === 'mybets' && !MetricsView && overview}
      {ownView && <details className="social-performance panel"><summary><TrendingUp size={18}/><span>Performance & selection charts</span><ChevronDown size={18}/></summary><div className="social-charts"><NetChart points={data.chart || []}/><Selections rows={data.selectionBreakdown || []} summary={summary}/></div></details>}
    </div>}
    {editor && (editor.action === 'settle' ? <ResultEditor key={editor.entry.id} entry={editor.entry} busy={busy || uncertain} error={editorError} recovery={recovery} unconfirmed={uncertain} onClose={() => setEditor(null)} onDirty={setEditorDirty} onSave={body => mutate('settle', body, editor.entry)}/> : <BetEditor key={`${editor.action}:${editor.entry?.id || 'new'}`} action={editor.action} fromRecommendation={editor.fromRecommendation} entry={editor.entry} games={games.filter(game => (game.season == null || game.season === (editor.entry?.season || shownWeek?.season)) && (game.week == null || game.week === (editor.entry?.week || shownWeek?.week)))} season={editor.entry?.season || shownWeek?.season} week={editor.entry?.week || shownWeek?.week} busy={busy || uncertain} error={editorError} recovery={recovery} unconfirmed={uncertain} onClose={() => setEditor(null)} onDirty={setEditorDirty} onSave={body => mutate(editor.action, { ...body, ...(editor.action === 'tail' ? { sourceEntryId: editor.entry.id } : {}) }, editor.entry)}/>)}
  </div>;
}
