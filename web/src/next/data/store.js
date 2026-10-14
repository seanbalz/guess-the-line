// The new app's shared reads (redesign build plan stage 11, section 3.3): one copy of each read for every screen that
// shows it. Pure: no React, DOM, storage or network of its own. AppData.jsx gives it the real reads (`/lobby` and
// `/community/read`) and keeps it fresh; the node tests (tests/next-data.test.mjs) give it fakes.
//
// - One request for every consumer: a read already on its way is shared, and a read already loaded is not repeated
//   unless a refresh asks for it.
// - A refresh (on focus, every 5 minutes, back online, after a write or a fresh sign-in) reads again everything a
//   screen has asked for. While it runs, the last good copy stays on screen.
// - A failed refresh keeps the last good copy and notes the error (shown as "may be out of date"), except a refusal
//   that says the copy no longer applies (403, 404), which drops it. A read never retries by itself: the next focus,
//   tick or Try again reads again.
// - A 401 notes that the sign-in ran out (`signInNeeded`), so the app can ask the member to sign in again; reads and
//   typed text stay as they are.
// - `abortAll()` (the app unmounting) cancels every read on its way; their answers are dropped.

export const REFRESH_MS = 5 * 60_000;
// A focus or a return to the tab within this long of the last good read does not read again.
export const FOCUS_REFRESH_MS = 15_000;

const DROP_ON = new Set([403, 404]);
const isAbort = error => error?.name === 'AbortError';

/**
 * `createDataStore({ lobby: signal => fetchLobby(signal), community: signal => ... }, { now })`. Each source is a
 * function that takes an AbortSignal and returns a promise of that read's data.
 */
export function createDataStore(sources, { now = Date.now } = {}) {
  const names = Object.keys(sources);
  const entries = Object.fromEntries(names.map(name => [name, { data: undefined, error: null, at: null, requested: false, inflight: null }]));
  const listeners = new Set();
  let version = 0;
  let signInNeeded = false;
  const views = new Map();

  function emit() {
    version += 1;
    views.clear();
    for (const listener of [...listeners]) listener();
  }
  function entry(name) {
    const found = entries[name];
    if (!found) throw new TypeError(`No read named ${name}.`);
    return found;
  }

  /** What a screen draws for one read: `{ status, data, error, at, loading }` (a stable object until the next change). */
  function get(name) {
    if (views.has(name)) return views.get(name);
    const e = entry(name);
    const has = e.data !== undefined;
    const status = has ? 'ready' : e.inflight ? 'loading' : e.error ? 'error' : e.requested ? 'loading' : 'idle';
    const view = Object.freeze({ status, data: has ? e.data : null, error: e.error, at: e.at, loading: !!e.inflight });
    views.set(name, view);
    return view;
  }

  function start(name) {
    const e = entry(name);
    e.requested = true;
    if (e.inflight) return e.inflight.promise;
    const controller = new AbortController();
    // Recorded before the read starts, so a source that throws at once still settles this flight.
    const flight = { controller, promise: null };
    e.inflight = flight;
    flight.promise = (async () => {
      try {
        const data = await sources[name](controller.signal);
        if (controller.signal.aborted) return;
        e.data = data;
        e.error = null;
        e.at = now();
      } catch (error) {
        if (controller.signal.aborted || isAbort(error)) return;
        e.error = error ?? new Error('The read failed.');
        if (DROP_ON.has(error?.status)) e.data = undefined;
        if (error?.status === 401) signInNeeded = true;
      } finally {
        if (e.inflight === flight) {
          e.inflight = null;
          emit();
        }
      }
    })().then(() => get(name));
    emit();
    return flight.promise;
  }

  return {
    names,
    get,
    /** Starts a read once: later calls share the one on its way, or the copy already loaded. Resolves to `get(name)`. */
    load(name) {
      const e = entry(name);
      if (e.inflight) return e.inflight.promise;
      if (e.data !== undefined) return Promise.resolve(get(name));
      return start(name);
    },
    /**
     * Reads again what screens have asked for (or `only` those names). `olderThan` (ms) skips a read whose last good
     * copy is newer than that. A read already on its way is shared, not repeated.
     */
    refresh({ only, olderThan } = {}) {
      const wanted = (only ?? names).filter(name => entry(name).requested);
      const due = wanted.filter(name => {
        const e = entry(name);
        return e.inflight || olderThan === undefined || e.at === null || now() - e.at >= olderThan;
      });
      return Promise.all(due.map(start));
    },
    /** Cancels every read on its way (the app unmounting). Their answers are dropped; a later load starts afresh. */
    abortAll() {
      let changed = false;
      for (const e of Object.values(entries)) {
        if (!e.inflight) continue;
        e.inflight.controller.abort();
        e.inflight = null;
        changed = true;
      }
      if (changed) emit();
    },
    get signInNeeded() { return signInNeeded; },
    /** A write found the sign-in had run out. */
    noteSignInNeeded() {
      if (signInNeeded) return;
      signInNeeded = true;
      emit();
    },
    /** The member signed in again (or dismissed the prompt): forget the 401 until the next one. */
    clearSignInNeeded() {
      if (!signInNeeded) return;
      signInNeeded = false;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}

/**
 * Keeps a store fresh in a window: a refresh on focus and when the tab comes back into view (skipped within
 * FOCUS_REFRESH_MS of the last good read), when the browser comes back online, and every REFRESH_MS while the tab is
 * in view. Returns `disconnect()`.
 */
export function connectRefresh(win, store, { intervalMs = REFRESH_MS, focusMs = FOCUS_REFRESH_MS } = {}) {
  const doc = win.document;
  const visible = () => !doc || doc.visibilityState !== 'hidden';
  const onFocus = () => { if (visible()) store.refresh({ olderThan: focusMs }); };
  const onOnline = () => store.refresh();
  win.addEventListener('focus', onFocus);
  win.addEventListener('online', onOnline);
  doc?.addEventListener('visibilitychange', onFocus);
  const timer = win.setInterval(() => { if (visible()) store.refresh(); }, intervalMs);
  return () => {
    win.removeEventListener('focus', onFocus);
    win.removeEventListener('online', onOnline);
    doc?.removeEventListener('visibilitychange', onFocus);
    win.clearInterval(timer);
  };
}

/**
 * What went wrong with a write, in a form the screens use: `uncertain` (the answer was lost: the typed values stay
 * and the member checks before saving again), `signIn` (401), `offline` (no answer at all), `refused` (the server
 * said no, with its own words) or `failed`.
 */
export function writeProblem(error) {
  if (error?.uncertain === true) return { kind: 'uncertain', message: error.message, status: error.status ?? 0 };
  if (error?.status === 401) return { kind: 'signIn', message: error.message, status: 401 };
  if (typeof error?.status !== 'number' || error.status === 0) return { kind: 'offline', message: '', status: 0 };
  if (error.status < 500) return { kind: 'refused', message: error.message, status: error.status };
  return { kind: 'failed', message: error.message, status: error.status };
}

/**
 * Writes through the store (section 3.3: writes never retry by themselves). `write(key, send, { refresh })` sends
 * once; a second call with the same key while the first is on its way gets the first one's answer instead of a second
 * request. After it settles (saved, refused or uncertain) the named reads refresh, so the screen shows what is
 * really saved; `send` is never called again by this module. A 401 also notes that the sign-in ran out. Resolves to
 * `{ ok: true, data }` or `{ ok: false, ...writeProblem(error) }`; never rejects.
 */
export function createWriter(store) {
  const pending = new Map();
  return function write(key, send, { refresh = [] } = {}) {
    if (pending.has(key)) return pending.get(key);
    const promise = (async () => {
      let result;
      try { result = { ok: true, data: await send() }; }
      catch (error) {
        result = { ok: false, ...writeProblem(error) };
        if (result.kind === 'signIn') store.noteSignInNeeded();
      }
      if (refresh.length && result.kind !== 'signIn') await store.refresh({ only: refresh });
      return result;
    })().finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
