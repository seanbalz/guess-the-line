// The new app's address and the browser's Back button (redesign build plan stage 10). The tab showing is the
// address fragment, one history entry per tab change (#home, #play, #bets, #lines, #league), so a reload lands on the
// same tab and Back moves between tabs. While any layer is open (a sheet, dialog, popover, overlay or page), one
// extra "layer" entry sits on top of the tab's entry, so the phone's Back button closes the top layer instead of
// leaving the tab or the site.
//
// Fragments the old app and its links use still work on the way in, then read as the new app's own:
//   #picks, #picks-spread, #picks-total (any #picks… but #picks-due) open Play (on that market); #feed opens League on
//   its Feed; #groups opens the league switcher over Home.
// Fragments the shell leaves alone, never rewritten: any with "=" (sign-in, recovery and invite links), #main and
// #picks-due (the old app's skip-link targets), and anything else it does not know.
//
// placeFromFragment is pure; connectHistory takes the window it works on, so tests drive it with a fake one.
import { DEFAULT_TAB, TABS, hasLayers, isTab } from './state.js';

const LEFT_ALONE = new Set(['main', 'picks-due']);
const LAYER_ENTRY = Object.freeze({ gxLayer: true });

/** The fragment the shell writes for a tab ("#play"). */
export const fragmentFor = tab => (isTab(tab) ? `#${tab}` : '#home');

/**
 * What a fragment asks for: `{ tab, view?, layer? }` (state.js initialState), or null for one the shell leaves alone.
 * An empty fragment is Home.
 */
export function placeFromFragment(fragment) {
  const name = String(fragment ?? '').replace(/^#/, '');
  if (name === '') return { tab: 'home' };
  if (name.includes('=') || LEFT_ALONE.has(name)) return null;
  if (TABS.includes(name)) return { tab: name };
  if (name.startsWith('picks')) {
    const market = name.match(/^picks-(spread|total)$/)?.[1];
    return market ? { tab: 'play', view: { market } } : { tab: 'play' };
  }
  if (name === 'feed') return { tab: 'league', view: { view: 'feed' } };
  if (name === 'groups') return { tab: 'home', layer: { id: 'sh.switcher' } };
  return null;
}

/** True for a fragment from the old app (or its links) that the new app reads, then writes as its own. */
export const isLegacyFragment = fragment => {
  const name = String(fragment ?? '').replace(/^#/, '');
  return !!placeFromFragment(name) && name !== '' && !TABS.includes(name);
};

/** The tab an address shows: the one its fragment names, else Home. */
const tabAt = location => (placeFromFragment(location.hash) ?? { tab: DEFAULT_TAB }).tab;
const isLayerEntry = entryState => entryState !== null && typeof entryState === 'object' && entryState.gxLayer === true;
const urlWith = (location, fragment) => `${location.pathname}${location.search}${fragment}`;

/**
 * Reads the address once, when the shell starts: the place to start in. A legacy fragment is rewritten in place
 * (#picks-total becomes #play, #groups becomes #home) and a layer entry left by a reload is cleared, both without
 * adding a history entry.
 */
export function startPlace(win) {
  const { history, location } = win;
  const place = placeFromFragment(location.hash);
  try {
    if (place && isLegacyFragment(location.hash)) history.replaceState(null, '', urlWith(location, fragmentFor(place.tab)));
    else if (isLayerEntry(history.state)) history.replaceState(null, '', location.href);
  } catch { /* The address stays as it is; the shell still starts in the right place. */ }
  return place;
}

/**
 * Keeps the address and history in step with the shell's state. `getState()` returns the current state and
 * `dispatch(action)` changes it. Call `sync(prev, next)` after every state change (an effect). Returns
 * `{ sync, disconnect }`.
 *
 * - A tab change the member made pushes the tab's fragment. A tab change that came from Back or Forward does not.
 * - A layer opening pushes the layer entry; the last layer closing goes back over it.
 * - Back while a layer is open closes the top layer (state.js closeTop); Back with none open moves to the tab the
 *   entry names (Home for an entry the shell did not write). An old link followed in the page is read and rewritten
 *   like one a visit starts on.
 */
export function connectHistory(win, { getState, dispatch, confirmLeave = () => true }) {
  const { history, location } = win;
  let ours = 0; // popstate events still to come from our own history.back()
  let disconnected = false;

  function push(entryState, fragment) {
    try { history.pushState(entryState, '', fragment === undefined ? location.href : urlWith(location, fragment)); } catch { /* In memory only. */ }
  }
  /** Brings history in line with `state`, assuming no traversal of ours is still on its way. */
  function settle(state, tabChanged) {
    const onLayer = isLayerEntry(history.state);
    if (onLayer && (!hasLayers(state) || tabChanged)) {
      ours += 1;
      try { history.back(); } catch { ours -= 1; }
      return;
    }
    if (tabChanged && tabAt(location) !== state.tab) push(null, fragmentFor(state.tab));
    if (hasLayers(state) && !isLayerEntry(history.state)) push(LAYER_ENTRY);
  }
  let pendingTab = false;
  function sync(prev, next) {
    if (disconnected || !next) return;
    const tabChanged = !!prev && prev.tab !== next.tab;
    if (ours > 0) { pendingTab = pendingTab || tabChanged; return; }
    settle(next, tabChanged);
    if (ours > 0) pendingTab = tabChanged;
  }
  function onPopState() {
    if (disconnected) return;
    const state = getState();
    if (ours > 0) {
      ours -= 1;
      if (ours === 0) {
        const tabChanged = pendingTab && tabAt(location) !== state.tab;
        pendingTab = false;
        settle(state, tabChanged);
        if (ours > 0) pendingTab = tabChanged;
      }
      return;
    }
    // A layer entry with nothing open (Forward onto one, or Back onto one a followed link left behind) marks nothing
    // now: it becomes a plain entry for the tab it names.
    if (isLayerEntry(history.state)) {
      if (hasLayers(state)) return;
      try { history.replaceState(null, '', location.href); } catch { /* Harmless. */ }
    }
    // Back from the layer entry lands on the tab's own entry: close the top layer. A link followed in the page while a
    // layer is open names another place instead, and goes there.
    const followed = isLegacyFragment(location.hash) || tabAt(location) !== state.tab;
    if (hasLayers(state) && !followed) { dispatch({ type: 'closeTop' }); return; }
    // An entry the shell did not write (the one a visit started on with #main or a sign-in fragment) is Home.
    const place = placeFromFragment(location.hash) ?? { tab: tabAt(location) };
    // Browser navigation must protect the same unsaved forms as tapping a tab. Restore the current tab's address
    // when the member keeps editing; beforeunload covers navigation to another document.
    if ((place.tab !== state.tab || place.view) && !confirmLeave()) {
      push(null, fragmentFor(state.tab));
      if (hasLayers(state)) push(LAYER_ENTRY);
      return;
    }
    // An old link followed in the page (#feed, #picks-total, #groups) is read like one a visit starts on, and its entry
    // rewritten as the new app's own, so Back to it later never reopens a layer.
    if (isLegacyFragment(location.hash)) {
      try { history.replaceState(null, '', urlWith(location, fragmentFor(place.tab))); } catch { /* Read once anyway. */ }
    }
    if (place.tab !== state.tab || place.view) dispatch({ type: 'go', tab: place.tab, view: place.view });
    if (place.layer) dispatch({ type: 'open', layer: place.layer });
  }
  win.addEventListener('popstate', onPopState);
  return {
    sync,
    disconnect() { disconnected = true; win.removeEventListener('popstate', onPopState); },
  };
}
