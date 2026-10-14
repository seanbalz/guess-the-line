// A confirmation dialog on the native <dialog> element (CONTRACT section 10: title, text, actions; 342 wide). The
// browser opens it modally with showModal(), so the page behind is inert, focus moves into it (to the first action:
// put the safe one first, "Keep playing" before "Skip this week") and returns to the opener when it closes. Escape asks
// `onClose`, once per press; a click on the backdrop does nothing, since these dialogs ask for a decision. `alert`
// (default) marks it an alertdialog. The parent owns `open`: when its onClose leaves `open` true (a save still
// running), the dialog stays open, even after a browser that will not let a page refuse a second Escape in a row closes
// it anyway (stage 10 kit fix).
import { useEffect, useId, useReducer, useRef } from 'react';
import { cx } from './cx.js';

export function Dialog({ open, title, text, onClose, alert = true, className, children }) {
  const ref = useRef(null);
  const titleId = useId();
  const textId = useId();
  const latest = useRef({ open, onClose });
  latest.current = { open, onClose };
  // Set when the browser fired a cancel it would not let us stop: the close event that follows is the same Escape.
  const closing = useRef(false);
  // Bumped when the browser closed the dialog by itself, so the effect below runs again and reopens it if `open` is
  // still true.
  const [closedByBrowser, noteClosed] = useReducer(n => n + 1, 0);
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
  }, [open, closedByBrowser]);
  // Escape fires cancel. It is refused here so the parent decides; a browser that will not let a page refuse two in a
  // row sends it uncancelable, then closes the dialog and fires close. Either way the parent hears once per Escape.
  const cancel = event => {
    event.preventDefault();
    closing.current = !event.cancelable;
    if (latest.current.open) latest.current.onClose?.();
  };
  const closed = () => {
    const sameEscape = closing.current;
    closing.current = false;
    if (!sameEscape && latest.current.open) latest.current.onClose?.();
    noteClosed();
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
