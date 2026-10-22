import { useCallback, useEffect, useState } from 'react';
import { firstTrendWeek, loadTrendWeek } from './trendsLoaders.js';
import { weekKey } from '../../shared/trends-view.mjs';
const known = (season, week) => Number.isInteger(season) && Number.isInteger(week);
/**
 * The state after a read settles: { ok: true, data } or { ok: false, error }. A background refresh (the 5-minute
 * interval or the tab becoming visible) never replaces a ready week with "missing" or an ordinary error for the same
 * key, since the week is open and was already shown; an account or membership refusal (400, 401, 403) always does.
 */
export function settleTrendWeek(current, key, outcome, background = false) {
  const ready = background && current?.key === key && current.status === 'ready';
  if (outcome.ok) return ready && !outcome.data ? current : { key, status: outcome.data ? 'ready' : 'missing', week: outcome.data };
  return ready && ![400, 401, 403].includes(outcome.error?.status) ? current : { key, status: 'error', week: null };
}
/** Shared legacy/new refresh, retry and synchronous week/scope masking. */
export function useTrendWeek(season, week, enabled = true, scope = '') {
  const key = known(season, week) ? weekKey(season, week) + ':' + scope : null;
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !known(season, week)) return undefined;
    let live = true;
    setState({ key, status: 'loading', week: null });
    const settle = (outcome, background) => { if (live) setState(current => settleTrendWeek(current, key, outcome, background)); };
    const read = (options = {}, background = false) => loadTrendWeek(season, week, options).then(data => settle({ ok: true, data }, background), error => settle({ ok: false, error }, background));
    const show = () => { if (document.visibilityState === 'visible') read({ fresh: true }, true); };
    read({ retry: attempt > 0 });
    const timer = setInterval(() => { if (document.visibilityState === 'visible') read({}, true); }, 5 * 60_000);
    document.addEventListener('visibilitychange', show);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', show); };
  }, [season, week, enabled, attempt, scope]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const shown = enabled && key && state?.key === key ? state : { status: enabled && key ? 'loading' : 'idle', week: null };
  return { ...shown, first: known(season, week) ? firstTrendWeek(season) : null, retry };
}
