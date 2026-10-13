import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export const DASHBOARD_PREFERENCES_KEY = 'gtl.dashboard.preferences.v1';

// Decision 5 (October 12): three layouts. A stored 'markets' or 'social' preference is left in storage
// untouched and reads as Command center through normalizeDashboardPreferences until the player picks again.
export const DASHBOARD_LAYOUTS = Object.freeze([
  { id: 'command', label: 'Command center', description: 'Scores first, then matchup gaps and line history.' },
  { id: 'matchups', label: 'Matchup cards', description: 'Give each matchup more room to compare.' },
  { id: 'analytics', label: 'Analytics lab', description: 'Lead with line history and research comparisons.' },
]);

export const DEFAULT_DASHBOARD_PREFERENCES = Object.freeze({
  version: 1,
  layout: 'command',
  modules: Object.freeze({ scores: true, gaps: true, history: true, connections: true, trends: true }),
  motion: 'system',
  notices: Object.freeze({ marketUpdates: true, dataIssues: true }),
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const booleanMap = (input, defaults) => Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof input?.[key] === 'boolean' ? input[key] : fallback]));

// Only presentation settings belong here. Never persist ballots or market data.
export function normalizeDashboardPreferences(value) {
  const input = isRecord(value) ? value : {};
  const modules = booleanMap(input.modules, DEFAULT_DASHBOARD_PREFERENCES.modules);
  if (!Object.values(modules).some(Boolean)) modules.scores = true;
  return {
    version: 1,
    layout: DASHBOARD_LAYOUTS.some(option => option.id === input.layout) ? input.layout : DEFAULT_DASHBOARD_PREFERENCES.layout,
    modules,
    motion: ['system', 'subtle', 'reduced'].includes(input.motion) ? input.motion : DEFAULT_DASHBOARD_PREFERENCES.motion,
    notices: booleanMap(input.notices, DEFAULT_DASHBOARD_PREFERENCES.notices),
  };
}

function browserStorage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function readDashboardPreferences(storage = browserStorage()) {
  if (!storage) return { preferences: normalizeDashboardPreferences(), storageAvailable: false };
  try {
    const stored = storage.getItem(DASHBOARD_PREFERENCES_KEY);
    let value;
    try { value = stored ? JSON.parse(stored) : undefined; } catch { value = undefined; }
    return { preferences: normalizeDashboardPreferences(value), storageAvailable: true };
  } catch {
    return { preferences: normalizeDashboardPreferences(), storageAvailable: false };
  }
}

export function writeDashboardPreferences(value, storage = browserStorage()) {
  const preferences = normalizeDashboardPreferences(value);
  try {
    if (!storage) throw new Error('Storage unavailable');
    storage.setItem(DASHBOARD_PREFERENCES_KEY, JSON.stringify(preferences));
    return { preferences, storageAvailable: true };
  } catch {
    return { preferences, storageAvailable: false };
  }
}

let snapshot;
const listeners = new Set();
const serverSnapshot = { preferences: normalizeDashboardPreferences(), storageAvailable: false };
function getSnapshot() { return snapshot ??= readDashboardPreferences(); }
function emit() { for (const listener of listeners) listener(); }
function receiveStorage(event) {
  if (event.key !== null && event.key !== DASHBOARD_PREFERENCES_KEY) return;
  snapshot = readDashboardPreferences();
  emit();
}
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', receiveStorage);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', receiveStorage);
  };
}

export function setDashboardPreferences(update) {
  const current = getSnapshot().preferences;
  const next = typeof update === 'function' ? update(current) : update;
  if (!isRecord(next)) return;
  snapshot = writeDashboardPreferences({ ...current, ...next,
    modules: { ...current.modules, ...(isRecord(next.modules) ? next.modules : {}) },
    notices: { ...current.notices, ...(isRecord(next.notices) ? next.notices : {}) },
  });
  emit();
}

export function resolveDashboardMotion(preference, systemReduced) {
  return preference === 'reduced' || systemReduced ? 'reduced' : 'subtle';
}

function readSystemMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useDashboardPreferences() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
  const [systemReduced, setSystemReduced] = useState(readSystemMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setSystemReduced(query.matches);
    changed();
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  const setPreferences = useCallback(update => setDashboardPreferences(update), []);
  return [state.preferences, setPreferences, {
    storageAvailable: state.storageAvailable,
    resolvedMotion: resolveDashboardMotion(state.preferences.motion, systemReduced),
  }];
}

export const DASHBOARD_MATCHUP_FILTER_KEY = 'gtl.dashboard.matchups.v1';
const DEFAULT_MATCHUP_FILTER = Object.freeze({ version: 1, mode: 'all', selectedIds: Object.freeze([]) });
const matchupSnapshots = new Map();
const matchupListeners = new Set();
const unavailableMatchupSnapshot = { filter: DEFAULT_MATCHUP_FILTER, storageAvailable: false };

export function dashboardMatchupScope(season, week) {
  const year = Number(season), round = Number(week);
  return Number.isInteger(year) && year >= 2000 && year <= 2200 && Number.isInteger(round) && round >= 1 && round <= 22
    ? `${DASHBOARD_MATCHUP_FILTER_KEY}.${year}.${round}` : null;
}

export function normalizeDashboardMatchupFilter(value, games) {
  const input = isRecord(value) ? value : {};
  const validIds = Array.isArray(games) ? new Set(games.map(game => game?.id).filter(id => typeof id === 'string')) : null;
  const selectedIds = Array.isArray(input.selectedIds) ? [...new Set(input.selectedIds.filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(id) && (!validIds || validIds.has(id))))].slice(0, 32) : [];
  return { version: 1, mode: input.mode === 'selected' ? 'selected' : 'all', selectedIds };
}

export function readDashboardMatchupFilter(scopeKey, storage = browserStorage()) {
  if (!scopeKey || !storage) return unavailableMatchupSnapshot;
  try {
    const stored = storage.getItem(scopeKey);
    let value;
    try { value = stored ? JSON.parse(stored) : undefined; } catch { value = undefined; }
    return { filter: normalizeDashboardMatchupFilter(value), storageAvailable: true };
  } catch { return unavailableMatchupSnapshot; }
}

export function writeDashboardMatchupFilter(scopeKey, value, storage = browserStorage()) {
  const filter = normalizeDashboardMatchupFilter(value);
  try {
    if (!scopeKey || !storage) throw new Error('Storage unavailable');
    storage.setItem(scopeKey, JSON.stringify(filter));
    return { filter, storageAvailable: true };
  } catch { return { filter, storageAvailable: false }; }
}

function matchupSnapshot(scopeKey) {
  if (!scopeKey) return unavailableMatchupSnapshot;
  if (!matchupSnapshots.has(scopeKey)) matchupSnapshots.set(scopeKey, readDashboardMatchupFilter(scopeKey));
  return matchupSnapshots.get(scopeKey);
}

function emitMatchups() { for (const listener of matchupListeners) listener(); }
function receiveMatchupStorage(event) {
  if (event.key !== null && !event.key.startsWith(`${DASHBOARD_MATCHUP_FILTER_KEY}.`)) return;
  if (event.key === null) matchupSnapshots.clear();
  else matchupSnapshots.delete(event.key);
  emitMatchups();
}
function subscribeMatchups(listener) {
  matchupListeners.add(listener);
  if (matchupListeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', receiveMatchupStorage);
  return () => {
    matchupListeners.delete(listener);
    if (!matchupListeners.size && typeof window !== 'undefined') window.removeEventListener('storage', receiveMatchupStorage);
  };
}

// Matchup identity only: never store guesses, odds, users, teams' results or bets.
// The caller filters visual details only; score totals keep the full slate.
export function useDashboardMatchupFilter({ season, week, games = [] }) {
  const scopeKey = dashboardMatchupScope(season, week);
  const getScopeSnapshot = useCallback(() => matchupSnapshot(scopeKey), [scopeKey]);
  const state = useSyncExternalStore(subscribeMatchups, getScopeSnapshot, () => unavailableMatchupSnapshot);
  const filter = normalizeDashboardMatchupFilter(state.filter, games);
  const setFilter = useCallback(update => {
    if (!scopeKey) return;
    const current = normalizeDashboardMatchupFilter(matchupSnapshot(scopeKey).filter, games);
    const next = typeof update === 'function' ? update(current) : update;
    if (!isRecord(next)) return;
    matchupSnapshots.set(scopeKey, writeDashboardMatchupFilter(scopeKey, normalizeDashboardMatchupFilter({ ...current, ...next }, games)));
    emitMatchups();
  }, [scopeKey, games]);
  const selectedGameIds = filter.mode === 'all' ? games.map(game => game.id) : filter.selectedIds;
  const selected = new Set(selectedGameIds);
  return [filter, setFilter, {
    scopeKey,
    storageAvailable: state.storageAvailable,
    selectedGameIds,
    visibleGames: games.filter(game => selected.has(game.id)),
  }];
}
