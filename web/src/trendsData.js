// Loading for the situational trends panel. Week files are lazy, same-origin chunks listed in
// trendWeeks.generated.js (written by scripts/trends.mjs); a week with no file reads as "missing",
// never as another week's cards. Hosted referee assignments come from gtl-api when it is deployed;
// a 404 (route not deployed yet), a signed-out or local workspace, or any error falls back to the
// week file's static map. The toggle that shows trends is a per-device preference only.
import { useCallback, useEffect, useState } from 'react';
import { TREND_WEEKS } from './trendWeeks.generated.js';
import { cloudEnabled } from './auth';
import { officialsApi } from './api';
import { TRENDS_TOGGLE_KEY, weekKey } from '../../shared/trends-view.mjs';

const weeks = new Map(), officials = new Map(), listeners = new Set();

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
