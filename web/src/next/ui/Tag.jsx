// Your pick or bet on a card (design system 7.5): an accent-tint tag with a micro key and a tabular value,
// "YOU SEA −2.5" or "BET KC −8 · 1U". It always means "yours"; other players' picks never use it.
import { cx } from './cx.js';

export function Tag({ k = 'You', className, children, ...rest }) {
  return (
    <span className={cx('gx-tag', className)} {...rest}>
      {k ? <span className="gx-tag-k">{k}</span> : null}
      <span>{children}</span>
    </span>
  );
}
