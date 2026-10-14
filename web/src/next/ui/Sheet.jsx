// A bottom sheet (CONTRACT sections 2 and 10; design system 7.15): a modal panel that slides up over a scrim, never
// above the top bar, at most 520 wide. Head: the title and a close button, or, in a sub-view, a back button naming the
// parent ("‹ SEA @ DEN") with the sub-view's title at the top of the body. The body scrolls; an optional foot holds
// the sheet's actions above the home indicator. Tapping the scrim or pressing Escape closes it; focus moves in on open,
// stays inside while open and returns to the opener on close. The stage 10 host keeps one sheet showing at a time.
// A sub-view opens in place (the same sheet, new `back` and `title`): the head swaps the title for the back button, so
// whatever had focus may be gone. Each change of view moves focus to the panel, which reads the new title and keeps
// Tab and Escape inside the sheet (stage 10 kit fix).
import { ChevronLeft, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
import { cx } from './cx.js';
import { useModal } from './useModal.js';

/**
 * `<Sheet title="SEA @ DEN" onClose={close} footer={<Button variant="primary" block>Guess this game</Button>}>`.
 * `back` is `{ label, onBack }` for a sub-view; `tall` grows it to its full height; `initialFocusRef` picks what takes
 * focus on open (the panel itself by default, so a screen reader reads the sheet's name first).
 */
export function Sheet({ title, onClose, back, tall = false, footer, closeLabel = 'Close', initialFocusRef, className, children }) {
  const panel = useRef(null);
  const titleId = useId();
  const onKeyDown = useModal(panel, { onEscape: onClose, initialFocusRef });
  const view = back ? `sub ${back.label} ${title}` : 'main';
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    panel.current?.focus({ preventScroll: true });
  }, [view]);
  const heading = <h2 className={back ? 'gx-t-section' : 'gx-sheet-title'} id={titleId}>{title}</h2>;
  return (
    <div className="gx-layer gx-layer--sheet" onKeyDown={onKeyDown}>
      {/* The scrim closes on a tap; keyboard and screen reader users have Escape and the close button, so it is hidden from them. */}
      <button type="button" className="gx-scrim" aria-hidden="true" tabIndex={-1} onClick={onClose}></button>
      <section ref={panel} className={cx('gx-sheet', className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="gx-sheet-grab" aria-hidden="true"></div>
        <div className={cx('gx-sheet-inner', tall && 'gx-sheet-inner--tall')}>
          <div className="gx-sheet-head">
            {back ? (
              <>
                <button type="button" className="gx-sheet-back" onClick={back.onBack}><Icon icon={ChevronLeft} size={20}/>{back.label}</button>
                <span className="gx-grow"></span>
              </>
            ) : heading}
            <IconButton icon={X} label={closeLabel} onClick={onClose}/>
          </div>
          <div className="gx-sheet-body">
            {back ? heading : null}
            {children}
          </div>
          {footer ? <div className="gx-sheet-foot">{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}
