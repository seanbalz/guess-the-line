// Buttons (design system 7.4). Primary is the one lime button in view (52 tall); secondary is an outline (44);
// danger is an outline with loss-colored words; ghost is a text button in the data color; ghost-2 is grey. Every
// variant keeps a 44px hit area. A disabled button says why in meta beside it (the caller writes that line). Pressed,
// a button dips and dims (press.css); the primary one also gives a light haptic tick where the device has one.
import { Icon } from './Icon.jsx';
import { cx, oneOf } from './cx.js';
import { lightHaptic } from './haptics.js';
import './press.css';

export const BUTTON_VARIANTS = Object.freeze(['primary', 'secondary', 'danger', 'ghost', 'ghost-2']);

/**
 * `<Button variant="primary" block onClick={send}>Lock in Spread picks</Button>`. `icon` sits before the words (20px),
 * `iconEnd` after them (16px, a chevron for "go somewhere"). Always `type="button"` unless a form needs `submit`.
 * `haptic` (default: primary only) ticks once on a press; keep it to primary actions.
 */
export function Button({ ref, variant = 'secondary', block = false, icon, iconEnd, type = 'button', haptic, onClick, className, children, ...rest }) {
  const kind = oneOf(variant, BUTTON_VARIANTS, 'secondary');
  const tick = haptic ?? kind === 'primary';
  const press = tick ? event => { lightHaptic(); onClick?.(event); } : onClick;
  return (
    <button ref={ref} type={type} className={cx('gx-btn', `gx-btn--${kind}`, block && 'gx-btn--block', className)} onClick={press} {...rest}>
      {icon ? <Icon icon={icon} size={20}/> : null}
      {children}
      {iconEnd ? <Icon icon={iconEnd} size={16}/> : null}
    </button>
  );
}
