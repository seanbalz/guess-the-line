// The Field monogram (D-12, D-14; BRAND_GUIDE "Stays"): the dark Yardline G on the rounded lime tile. The G's two
// paths are the exact original study geometry of `YardlineMark` in web/src/Brand.jsx (tests/next-ui.test.jsx checks they
// stay equal); this copy exists so the new app does not load the old app's brand.css. Top bar (32, the link home),
// system posts at avatar size (24 to 56). Decorative by default; with `label` it is an image named "Guess The Line".
import { cx, imgA11y, oneOf } from './cx.js';

export const FIELD_MARK_SIZES = Object.freeze([24, 32, 40, 56, 80]);
export const YARDLINE_G_PATHS = Object.freeze({
  g: 'M86 20H54L32 40v33h54V46H60v12h13v3H46V46l16-14h24z',
  yards: 'M22 35h13M22 55h13M90 35h13M90 55h13',
});

export function FieldMark({ size = 32, label, className, ...rest }) {
  const px = oneOf(size, FIELD_MARK_SIZES, 32);
  return (
    <span className={cx('gx-mono', px !== 32 && `gx-mono--${px}`, className)} {...imgA11y(label)} {...rest}>
      <svg className="gx-mono-svg" viewBox="0 0 130 90" aria-hidden="true" focusable="false">
        <path d={YARDLINE_G_PATHS.g} fill="currentColor"></path>
        <path d={YARDLINE_G_PATHS.yards} fill="none" stroke="currentColor" strokeWidth="3"></path>
      </svg>
    </span>
  );
}
