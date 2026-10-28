// Last matchweek's margin bars (spec section 8 charts): who won the Pick a Team bonus, with the club's winning margin as
// a bar from the chart kit (charts.css gx-tc-bar, bar-1 to bar-2) and the points as words ("+15 pts", "won by 3"), so
// nothing reads by length or color alone. Only the widest win scores (margin × 5; tied managers all score), so the rows
// are the winners the server recorded. A week under review shows that instead, and no recorded bonus says so.
import '../charts/charts.css';
import { signed } from '../charts/geometry.js';
import { Crest } from './DraftBoard.jsx';
import { PICK_COPY } from './draftModel.js';

export function MarginChart({ bonus, review = false, clubName = code => code }) {
  if (review) return <div className="gx-epl-margin-empty">
    <p className="gx-t-body">{PICK_COPY.review}</p>
    <p className="gx-t-meta gx-c-2">{PICK_COPY.reviewBody}</p>
  </div>;
  const rows = (bonus ?? []).filter(row => Number.isInteger(row.points) && row.points > 0);
  if (!rows.length) return <p className="gx-t-body gx-c-2">{PICK_COPY.noBonus}</p>;
  const widest = Math.max(...rows.map(row => (Number.isInteger(row.margin) ? row.margin : 0)), 1);
  return <ul className="gx-epl-margins">
    {rows.map(row => {
      const margin = Number.isInteger(row.margin) ? row.margin : null;
      return <li key={row.ownerId} className="gx-epl-margin">
        {row.club ? <Crest code={row.club} size="sm"/> : null}
        <span className="gx-epl-margin-main">
          <span className="gx-epl-margin-head">
            <span className="gx-epl-margin-name">{row.name}{row.club ? <span className="gx-c-2"> · {clubName(row.club)}</span> : null}</span>
            <span className="gx-epl-margin-pts">{signed(row.points, 0)} pts</span>
          </span>
          <span className="gx-tc-bar" aria-hidden="true"><span className="gx-tc-bar-fill" style={{ width: `${margin === null ? 0 : Math.round((margin / widest) * 100)}%` }}></span></span>
          <span className="gx-t-meta gx-c-2">{margin === null ? '—' : `won by ${margin}`}</span>
        </span>
      </li>;
    })}
  </ul>;
}
