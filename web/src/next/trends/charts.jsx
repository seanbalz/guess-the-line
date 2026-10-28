import { useId } from 'react';
const scaleFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });
export const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
export const signed = value => value == null ? '—' : value < 0 ? '−' + number(-value) : value > 0 ? '+' + number(value) : '0';
export function time(value) {
  if (!value) return 'Source time unavailable';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT' : 'Source time unavailable';
}
/** A zero-centered plot and the same visible values in a keyboard-accessible table. Missing is a gap. */
export function BiasChart({ rows = [], title, signedValues = true, unit = 'points' }) {
  const id = useId();
  const known = rows.filter(r => Number.isFinite(r.value));
  const max = unit === 'percent' ? 100 : Math.max(1, ...known.map(r => Math.abs(r.value)));
  const center = signedValues ? 150 : 16, span = signedValues ? 128 : 268;
  const bound = scaleFormat.format(max);
  const scale = !known.length ? 'Scale unavailable' : `Scale: ${signedValues ? '−' + bound : '0'} to ${signedValues ? '+' : ''}${bound}${unit === 'percent' ? '%' : ' ' + unit}`;
  const valueText = value => Number.isFinite(value) ? (signedValues ? signed(value) : number(value)) : 'No sample';
  return <figure className="gx-tr-chart" aria-labelledby={id} aria-describedby={`${id}-scale`}>
    <figcaption className="gx-t-strong" id={id}>{title}</figcaption>
    <p className="gx-t-meta gx-c-2" id={`${id}-scale`} data-chart-scale="">{scale} · Zero baseline</p>
    {rows.length ? <ul className="gx-tr-observations" role="list" aria-label={title + ' observations'}>{rows.map(r => {
      const known = Number.isFinite(r.value), width = known ? Math.abs(r.value) / max * span : 0;
      return <li className="gx-tr-observation" key={r.label}>
        <div className="gx-tr-observation-label"><span className="gx-t-body">{r.label}</span><span className={known ? 'gx-n-xs' : 'gx-t-meta'}>{valueText(r.value)}{known && unit === 'percent' ? '%' : ''}</span></div>
        <svg viewBox="0 0 300 24" aria-hidden="true">
          <line x1={center} x2={center} y1="0" y2="24" className="gx-tr-zero"/>
          {known && (r.value === 0 ? <circle cx={center} cy="12" r="3" className="gx-tr-zero-point"/>
            : <rect x={r.value < 0 ? center - width : center} y="4" width={width} height="16" className={r.value < 0 ? 'gx-tr-negative' : 'gx-tr-positive'}/>)}
        </svg>
      </li>;
    })}</ul> : <p className="gx-t-body">No sample</p>}
    <div className="gx-tr-table" role="region" aria-label={title + ' data'} tabIndex={0}><table>
      <caption className="gx-t-meta">{title} · exact values</caption>
      <thead><tr><th scope="col">Period / observation</th><th scope="col">{unit}</th><th scope="col">Games</th>{unit === 'percent' && <><th scope="col">Decisions</th><th scope="col">Pushes</th></>}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.label}><th scope="row">{r.label}</th><td>{valueText(r.value)}</td><td>{r.sample}</td>{unit === 'percent' && <><td>{r.decided}</td><td>{r.pushes}</td></>}</tr>)}</tbody>
    </table></div>
  </figure>;
}
