// Four roots and allowlisted detail addresses. History contains navigation metadata only.
import { DEFAULT_TAB, LEGACY_TABS, destination, hasLayers, isTab } from './state.js';
const LEFT_ALONE = new Set(['main', 'picks-due']);
const KEYS = new Set(['market','season','week','weekId','leagueId','accountId','period','team','matchup','scoreGame','comparisonKind']);
const SECTIONS = { play: ['picks','score','compare','league','points'], research: ['games','fantasy','trends'], bets: ['active','settled','tracked','recommended','virtual','everyone','add'] };
export function safeView(tab, view = {}) {
  const result = {};
  const routeKey = tab === 'bets' ? 'view' : 'section';
  if (SECTIONS[tab]?.includes(view[routeKey])) result[routeKey] = view[routeKey];
  const keys = tab === 'research' && result.section === 'trends' ? [...KEYS, 'trendSection', 'window', 'player', 'weekTeam', 'playerMatchup'] : KEYS;
  for (const key of keys) {
    const value = view[key];
    if ((typeof value === 'string' && value.length <= 100 && /^[\w .:@/+\-]*$/.test(value)) || (typeof value === 'number' && Number.isFinite(value)) || value === null) result[key] = value;
  }
  // League's existing feed/board/history control remains an adapter preference.
  if (tab === 'play' && result.section === 'league' && ['feed','board','history'].includes(view.view)) result.view = view.view;
  return result;
}
const adapterFor = (tab, view) => tab === 'play' && view?.section === 'league' ? 'league' : tab === 'research' && view?.section === 'fantasy' ? 'fantasy' : tab === 'research' && view?.section === 'games' ? 'lines' : tab === 'research' && view?.section === 'trends' ? 'trends' : null;
function routePlace(tab, view = {}, adapters = {}) {
  const adapter = adapterFor(tab, view);
  const clean = safeView(tab, { ...view, ...(adapter ? adapters[adapter] : {}), ...(view.section ? { section: view.section } : {}) });
  const { section, ...adapterView } = clean;
  return { tab, view: clean, ...(adapter ? { adapters: { [adapter]: adapterView } } : {}) };
}
export function fragmentFor(tab, view, adapters) {
  const target = destination(tab, view);
  if (!isTab(target.tab)) return '#home';
  const place = routePlace(target.tab, target.view, adapters ?? (target.adapter ? { [target.adapter]: target.adapterView } : {}));
  const key = target.tab === 'bets' ? 'view' : 'section';
  const section = place.view[key];
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(place.view)) if (name !== key && value !== undefined) params.set(name, value === null ? '' : String(value));
  return `#${target.tab}${section ? `/${section}` : ''}${params.size ? `?${params}` : ''}`;
}
export function placeFromFragment(fragment) {
  const name = String(fragment ?? '').replace(/^#/, '');
  if (!name) return { tab: 'home' };
  if (LEFT_ALONE.has(name)) return null;
  if (LEGACY_TABS.includes(name)) { const target = destination(name); return routePlace(target.tab, target.view); }
  if (name === 'feed') return routePlace('play', { section: 'league', view: 'feed' });
  if (name === 'groups') return { tab: 'home', layer: { id: 'sh.switcher' } };
  if (name.startsWith('picks') && !name.includes('=')) {
    const market = name.match(/^picks-(spread|total)$/)?.[1];
    return { tab: 'play', view: { section: 'picks', ...(market ? { market } : {}) } };
  }
  const match = name.match(/^(home|play|bets|research)(?:\/([a-z]+))?(?:\?(.*))?$/);
  if (!match) return null; // Includes all authentication, invite and recovery fragments.
  const [, tab, section, query] = match;
  if (section && !SECTIONS[tab]?.includes(section)) return null;
  const values = Object.fromEntries(new URLSearchParams(query));
  for (const key of ['season', 'week']) if (Object.hasOwn(values, key)) values[key] = values[key] === '' ? null : /^\d+$/.test(values[key]) ? Number(values[key]) : undefined;
  const view = safeView(tab, { ...values, ...(section ? { [tab === 'bets' ? 'view' : 'section']: section } : {}) });
  if (section) view[tab === 'bets' ? 'view' : 'section'] = section;
  const place = routePlace(tab, view);
  return Object.keys(view).length ? place : { tab };
}
export const isLegacyFragment = fragment => {
  const name = String(fragment ?? '').replace(/^#/, '');
  return LEGACY_TABS.includes(name) || name === 'feed' || name === 'groups' || (name.startsWith('picks') && !!placeFromFragment(fragment));
};
const urlWith = (location, fragment) => `${location.pathname}${location.search}${fragment}`;
const fromState = state => routePlace(state.tab, state.views[state.tab], state.views);
const routeFragment = state => fragmentFor(state.tab, state.views[state.tab], state.views);
function safePlace(place) {
  if (!isTab(place?.tab)) return null;
  return routePlace(place.tab, place.view, place.adapters);
}
function entryFor(state, layer = false) {
  const place = fromState(state);
  return { gxRoute: { ...place, trail: state.trail.map(safePlace).filter(Boolean) }, ...(layer ? { gxLayer: true } : {}) };
}
function readEntry(entry) {
  const place = safePlace(entry?.gxRoute);
  return place ? { ...place, trail: (Array.isArray(entry.gxRoute.trail) ? entry.gxRoute.trail : []).map(safePlace).filter(Boolean) } : null;
}
export function startPlace(win) {
  let place = placeFromFragment(win.location.hash);
  const saved = readEntry(win.history.state);
  if (place && saved && fragmentFor(saved.tab, saved.view, saved.adapters) === fragmentFor(place.tab, place.view, place.adapters)) place = { ...place, trail: saved.trail };
  try {
    if (place && isLegacyFragment(win.location.hash)) win.history.replaceState(null, '', urlWith(win.location, fragmentFor(place.tab, place.view, place.adapters)));
    else if (win.history.state?.gxLayer) win.history.replaceState(saved ? { gxRoute: saved, gxIndex: win.history.state.gxIndex } : null, '', win.location.href);
  } catch { /* Navigation still works in memory. */ }
  return place;
}
export function connectHistory(win, { getState, dispatch, confirmLeave = () => true, beforeNavigate = () => {} }) {
  const { history, location } = win;
  let index = Number.isInteger(history.state?.gxIndex) ? history.state.gxIndex : 0;
  let ours = 0;
  let pendingNavigation = false;
  let disconnected = false;
  function write(state, push = false, layer = false, preserveFragment = false) {
    if (push) index += 1;
    try { history[push ? 'pushState' : 'replaceState']({ ...entryFor(state, layer), gxIndex: index }, '', preserveFragment ? location.href : urlWith(location, routeFragment(state))); } catch { /* In memory only. */ }
  }
  function settle(state, navigation) {
    const onLayer = history.state?.gxLayer === true;
    if (onLayer && (!hasLayers(state) || navigation)) {
      ours += 1;
      try { history.back(); } catch { ours -= 1; }
      return;
    }
    if (navigation) write(state, true);
    else if (!onLayer) write(state, false, false, !placeFromFragment(location.hash));
    if (hasLayers(state) && !history.state?.gxLayer) write(state, true, true, true);
  }
  function sync(prev, next) {
    if (disconnected || !next || prev === next) return;
    const navigation = !!prev && prev.nav !== next.nav;
    if (ours) { pendingNavigation ||= navigation; return; }
    if (navigation && next.navMode === 'restore') {
      write(next, false, false, !placeFromFragment(location.hash));
      // React may batch a followed #groups route with opening its switcher. It still needs its own Back entry.
      if (hasLayers(next)) write(next, true, true, true);
      return;
    }
    if (navigation && next.navMode === 'back' && history.state?.gxRoute?.trail?.length > next.trail.length) {
      ours += 1;
      try { history.back(); } catch { ours -= 1; }
      return;
    }
    settle(next, navigation);
    if (ours) pendingNavigation ||= navigation;
  }
  function onPopState() {
    if (disconnected) return;
    const state = getState();
    if (ours) {
      index = Number.isInteger(history.state?.gxIndex) ? history.state.gxIndex : index;
      ours -= 1;
      if (!ours) {
        const navigation = pendingNavigation;
        pendingNavigation = false;
        settle(state, navigation);
      }
      return;
    }
    const targetIndex = Number.isInteger(history.state?.gxIndex) ? history.state.gxIndex : index + 1;
    const rejectTraversal = () => {
      const delta = index - targetIndex;
      if (delta && typeof history.go === 'function') { ours += 1; history.go(delta); }
      else write(state, true, hasLayers(state));
    };
    const address = placeFromFragment(location.hash);
    const followed = isLegacyFragment(location.hash) || (address && fragmentFor(address.tab, address.view, address.adapters) !== routeFragment(state));
    if (hasLayers(state) && !followed) {
      if (!confirmLeave()) { rejectTraversal(); return; }
      index = targetIndex;
      dispatch({ type: 'closeTop' }); return;
    }
    const saved = readEntry(history.state);
    const place = saved ?? address ?? { tab: DEFAULT_TAB };
    if (!confirmLeave()) { rejectTraversal(); return; }
    index = targetIndex;
    beforeNavigate();
    dispatch({ type: 'restore', place });
    if (place.layer) dispatch({ type: 'open', layer: place.layer });
  }
  win.addEventListener('popstate', onPopState);
  return { sync, disconnect() { disconnected = true; win.removeEventListener('popstate', onPopState); } };
}
