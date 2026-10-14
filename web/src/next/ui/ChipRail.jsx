// A row of chips that scrolls inside its own track (snap scrolling), so the page never scrolls sideways. It is a
// named group; Play's pick control (stage 28) adds its own keyboard model on top.
import { cx, needLabel } from './cx.js';

export function ChipRail({ label, className, children, ...rest }) {
  return <div className={cx('gx-chip-rail', className)} role="group" aria-label={needLabel(label, 'ChipRail')} {...rest}>{children}</div>;
}
