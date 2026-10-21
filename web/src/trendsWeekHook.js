import { useCallback, useEffect, useState } from 'react';
import { firstTrendWeek, loadTrendWeek } from './trendsLoaders.js';
import { weekKey } from '../../shared/trends-view.mjs';
const known = (season, week) => Number.isInteger(season) && Number.isInteger(week);
/** Shared legacy/new refresh, retry and synchronous week/scope masking. */
export function useTrendWeek(season, week, enabled = true, scope = '') {
  const key = known(season, week) ? weekKey(season, week) + ':' + scope : null;
  const [state, setState] = useState(null), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !known(season, week)) return undefined;
    let live = true;
    setState({ key, status: 'loading', week: null });
    const read = (options = {}) => loadTrendWeek(season, week, options).then(data => { if (live) setState({ key, status: data ? 'ready' : 'missing', week: data }); }, () => { if (live) setState({ key, status: 'error', week: null }); });
    const show = () => { if (document.visibilityState === 'visible') read({ fresh: true }); };
    read({ retry: attempt > 0 });
    const timer = setInterval(() => { if (document.visibilityState === 'visible') read(); }, 5 * 60_000);
    document.addEventListener('visibilitychange', show);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', show); };
  }, [season, week, enabled, attempt, scope]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const shown = enabled && key && state?.key === key ? state : { status: enabled && key ? 'loading' : 'idle', week: null };
  return { ...shown, first: known(season, week) ? firstTrendWeek(season) : null, retry };
}
