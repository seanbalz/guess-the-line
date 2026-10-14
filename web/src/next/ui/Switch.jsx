// An on/off setting row (prototype Settings: "Reduce motion", "Pick reminders"): the words on the left, a 52 x 32
// switch on the right, 56 tall. It is a real checkbox with role="switch", named by its words alone (aria-labelledby:
// the <label> holds the meta line too, which would otherwise join the name and be read twice) and described by its
// meta line; the checkbox covers the whole row, so the row is the tap target, and the drawn switch is decoration.
import { useId } from 'react';
import { cx } from './cx.js';

/** `<Switch label="Reduce motion" sub="Your phone's setting also counts." checked={on} onChange={setOn}/>`; onChange gets the new value. */
export function Switch({ label, sub, checked = false, onChange, disabled = false, className, ...rest }) {
  const titleId = useId();
  const subId = useId();
  return (
    <label className={cx('gx-switch-row', className)}>
      <span className="gx-row-main">
        <span className="gx-row-title" id={titleId}>{label}</span>
        {sub ? <span className="gx-row-sub" id={subId}>{sub}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="gx-switch-input"
        checked={checked}
        disabled={disabled}
        aria-labelledby={titleId}
        aria-describedby={sub ? subId : undefined}
        onChange={event => onChange?.(event.target.checked)}
        {...rest}
      />
      <span className="gx-switch" aria-hidden="true"></span>
    </label>
  );
}
