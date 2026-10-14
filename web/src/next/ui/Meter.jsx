// Meters (design system 7.13; D-36 qualification). Meter is the Bets weekly minimum: three segments (3 bets or 3U,
// challenges count), filled as far as the player has got. DriveMeter is a streak: five slanted segments that stay full
// from five on while the number beside it keeps counting. Both are pictures of a number the caller also writes in
// words; give `label` ("Pick streak, 4 weeks") when no visible words sit beside it, else they are hidden.
import { cx, imgA11y } from './cx.js';

const count = (value, max) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(max, Math.max(0, n));
};

export function Meter({ value, max = 3, label, className, ...rest }) {
  const size = Number.isInteger(max) && max > 0 ? max : 3;
  const on = count(value, size);
  return (
    <div className={cx('gx-meter3', className)} {...imgA11y(label)} {...rest}>
      {Array.from({ length: size }, (_, i) => <span key={i} className={cx('gx-meter3-seg', i < on && 'gx-meter3-seg--on')}></span>)}
    </div>
  );
}

export const DRIVE_SEGMENTS = 5;

export function DriveMeter({ value, label, className, ...rest }) {
  const on = count(value, DRIVE_SEGMENTS);
  return (
    <span className={cx('gx-drive', className)} {...imgA11y(label)} {...rest}>
      {Array.from({ length: DRIVE_SEGMENTS }, (_, i) => <span key={i} className={cx('gx-drive-seg', i < on && 'gx-drive-seg--on')}></span>)}
    </span>
  );
}
