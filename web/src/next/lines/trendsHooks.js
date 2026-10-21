// The new app's hooks over the shared trends loaders (web/src/trendsLoaders.js, no React): the week file, the hosted
// referee assignments and the kickoff wind forecasts (D-34). They match the old app's hooks in trendsData.js and share
// its caches: one `/wind/read` or `/officials/read` per week, reused for five minutes by the board and every sheet. The
// board (for its D-45 chips, build plan stage 13) and an open game sheet re-read the wind at the D-47 due points (24 h
// after a snapshot was taken, 12 h and 2 h before kickoff), at kickoff and when the tab shows again, as the old trends
// panel does, and never more often; reads that land within a minute of each other share one request. The referees are
// read only once a sheet opens.
import { useCallback, useEffect, useState } from 'react';
import { firstTrendWeek, loadOfficials, loadTrendWeek, loadWind, onOfficialsChange } from '../../trendsLoaders.js';
import { watchWind, windNowFor } from '../../windTimer.js';
import { weekKey } from '../../../../shared/trends-view.mjs';

const known = (season, week) => Number.isInteger(season) && Number.isInteger(week);

/** `{ status: 'idle' | 'loading' | 'ready' | 'missing' | 'error', week, first, retry }` for one week's trends file. */
export function useTrendWeek(season, week, enabled = true) {
  const key = known(season, week) ? weekKey(season, week) : null;
  const [state, setState] = useState({ key, status: enabled ? 'loading' : 'idle', week: null });
  const [attempt, setAttempt] = useState(0);
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
  }, [season, week, enabled, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const shown = enabled && key && state.key === key ? state : { status: enabled && key ? 'loading' : 'idle', week: null };
  return { ...shown, first: known(season, week) ? firstTrendWeek(season) : null, retry };
}

/** The commissioner's referee assignments for the week, or null (a 404, signed out, or unavailable: the rows hide). */
export function useOfficials(season, week, enabled = true) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    if (!enabled || !known(season, week)) return undefined;
    let live = true;
    const read = () => loadOfficials(season, week).then(data => { if (live) setValue(data); });
    const key = weekKey(season, week);
    const stop = onOfficialsChange(changed => { if (changed === key) read(); });
    read();
    return () => { live = false; stop(); };
  }, [season, week, enabled]);
  return value;
}

/**
 * `{ loading, wind, now }`: the week's kickoff forecasts and the server time for their ages. It re-renders every minute
 * and re-reads at the D-47 due points, at kickoff and when the tab shows again (watchWind).
 */
export function useWind(season, week, enabled = true) {
  const [state, setState] = useState({ loading: enabled, result: null });
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled || !known(season, week)) { setState({ loading: false, result: null }); return undefined; }
    let live = true;
    if (attempt === 0) setState({ loading: true, result: null });
    loadWind(season, week, { fresh: attempt > 0 }).then(result => { if (live) setState(current => ({ loading: false, result: result ?? (attempt > 0 ? current.result : null) })); });
    return () => { live = false; };
  }, [season, week, enabled, attempt]);
  useEffect(() => {
    if (!enabled || !state.result) return undefined;
    return watchWind({ result: state.result, onTick: setTick, onRefetch: () => setAttempt(n => n + 1) });
  }, [enabled, state.result]);
  return { loading: state.loading, wind: state.result?.data ?? null, now: windNowFor(state.result) };
}
