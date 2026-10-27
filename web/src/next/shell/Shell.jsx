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
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { openOldApp } from '../../appView.js';
import { noteSportRoute } from '../../sportNavigation.js';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { Boundary, FailCard } from './Boundary.jsx';
import { ShellContext } from './context.js';
import { DetailBack, OfflineBanner, SportControls, TabBar, TopBar } from './Frame.jsx';
import { DialogHost, OverlayHost, PageHost, PopoverHost, SheetHost } from './LayerHosts.jsx';
import { ToastHost } from './ToastHost.jsx';
import { LAYERS, SCREENS } from './registry.jsx';
import { connectHistory, fragmentFor, startPlace } from './router.js';
import { canGoBack, hasLayers, initialState, isDetail, layer, layerKind, modalOpen, navigationPatch, reduce, visibleOverlay } from './state.js';
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
  const dirty = useRef(new Set());
  const setDirty = useCallback((key, value) => {
    if (value) dirty.current.add(key);
    else dirty.current.delete(key);
  }, []);
  const confirmLeave = useCallback(() => {
    if (!dirty.current.size) return true;
    if (!window.confirm('Leave without saving your changes?')) return false;
    return true;
  }, []);
  useEffect(() => {
    const guard = event => { if (!confirmLeave()) event.preventDefault(); };
    window.addEventListener('gtl:sport-leave', guard);
    return () => window.removeEventListener('gtl:sport-leave', guard);
  }, [confirmLeave]);
  useEffect(() => {
    const warn = event => {
      if (!dirty.current.size) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // The address and Back follow the state (router.js).
  const stateRef = useRef(state);
  stateRef.current = state;
  const history = useRef(null);
  const synced = useRef(null);
  useEffect(() => {
    const connection = connectHistory(window, { getState: () => stateRef.current, dispatch, confirmLeave, beforeNavigate: rememberPosition });
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
    noteSportRoute();
  }, [state]);

  // Keep scroll/focus privately in memory; addresses/history never contain DOM or editor records.
  const positions = useRef(new Map());
  const positionKey = current => isDetail(current) ? fragmentFor(current.tab, current.views[current.tab], current.views) : current.tab;
  const rememberPosition = useCallback(() => {
    const node = document.activeElement;
    positions.current.set(positionKey(stateRef.current), { scroll: window.scrollY, focus: node && node !== document.body ? { id: node.id, tag: node.tagName, label: node.getAttribute('aria-label'), text: node.textContent?.trim() } : null });
  }, []);
  const navigated = useRef(state.nav);
  useLayoutEffect(() => {
    if (navigated.current === state.nav) return;
    navigated.current = state.nav;
    const saved = positions.current.get(positionKey(state));
    const returning = state.navMode === 'back' || state.navMode === 'restore';
    const main = document.querySelector('main');
    let frame, timeout, sizeObserver, contentObserver, stopped = false, focused = null;
    const cancelEvents = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      sizeObserver?.disconnect();
      contentObserver?.disconnect();
      for (const name of cancelEvents) window.removeEventListener(name, stop, true);
    };
    const restore = () => {
      if (stopped) return;
      // A detail destination can focus itself before this animation frame runs.
      // Preserve that explicit handoff, including its scroll position.
      const active = document.activeElement;
      if (!returning && main?.contains(active) && active.matches('[data-route-focus]')) { stop(); return; }
      const descriptor = returning ? saved?.focus : null;
      const origin = descriptor ? (descriptor.id && document.getElementById(descriptor.id)) || [...(main?.querySelectorAll('button,a,input,select') ?? [])].find(node => node.tagName === descriptor.tag && (descriptor.label ? node.getAttribute('aria-label') === descriptor.label : node.textContent?.trim() === descriptor.text)) : null;
      const target = origin ?? main?.querySelector('h1') ?? main;
      if (target && target !== focused) {
        if (!target.hasAttribute('tabindex') && !target.matches('button,a,input,select,textarea')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        focused = target;
      }
      const scroll = returning && saved ? saved.scroll : 0;
      window.scrollTo(0, scroll);
      const available = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      // A loading screen can be shorter than the returned list. Wait for its content/height without fighting input.
      if (scroll <= available + 1 && (!descriptor || origin)) stop();
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); };
    if (returning && saved) {
      for (const name of cancelEvents) window.addEventListener(name, stop, { capture: true, passive: true });
      if (typeof ResizeObserver === 'function' && main) { sizeObserver = new ResizeObserver(schedule); sizeObserver.observe(main); }
      if (typeof MutationObserver === 'function' && main) { contentObserver = new MutationObserver(schedule); contentObserver.observe(main, { subtree: true, childList: true, characterData: true }); }
      timeout = setTimeout(stop, 3000);
    }
    schedule();
    return stop;
  }, [state.nav]);

  const onSignOutRef = useRef(onSignOut);
  onSignOutRef.current = onSignOut;
  const actions = useMemo(() => {
    const opener = kind => (id, args) => {
      if (layerKind(id) !== kind) throw new TypeError(`${id} is not a ${kind} id.`);
      dispatch({ type: 'open', layer: layer(id, args) });
    };
    const toast = (text, options = {}) => dispatch({ type: 'toast', toast: { ...options, text } });
    return {
      setDirty,
      confirmLeave,
      tab: tab => { if (confirmLeave()) { rememberPosition(); dispatch({ type: 'tab', tab }); } },
      go: (tab, view) => { if (confirmLeave()) { rememberPosition(); dispatch({ type: 'go', tab, view }); } },
      back: () => { if (confirmLeave()) { rememberPosition(); dispatch({ type: 'back' }); } },
      setView: (tab, patch) => {
        if (navigationPatch(stateRef.current, tab, patch)) {
          if (!confirmLeave()) return;
          rememberPosition();
        }
        dispatch({ type: 'view', tab, patch });
      },
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
      closePage: () => { if (confirmLeave()) dispatch({ type: 'close', kind: 'page' }); },
      showOverlay: (id, args, options = {}) => {
        if (layerKind(id) !== 'overlay') throw new TypeError(`${id} is not an overlay id.`);
        dispatch({ type: 'open', layer: layer(id, args), front: options.front });
      },
      closeOverlay: key => dispatch({ type: 'close', kind: 'overlay', key }),
      closeTop: () => { if (confirmLeave()) dispatch({ type: 'closeTop' }); },
      /** Closes one opening of a sheet, dialog, popover or overlay by its key, wherever it is (a layer that fails). */
      closeLayer: (id, key) => {
        const kind = layerKind(id);
        if (kind && kind !== 'page' && key !== undefined) dispatch({ type: 'close', kind, key });
      },
      toast,
      dismissToast: key => dispatch({ type: 'dismissToast', key }),
      // D-60: the old app holds only what has no new home yet (older records and some commissioner tools).
      toOldApp: () => { if (confirmLeave()) { dirty.current.clear(); openOldApp(); } },
      /** Signs out; true when it worked (AuthGate then shows sign-in), false after saying why in a toast. */
      signOut: async () => {
        if (!confirmLeave()) return false;
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
  const communityAdmin = data?.community?.admin === true;
  const value = useMemo(() => ({ ...actions, communityAdmin, canGoBack: canGoBack(state), state, dockHost, you: member, league, offline: !online }),
    [actions, state, dockHost, member, league, online, communityAdmin]);

  // A notice from outside the frame (the name just saved), once per key.
  const noticeKey = notice?.key;
  useEffect(() => {
    if (noticeKey !== undefined && noticeKey !== null && notice?.text) actions.toast(notice.text);
    // Once per key; the text belongs to that key.
  }, [noticeKey, actions]);

  const toTop = () => window.scrollTo({ top: 0, behavior: reduceMotion || prefersReducedMotion() ? 'auto' : 'smooth' });
  // Main tab selection opens its root; selecting the root already showing scrolls to its top.
  const onTab = tab => (tab === state.tab && !state.page && !isDetail(state) && !hasLayers(state) ? toTop() : actions.tab(tab));
  const onHome = () => (state.tab === 'home' && !state.page && !hasLayers(state) ? toTop() : actions.go('home'));
  const onRetry = () => { if (!recheckOnline()) actions.toast(SHELL_COPY.stillOffline, { tone: 'plain' }); };

  const Screen = screens[state.tab] ?? (state.tab === 'research' ? screens[state.views.research.section === 'fantasy' ? 'fantasy' : 'lines'] : null);
  const style = { '--gx-dock-space': `${dockHeight > 0 ? dockHeight + 8 : 0}px` };
  return (
    <ShellContext.Provider value={value}>
      <div className="gx" data-motion={reduceMotion ? 'reduce' : undefined} style={style}>
        <div className="gx-app" inert={modalOpen(state)}>
          <TopBar leagueName={league.name} you={member} onHome={onHome} onLeague={() => actions.openSheet('sh.switcher')} onMenu={() => actions.openSheet('sh.menu')}/>
          <SportControls/>
          <main className="gx-main" id="main" tabIndex={-1}>
            <OfflineBanner offline={!online} onRetry={onRetry}/>
            {!cover && !state.page && (state.trail.length > 0 || isDetail(state)) ? <DetailBack onBack={actions.back}/> : null}
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
