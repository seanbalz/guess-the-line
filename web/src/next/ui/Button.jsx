// Buttons (design system 7.4). Primary is the one lime button in view (52 tall); secondary is an outline (44);
// danger is an outline with loss-colored words; ghost is a text button in the data color; ghost-2 is grey. Every
// variant keeps a 44px hit area. A disabled button says why in meta beside it (the caller writes that line).
import { Icon } from './Icon.jsx';
import { cx, oneOf } from './cx.js';

export const BUTTON_VARIANTS = Object.freeze(['primary', 'secondary', 'danger', 'ghost', 'ghost-2']);

/**
 * `<Button variant="primary" block onClick={send}>Lock in Spread picks</Button>`. `icon` sits before the words (20px),
 * `iconEnd` after them (16px, a chevron for "go somewhere"). Always `type="button"` unless a form needs `submit`.
 */
export function Button({ ref, variant = 'secondary', block = false, icon, iconEnd, type = 'button', className, children, ...rest }) {
  return (
    <button ref={ref} type={type} className={cx('gx-btn', `gx-btn--${oneOf(variant, BUTTON_VARIANTS, 'secondary')}`, block && 'gx-btn--block', className)} {...rest}>
      {icon ? <Icon icon={icon} size={20}/> : null}
      {children}
      {iconEnd ? <Icon icon={iconEnd} size={16}/> : null}
    </button>
  );
}
