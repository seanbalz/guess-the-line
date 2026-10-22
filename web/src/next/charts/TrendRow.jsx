// D-55 compact trend row (round 3 board R1): the title, the side and percent, a small glow area and the units. The
// whole row is one button that opens the trend's detail in place below it.
import { linePath } from './geometry.js';
import { Icon } from '../ui/index.js';
import './charts.css';

/** A decorative 80 × 30 area for a row; the row's words carry the numbers. */
export function MiniArea({ values }) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const geo = linePath(values, { width: 80, height: 30, top: 3, bottom: 3 });
  return (
    <svg className="gx-tc-mini" viewBox="0 0 80 30" preserveAspectRatio="none" aria-hidden="true">
      <path className="gx-tc-mini-area" d={geo.area}/>
      <path className="gx-tc-mini-line" d={geo.line}/>
    </svg>
  );
}

/** `values` draw the mini area; `value` is the number on the right ("+45.2 U"); `controls` is the detail's id. */
export function TrendRow({ title, sub, values, value, open, controls, onToggle }) {
  return (
    <button type="button" className="gx-tc-row" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <span className="gx-tc-row-main">
        <span className="gx-t-strong">{title}</span>
        {sub ? <span className="gx-tc-row-sub">{sub}</span> : null}
      </span>
      <MiniArea values={values}/>
      {value ? <span className="gx-tc-row-value">{value}</span> : null}
      <Icon icon="chevronDown" size={20} className={open ? 'gx-tc-chev gx-tc-chev--up' : 'gx-tc-chev'}/>
    </button>
  );
}
