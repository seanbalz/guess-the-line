// The new app's navigation state (redesign build plan stage 10; prototype CONTRACT sections 5, 6 and 9): which tab
// shows, each tab's own view, and the layers over it. A pure reducer with no DOM, storage, clock or network, so the
// node tests (tests/next-shell-state.test.mjs) run it as is. Shell.jsx keeps it in useReducer and router.js keeps the
// address and the browser's Back button in step with it.
//
// - Four roots keep local filter preferences. Main tab selection returns to its root; detail navigation records
//   its actual opening screen in an in-memory trail. Legacy adapter views remain available under their old keys.
// - Layers are named by id, and the id's prefix says which kind: `sh.` sheet, `dlg.` dialog, `pop.` popover, `ov.`
//   overlay, `page.` page. Their args are plain values and may not use the keys `id` (the layer id) or `key`.
// - Every sheet, dialog, popover and overlay that opens gets its own `key`, which the hosts draw it by. A close that
//   names a key closes that one, wherever it is (a layer that fails closes itself, even under another sheet), and does
//   nothing once it is gone. A sheet keeps its key through a sub-view, and through a replace with the same id.
// - Sheets are one stack (only the top one shows; a sub-view changes the top sheet's args in place). One dialog,
//   one popover and one page at a time. Overlays are a queue: the first shows, but never over a dialog. Toasts are a
//   queue too: the first shows, never over an overlay.
// - closeTop is Escape and Back: overlay, then popover, dialog, the top sheet, the page.

export const TABS = Object.freeze(['home', 'play', 'bets', 'research']);
export const LEGACY_TABS = Object.freeze(['league', 'lines', 'fantasy', 'trends']);
const ALIASES = { league: ['play', 'league'], lines: ['research', 'games'], fantasy: ['research', 'fantasy'], trends: ['research', 'trends'] };
export function destination(tab, view) {
  if (Object.hasOwn(ALIASES, tab)) return { tab: ALIASES[tab][0], view: { section: ALIASES[tab][1] }, adapter: tab, adapterView: view };
  const adapter = tab === 'play' && view?.section === 'league' ? 'league' : tab === 'research' && view?.section === 'games' ? 'lines' : tab === 'research' && view?.section === 'fantasy' ? 'fantasy' : tab === 'research' && view?.section === 'trends' ? 'trends' : null;
  if (!adapter) return { tab, view };
  const { section, ...adapterView } = view;
  return { tab, view, adapter, adapterView };
}
export const isDetail = state => !!state.views[state.tab]?.section || (state.tab === 'bets' && !!state.views.bets.view);
export const navigationPatch = (state, tab, patch) => !!patch && (
  (Object.hasOwn(patch, 'section') && patch.section !== state.views[tab]?.section)
  || (['bets', 'league'].includes(tab) && Object.hasOwn(patch, 'view') && patch.view !== state.views[tab]?.view)
  || (tab === 'play' && state.views.play.section === 'picks' && ['market', 'season', 'week'].some(key => Object.hasOwn(patch, key) && patch[key] !== state.views.play[key]))
  // D-66: opening or closing a Trends nesting card is a step, so back closes one layer. The account reset in
  // TrendsScreen also clears the history window; it is not a step, so back never restores another account's choice.
  || (tab === 'fantasy' && ['fantasyLayer', 'fantasyPlayer'].some(key => Object.hasOwn(patch, key) && (patch[key] ?? null) !== (state.views.fantasy?.[key] ?? null)))
  || (tab === 'trends' && !Object.hasOwn(patch, 'window') && ['teamsTeam', 'teamsTrend', 'player', 'playerLayer', 'playerItem', 'weekGame', 'weekTrend'].some(key => Object.hasOwn(patch, key) && (patch[key] ?? null) !== (state.views.trends?.[key] ?? null)))
);
export const canGoBack = state => hasLayers(state) || state.trail.length > 0 || isDetail(state);
export const DEFAULT_TAB = 'home';
const KINDS = Object.freeze({ sh: 'sheet', dlg: 'dialog', pop: 'popover', ov: 'overlay', page: 'page' });
export const LAYER_KINDS = Object.freeze(Object.values(KINDS));

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isTab = tab => TABS.includes(tab);

/** The kind of layer an id names ('sheet', 'dialog', 'popover', 'overlay', 'page'), or null. */
export function layerKind(id) {
  if (typeof id !== 'string') return null;
  const dot = id.indexOf('.');
  return dot > 0 && dot < id.length - 1 ? KINDS[id.slice(0, dot)] ?? null : null;
}

/** True for args or a patch that use a name the shell keeps for itself: `id` (the layer id) or `key` (its opening). */
const usesReserved = args => Object.hasOwn(args, 'id') || Object.hasOwn(args, 'key');

/**
 * A layer record `{ ...args, id }`. Throws a TypeError for an id that names no layer kind, args that are not a plain
 * object, or args that use `id` (the layer id) or `key` (the shell keys each opening): these are programming errors,
 * caught where the call is made.
 */
export function layer(id, args = {}) {
  if (!layerKind(id)) throw new TypeError(`Not a layer id: ${String(id)}`);
  if (args === null || args === undefined) args = {};
  if (!isRecord(args)) throw new TypeError(`Layer args for ${id} must be a plain object.`);
  if (Object.hasOwn(args, 'id')) throw new TypeError(`Layer args for ${id} may not use "id"; it is the layer id.`);
  if (Object.hasOwn(args, 'key')) throw new TypeError(`Layer args for ${id} may not use "key"; the shell keys each opening.`);
  return { ...args, id };
}

function emptyViews() {
  return Object.fromEntries([...TABS, ...LEGACY_TABS].map(tab => [tab, {}]));
}

/** The state a visit starts in: `place` is what the address asked for (router.js), `{ tab, view, layer }`. */
export function initialState(place = null) {
  const state = { tab: DEFAULT_TAB, views: emptyViews(), page: null, sheets: [], dialog: null, popover: null, overlays: [], toasts: [], seq: 0, trail: [], nav: 0, navMode: 'start' };
  if (!isRecord(place) || (!isTab(place.tab) && !LEGACY_TABS.includes(place.tab))) return state;
  let next = reduce(state, { type: 'go', tab: place.tab, view: place.view });
  if (isRecord(place.adapters)) next.views = { ...next.views, ...place.adapters };
  next = { ...next, trail: Array.isArray(place.trail) ? place.trail : [], navMode: 'start' };
  if (isRecord(place.layer) && layerKind(place.layer.id)) next = reduce(next, { type: 'open', layer: place.layer });
  return next;
}

const closed = { sheets: [], dialog: null, popover: null, page: null };
const withView = (views, tab, patch) => (isRecord(patch) ? { ...views, [tab]: { ...views[tab], ...patch } } : views);

// Origin context is reversible; newer local list/filter preferences survive returning through a root.
const ROUTE_KEYS = ['section', 'view', 'market', 'season', 'week', 'weekId', 'leagueId', 'accountId', 'period', 'team', 'matchup', 'scoreGame', 'comparisonKind', 'pickGame', 'teamsTeam', 'teamsTrend', 'player', 'playerLayer', 'playerItem', 'weekGame', 'weekTrend', 'fantasyLayer', 'fantasyPlayer'];
function originView(current, prior, detail) {
  const view = { ...prior, ...current };
  for (const key of detail ? ROUTE_KEYS : ['section', 'view']) view[key] = prior?.[key];
  return view;
}
/** Whether applying `patch` to `tab`'s view reproduces the trail's last place (same tab, section and route keys). */
function returnsToPrior(state, tab, patch) {
  const prior = state.trail.at(-1);
  if (!prior || prior.tab !== state.tab || hasLayers(state)) return false;
  const { adapter } = destination(tab, patch);
  const before = adapter ? prior.adapters?.[adapter] : prior.view;
  if (!before || (adapter && (prior.view?.section ?? null) !== (state.views[state.tab]?.section ?? null))) return false;
  const after = { ...state.views[adapter ?? tab], ...patch };
  return ROUTE_KEYS.every(key => (after[key] ?? null) === (before[key] ?? null));
}
const mergeAdapters =(views, adapters) => Object.fromEntries(Object.entries(adapters ?? {}).map(([tab, view]) => [tab, { ...views[tab], ...view }]));

/** Every layer that is open, overlays queued behind the first one included. */
export function layerCount(state) {
  return state.overlays.length + (state.popover ? 1 : 0) + (state.dialog ? 1 : 0) + state.sheets.length + (state.page ? 1 : 0);
}
/** True when something sits over the tab: what Back closes before it changes tabs. */
export const hasLayers = state => layerCount(state) > 0;
export const topSheet = state => state.sheets.at(-1) ?? null;
/** The overlay showing: the first in the queue, held while a dialog is open. */
export const visibleOverlay = state => (state.dialog ? null : state.overlays[0] ?? null);
/** The toast showing: the first in the queue, held while an overlay shows. */
export const visibleToast = state => (visibleOverlay(state) ? null : state.toasts[0] ?? null);
/**
 * A layer that makes the frame behind it inert: a sheet or an overlay. A dialog's own showModal() makes the rest of the
 * page inert while it is open (and only then, so the browser can return focus when it closes it); a popover and a page
 * leave the frame as it is.
 */
export const modalOpen = state => state.sheets.length > 0 || !!visibleOverlay(state);

/** The reducer. Unknown or malformed actions leave the state as it is. */
export function reduce(state, action) {
  if (!isRecord(action)) return state;
  switch (action.type) {
    case 'tab':
    case 'go': {
      const target = destination(action.tab, action.view);
      if (!isTab(target.tab)) return state;
      const current = state.views[target.tab];
      const next = target.tab === 'play' && Object.hasOwn(current, 'pickGame') ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'pickGame')) : current;
      const root = { ...next, section: undefined, ...(target.tab === 'bets' ? { view: undefined } : {}) };
      const view = action.type === 'tab' || !target.view ? root : { ...next, ...target.view };
      const views = { ...state.views, [target.tab]: view, ...(target.adapter ? { [target.adapter]: { ...state.views[target.adapter], ...target.adapterView } } : {}) };
      const changed = state.tab !== target.tab || JSON.stringify(current) !== JSON.stringify(view) || !!target.adapter;
      if (!changed && !hasLayers(state)) return state;
      const trail = action.type === 'tab' || !target.view ? [] : [...state.trail, { tab: state.tab, view: state.views[state.tab], adapters: Object.fromEntries(LEGACY_TABS.map(tab => [tab, state.views[tab]])) }];
      return { ...state, ...closed, tab: target.tab, views, trail, nav: state.nav + 1, navMode: 'go' };
    }
    case 'view': {
      if ((!isTab(action.tab) && !LEGACY_TABS.includes(action.tab)) || !isRecord(action.patch)) return state;
      if (navigationPatch(state, action.tab, action.patch)) {
        // D-66: a step that lands exactly on the previous place (a nesting card's lip to its parent) goes back, so the
        // next Back leaves the section instead of reopening the layer just closed.
        if (returnsToPrior(state, action.tab, action.patch)) return reduce(state, { type: 'back' });
        return reduce(state, { type: 'go', tab: action.tab, view: action.patch });
      }
      return { ...state, views: withView(state.views, action.tab, action.patch) };
    }
    case 'back': {
      if (hasLayers(state)) return reduce(state, { type: 'closeTop' });
      const prior = state.trail.at(-1);
      if (!prior) return isDetail(state) ? { ...reduce(state, { type: 'tab', tab: state.tab }), navMode: 'back' } : state;
      const adapter = destination(prior.tab, prior.view).adapter;
      const adapters = adapter && prior.adapters?.[adapter] ? { [adapter]: originView(state.views[adapter], prior.adapters[adapter], true) } : {};
      const detail = !!prior.view?.section || (prior.tab === 'bets' && !!prior.view?.view);
      return { ...state, ...closed, tab: prior.tab, views: { ...state.views, ...adapters, [prior.tab]: originView(state.views[prior.tab], prior.view, detail) }, trail: state.trail.slice(0, -1), nav: state.nav + 1, navMode: 'back' };
    }
    case 'restore': {
      const place = action.place;
      if (!isTab(place?.tab)) return state;
      return { ...state, ...closed, tab: place.tab, views: { ...state.views, ...mergeAdapters(state.views, place.adapters), [place.tab]: { ...state.views[place.tab], section: undefined, pickGame: undefined, ...(place.tab === 'bets' ? { view: undefined } : {}), ...place.view } }, trail: place.trail ?? [], nav: state.nav + 1, navMode: 'restore' };
    }
    case 'open': {
      const kind = layerKind(action.layer?.id);
      if (!kind) return state;
      const record = { ...action.layer };
      if (kind === 'page') return { ...state, ...closed, page: record };
      // Every other opening carries its own key: the hosts draw each one by it, and a close can name it.
      const seq = state.seq + 1;
      const shown = { ...record, key: seq };
      if (kind === 'sheet') return { ...state, seq, sheets: [...state.sheets, shown], dialog: null, popover: null };
      if (kind === 'popover') return { ...state, seq, popover: shown };
      if (kind === 'dialog') return { ...state, seq, dialog: shown, popover: null };
      return { ...state, seq, overlays: action.front ? [shown, ...state.overlays] : [...state.overlays, shown] };
    }
    case 'replaceSheet': {
      if (layerKind(action.layer?.id) !== 'sheet') return state;
      // The same id keeps its key (the host keeps drawing it, as a sub-view does); another sheet gets a new one.
      const top = topSheet(state);
      const seq = top?.id === action.layer.id ? state.seq : state.seq + 1;
      const key = top?.id === action.layer.id ? top.key : seq;
      return { ...state, seq, sheets: [...state.sheets.slice(0, -1), { ...action.layer, key }], dialog: null, popover: null };
    }
    case 'sheetArgs': {
      const top = topSheet(state);
      if (!top || !isRecord(action.patch) || usesReserved(action.patch)) return state;
      return { ...state, sheets: [...state.sheets.slice(0, -1), { ...top, ...action.patch, id: top.id }] };
    }
    case 'pageArgs': {
      if (!state.page || !isRecord(action.patch) || usesReserved(action.patch)) return state;
      return { ...state, page: { ...state.page, ...action.patch, id: state.page.id } };
    }
    case 'close': {
      // With a key, only that opening closes, wherever it is; a stale call for one already gone does nothing.
      const named = action.key !== undefined;
      switch (action.kind) {
        case 'sheet': {
          const at = named ? state.sheets.findIndex(sheet => sheet.key === action.key) : state.sheets.length - 1;
          if (at < 0) return state;
          // The popover belongs to the sheet showing: it closes with that one only.
          const top = at === state.sheets.length - 1;
          return { ...state, sheets: state.sheets.filter((_, index) => index !== at), popover: top ? null : state.popover };
        }
        case 'sheets': return state.sheets.length || state.dialog || state.popover ? { ...state, sheets: [], dialog: null, popover: null } : state;
        case 'dialog': return state.dialog && (!named || state.dialog.key === action.key) ? { ...state, dialog: null } : state;
        case 'popover': return state.popover && (!named || state.popover.key === action.key) ? { ...state, popover: null } : state;
        case 'page': return state.page ? { ...state, ...closed } : state;
        case 'overlay': {
          // Without a key, the one showing.
          const overlays = named ? state.overlays.filter(overlay => overlay.key !== action.key) : state.overlays.slice(1);
          return overlays.length === state.overlays.length ? state : { ...state, overlays };
        }
        default: return state;
      }
    }
    case 'closeTop': {
      if (visibleOverlay(state)) return reduce(state, { type: 'close', kind: 'overlay' });
      if (state.popover) return reduce(state, { type: 'close', kind: 'popover' });
      if (state.dialog) return reduce(state, { type: 'close', kind: 'dialog' });
      if (state.sheets.length) return reduce(state, { type: 'close', kind: 'sheet' });
      if (state.page) return reduce(state, { type: 'close', kind: 'page' });
      // Overlays held behind a dialog that is now gone (nothing else is open).
      if (state.overlays.length) return reduce(state, { type: 'close', kind: 'overlay' });
      return state;
    }
    case 'toast': {
      const toast = action.toast;
      if (!isRecord(toast) || typeof toast.text !== 'string' || !toast.text.trim()) return state;
      const seq = state.seq + 1;
      return { ...state, seq, toasts: [...state.toasts, { ...toast, key: seq }] };
    }
    case 'dismissToast': {
      // By key, so a late timer from a toast already gone never takes the next one with it.
      const toasts = state.toasts.filter(toast => toast.key !== action.key);
      return toasts.length === state.toasts.length ? state : { ...state, toasts };
    }
    default:
      return state;
  }
}
