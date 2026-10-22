// D-55 season table (direction D): the same seasons as the stems, as a real table with a hit-rate bar per season.
import { BREAK_EVEN_PCT, hitPct, recordText, signed } from './geometry.js';

/** `seasons` are `{ season, w, l, p, units }`; `caption` says which period they are. */
export function SeasonTable({ seasons, caption }) {
  return (
    <div className="gx-tc-table-wrap">
      <table className="gx-tc-table">
        <caption className="gx-sr-only">{caption}</caption>
        <thead className="gx-sr-only"><tr><th scope="col">Season</th><th scope="col">Record</th><th scope="col">Win rate</th><th scope="col">Units</th></tr></thead>
        <tbody>
          {seasons.map(s => {
            const pct = hitPct(s.w, s.l);
            return (
              <tr key={s.season}>
                <th scope="row">{s.season}</th>
                <td>{recordText(s.w, s.l, s.p)}</td>
                <td className="gx-tc-table-bar">
                  <span className="gx-tc-bar" aria-hidden="true">
                    <span className={pct !== null && pct < BREAK_EVEN_PCT ? 'gx-tc-bar-fill gx-tc-bar-fill--below' : 'gx-tc-bar-fill'} style={{ width: `${pct ?? 0}%` }}></span>
                    <span className="gx-tc-bar-tick" style={{ left: `${BREAK_EVEN_PCT}%` }}></span>
                  </span>
                  <span className="gx-sr-only">{pct === null ? '—' : `${pct}%`}</span>
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
