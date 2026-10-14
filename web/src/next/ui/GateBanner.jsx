// The one line-lock banner per screen (CONTRACT section 13 rule 1; D-39 per-game lock-in). It draws the view model from
// rules.js `gateBanner(week, market)`: the lock sentence, the way in (a data-colored text button) and the D-36 skip
// (grey). It renders nothing once the market's lines are open. A button shows only when its handler is given, so the
// banner never offers a dead control. The server is the authority; this banner only says what it decided.
import { ChevronRight } from 'lucide-react';
import { Button } from './Button.jsx';
import { LockLine } from './LockLine.jsx';
import { cx } from './cx.js';

export function GateBanner({ gate, onCta, onSkip, note, className, ...rest }) {
  if (!gate || !gate.locked || !gate.sentence) return null;
  const cta = gate.ctaLabel && typeof onCta === 'function';
  const skip = gate.canSkip && gate.skipLabel && typeof onSkip === 'function';
  return (
    <div className={cx('gx-lock-card', className)} {...rest}>
      <LockLine>{gate.sentence}</LockLine>
      {note ? <p className="gx-t-meta">{note}</p> : null}
      {cta || skip ? (
        <div className="gx-gate-acts">
          {cta ? <Button variant="ghost" iconEnd={ChevronRight} onClick={onCta}>{gate.ctaLabel}</Button> : null}
          {skip ? <Button variant="ghost-2" onClick={onSkip}>{gate.skipLabel}</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
