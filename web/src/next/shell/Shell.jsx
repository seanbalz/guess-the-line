// The new app's frame (redesign build plan stage 10; prototype shell): the top bar, the page (the tab's screen or a
// page over it, with the offline banner on top), the dock, the tab bar, and the layer hosts above them (sheet, popover,
// dialog, toast, overlay). It keeps the navigation state (state.js), the address and Back (router.js), the device's
// theme and reduced-motion choices under the old app's keys, and an error boundary per tab and page. It reads no data
// and calls no route itself: since stage 11 the data layer (web/src/next/data) reads and shares the data, and the app
// gate (AppGate.jsx) hands the frame what it shows.
//
// Props: `session` and `onSignOut` from AuthGate. `screens` and `layers` default to the registry (registry.jsx); tests
// pass their own. `league` is the league showing (`{ id, name }`; `leagueName` alone is enough for a test), `you`
// the member as the frame names them (their saved display name), and `data` what each tab's counter reads (the tab
// slot files). `cover` replaces the tab's screen and any page (the removed-account and access-pending screens), while
// the bars still work. `initialLayer` opens one layer when the frame starts (the switcher for a saved invite link),
// unless the address already opens one. `notice` (`{ key, text }`) shows as a toast once per key. `children` render
// inside the frame's root, after the layers (the "sign in again" prompt).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { switchApp } from '../../appView.js';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { Boundary, FailCard } from './Boundary.jsx';
import { ShellContext } from './context.js';
import { OfflineBanner, TabBar, TopBar } from './Frame.jsx';
import { DialogHost, OverlayHost, PageHost, PopoverHost, SheetHost } from './LayerHosts.jsx';
import { ToastHost } from './ToastHost.jsx';
import { LAYERS, SCREENS } from './registry.jsx';
import { connectHistory, startPlace } from './router.js';
import { hasLayers, initialState, layer, layerKind, modalOpen, reduce, visibleOverlay } from './state.js';
import { SHELL_COPY } from './tabs.js';
import './shell.css';

const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** True while the browser says it is online; `recheck()` reads it again. */
function useOnline() {
  const [online, setOnline] = useState(browserOnline);
  useEffect(() => {
    const update = () => setOnline(browserOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const recheck = useCallback(() => {
    const now = browserOnline();
    setOnline(now);
    return now;
  }, []);
  return [online, recheck];
}

/** The signed-in member as the frame shows them: the avatar's id and name, and the email the menu names. */
export function memberOf(session) {
  const user = session?.user ?? {};
  const meta = user.user_metadata ?? {};
  const email = typeof user.email === 'string' ? user.email : '';
  const name = [meta.display_name, meta.full_name, meta.name].find(value => typeof value === 'string' && value.trim()) ?? email;
  return { id: user.id ?? email, email, name };
}

/** Reads the dock's height, so toasts sit 8 above a dock bar when one shows. */
function useHeight(element) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!element || typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(() => setHeight(Math.round(element.getBoundingClientRect().height)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return height;
}

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Shell({ session, onSignOut, screens = SCREENS, layers = LAYERS, leagueName = SHELL_COPY.defaultLeague, league: shown, you, data = null, cover = null, initialLayer = null, notice = null, children }) {
  const [state, dispatch] = useReducer(reduce, null, () => {
    const start = initialState(startPlace(window));
    return initialLayer && layerKind(initialLayer) && !hasLayers(start) ? reduce(start, { type: 'open', layer: layer(initialLayer) }) : start;
  });
  const [online, recheckOnline] = useOnline();
  const [preferences] = useDashboardPreferences();
  const reduceMotion = preferences.motion === 'reduced';
  const [dockHost, setDockHost] = useState(null);
  const dockHeight = useHeight(dockHost);

  // The address and Back follow the state (router.js).
  const stateRef = useRef(state);
  stateRef.current = state;
  const history = useRef(null);
  const synced = useRef(null);
  useEffect(() => {
    const connection = connectHistory(window, { getState: () => stateRef.current, dispatch });
    history.current = connection;
    connection.sync(null, stateRef.current);
    synced.current = stateRef.current;
    return () => { connection.disconnect(); history.current = null; };
  }, []);
  useEffect(() => {
    const prev = synced.current;
    if (prev === state) return;
    synced.current = state;
    history.current?.sync(prev, state);
    if (prev && prev.tab !== state.tab) window.scrollTo(0, 0);
  }, [state]);

  const onSignOutRef = useRef(onSignOut);
  onSignOutRef.current = onSignOut;
  const actions = useMemo(() => {
    const opener = kind => (id, args) => {
      if (layerKind(id) !== kind) throw new TypeError(`${id} is not a ${kind} id.`);
      dispatch({ type: 'open', layer: layer(id, args) });
    };
    const toast = (text, options = {}) => dispatch({ type: 'toast', toast: { ...options, text } });
    return {
      tab: tab => dispatch({ type: 'tab', tab }),
      go: (tab, view) => dispatch({ type: 'go', tab, view }),
      setView: (tab, patch) => dispatch({ type: 'view', tab, patch }),
      open: (id, args, options = {}) => dispatch({ type: 'open', layer: layer(id, args), front: options.front }),
      openSheet: opener('sheet'),
      replaceSheet: (id, args) => {
        if (layerKind(id) !== 'sheet') throw new TypeError(`${id} is not a sheet id.`);
        dispatch({ type: 'replaceSheet', layer: layer(id, args) });
      },
      setSheetArgs: patch => dispatch({ type: 'sheetArgs', patch }),
      closeSheet: () => dispatch({ type: 'close', kind: 'sheet' }),
      closeAllSheets: () => dispatch({ type: 'close', kind: 'sheets' }),
      openDialog: opener('dialog'),
      closeDialog: () => dispatch({ type: 'close', kind: 'dialog' }),
      openPopover: opener('popover'),
      closePopover: () => dispatch({ type: 'close', kind: 'popover' }),
      openPage: opener('page'),
      setPageArgs: patch => dispatch({ type: 'pageArgs', patch }),
      closePage: () => dispatch({ type: 'close', kind: 'page' }),
      showOverlay: (id, args, options = {}) => {
        if (layerKind(id) !== 'overlay') throw new TypeError(`${id} is not an overlay id.`);
        dispatch({ type: 'open', layer: layer(id, args), front: options.front });
      },
      closeOverlay: key => dispatch({ type: 'close', kind: 'overlay', key }),
      closeTop: () => dispatch({ type: 'closeTop' }),
      /** Closes one opening of a sheet, dialog, popover or overlay by its key, wherever it is (a layer that fails). */
      closeLayer: (id, key) => {
        const kind = layerKind(id);
        if (kind && kind !== 'page' && key !== undefined) dispatch({ type: 'close', kind, key });
      },
      toast,
      dismissToast: key => dispatch({ type: 'dismissToast', key }),
      toOldApp: () => switchApp('classic'),
      /** Signs out; true when it worked (AuthGate then shows sign-in), false after saying why in a toast. */
      signOut: async () => {
        try {
          await onSignOutRef.current?.();
          return true;
        } catch (failure) {
          toast(failure?.message || SHELL_COPY.signOutFailed, { tone: 'error' });
          return false;
        }
      },
    };
  }, []);

  const sessionMember = useMemo(() => memberOf(session), [session]);
  const member = you ?? sessionMember;
  const leagueId = shown?.id ?? 'community';
  const leagueLabelName = shown?.name ?? leagueName;
  const league = useMemo(() => ({ id: leagueId, name: leagueLabelName }), [leagueId, leagueLabelName]);
  const value = useMemo(() => ({ ...actions, state, dockHost, you: member, league, offline: !online }),
    [actions, state, dockHost, member, league, online]);

  // A notice from outside the frame (the name just saved), once per key.
  const noticeKey = notice?.key;
  useEffect(() => {
    if (noticeKey !== undefined && noticeKey !== null && notice?.text) actions.toast(notice.text);
    // Once per key; the text belongs to that key.
  }, [noticeKey, actions]);

  const toTop = () => window.scrollTo({ top: 0, behavior: reduceMotion || prefersReducedMotion() ? 'auto' : 'smooth' });
  // The tab already showing scrolls to its top (or closes its page); any other tab shows as it was left.
  const onTab = tab => (tab === state.tab && !state.page ? toTop() : actions.tab(tab));
  const onHome = () => (state.tab === 'home' && !state.page ? toTop() : actions.go('home'));
  const onRetry = () => { if (!recheckOnline()) actions.toast(SHELL_COPY.stillOffline, { tone: 'plain' }); };

  const Screen = screens[state.tab];
  const style = dockHeight > 0 ? { '--gx-dock-space': `${dockHeight + 8}px` } : undefined;
  return (
    <ShellContext.Provider value={value}>
      <div className="gx" data-motion={reduceMotion ? 'reduce' : undefined} style={style}>
        <div className="gx-app" inert={modalOpen(state)}>
          <TopBar leagueName={league.name} you={member} onHome={onHome} onLeague={() => actions.openSheet('sh.switcher')} onMenu={() => actions.openSheet('sh.menu')}/>
          <main className="gx-main" id="main">
            <OfflineBanner offline={!online} onRetry={onRetry}/>
            {cover ? (
              <Boundary resetKey="cover" fallback={reset => <FailCard title={SHELL_COPY.tabFailed} onRetry={reset} onOldApp={actions.toOldApp}/>}>{cover}</Boundary>
            ) : state.page ? <PageHost page={state.page} layers={layers}/> : (
              <Boundary resetKey={state.tab} fallback={reset => <FailCard title={SHELL_COPY.tabFailed} onRetry={reset} onOldApp={actions.toOldApp}/>}>
                {Screen ? <Screen tab={state.tab}/> : null}
              </Boundary>
            )}
          </main>
          <div className="gx-dock" ref={setDockHost}></div>
          <TabBar current={state.tab} data={data} onTab={onTab}/>
        </div>
        <SheetHost state={state} layers={layers} inert={!!visibleOverlay(state)}/>
        <PopoverHost state={state} layers={layers}/>
        <DialogHost state={state} layers={layers}/>
        <ToastHost state={state} onDismiss={actions.dismissToast}/>
        <OverlayHost state={state} layers={layers}/>
        {children}
      </div>
    </ShellContext.Provider>
  );
}
