// D-55 season stems (direction B): one stem per season from the break-even line, above it in the bar colors and below
// it in loss with the sign, so no season reads by color alone. Like the line, a pointer or a finger anywhere over the
// plot picks the nearest season and a range input does the same from the keyboard (eight 40px-wide columns would be
// under the 44px target), and the glass tooltip shows that season's record and units. The table below is the record.
import { recordText, signed, stemLayout } from './geometry.js';
import { useId, useMemo } from 'react';
import { ChartTooltip } from './ChartTooltip.jsx';
import { ChartScale } from './ChartScale.jsx';

/** `seasons` are `{ season, w, l, p, units }`; selection is shared with the table. `contextLabel` names the trend. */
export function SeasonStems({ seasons, selectedIndex, onSelect, id, contextLabel }) {
  const scaleId = useId();
  const count = seasons.length;
  const at = Math.max(0, Math.min(selectedIndex, count - 1));
  const layout = stemLayout(seasons.map(s => s.units));
  const shown = seasons[at];
  const readouts = useMemo(() => seasons.map(s => ({ value: `${signed(s.units)} U`, label: `${s.season} · ${recordText(s.w, s.l, s.p)}` })), [seasons]);
  const x = count ? ((at + 0.5) / count) * 100 : 0;
  const follow = event => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) onSelect(Math.max(0, Math.min(count - 1, Math.floor(((event.clientX - box.left) / box.width) * count))));
  };
  const text = s => Number.isFinite(s.units) ? `${s.season}: ${recordText(s.w, s.l, s.p)}, ${signed(s.units)} units, ${s.units === 0 ? 'at' : s.units > 0 ? 'above' : 'below'} break-even` : `${s.season}: ${recordText(s.w, s.l, s.p)}, units unavailable`;
  return (
    <div className="gx-tc-seasons" id={id}>
      <ChartTooltip readouts={readouts} index={at} x={x}/>
      <ChartScale extent={layout.extent} id={scaleId}/>
      <span className="gx-tc-baseline-key"><span aria-hidden="true"/>0 U · break-even</span>
      <div className="gx-tc-stems" onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId); follow(event);
      }} onPointerMove={follow} onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} role="img" aria-label={`Units by season: ${seasons.map(text).join('; ')}`} aria-describedby={scaleId}>
        <span className="gx-tc-stems-zero" style={{ top: `${layout.zeroY * 100}%` }}></span>
        {seasons.map((s, i) => {
          const stem = layout.stems[i], zero = s.units === 0;
          return (
            <span key={s.season} className={i === at ? 'gx-tc-col gx-tc-col--on' : 'gx-tc-col'}>
              {Number.isFinite(s.units) && <span className={`gx-tc-stem ${zero ? 'gx-tc-stem--zero' : stem.up ? 'gx-tc-stem--up' : 'gx-tc-stem--down'}${i === at ? ' gx-tc-stem--on' : ''}`} style={{ top: `${stem.top * 100}%`, ...(zero ? {} : { height: `${stem.height * 100}%` }) }}></span>}
            </span>
          );
        })}
      </div>
      <div className="gx-tc-years" aria-hidden="true">{seasons.map(s => <span key={s.season}>’{String(s.season).slice(2)}</span>)}</div>
      <input
        className="gx-tc-scrub"
        type="range"
        min="0"
        max={count - 1}
        step="1"
        value={at}
        aria-label={contextLabel ? `Move across the seasons · ${contextLabel}` : 'Move across the seasons'}
        aria-valuetext={text(shown)}
        onChange={event => onSelect(Number(event.target.value))}
      />
    </div>
  );
}
