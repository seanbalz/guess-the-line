// D-69 step 1 (spec section 5, "Under it, tiles in two columns"): one Play landing tile. A label and an icon, one big
// number, one short line, and NEW when its card holds a moment that waits (moments/MomentsProvider.jsx useNewCount).
// A toned line always carries its own word or symbol ("▲ 2", "New: …"), never color alone (D-38).
import { Icon, NewPill, cx } from '../ui/index.js';
import './playFrame.css';

const TONES = new Set(['plain', 'good', 'warn']);

/** The spoken name with NEW in it: ", new" is added when `isNew` and the caller's label does not already say the word. */
export const spokenName = (ariaLabel, isNew) => (isNew && typeof ariaLabel === 'string' && !/\bnew\b/i.test(ariaLabel) ? `${ariaLabel}, new` : ariaLabel);

/** `ref` (a React 19 ref prop) reaches the button, so the landing can return focus to a tile. `ariaLabel` is the spoken
 * name; the tile says "new" in it whenever the visible NEW tag shows (spokenName), so no caller can forget it and none
 * says it twice. */
export function PlayTile({ ref, label, icon, big, sub, tone = 'plain', isNew = false, onClick, ariaLabel }) {
  const t = TONES.has(tone) ? tone : 'plain';
  return (
    <button ref={ref} type="button" className="gx-nest-tile gx-play-tile" aria-label={spokenName(ariaLabel, isNew)} onClick={onClick}>
      <span className="gx-nest-tile-top">
        <span className="gx-nest-tile-label">{label}</span>
        {icon ? <Icon icon={icon} size={20}/> : null}
      </span>
      <span className="gx-n-l gx-nest-num">{big}</span>
      <span className="gx-play-tile-foot">
        <span className={cx('gx-t-meta', 'gx-play-tile-sub', `gx-play-tile-sub--${t}`)}>{sub}</span>
        {isNew ? <NewPill/> : null}
      </span>
    </button>
  );
}
