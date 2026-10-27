// A bottom sheet (CONTRACT sections 2 and 10; design system 7.15): a modal panel that slides up over a scrim, never
// above the top bar, at most 520 wide. Head: the title and a close button, or, in a sub-view, a back button naming the
// parent ("‹ SEA @ DEN") with the sub-view's title at the top of the body. The body scrolls; an optional foot holds
// the sheet's actions above the home indicator. Tapping the scrim or pressing Escape closes it; focus moves in on open,
// stays inside while open and returns to the opener on close. The stage 10 host keeps one sheet showing at a time.
// A sub-view opens in place (the same sheet, new `back` and `title`): the head swaps the title for the back button, so
// whatever had focus may be gone. Each change of view moves focus to the panel, which reads the new title and keeps
// Tab and Escape inside the sheet (stage 10 kit fix).
// Gestures (design upgrade, useSheetGestures.js): dragging the grab handle or the head down moves the sheet with the
// finger and closes it past the threshold (a short drag snaps back). A paging sheet (`pager`) also turns its page on a
// sideways drag of the body, and shows its place ("2 of 14") with 44px previous and next buttons for everyone else.
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { pagerPlace } from './gesture.js';
import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
import { cx } from './cx.js';
import { useModal } from './useModal.js';
import { useDismissDrag, usePagerSwipe } from './useSheetGestures.js';
import './press.css';
import './sheet.css';

/**
 * `<Sheet title="SEA @ DEN" onClose={close} footer={<Button variant="primary" block>Guess this game</Button>}>`.
 * `back` is `{ label, onBack }` for a sub-view; `tall` grows it to its full height; `initialFocusRef` picks what takes
 * focus on open (the panel itself by default, so a screen reader reads the sheet's name first). `pager` makes it a
 * paging sheet: `{ index, count, onMove(step), unit, prevLabel, nextLabel }`, where `onMove(-1 | 1)` shows the previous
 * or next page (by changing what the sheet draws) and `unit` names a page ("game": "SEA @ DEN, game 2 of 14").
 */
export function Sheet({ title, onClose, back, tall = false, footer, closeLabel = 'Close', initialFocusRef, pager, className, children }) {
  const panel = useRef(null), scrim = useRef(null), body = useRef(null);
  const titleId = useId();
  const onKeyDown = useModal(panel, { onEscape: onClose, initialFocusRef });
  const onDragStart = useDismissDrag(panel, scrim, onClose);
  const place = pagerPlace(pager?.index, pager?.count);
  const paging = usePagerSwipe(body, place ? pager : null);
  const view = back ? `sub ${back.label} ${title}` : 'main';
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    panel.current?.focus({ preventScroll: true });
  }, [view]);
  const heading = <h2 className={back ? 'gx-t-section' : 'gx-sheet-title'} id={titleId}>{title}</h2>;
  const pageButton = (step, icon, label, can) => (
    <IconButton icon={icon} label={label} className="gx-sheet-page" aria-disabled={can ? undefined : 'true'}
      onClick={() => { if (can) paging.turn(step); }}/>
  );
  return (
    <div className="gx-layer gx-layer--sheet" onKeyDown={onKeyDown}>
      {/* The scrim closes on a tap; keyboard and screen reader users have Escape and the close button, so it is hidden from them. */}
      <button ref={scrim} type="button" className="gx-scrim" aria-hidden="true" tabIndex={-1} onClick={onClose}></button>
      <section ref={panel} className={cx('gx-sheet', className)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="gx-sheet-grab" aria-hidden="true" onPointerDown={onDragStart}></div>
        <div className={cx('gx-sheet-inner', tall && 'gx-sheet-inner--tall')}>
          <div className="gx-sheet-head" onPointerDown={onDragStart}>
            {back ? (
              <>
                <button type="button" className="gx-sheet-back" onClick={back.onBack}><Icon icon={ChevronLeft} size={20}/>{back.label}</button>
                <span className="gx-grow"></span>
              </>
            ) : place ? (
              <div className="gx-sheet-titles">
                {heading}
                <p className="gx-t-meta gx-c-2" aria-live="polite"><span className="gx-sr-only">{title}, {pager.unit ?? 'page'} </span>{place.text}</p>
              </div>
            ) : heading}
            {place ? (
              <>
                {pageButton(-1, ChevronLeft, pager.prevLabel ?? 'Previous', place.canPrev)}
                {pageButton(1, ChevronRight, pager.nextLabel ?? 'Next', place.canNext)}
              </>
            ) : null}
            <IconButton icon={X} label={closeLabel} onClick={onClose}/>
          </div>
          <div ref={body} className={cx('gx-sheet-body', place && 'gx-sheet-body--pager')} onPointerDown={place ? paging.onPointerDown : undefined}>
            {back ? heading : null}
            {children}
          </div>
          {footer ? <div className="gx-sheet-foot">{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}
