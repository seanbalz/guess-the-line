// D-69 step 3 (spec 4.1: "Its swipe paging between games moves into the game layer"): the game sheet's pager inside a
// nesting card. Its place ("2 of 14", said with the title) and 44 px previous and next buttons sit at the top of the
// card; a sideways drag of its body turns the page with the sheet's own gesture and thresholds (useSheetGestures.js
// usePagerSwipe, sheet.css's motion classes). The body moves with an inline transform on itself only, never on an
// ancestor of the fixed bars. Turning a page is not a navigation: the owner swaps the item in place, so focus stays on
// the button, and the page scrolls back to the top when the item (`page`) changes.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { pagerPlace } from './gesture.js';
import { IconButton } from './IconButton.jsx';
import { cx } from './cx.js';
import { usePagerSwipe } from './useSheetGestures.js';
import './sheet.css';
import './pager.css';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function LayerPager({ title, pager, page, children }) {
  const body = useRef(null), shown = useRef(page);
  const place = pagerPlace(pager?.index, pager?.count);
  const paging = usePagerSwipe(body, place ? pager : null);
  useClientLayoutEffect(() => {
    if (shown.current !== page) window.scrollTo(0, 0);
    shown.current = page;
  }, [page]);
  const button = (step, icon, label, can) => <IconButton icon={icon} label={label} className="gx-sheet-page"
    aria-disabled={can ? undefined : 'true'} onClick={() => { if (can) paging.turn(step); }}/>;
  return <>
    {place ? <div className="gx-pager-head" data-pager="">
      <p className="gx-t-meta gx-c-2" aria-live="polite"><span className="gx-sr-only">{title}, {pager.unit ?? 'page'} </span>{place.text}</p>
      {button(-1, ChevronLeft, pager.prevLabel ?? 'Previous', place.canPrev)}
      {button(1, ChevronRight, pager.nextLabel ?? 'Next', place.canNext)}
    </div> : null}
    <div ref={body} className={cx('gx-pager-body', place && 'gx-sheet-body--pager')} onPointerDown={place ? paging.onPointerDown : undefined}>{children}</div>
  </>;
}
