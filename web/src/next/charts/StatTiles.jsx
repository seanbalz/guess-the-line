// D-55 stat tiles (direction D): at most three, each a label, one number and a small picture of that number: a
// hit-rate bar with the break-even tick, last-10 blocks, or a short line of words. The number is always text.
import { BREAK_EVEN_PCT } from './geometry.js';

/** `tiles` are `{ label, value, sub?, meter?: percent, blocks?: { on, of } }`. */
export function StatTiles({ tiles }) {
  return (
    <ul className="gx-tc-tiles">
      {tiles.slice(0, 3).map(tile => (
        <li key={tile.label} className="gx-tc-tile">
          <span className="gx-tc-tile-label">{tile.label}</span>
          <span className="gx-tc-tile-value">{tile.value}</span>
          {Number.isFinite(tile.meter) ? (
            <span className="gx-tc-bar" aria-hidden="true">
              <span className="gx-tc-bar-fill" style={{ width: `${Math.min(100, Math.max(0, tile.meter))}%` }}></span>
              <span className="gx-tc-bar-tick" style={{ left: `${BREAK_EVEN_PCT}%` }}></span>
            </span>
          ) : tile.blocks ? (
            <span className="gx-tc-blocks" aria-hidden="true">
              {Array.from({ length: tile.blocks.of }, (_, i) => <span key={i} className={i < tile.blocks.on ? 'gx-tc-block gx-tc-block--on' : 'gx-tc-block'}></span>)}
            </span>
          ) : tile.sub ? <span className="gx-tc-tile-sub">{tile.sub}</span> : null}
        </li>
      ))}
    </ul>
  );
}
