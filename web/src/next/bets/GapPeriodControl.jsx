import { useId, useState } from 'react';
import { periodWeeks, weekKey } from './gapPeriods.js';
import { Button } from '../ui/Button.jsx';

function CustomRange({ weeks, range, onApply }) {
  const id = useId();
  const [from, setFrom] = useState(range?.from ?? (weeks[0] ? weekKey(weeks[0]) : ''));
  const [to, setTo] = useState(range?.to ?? (weeks.at(-1) ? weekKey(weeks.at(-1)) : ''));
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    try { periodWeeks(weeks, { period: 'custom', from, to }); }
    catch (failure) { setError(failure.message); return; }
    setError(''); onApply({ from, to });
  }
  const field = (label, value, change) => <div className="gx-gap-period-field"><label htmlFor={`${id}-${label}`}>{label}</label>
    <select id={`${id}-${label}`} value={value} onChange={event => { change(event.target.value); setError(''); }}
      aria-invalid={error ? true : undefined} aria-describedby={error ? id : undefined}>
      {!weeks.length && <option value="">No published weeks</option>}
      {weeks.map(w => <option key={weekKey(w)} value={weekKey(w)}>{w.season} · W{w.week}</option>)}
    </select>
  </div>;
  return <form className="gx-gap-custom" onSubmit={submit}>
    <div className="gx-gap-range-fields">{field('From', from, setFrom)}{field('To', to, setTo)}</div>
    {error && <p id={id} role="alert" className="gx-t-body">{error}</p>}
    <Button type="submit" variant="primary" disabled={!weeks.length}>Apply range</Button>
  </form>;
}
export function GapPeriodControl({ period, weeks, range, onPeriod, onApply }) {
  const id = useId();
  return <div className="gx-gap-period">
    <div className="gx-gap-period-field"><label htmlFor={id}>Record period</label><select id={id} value={period} onChange={event => onPeriod(event.target.value)}>
      <option value="week">Week</option><option value="season">This season</option>
      <option value="all">All time</option><option value="custom">Custom range</option>
    </select></div>
    {period === 'custom' && <CustomRange weeks={weeks} range={range} onApply={onApply}/>}
  </div>;
}
