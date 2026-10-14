// A celebration layer (design system 7.16 "stadium flash"; CONTRACT section 10): a full-phone scrim with a centered
// card (342 wide) or a full-height panel. Only for verified outcomes, one at a time and never on page load; the stage
// 10 host queues them. It is a modal dialog named by `label` (or by an element id in `labelledBy`): focus moves into
// it, stays inside and returns on close; Escape asks `onClose`. Motion is the card's pop, which reduced motion stops.
import { useRef } from 'react';
import { cx } from './cx.js';
import { useModal } from './useModal.js';

export function Overlay({ label, labelledBy, onClose, full = false, initialFocusRef, className, children }) {
  if (!(typeof label === 'string' && label.trim()) && !(typeof labelledBy === 'string' && labelledBy)) throw new TypeError('Overlay needs an accessible name.');
  const panel = useRef(null);
  const onKeyDown = useModal(panel, { onEscape: onClose, initialFocusRef });
  return (
    <div className="gx-layer gx-layer--overlay" onKeyDown={onKeyDown}>
      <div
        ref={panel}
        className={cx(full ? 'gx-ov-full' : 'gx-ov-card', className)}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy || undefined}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
