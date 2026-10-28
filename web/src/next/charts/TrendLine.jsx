// D-55 line chart (direction A): cumulative units under a glow area, a solid 0 U baseline, and a crosshair with a glass
// tooltip that follows a pointer or a finger dragged across the plot. A range input under it moves the same crosshair
// from the keyboard and tells a screen reader the value at each point. Values only; the caller writes the words.
import { useId, useMemo, useState } from 'react';
import { linePath, nearestIndex } from './geometry.js';
import { ChartTooltip } from './ChartTooltip.jsx';
import { ChartScale } from './ChartScale.jsx';

const W = 320;

/**
 * `values` are the cumulative points (the first is the start). `tip(i)` returns `{ value, label }` for point `i`.
 * `start` and `end` label the two ends of the time axis; `label` names the whole chart for a screen reader.
 * Pass `selectedIndex` and `onSelect` together to retain selection outside a swapped view.
 * `contextLabel` adds the visible trend title to the slider's accessible name.
 */
export function TrendLine({ values, tip, start, end, label, height = 160, selectedIndex, onSelect, id: chartId, contextLabel }) {
  const count = values.length;
  const [index, setIndex] = useState(count - 1);
  const at = Math.max(0, Math.min(selectedIndex ?? index, count - 1));
  const select = onSelect ?? setIndex;
  const geo = useMemo(() => linePath(values, { width: W, height }), [values, height]);
  const id = useId().replace(/[^\w-]/g, '');
  const follow = event => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) select(nearestIndex((event.clientX - box.left) / box.width, count));
  };
  const x = count > 1 ? (at / (count - 1)) * 100 : 0;
  const y = (geo.y(values[at]) / height) * 100;
  const readouts = useMemo(() => values.map((_, i) => tip(i)), [values, tip]);
  const now = readouts[at];
  return (
    <div className="gx-tc-line" id={chartId}>
      <ChartTooltip readouts={readouts} index={at} x={x}/>
      <ChartScale extent={geo.extent} id={`${id}scale`}/>
      <div className="gx-tc-plot" onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId); follow(event);
      }} onPointerMove={follow} onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} style={{ height }}>
        <svg className="gx-tc-svg" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} aria-describedby={`${id}scale`}>
          <defs>
            <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="gx-tc-s1"/>
              <stop offset="0.55" className="gx-tc-s2"/>
              <stop offset="1" className="gx-tc-s3"/>
            </linearGradient>
            <filter id={`${id}b`} x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
          </defs>
          <path className="gx-tc-glow" d={geo.area} fill={`url(#${id}g)`} filter={`url(#${id}b)`}/>
          <path className="gx-tc-area" d={geo.area} fill={`url(#${id}g)`}/>
          <line className="gx-tc-zero" x1="0" x2={W} y1={geo.zeroY} y2={geo.zeroY} data-zero-baseline="true"/>
          <path className="gx-tc-path" d={geo.line}/>
        </svg>
        <span className="gx-tc-zero-label" aria-hidden="true" style={{ top: `${(geo.zeroY / height) * 100}%` }}>0 U</span>
        <span className="gx-tc-cross" aria-hidden="true" style={{ left: `${x}%` }}></span>
        <span className="gx-tc-dot" aria-hidden="true" style={{ left: `${x}%`, top: `${y}%` }}></span>
      </div>
      <div className="gx-tc-axis" aria-hidden="true"><span>{start}</span><span>{end}</span></div>
      <input
        className="gx-tc-scrub"
        type="range"
        min="0"
        max={count - 1}
        step="1"
        value={at}
        aria-label={contextLabel ? `Move along the line · ${contextLabel}` : 'Move along the line'}
        aria-valuetext={`${now.value}, ${now.label}`}
        onChange={event => select(Number(event.target.value))}
      />
    </div>
  );
}
