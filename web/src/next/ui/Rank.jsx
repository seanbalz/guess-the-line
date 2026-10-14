// A board rank (design system 7.10): tabular numerals, shared ranks shown "T-2" (never a made-up order, T-2 rule),
// first place in a lime-ringed tile, second and third with a plain ring (no gold, silver or bronze). No rank yet reads
// "—" (never 0). Move is the change since last time: ▲ win color, ▼ loss color, an en dash for no change. Each reads
// in words for a screen reader ("Rank 2, tied"; "up 1"), with the glyphs hidden.
import { cx } from './cx.js';

/** A rank from the server's value: 2, '2', 'T-2' or null. `{ n, tied }`, or null when there is no rank. */
export function parseRank(rank, tied = false) {
  if (typeof rank === 'number') return Number.isInteger(rank) && rank > 0 ? { n: rank, tied: !!tied } : null;
  if (typeof rank !== 'string') return null;
  const m = /^\s*(T-)?(\d+)\s*$/i.exec(rank);
  if (!m) return null;
  const n = Number(m[2]);
  return n > 0 ? { n, tied: !!m[1] || !!tied } : null;
}

export function Rank({ rank, tied = false, className, ...rest }) {
  const r = parseRank(rank, tied);
  if (!r) {
    return (
      <span className={cx('gx-rank', 'gx-c-3', className)} {...rest}>
        <span aria-hidden="true">—</span>
        <span className="gx-sr-only">Not ranked</span>
      </span>
    );
  }
  return (
    <span className={cx('gx-rank', r.tied && 'gx-rank--t', r.n === 1 && 'gx-rank--1', (r.n === 2 || r.n === 3) && 'gx-rank--top', className)} {...rest}>
      <span aria-hidden="true">{r.tied ? `T-${r.n}` : r.n}</span>
      <span className="gx-sr-only">{`Rank ${r.n}${r.tied ? ', tied' : ''}`}</span>
    </span>
  );
}

/** Places moved since the last board: positive is up. `null` (no earlier board) and 0 both show the en dash. */
export function Move({ by, className, ...rest }) {
  const n = typeof by === 'number' && Number.isFinite(by) ? Math.trunc(by) : 0;
  const up = n > 0, down = n < 0;
  return (
    <span className={cx('gx-move', up && 'gx-move--up', down && 'gx-move--down', !up && !down && 'gx-c-3', className)} {...rest}>
      <span aria-hidden="true">{up ? `▲${n}` : down ? `▼${-n}` : '–'}</span>
      <span className="gx-sr-only">{up ? `up ${n}` : down ? `down ${-n}` : 'no change'}</span>
    </span>
  );
}
