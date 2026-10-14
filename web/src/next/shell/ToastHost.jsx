// The toast host (prototype CONTRACT section 6, `toast()`; design system 7.16): one toast at a time from the shell's
// queue, 8 above the tab bar or a dock, never over an overlay. Screen readers hear each toast from ONE live region
// that is always in the page (stage 10 kit fix): a live region that appears together with its words is often not
// announced, so the toasts themselves drop their role (`live={false}`). The region is emptied first and filled a
// moment later, so a repeated message is announced again and a switch to "assertive" for an error lands before the
// words do. An error toast stays until dismissed and is announced at once; the others are polite.
import { useEffect, useState } from 'react';
import { Toast } from '../ui/index.js';
import { visibleToast } from './state.js';

export const ANNOUNCE_DELAY_MS = 100;

export function ToastHost({ state, onDismiss }) {
  const toast = visibleToast(state);
  const [said, setSaid] = useState({ text: '', assertive: false });
  const key = toast?.key ?? null;
  useEffect(() => {
    const assertive = toast?.tone === 'error';
    setSaid({ text: '', assertive });
    if (!toast) return undefined;
    const timer = setTimeout(() => setSaid({ text: toast.text, assertive }), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
    // Once per toast: its key changes when the next one shows.
  }, [key]);
  return (
    <>
      <div className="gx-sr-only" role="status" aria-live={said.assertive ? 'assertive' : 'polite'} aria-atomic="true">{said.text}</div>
      {toast ? (
        <Toast
          key={toast.key}
          live={false}
          text={toast.text}
          tone={toast.tone}
          duration={toast.duration}
          actionLabel={toast.actionLabel}
          onAction={typeof toast.action === 'function' ? () => { onDismiss(toast.key); toast.action(); } : undefined}
          onDismiss={() => onDismiss(toast.key)}
        />
      ) : null}
    </>
  );
}
