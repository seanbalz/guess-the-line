// A loading skeleton (design upgrade, "game feel"): token-tinted blocks in the shape of what is coming, in place of a
// bare "Loading…" sentence. The sentence stays as the status text a screen reader announces (role=status, visually
// hidden); the blocks are decoration, hidden from assistive technology. A static tint, never a shimmer: the LIVE dot is
// the app's one loop (brand guide, Motion). Shapes: `lines` (text), `rows` (a list of rows with a face), `cards` (game
// cards), `panels` (cards with a heading and two lines), `block` (one field, such as a note), `tiles` (a tab's two-column
// tiles) and `landing` (a tab's next-move card, then its tiles).
import { cx, needLabel } from './cx.js';
import './skeleton.css';

export const SKELETON_SHAPES = Object.freeze(['lines', 'rows', 'cards', 'panels', 'block', 'tiles', 'landing']);
/** The landing shape's card: Home's (a countdown block) or a meter card (Research's, as Play's: one bar). */
export const SKELETON_HEROES = Object.freeze(['countdown', 'meter']);
const WIDTHS = ['gx-skel-bar--w1', 'gx-skel-bar--w2', 'gx-skel-bar--w3'];

const Bar = ({ width = 0, title = false }) => <span className={cx('gx-skel-bar', title ? 'gx-skel-bar--title' : WIDTHS[width % WIDTHS.length])}></span>;

const SkelTile = ({ i }) => <span className="gx-skel-tile"><Bar width={2}/><Bar title/><Bar width={1 + (i % 2)}/></span>;
const tilesOf = each => <span className="gx-skel-tiles">{each.map(i => <SkelTile key={i} i={i}/>)}</span>;

function art(shape, count, hero) {
  const each = Array.from({ length: count }, (_, i) => i);
  switch (shape) {
    case 'rows':
      return (
        <span className="gx-skel-list">
          {each.map(i => (
            <span key={i} className="gx-skel-row">
              <span className="gx-skel-dot"></span>
              <span className="gx-skel-stack"><Bar width={1}/><Bar width={2 + i}/></span>
            </span>
          ))}
        </span>
      );
    case 'cards':
      return each.map(i => (
        <span key={i} className="gx-skel-card">
          <span className="gx-skel-line"><span className="gx-skel-dot"></span><Bar width={2}/></span>
          <span className="gx-skel-line"><span className="gx-skel-dot"></span><Bar width={1 + i}/></span>
          <span className="gx-skel-foot"><Bar width={2}/></span>
        </span>
      ));
    case 'panels':
      return each.map(i => (
        <span key={i} className="gx-skel-card">
          <Bar title/>
          <Bar width={0}/>
          <Bar width={1 + i}/>
        </span>
      ));
    case 'block':
      return <span className="gx-skel-block"></span>;
    case 'tiles':
      return tilesOf(each);
    case 'landing':
      return (
        <>
          {hero === 'meter' ? (
            <span className="gx-skel-card gx-skel-hero gx-skel-hero--meter">
              <Bar width={2}/><Bar title/><span className="gx-skel-bar gx-skel-meter"></span><Bar width={1}/>
              <span className="gx-skel-button"></span>
            </span>
          ) : (
            <span className="gx-skel-card gx-skel-hero">
              <Bar width={2}/><Bar title/><Bar width={1}/>
              <span className="gx-skel-block gx-skel-countdown"></span>
              <Bar width={0}/>
              <span className="gx-skel-button"></span>
            </span>
          )}
          {tilesOf(each)}
        </>
      );
    default:
      return each.map(i => <Bar key={i} width={i}/>);
  }
}

/**
 * `<Skeleton label="Loading market lines…" shape="panels" count={2}/>`. `label` (required) is the status a screen
 * reader hears; `count` is how many lines, rows or cards (1 to 6); `hero` is the landing shape's card (SKELETON_HEROES).
 */
export function Skeleton({ label, shape = 'lines', count = 3, hero = 'countdown', className, ...rest }) {
  const name = needLabel(label, 'Skeleton');
  const kind = SKELETON_SHAPES.includes(shape) ? shape : 'lines';
  const look = SKELETON_HEROES.includes(hero) ? hero : 'countdown';
  const n = Math.min(6, Math.max(1, Number.isInteger(count) ? count : 3));
  return (
    <div className={cx('gx-skel', `gx-skel--${kind}`, className)} role="status" data-skeleton={kind} {...rest}>
      <span className="gx-sr-only">{name}</span>
      <span className="gx-skel-art" aria-hidden="true">{art(kind, n, look)}</span>
    </div>
  );
}
