// Loading for the situational trends panel: React hooks over the loaders in trendsLoaders.js (the week files, the hosted
// referee assignments and the kickoff wind forecasts, D-34), which the new app's Lines tab shares. The toggle that shows
// trends is a per-device preference only.
import { useCallback, useEffect, useState } from 'react';
import { TRENDS_TOGGLE_KEY, weekKey } from '../../shared/trends-view.mjs';
import { watchWind, windNowFor } from './windTimer.js';
import { firstTrendWeek, hasTrendWeek, loadOfficials, loadTrendWeek, loadWind, onOfficialsChange, rememberOfficial } from './trendsLoaders.js';

export { firstTrendWeek, hasTrendWeek, loadOfficials, loadTrendWeek, loadWind, rememberOfficial };

export { useTrendWeek } from './trendsWeekHook.js';

export function useOfficials(season, week, enabled = true) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    if (!enabled || !Number.isInteger(season) || !Number.isInteger(week)) return undefined;
    let live = true;
    const read = () => loadOfficials(season, week).then(data => { if (live) setValue(data); });
    const key = weekKey(season, week), listener = changed => { if (changed === key) read(); };
    const stop = onOfficialsChange(listener); read();
    return () => { live = false; stop(); };
  }, [season, week, enabled]);
  return value;
}

/** { loading, wind, now }: the week's forecasts and the effective server time, re-rendered every minute while the panel is open. */
export function useWind(season, week, enabled = true) {
  const [state, setState] = useState({ loading: enabled, result: null });
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled || !Number.isInteger(season) || !Number.isInteger(week)) { setState({ loading: false, result: null }); return undefined; }
    let live = true;
    // A refresh keeps showing the current result; only the first read for this week shows "Loading".
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

function readToggle() { try { return localStorage.getItem(TRENDS_TOGGLE_KEY) === 'on'; } catch { return false; } }
/** "Show trends" is off by default so the pick screens keep their keyboard order; saved per device only. */
export function useTrendsToggle() {
  const [on, setOn] = useState(readToggle);
  const toggle = useCallback(() => setOn(value => {
    const next = !value;
    try { localStorage.setItem(TRENDS_TOGGLE_KEY, next ? 'on' : 'off'); } catch { /* Kept for this visit only. */ }
    return next;
  }), []);
  return [on, toggle];
}
