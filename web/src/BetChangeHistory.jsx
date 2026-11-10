import { date } from './api.js';
import { unitText } from './trackedBetTerms.js';

const FIELDS = { odds: 'American odds', stakeUnits: 'Stake units', actualReturnUnits: 'Full return units', outcome: 'Outcome', source: 'Source', countsForRecord: 'Included in records', notes: 'Note', quotedAt: 'Quote observed', placedAt: 'Bet placed' };
const text = value => value === null || value === undefined || value === '' ? 'Not entered' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'object' ? value.name || 'Not entered' : String(value);
const state = value => ({ pending: 'Open', win: 'Won', loss: 'Lost', push: 'Push', void: 'Void' })[value] || text(value);
const terms = value => `${state(value.outcome)} · ${unitText(value.stakeUnits)} risk${Number.isFinite(value.actualReturnUnits) ? ` · ${unitText(value.actualReturnUnits)} returned` : ''}`;
const selection = leg => leg.locked ? `${leg.selection || 'Selection'} · line locked` : leg.selection || `${leg.side || ''} ${leg.line ?? ''}`.trim();

/** Render only the server-permitted audit, without reconstructing missing receipt terms. */
export function BetChangeHistory({ events }) {
  return <section className="social-change-history" aria-label="Ticket change history"><h3>Ticket history</h3><ol>{events.map((event, index) => {
    const at = event.at || event.recordedAt || event.timestamp;
    const fields = event.before && event.after ? Object.keys(FIELDS).filter(key => event.before[key] !== event.after[key]) : [];
    const legsChanged = event.before && event.after && JSON.stringify(event.before.legs) !== JSON.stringify(event.after.legs);
    return <li key={event.id || index}><span className="social-change-step" aria-hidden="true">{index + 1}</span><div>
      <strong>{({ create: 'Original ticket', correct: 'Ticket correction', settle: 'Reported result', include: 'Record inclusion' })[event.action] || event.action || event.type || 'Revision'}</strong>
      <p>{at ? `${date(at)} PT` : 'Time not recorded'}{event.reason ? ` · ${event.reason}` : ''}</p>
      {event.before && event.after && <>
        <dl className="social-change-summary"><div><dt>Before</dt><dd>{terms(event.before)}</dd></div><div><dt>After</dt><dd>{terms(event.after)}</dd></div></dl>
        <details><summary>Review saved change</summary><dl className="social-audit-change">{fields.map(key => <div key={key}><dt>{FIELDS[key]}</dt><dd><span>Before: {text(event.before[key])}</span><span>After: {text(event.after[key])}</span></dd></div>)}{legsChanged && <div><dt>Selections</dt><dd><span>Before: {(event.before.legs || []).map(selection).join(' · ') || 'Not entered'}</span><span>After: {(event.after.legs || []).map(selection).join(' · ') || 'Not entered'}</span></dd></div>}</dl></details>
      </>}
    </div></li>;
  })}</ol></section>;
}
