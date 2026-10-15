// The Field monogram (D-12, D-14, D-44; BRAND_GUIDE "Stays"): the Yardline G alone, in the theme's accent-ink green
// (lime in dark, deep green in light), on a transparent background with no tile. The G's two paths are the exact
// original study geometry of `YardlineMark` in web/src/Brand.jsx (tests/next-ui.test.jsx checks they stay equal), and
// the viewBox is the G's own bounds, so the G fills the box; this copy exists so the new app does not load the old
// app's brand.css. Top bar (32, the link home), the start screen (80) and the load-failed screen (56). Decorative by
// default; with `label` it is an image named "Guess The Line".
import { cx, imgA11y, oneOf } from './cx.js';

export const FIELD_MARK_SIZES = Object.freeze([24, 32, 40, 56, 80]);
export const YARDLINE_G_PATHS = Object.freeze({
  g: 'M86 20H54L32 40v33h54V46H60v12h13v3H46V46l16-14h24z',
  yards: 'M22 35h13M22 55h13M90 35h13M90 55h13',
});
/** The bounds of the two paths: x 22 to 103 (the yard lines' ends), y 20 to 73 (the G's top and foot). */
export const YARDLINE_G_VIEWBOX = '22 20 81 53';

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
