// Keep the original artwork as cacheable media, outside embedded SVG attribute payloads.
import dark from './brand-assets/lime.svg?no-inline';
import light from './brand-assets/light-deep-green.svg?no-inline';

/** Selected original hybrid G. The parent button supplies its accessible name; no backing circle. */
export function PrismBrand() {
  return <span className="gx-prism-brand" aria-hidden="true"><img className="gx-prism-dark" src={dark} alt=""/><img className="gx-prism-light" src={light} alt=""/></span>;
}
