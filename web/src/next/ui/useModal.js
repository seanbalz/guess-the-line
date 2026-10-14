// Focus handling for the new app's own modal layers (Sheet, Overlay; the native <dialog> does this itself):
// on open, focus moves into the layer; Tab and Shift+Tab stay inside it; Escape asks it to close; on close, focus goes
// back to whatever had it before. The stage 10 layer hosts stack these and make the page behind inert.
import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/** The elements Tab can reach inside `root`, in order (visible ones only). */
export function tabbables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0);
}

/**
 * `const onKeyDown = useModal(panelRef, { onEscape, initialFocusRef })`; put `onKeyDown` on the layer element and
 * `tabIndex={-1}` on the panel, which takes focus when nothing more specific is asked for.
 */
export function useModal(panelRef, { onEscape, initialFocusRef } = {}) {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const target = initialFocusRef?.current ?? panelRef.current;
    target?.focus({ preventScroll: true });
    return () => {
      if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
    // Once per opening: the layer mounts when it opens and unmounts when it closes.
  }, []);
  return useCallback(event => {
    if (event.key === 'Escape') {
      if (typeof escape.current === 'function') {
        event.stopPropagation();
        escape.current();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    const items = tabbables(panel);
    if (!items.length) {
      event.preventDefault();
      panel?.focus({ preventScroll: true });
      return;
    }
    const first = items[0], last = items[items.length - 1], active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel || !panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }, [panelRef]);
}
