// D-55 season stems (direction B): one stem per season from the break-even line, above it in the bar colors and below
// it in loss with the sign, so no season reads by color alone. Like the line, a pointer or a finger anywhere over the
// plot picks the nearest season and a range input does the same from the keyboard (eight 40px-wide columns would be
// under the 44px target), and the glass tooltip shows that season's record and units. The table below is the record.
import { useState } from 'react';
import { nearestIndex, recordText, signed, stemLayout } from './geometry.js';

/** `seasons` are `{ season, w, l, p, units }`; the latest season starts selected. */
export function SeasonStems({ seasons }) {
  const count = seasons.length;
  const [picked, setPicked] = useState(count - 1);
  const at = Math.min(picked, count - 1);
  const layout = stemLayout(seasons.map(s => s.units));
  const shown = seasons[at];
  const x = count ? ((at + 0.5) / count) * 100 : 0;
  const follow = event => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) setPicked(Math.min(count - 1, Math.floor(((event.clientX - box.left) / box.width) * count)));
  };
  const text = s => `${s.season}: ${recordText(s.w, s.l, s.p)}, ${signed(s.units)} units, ${s.units >= 0 ? 'above' : 'below'} break-even`;
  return (
    <div className="gx-tc-seasons">
      <div className="gx-tc-tip" aria-hidden="true" style={{ left: `clamp(0px, calc(${x}% - 76px), calc(100% - 152px))` }}>
        <span className="gx-tc-tip-value">{signed(shown.units)} U</span>
        <span className="gx-tc-tip-label">{shown.season} · {recordText(shown.w, shown.l, shown.p)}</span>
      </div>
      <div className="gx-tc-stems" onPointerDown={follow} onPointerMove={follow} role="img" aria-label={`Units by season: ${seasons.map(text).join('; ')}`}>
        <span className="gx-tc-stems-zero" style={{ top: `${layout.zeroY * 100}%` }}></span>
        {seasons.map((s, i) => {
          const stem = layout.stems[i];
          return (
            <span key={s.season} className={i === at ? 'gx-tc-col gx-tc-col--on' : 'gx-tc-col'}>
              <span className={`gx-tc-stem ${stem.up ? 'gx-tc-stem--up' : 'gx-tc-stem--down'}${i === at ? ' gx-tc-stem--on' : ''}`} style={{ top: `${stem.top * 100}%`, height: `${stem.height * 100}%` }}></span>
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
        aria-label="Move across the seasons"
        aria-valuetext={text(shown)}
        onChange={event => setPicked(Number(event.target.value))}
      />
    </div>
  );
}
