// The Pick a Team read for a screen: one `epl/draft/read` on mount, again every 30 seconds while the page is in view
// (everyone sees the board as it happens) and when the page comes back into view, and on request after a save.
// draftReducer drops the board on a refusal, so a non-member's 403 never leaves draft data on screen.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { draftReducer } from './draftModel.js';

export const DRAFT_POLL_MS = 30_000;

export function useEplDraft(api) {
  const [state, dispatch] = useReducer(draftReducer, undefined, () => draftReducer(undefined, { type: 'start' }));
  const [now, setNow] = useState(() => Date.now());
  const live = useRef(null);
  const load = useCallback(() => {
    live.current?.abort();
    const controller = new AbortController();
    live.current = controller;
    dispatch({ type: 'start' });
    return api('draft/read', {}, { signal: controller.signal }).then(
      data => { if (live.current === controller) { setNow(Date.now()); dispatch({ type: 'loaded', data }); } },
      error => { if (live.current === controller && error?.name !== 'AbortError') { setNow(Date.now()); dispatch({ type: 'failed', error }); } },
    );
  }, [api]);
  useEffect(() => {
    load();
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const timer = setInterval(() => { if (visible()) load(); }, DRAFT_POLL_MS);
    // The deadline hint: the clock moves on between reads so the buttons lock at first kickoff.
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const back = () => { if (visible()) load(); };
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(timer); clearInterval(tick); document.removeEventListener('visibilitychange', back); live.current?.abort(); live.current = null; };
  }, [load]);
  return { state, now, reload: load };
}
