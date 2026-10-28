// The team sheet's margin chart (D-62 rule 3, D-55 chart rules): one bar per final by week from a solid zero line, up
// in `win` for a win and down in `loss` for a loss, a hollow ring on the line for a tie. Like the trend stems, a pointer
// or a finger over the plot picks the nearest game and a range input does the same from the keyboard (seventeen bars
// would be under the 44px target each); the readout names the picked game ("Week 3 · W 24–17 vs DEN"). The plot is one
// image with every game in words, and the same numbers are in the games list below, so nothing is only in the chart.
import { useId } from 'react';
import { useChartSelection } from '../charts/useChartSelection.js';
import { marginRangeText } from './teamModel.js';

const W = 320, H = 120, PAD = 8, R = 4;
const round1 = n => Math.round(n * 10) / 10;
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Bar geometry in a W × H box: `{ zeroY, slot, bars: [{ x, y0, y1, width }] }`, lengths proportional to the margin. */
export function marginLayout(series, extent) {
  const n = Math.max(1, series.length), slot = W / n, width = Math.min(12, Math.max(4, slot * 0.5));
  const lo = extent?.low ?? 0, hi = extent?.high ?? 0, span = hi - lo || 1;
  const y = v => PAD + ((hi - v) * (H - 2 * PAD)) / span;
  const zeroY = round1(y(0));
  return { zeroY, slot, width, bars: series.map((p, i) => ({ x: round1(slot * (i + 0.5)), y0: zeroY, y1: round1(y(p.margin)) })) };
}

/** A bar from the zero line with a rounded data end (4px) and a square base. */
function barPath(x, y0, y1, width) {
  const half = width / 2, up = y1 < y0, len = Math.abs(y1 - y0), r = Math.min(R, half, len);
  const [l, rt] = [round1(x - half), round1(x + half)];
  return up
    ? `M${l} ${y0}V${round1(y1 + r)}A${r} ${r} 0 0 1 ${round1(l + r)} ${y1}H${round1(rt - r)}A${r} ${r} 0 0 1 ${rt} ${round1(y1 + r)}V${y0}Z`
    : `M${l} ${y0}V${round1(y1 - r)}A${r} ${r} 0 0 0 ${round1(l + r)} ${y1}H${round1(rt - r)}A${r} ${r} 0 0 0 ${rt} ${round1(y1 - r)}V${y0}Z`;
}

/** `series` from teamModel.marginSeries, `extent` from marginExtent. */
export function MarginChart({ series, extent }) {
  const scaleId = useId();
  const { index, onSelect } = useChartSelection(series.map(p => p.week).join(','), series.length);
  const at = Math.max(0, Math.min(index, series.length - 1)), shown = series[at];
  const layout = marginLayout(series, extent);
  const follow = event => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) onSelect(Math.max(0, Math.min(series.length - 1, Math.floor(((event.clientX - box.left) / box.width) * series.length))));
  };
  return (
    <div className="gx-team-chart" data-chart="margin">
      <p className="gx-team-readout" aria-hidden="true"><span className="gx-team-readout-value">{signed(shown.margin)}</span><span className="gx-t-meta gx-c-2">{shown.label}</span></p>
      <div className="gx-team-plot" role="img" aria-label={`Margin by week, oldest first: ${series.map(p => p.words).join('; ')}`} aria-describedby={scaleId}
        onPointerDown={event => { if (!event.isPrimary || event.button !== 0) return; event.currentTarget.setPointerCapture?.(event.pointerId); follow(event); }}
        onPointerMove={follow}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
        <svg className="gx-team-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <rect className="gx-team-band" x={round1(layout.slot * at)} y="0" width={round1(layout.slot)} height={H} rx="6"/>
          <line className="gx-team-zero" x1="0" x2={W} y1={layout.zeroY} y2={layout.zeroY}/>
          {series.map((p, i) => {
            const bar = layout.bars[i], on = i === at ? ' gx-team-bar--on' : '';
            return p.margin === 0
              ? <circle key={p.week} className={`gx-team-tie${on}`} cx={bar.x} cy={bar.y0} r={Math.min(5, layout.width / 2 + 1)}/>
              : <path key={p.week} className={`gx-team-bar gx-team-bar--${p.result === 'W' ? 'win' : 'loss'}${on}`} d={barPath(bar.x, bar.y0, bar.y1, layout.width)}/>;
          })}
        </svg>
      </div>
      <div className="gx-team-weeks" aria-hidden="true">{series.map(p => <span key={p.week}>{p.week}</span>)}</div>
      <p className="gx-t-meta gx-c-2" id={scaleId}>Week by week · scale {marginRangeText(extent)}</p>
      {series.length > 1 ? <input className="gx-team-scrub" type="range" min="0" max={series.length - 1} step="1" value={at}
        aria-label="Move across the games" aria-valuetext={shown.words} onChange={event => onSelect(Number(event.target.value))}/> : null}
    </div>
  );
}
