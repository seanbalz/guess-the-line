import React, { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { communityApi } from './api';
import './community.css';

const MODE = { guess_spread: 'Spread', guess_total: 'Total' };

/**
 * D-23 final weekly opt-out. Sitting out forfeits that mode's score for the week
 * (recorded as sat out, never zero), clears its picks-due notice and reveals the
 * other players' picks. Cloud only: it writes through /community/sit-out.
 * The trigger is a text link in its own row below the ballot, rendered after the save bar so the
 * keyboard reaches Save draft and Submit first and a tremor never lands on a final action beside the
 * routine one (persona audit #40); the confirmation dialog and its copy are unchanged.
 * `disabled` disables the trigger natively; `busy` (the save bar has a request in flight) marks it
 * aria-disabled instead, so a screen whose pressed button keeps focus while it reads "Saving…" has no
 * natively disabled control in it (persona audit review of PR #34).
 */
export default function SitOutWeek({ season, week, mode, disabled, busy, onDone }) {
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    ref.current?.showModal();
    ref.current?.querySelector('[data-initial-focus]')?.focus();
    return () => previous?.focus?.();
  }, [open]);
  async function confirm() {
    setSaving(true); setError('');
    try { await communityApi('sit-out', { season, week, mode }); setOpen(false); await onDone?.(); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  return <>
    <p className="sit-out-row">Not playing Week {week} {MODE[mode]}? <button type="button" className="text-button sit-out-link" disabled={disabled} aria-disabled={busy || undefined} onClick={() => { if (!busy) setOpen(true); }}>Sit out this week</button>
      <span className="muted"> · Final: it forfeits this week's {MODE[mode]} score (recorded as sat out, not zero).</span></p>
    {open && <dialog ref={ref} className="modal sit-out-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!saving) setOpen(false); }}>
      <div className="modal-heading"><h2 id={titleId}>Sit out Week {week} {MODE[mode]}?</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={saving} onClick={() => setOpen(false)}><X size={20}/></button></div>
      <div className="callout"><TriangleAlert size={19}/><p>This is final for Week {week} {MODE[mode]}. You forfeit this week's {MODE[mode]} score, which is recorded as sat out, not zero. You cannot submit {MODE[mode]} picks for this week afterwards.</p></div>
      <p>Your picks-due notice for {MODE[mode]} clears and the other players' Week {week} {MODE[mode]} picks become visible to you. {MODE[mode === 'guess_spread' ? 'guess_total' : 'guess_spread']} is not affected.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="review-actions"><button type="button" className="secondary" data-initial-focus disabled={saving} onClick={() => setOpen(false)}>Keep my ballot</button>
        <button type="button" className="primary" disabled={saving} onClick={confirm}>{saving && <LoaderCircle className="spin" size={16}/>}Sit out {MODE[mode]}</button></div>
    </dialog>}
  </>;
}
