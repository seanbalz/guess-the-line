// Cards (CONTRACT section 11): `card` (16 radius, 16 padding, e1) plus variants: hero (the Home hero, yard lines in
// dark), flush (no padding, for lists), tint (accent tint), wait (a data-colored left edge: something waits for you),
// dashed (not available), s2 (surface-2, no shadow). A card that opens something is one button (CardButton).
import { cx } from './cx.js';

export const CARD_VARIANTS = Object.freeze(['hero', 'flush', 'tint', 'wait', 'dashed', 's2']);

const variantClasses = variant => [variant].flat().filter(v => CARD_VARIANTS.includes(v)).map(v => `gx-card--${v}`);

/** `<Card as="section" variant="hero" aria-labelledby={id}>...</Card>`; `variant` is one name or a list. */
export function Card({ as: Tag = 'div', variant, className, children, ...rest }) {
  return <Tag className={cx('gx-card', variantClasses(variant), className)} {...rest}>{children}</Tag>;
}

/** A whole card that is one button (it lays its children out in a row; add gx- layout classes for a column). */
export function CardButton({ ref, variant, className, children, ...rest }) {
  return <button ref={ref} type="button" className={cx('gx-card', 'gx-card-btn', variantClasses(variant), className)} {...rest}>{children}</button>;
}
