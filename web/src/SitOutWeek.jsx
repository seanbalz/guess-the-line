import React, { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { communityApi } from './api';

const MODE = { guess_spread: 'Spread', guess_total: 'Total' };

/**
 * D-23 final weekly opt-out. Sitting out forfeits that mode's score for the week
 * (recorded as sat out, never zero), clears its picks-due notice and reveals the
 * other players' picks. Cloud only: it writes through /community/sit-out.
 */
export default function SitOutWeek({ season, week, mode, disabled, onDone }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ref = useRef(null), titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    ref.current?.showModal();
    ref.current?.querySelector('[data-initial-focus]')?.focus();
    return () => previous?.focus?.();
  }, [open]);
  async function confirm() {
    setBusy(true); setError('');
    try { await communityApi('sit-out', { season, week, mode }); setOpen(false); await onDone?.(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="secondary sit-out-button" disabled={disabled} onClick={() => setOpen(true)}>Sit out this week</button>
    {open && <dialog ref={ref} className="modal sit-out-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) setOpen(false); }}>
      <div className="modal-heading"><h2 id={titleId}>Sit out Week {week} {MODE[mode]}?</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={() => setOpen(false)}><X size={20}/></button></div>
      <div className="callout"><TriangleAlert size={19}/><p>This is final for Week {week} {MODE[mode]}. You forfeit this week's {MODE[mode]} score, which is recorded as sat out, not zero. You cannot submit {MODE[mode]} picks for this week afterwards.</p></div>
      <p>Your picks-due notice for {MODE[mode]} clears and the other players' Week {week} {MODE[mode]} picks become visible to you. {MODE[mode === 'guess_spread' ? 'guess_total' : 'guess_spread']} is not affected.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="review-actions"><button type="button" className="secondary" data-initial-focus disabled={busy} onClick={() => setOpen(false)}>Keep my ballot</button>
        <button type="button" className="primary" disabled={busy} onClick={confirm}>{busy && <LoaderCircle className="spin" size={16}/>}Sit out {MODE[mode]}</button></div>
    </dialog>}
  </>;
}
