import dark from './brand-assets/lime.svg';
import light from './brand-assets/light-deep-green.svg';

/** Selected original hybrid G. The parent button supplies its accessible name; no backing circle. */
export function PrismBrand() {
  return <span className="gx-prism-brand" aria-hidden="true"><img className="gx-prism-dark" src={dark} alt=""/><img className="gx-prism-light" src={light} alt=""/></span>;
}
