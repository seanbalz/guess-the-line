// The new app's navigation state (redesign build plan stage 10; prototype CONTRACT sections 5, 6 and 9): which tab
// shows, each tab's own view, and the layers over it. A pure reducer with no DOM, storage, clock or network, so the
// node tests (tests/next-shell-state.test.mjs) run it as is. Shell.jsx keeps it in useReducer and router.js keeps the
// address and the browser's Back button in step with it.
//
// - A tab's view (its segment, market, scroll target) is its own: the shell keeps it for the visit and
//   never reads it. Tapping a tab closes every sheet, dialog, popover and page and shows that tab as it was; tapping
//   the tab already showing closes its page (the frame scrolls to the top when there is none).
// - Layers are named by id, and the id's prefix says which kind: `sh.` sheet, `dlg.` dialog, `pop.` popover, `ov.`
//   overlay, `page.` page. Their args are plain values and may not use the keys `id` (the layer id) or `key`.
// - Every sheet, dialog, popover and overlay that opens gets its own `key`, which the hosts draw it by. A close that
//   names a key closes that one, wherever it is (a layer that fails closes itself, even under another sheet), and does
//   nothing once it is gone. A sheet keeps its key through a sub-view, and through a replace with the same id.
// - Sheets are one stack (only the top one shows; a sub-view changes the top sheet's args in place). One dialog,
//   one popover and one page at a time. Overlays are a queue: the first shows, but never over a dialog. Toasts are a
//   queue too: the first shows, never over an overlay.
// - closeTop is Escape and Back: overlay, then popover, dialog, the top sheet, the page.

export const TABS = Object.freeze(['home', 'play', 'bets', 'lines', 'league', 'fantasy']);
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
  return Object.fromEntries(TABS.map(tab => [tab, {}]));
}

/** The state a visit starts in: `place` is what the address asked for (router.js), `{ tab, view, layer }`. */
export function initialState(place = null) {
  const state = { tab: DEFAULT_TAB, views: emptyViews(), page: null, sheets: [], dialog: null, popover: null, overlays: [], toasts: [], seq: 0 };
  if (!isRecord(place) || !isTab(place.tab)) return state;
  let next = reduce(state, { type: 'go', tab: place.tab, view: place.view });
  if (isRecord(place.layer) && layerKind(place.layer.id)) next = reduce(next, { type: 'open', layer: place.layer });
  return next;
}

const closed = { sheets: [], dialog: null, popover: null, page: null };
const withView = (views, tab, patch) => (isRecord(patch) ? { ...views, [tab]: { ...views[tab], ...patch } } : views);

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
    case 'tab': {
      if (!isTab(action.tab)) return state;
      // The tab already showing: pop its page (nothing else changes; the frame scrolls to the top otherwise).
      if (action.tab === state.tab) return state.page ? { ...state, ...closed } : state;
      return { ...state, ...closed, tab: action.tab };
    }
    case 'go': {
      if (!isTab(action.tab)) return state;
      return { ...state, ...closed, tab: action.tab, views: withView(state.views, action.tab, action.view) };
    }
    case 'view': {
      if (!isTab(action.tab) || !isRecord(action.patch)) return state;
      return { ...state, views: withView(state.views, action.tab, action.patch) };
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
