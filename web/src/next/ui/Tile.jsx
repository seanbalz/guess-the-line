// D-69 (design audit B0-1): the kit's tile, one per destination on a tab's first card (spec section 5, "Under it, tiles
// in two columns"). A label with an icon or a small picture, one big number, one short line, and NEW when its card holds
// a moment that waits (moments/MomentsProvider.jsx useNewCount). A toned line always carries its own word or symbol
// ("▲ 2", "New: …"), never color alone (D-38). Home and Play's landing draw it; play/PlayTile.jsx re-exports it.
import { Icon } from './Icon.jsx';
import { NewPill } from './Pill.jsx';
import { cx } from './cx.js';
import './tile.css';

export const TILE_TONES = Object.freeze(['plain', 'good', 'warn']);

/** The spoken name with NEW in it: ", new" is added when `isNew` and the caller's label does not already say the word. */
export const spokenName = (ariaLabel, isNew) => (isNew && typeof ariaLabel === 'string' && !/\bnew\b/i.test(ariaLabel) ? `${ariaLabel}, new` : ariaLabel);

/**
 * `ref` (a React 19 ref prop) reaches the button, so a screen can return focus to a tile. `ariaLabel` is the whole
 * spoken name; the tile says "new" in it whenever its NEW tag shows (spokenName). `icon` is an `Icon` name or a Lucide
 * component. `picture` (faces, marks) is drawn under the label and hidden from assistive technology: the name says it.
 */
export function Tile({ ref, label, icon, picture, big, sub, tone = 'plain', isNew = false, onClick, ariaLabel }) {
  const t = TILE_TONES.includes(tone) ? tone : 'plain';
  return (
    <button ref={ref} type="button" className="gx-nest-tile gx-tile" aria-label={spokenName(ariaLabel, isNew)} onClick={onClick}>
      <span className="gx-nest-tile-top">
        <span className="gx-nest-tile-label">{label}</span>
        {icon ? <Icon icon={icon} size={20}/> : null}
      </span>
      {picture ? <span className="gx-tile-pic" aria-hidden="true">{picture}</span> : null}
      <span className="gx-n-l gx-nest-num">{big}</span>
      <span className="gx-tile-foot">
        <span className={cx('gx-t-meta', 'gx-tile-sub', `gx-tile-sub--${t}`)}>{sub}</span>
        {isNew ? <NewPill/> : null}
      </span>
    </button>
  );
}
