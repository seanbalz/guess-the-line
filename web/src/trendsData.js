// Loading for the situational trends panel. Week files are lazy, same-origin chunks listed in
// trendWeeks.generated.js (written by scripts/trends.mjs); a week with no file reads as "missing",
// never as another week's cards. Hosted referee assignments come from gtl-api when it is deployed;
// a 404 (route not deployed yet), a signed-out or local workspace, or any error falls back to the
// week file's static map. Kickoff wind forecasts (D-34) come from gtl-api the same way; without them
// (signed out, local mode, not a member, or not deployed) the panel keeps its "no current forecast"
// note. The toggle that shows trends is a per-device preference only.
import { useCallback, useEffect, useState } from 'react';
import { TREND_WEEKS } from './trendWeeks.generated.js';
import { cloudEnabled } from './auth';
import { officialsApi, windApi } from './api';
import { TRENDS_TOGGLE_KEY, weekKey } from '../../shared/trends-view.mjs';
import { WIND_TICK_MS, watchWind, windNowFor } from './windTimer.js';

const weeks = new Map(), officials = new Map(), listeners = new Set(), winds = new Map();
const WIND_CACHE_MS = 5 * 60_000;
let windOff = false;

/** The week file, or null when no file is published for that week. Rejects only when the chunk fails to load. */
export function loadTrendWeek(season, week) {
  const key = weekKey(season, week), loader = TREND_WEEKS[key];
  if (!loader) return Promise.resolve(null);
  if (!weeks.has(key)) weeks.set(key, loader().then(module => module.default ?? module).catch(error => { weeks.delete(key); throw error; }));
  return weeks.get(key);
}
export const hasTrendWeek = (season, week) => Object.hasOwn(TREND_WEEKS, weekKey(season, week));
/** The first week of a season with a published trends file, or null. */
export const firstTrendWeek = season => Object.keys(TREND_WEEKS).filter(key => key.startsWith(`${season}-`)).map(key => Number(key.slice(5))).sort((a, b) => a - b)[0] ?? null;

/** Hosted assignments { season, week, assignments } or null (not deployed, not signed in, or unavailable). */
export function loadOfficials(season, week) {
  if (!cloudEnabled) return Promise.resolve(null);
  const key = weekKey(season, week);
  // A 404 (routes not deployed yet) is remembered for this visit; any other failure is retried on the next open.
  if (!officials.has(key)) officials.set(key, officialsApi('read', { season, week }).catch(error => { if (error?.status !== 404) officials.delete(key); return null; }));
  return officials.get(key);
}
/** After the commissioner saves, every open panel shows the new assignment without a reload. */
export function rememberOfficial(season, week, gameId, row) {
  const key = weekKey(season, week);
  const update = current => ({ season, week, assignments: { ...(current?.assignments || {}), [gameId]: row } });
  officials.set(key, (officials.get(key) || Promise.resolve(null)).then(update, () => update(null)));
  for (const listener of listeners) listener(key);
}

export function useTrendWeek(season, week, enabled = true) {
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', week: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !Number.isInteger(season) || !Number.isInteger(week)) return undefined;
    let live = true;
    setState({ status: 'loading', week: null });
    loadTrendWeek(season, week).then(data => { if (live) setState({ status: data ? 'ready' : 'missing', week: data }); }, () => { if (live) setState({ status: 'error', week: null }); });
    return () => { live = false; };
  }, [season, week, enabled, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, retry };
}

export function useOfficials(season, week, enabled = true) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    if (!enabled || !Number.isInteger(season) || !Number.isInteger(week)) return undefined;
    let live = true;
    const read = () => loadOfficials(season, week).then(data => { if (live) setValue(data); });
    const key = weekKey(season, week), listener = changed => { if (changed === key) read(); };
    listeners.add(listener); read();
    return () => { live = false; listeners.delete(listener); };
  }, [season, week, enabled]);
  return value;
}

/**
 * Kickoff wind forecasts for a week: { data, receivedAt } or null. A read is reused for 5 minutes, and a
 * fresh read (an open panel's timer, a visible tab) reuses one that started in the last minute, so several
 * open panels make one request. A 404 (route not deployed yet) is remembered for this visit; a 401 or 403
 * (signed out, or not a community member) is kept like a result, so it is asked again after 5 minutes or
 * after signing in as someone else; any other failure is retried on the next open. receivedAt lets the
 * panel age the snapshot from the server's asOf, so a reopened panel never shows a younger age than the
 * real one.
 */
export function loadWind(season, week, { fresh = false } = {}) {
  if (!cloudEnabled || windOff) return Promise.resolve(null);
  const key = weekKey(season, week), hit = winds.get(key), age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < (fresh ? WIND_TICK_MS : WIND_CACHE_MS)) return hit.promise;
  const entry = { at: Date.now(), promise: null };
  entry.promise = windApi('read', { season, week }).then(data => ({ data, receivedAt: Date.now() }), error => {
    if (error?.status === 404) windOff = true;
    else if (![401, 403].includes(error?.status) && winds.get(key) === entry) winds.delete(key);
    return null;
  });
  winds.set(key, entry);
  return entry.promise;
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
