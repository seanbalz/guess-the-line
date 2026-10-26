// D-55 season table (direction D): the same seasons as the stems, as a real table with a hit-rate bar per season.
import { Icon } from '../ui/Icon.jsx';
import { BREAK_EVEN_PCT, hitPct, recordText, signed } from './geometry.js';

/** `seasons` are `{ season, w, l, p, units }`; `caption` says which period they are. */
export function SeasonTable({ seasons, caption, selectedSeason, onSelect, chartId }) {
  return (
    <div className="gx-tc-table-wrap">
      <table className="gx-tc-table">
        <caption className="gx-sr-only">{caption}</caption>
        <thead><tr><th scope="col">Season</th><th scope="col">Record</th><th scope="col">Win rate</th><th scope="col">Units</th></tr></thead>
        <tbody>
          {seasons.map(s => {
            const pct = hitPct(s.w, s.l);
            return (
              <tr key={s.season} data-selected={onSelect ? s.season === selectedSeason : undefined}>
                <th scope="row">{onSelect ? <button type="button" className="gx-tc-season-pick"
                  aria-label={`Show ${s.season} season on chart`} aria-pressed={s.season === selectedSeason} aria-controls={chartId}
                  onClick={() => onSelect(s.season)}>
                  {s.season}<Icon icon="check" size={12} className="gx-tc-season-check"/>
                </button> : s.season}</th>
                <td>{recordText(s.w, s.l, s.p)}</td>
                <td className="gx-tc-table-bar">
                  <span className="gx-tc-table-rate">{pct === null ? <><span aria-hidden="true">—</span><span className="gx-sr-only">No decided games</span></> : `${pct}%`}</span>
                  {pct !== null && <span className="gx-tc-bar" aria-hidden="true">
                    <span className={pct < BREAK_EVEN_PCT ? 'gx-tc-bar-fill gx-tc-bar-fill--below' : 'gx-tc-bar-fill'} style={{ width: `${pct}%` }}></span>
                    <span className="gx-tc-bar-tick" style={{ left: `${BREAK_EVEN_PCT}%` }}></span>
                  </span>}
                </td>
                <td>{signed(s.units)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
