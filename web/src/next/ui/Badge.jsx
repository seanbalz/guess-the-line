// The badge tile (design system 7.12, the "Pylon"): an original rounded tile with a corner stripe in its rarity ring.
// Sizes 24 (rows), 40 (feed), 56 (profile, default), 96 (celebration). Rarity is a ring plus a printed word, never
// color alone: the caller prints the name and the rarity word beside the tile (or passes `label` with both). Locked
// is dashed with a muted icon. Icons are original line icons: a Lucide glyph (`icon`) or one 24-unit path (`iconPath`);
// no team logos, sportsbook marks or emoji.
import { Icon } from './Icon.jsx';
import { cx, imgA11y, oneOf } from './cx.js';

export const BADGE_SIZES = Object.freeze([24, 40, 56, 96]);
export const BADGE_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic']);
const ICON_PX = { 24: 12, 40: 20, 56: 24, 96: 32 };

export function Badge({ icon, iconPath, size = 56, rarity = 'common', locked = false, label, className, ...rest }) {
  const px = oneOf(size, BADGE_SIZES, 56);
  const tier = oneOf(rarity, BADGE_RARITIES, 'common');
  const iconPx = ICON_PX[px];
  let glyph = null;
  if (iconPath) {
    glyph = (
      <svg className={cx('gx-ic', iconPx !== 24 && `gx-ic-${iconPx}`)} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={iconPath}></path>
      </svg>
    );
  } else if (icon) {
    glyph = <Icon icon={icon} size={iconPx}/>;
  }
  return (
    <span className={cx('gx-badge', px !== 56 && `gx-badge--${px}`, !locked && tier !== 'common' && `gx-badge--${tier}`, locked && 'gx-badge--locked', className)} {...imgA11y(label)} {...rest}>
      {glyph}
    </span>
  );
}
