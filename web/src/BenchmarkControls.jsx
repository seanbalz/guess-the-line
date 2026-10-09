import React, { useEffect, useId, useRef, useState } from 'react';
import { LockKeyhole, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { cloudApi, date } from './api';

function FreezeReview({ actualKickoff, sourceURL, busy, error, onClose, onConfirm }) {
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal(); ref.current?.querySelector('[data-initial-focus]')?.focus();
    return () => previous?.focus();
  }, []);
  return <dialog ref={ref} className="modal submit-review" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-heading"><h2 id={titleId}>Freeze this scoring benchmark?</h2><button type="button" className="icon-button" aria-label="Close freeze review" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    <p className="review-description">This permanently freezes the approved Week 5 Spread benchmark for this Duel using eligible quotes from before actual kickoff. The frozen reference cannot be replaced or edited.</p>
    <dl className="freeze-review-details"><div><dt>Confirmed actual kickoff</dt><dd>{date(actualKickoff)} Pacific<br/>{actualKickoff} UTC</dd></div><div><dt>Your kickoff evidence</dt><dd>{sourceURL}</dd></div></dl>
    <p className="hub-help">You are confirming actual play began at this time. A scheduled kickoff time alone is insufficient.</p>
    {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
    <div className="review-actions"><button type="button" className="secondary" data-initial-focus disabled={busy} onClick={onClose}>Keep editing</button><button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Freezing…' : 'Freeze benchmark permanently'}<LockKeyhole size={17}/></button></div>
  </dialog>;
}

export default function BenchmarkControls({ data, onFrozen }) {
  const [kickoff, setKickoff] = useState(''), [sourceURL, setSourceURL] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [frozen, setFrozen] = useState(null);
  const requestId = useRef(null);
  const benchmark = data.scoringBenchmark;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device time zone';
  const actualKickoff = kickoff && Number.isFinite(Date.parse(kickoff)) ? new Date(kickoff).toISOString() : null;
  const windowStarts = Date.parse(data.league.deadline) - 30 * 60_000;
  const windowOpen = Number.isFinite(windowStarts) && Date.parse(data.now) >= windowStarts;
  const completed = frozen || (benchmark.status === 'frozen' ? benchmark : null);
  function change(setter, value) { requestId.current = null; setError(''); setter(value); }
  function openReview(event) {
    event.preventDefault();
    if (!actualKickoff || !confirmed || !windowOpen) return;
    try { const url = new URL(sourceURL); if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(); }
    catch { setError('Use an HTTPS source URL without a sign-in, password, or fragment.'); return; }
    setError(''); setReview(true);
  }
  async function freeze() {
    if (busy || !actualKickoff || !confirmed || !windowOpen) return;
    setBusy(true); setError(''); requestId.current ||= crypto.randomUUID();
    try {
      const result = await cloudApi('benchmark/freeze', { requestId: requestId.current, actualKickoff, sourceURL: sourceURL.trim() }, { league: data.league.id });
      if (result.status !== 'frozen') throw new Error('The freeze was not confirmed. Check the saved status before retrying.');
      setFrozen(result); setReview(false); await onFrozen?.();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="panel benchmark-controls" aria-labelledby="benchmark-controls-heading">
    <div className="panel-heading"><div><h2 id="benchmark-controls-heading">Scoring benchmark freeze</h2><p>Commissioner control · Week 5 Spread · This Duel only</p></div><ShieldCheck size={20}/></div>
    <div className="benchmark-controls-body">{completed ? <div className="callout" role="status"><LockKeyhole size={18}/><p><strong>Benchmark frozen.</strong> Actual kickoff: {date(completed.actualKickoff)} PT. This scoring reference is immutable.</p></div> : <>
      <p>The approved source is the DraftKings / FanDuel / BetMGM median. Before kickoff, collect a fresh set of quotes using Triple Threat’s manual connection controls. After play actually begins, record the confirmed start time and a source that supports it.</p>
      <p className="hub-help">Freezing is manual. The server requires complete eligible quotes before actual kickoff and rejects future or invalid start times. Total and Challenge are separate.</p>
      {!windowOpen&&<div className="callout"><LockKeyhole size={18}/><div><p>Freeze controls stay disabled until {date(new Date(windowStarts).toISOString())} PT. After that time, confirm the actual observed start; reaching the scheduled time does not authorize a freeze.</p><button type="button" className="secondary" onClick={onFrozen}>Refresh kickoff window</button></div></div>}
      <form className="hub-form" onSubmit={openReview}>
        <label htmlFor="actual-kickoff">Observed actual kickoff · {deviceZone}<input id="actual-kickoff" type="datetime-local" step="1" required value={kickoff} onChange={event => change(setKickoff, event.target.value)} disabled={busy}/></label>
        <label htmlFor="kickoff-source">Official kickoff source URL<input id="kickoff-source" type="url" required placeholder="https://…" value={sourceURL} onChange={event => change(setSourceURL, event.target.value)} disabled={busy}/></label>
        <label className="practice-choice"><input type="checkbox" checked={confirmed} onChange={event => change(setConfirmed, event.target.checked)} disabled={busy}/><span>I observed actual kickoff and confirmed it using the linked source. This is not merely the scheduled start time.</span></label>
        {error && !review && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
        <button type="submit" className="primary" disabled={busy || !windowOpen || !actualKickoff || !sourceURL.trim() || !confirmed}>Review permanent freeze<LockKeyhole size={17}/></button>
      </form>
    </>}</div>
    {review && <FreezeReview actualKickoff={actualKickoff} sourceURL={sourceURL.trim()} busy={busy} error={error} onClose={() => setReview(false)} onConfirm={freeze}/>}
  </section>;
}
