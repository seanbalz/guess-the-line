// An icon-only button: a 44px round hit area whose name is its `label` (required; the icon itself is hidden).
// `pressed` makes it a toggle (aria-pressed).
import { Icon } from './Icon.jsx';
import { cx, needLabel } from './cx.js';

export function IconButton({ ref, icon, label, size = 24, pressed, className, ...rest }) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx('gx-icon-btn', className)}
      aria-label={needLabel(label, 'IconButton')}
      aria-pressed={typeof pressed === 'boolean' ? String(pressed) : undefined}
      {...rest}
    >
      <Icon icon={icon} size={size}/>
    </button>
  );
}
