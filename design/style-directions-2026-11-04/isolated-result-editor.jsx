// Native ResultEditor body, isolated from authenticated readers/actions. Shared preview Modal adds the no-save banner.
import React,{useEffect,useState} from 'react';
import {PreviewBetModal as Modal} from './isolated-bet-editor.jsx';
const nullable=value=>value===''||value===undefined||value===null?null:Number(value);
function Alert({children}){return children?<p className="social-alert" role="alert">{children}</p>:null;}
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

export {ResultEditor};
