// A confirmation dialog on the native <dialog> element (CONTRACT section 10: title, text, actions; 342 wide). The
// browser opens it modally with showModal(), so the page behind is inert, focus moves into it (to the first action:
// put the safe one first, "Keep playing" before "Skip this week") and returns to the opener when it closes. Escape asks
// `onClose`; a click on the backdrop does nothing, since these dialogs ask for a decision. `alert` (default) marks it
// an alertdialog. The parent owns `open`.
import { useEffect, useId, useRef } from 'react';
import { cx } from './cx.js';

export function Dialog({ open, title, text, onClose, alert = true, className, children }) {
  const ref = useRef(null);
  const titleId = useId();
  const textId = useId();
  const isOpen = useRef(open);
  isOpen.current = open;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);
  // The browser may close a modal dialog on Escape by itself (a close request it does not let a page cancel twice);
  // either way the parent hears about it once and stays the owner of `open`.
  const cancel = event => {
    event.preventDefault();
    if (isOpen.current) onClose?.();
  };
  const closed = () => {
    if (isOpen.current) onClose?.();
  };
  return (
    <dialog
      ref={ref}
      className={cx('gx-dialog', className)}
      role={alert ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={text ? textId : undefined}
      onCancel={cancel}
      onClose={closed}
    >
      <h2 className="gx-dialog-title" id={titleId}>{title}</h2>
      {text ? <p className="gx-dialog-text" id={textId}>{text}</p> : null}
      <div className="gx-dialog-actions">{children}</div>
    </dialog>
  );
}
