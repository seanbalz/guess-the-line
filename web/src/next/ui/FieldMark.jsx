// The Field monogram (D-12, D-14, D-44; BRAND_GUIDE "Stays"): the Yardline G alone, in the theme's accent-ink green
// (lime in dark, deep green in light), on a transparent background with no tile. The G's two paths are the exact
// October 29 Balanced geometry of `YardlineMark` in web/src/Brand.jsx (tests/next-ui.test.jsx checks they stay equal), and
// the viewBox is the G's own bounds, so the G fills the box; this copy exists so the new app does not load the old
// app's brand.css. Top bar (32, the link home), the start screen (80) and the load-failed screen (56). Decorative by
// default; with `label` it is an image named "Guess The Line".
import { cx, imgA11y, oneOf } from './cx.js';

export const FIELD_MARK_SIZES = Object.freeze([24, 32, 40, 56, 80]);
export const YARDLINE_G_PATHS = Object.freeze({
  g: 'M16 8H48L56 16V20H22L20 22V42L22 44H42L44 42V40H32V28H56V48L48 56H16L8 48V16Z',
  yards: 'M0 24h6M0 40h6M58 24h6M58 40h6',
});
/** The bounds of the two paths: x 0 to 64 (the yard lines' ends), y 8 to 56 (the G's top and foot). */
export const YARDLINE_G_VIEWBOX = '0 8 64 48';

export function FieldMark({ size = 32, label, className, ...rest }) {
  const px = oneOf(size, FIELD_MARK_SIZES, 32);
  return (
    <span className={cx('gx-mono', px !== 32 && `gx-mono--${px}`, className)} {...imgA11y(label)} {...rest}>
      <svg className="gx-mono-svg" viewBox={YARDLINE_G_VIEWBOX} aria-hidden="true" focusable="false">
        <path d={YARDLINE_G_PATHS.g} fill="currentColor"></path>
        <path d={YARDLINE_G_PATHS.yards} fill="none" stroke="currentColor" strokeWidth="3"></path>
      </svg>
    </span>
  );
}
