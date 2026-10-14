// "Where everyone landed" (prototype C24): faces along an axis from the lowest to the highest guess, with the line as a
// lime tick once that line is open to this player. Faces closer than one face width stack upward, 16px a level, and
// the strip grows to fit; the mini strip (112 x 28, inside a row) uses 12px pips. It is a picture of numbers the
// screen also lists, so it is one image named by `label` ("6 guesses from DEN +1 to DEN +4.5; the line is DEN +3").
// It only draws picks the server already decided this player may see.
import { AVATAR_FILLS, Avatar, avatarFill } from './Avatar.jsx';
import { cx, needLabel, oneOf } from './cx.js';

/** One 24px face on the ~334px axis of a full-width strip, in percent: faces closer than this stack. */
export const STRIP_NEAR = 7.5;

const clampPct = pct => Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 50));
const along = pct => `calc(12px + ${clampPct(pct) / 100} * (100% - 24px))`;

/**
 * Positions for the strip from `items: [{ id, name, fill?, pct (0–100 along the axis), you? }]` and `linePct` (null
 * while the line is hidden). Returns `{ hasTick, tickLeft, height, items: [{ ...item, level, left, bottom }] }`.
 */
export function stripLayout({ items = [], linePct = null } = {}, { mini = false } = {}) {
  const placed = [];
  const laid = items.map(item => {
    const pct = clampPct(item.pct);
    let level = 0;
    while (!mini && placed.some(p => p.level === level && Math.abs(p.pct - pct) < STRIP_NEAR)) level += 1;
    placed.push({ pct, level });
    return { ...item, pct, level, left: along(pct), bottom: mini ? '0px' : `${28 + level * 16}px` };
  });
  const levels = placed.reduce((top, p) => Math.max(top, p.level), 0);
  const hasTick = typeof linePct === 'number' && Number.isFinite(linePct);
  return { hasTick, tickLeft: hasTick ? along(linePct) : null, height: mini ? '28px' : `${Math.max(72, 52 + levels * 16)}px`, items: laid };
}

export function Strip({ items = [], linePct = null, lowLabel, highLabel, label, mini = false, className, ...rest }) {
  const layout = stripLayout({ items, linePct }, { mini });
  return (
    <div className={cx(mini ? 'gx-strip--mini' : 'gx-strip', className)} style={{ height: layout.height }} role="img" aria-label={needLabel(label, 'Strip')} {...rest}>
      <span className="gx-strip-axis"></span>
      {layout.hasTick ? <span className="gx-strip-tick" style={{ left: layout.tickLeft }}></span> : null}
      {layout.items.map((item, i) => (mini
        ? <span key={item.id ?? i} className={cx('gx-av', `gx-av-${oneOf(item.fill, AVATAR_FILLS, avatarFill(item.id ?? item.name))}`, 'gx-strip-pip', item.you && 'gx-strip-pip--you')} style={{ left: item.left }}></span>
        : <Avatar key={item.id ?? i} id={item.id} name={item.name} fill={item.fill} size={24} you={item.you} className="gx-strip-dot" style={{ left: item.left, bottom: item.bottom }}/>))}
      {!mini && lowLabel ? <span className="gx-strip-lo gx-t-meta">{lowLabel}</span> : null}
      {!mini && highLabel ? <span className="gx-strip-hi gx-t-meta">{highLabel}</span> : null}
    </div>
  );
}
