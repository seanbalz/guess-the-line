// Pick reminders in the new app (Board i39; D-28 opt-in web push, D-39 "due" wording, D-56 one Points reminder). The
// opt-in only lived in the retired old app's Community home, so no player had turned it on. This module is the one
// state machine behind Menu › Pick reminders and the one-time prompt under Play's Points card; both draw the same store.
//
// It reuses the existing client helper (web/src/webPush.js) and its routes (/push/status, /push/subscribe,
// /push/unsubscribe); nothing here adds a route or reads a pick, a line or another player.
// - Reading the state never asks for permission and never registers a service worker: only `turnOn`, called from a tap,
//   asks (enablePush calls Notification.requestPermission first, inside the gesture, as iOS requires).
// - One store per signed-in account: a different account gets a fresh store, so one account's "on", message or error
//   never shows for the next (the server's subscription row is per account too).
// - The prompt's dismissal is kept per account on this device (localStorage, every access in try/catch); turning
//   reminders on also retires the prompt, so it is shown until it is answered once.
// React-free apart from the hook at the bottom, so the state machine is tested with fakes (tests/next-reminders.test.jsx).
import { useEffect, useSyncExternalStore } from 'react';
import { currentSubscription, disablePush, enablePush, pushEnvironment, pushStatus } from '../../webPush.js';

export const REMINDER_PROMPT_PREFIX = 'gtl.next.remindersPrompt.v1.';

export const REMINDER_COPY = Object.freeze({
  title: 'Pick reminders',
  // The switch's meta line, one per state. "Due", not "lock" (D-39); the push never names a pick, a line or a score.
  off: 'One push 2 hours before picks are due: Spread, Total and Points. It never shows a pick or a line.',
  on: 'On for this device. One push 2 hours before picks are due.',
  checking: 'Checking this device…',
  turningOn: 'Turning on…',
  turningOff: 'Turning off…',
  blocked: 'Blocked for this site. Allow notifications in your browser or phone settings, then reload.',
  unsupported: 'This browser can’t show reminders.',
  install: 'On iPhone, add the app to your Home Screen first: Share › Add to Home Screen, then open it there.',
  device: 'This device only. Turn it on on each phone or browser you use.',
  doneOn: 'Reminders are on for this device.',
  doneOff: 'Reminders are off for this device.',
  failed: 'Reminders could not be changed. Try again.',
  promptTitle: 'Get a nudge before picks are due',
  promptBody: 'One push 2 hours before your Points players and Spread and Total picks are due. It never shows a pick or a line.',
  promptOn: 'Turn on reminders',
  promptLater: 'Not now',
});

const PUSH = Object.freeze({ currentSubscription, disablePush, enablePush, pushEnvironment, pushStatus });
const deviceStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const promptKey = accountId => `${REMINDER_PROMPT_PREFIX}${accountId}`;

/** Whether this account dismissed (or answered) the prompt on this device; storage that throws reads as not dismissed. */
export function promptDismissed(accountId, storage = deviceStorage()) {
  try { return Boolean(accountId) && storage?.getItem(promptKey(accountId)) === '1'; } catch { return false; }
}
/** Remembers the dismissal; false when this browser keeps no storage (the prompt then stays away until the page closes). */
export function rememberPromptDismissed(accountId, storage = deviceStorage()) {
  try { if (!accountId || !storage) return false; storage.setItem(promptKey(accountId), '1'); return true; } catch { return false; }
}

/**
 * What the switch shows: 'install' (iPhone/iPad Safari tab), 'unsupported', 'blocked' (notifications denied for the site),
 * or the device's phase: 'checking', 'off', 'on', 'busy'.
 */
export function reminderStatus(state) {
  if (state.env === 'needs-install') return 'install';
  if (state.env === 'unsupported') return 'unsupported';
  if (state.env === 'denied') return 'blocked';
  return state.phase;
}

/**
 * The switch's props for a state: `{ checked, disabled, sub }`. Only 'on' and 'off' can be switched; while a tap is being
 * answered the switch stays enabled, so keyboard focus is not dropped, and the store ignores another tap.
 */
export function reminderSwitch(state) {
  const status = reminderStatus(state);
  const busy = status === 'busy';
  const sub = busy ? (state.action === 'off' ? REMINDER_COPY.turningOff : REMINDER_COPY.turningOn) : REMINDER_COPY[status] ?? REMINDER_COPY.off;
  return { status, checked: status === 'on' || busy && state.action === 'on', disabled: !['on', 'off', 'busy'].includes(status), sub };
}

/**
 * Whether the prompt under the Points card shows: only when the server can send pushes (`/community/read` pushConfigured),
 * the account has not dismissed or answered it here, and there is something to do (switch on, or add to the Home Screen),
 * or the answer to a tap made from it is still on screen.
 */
export function showPrompt(state, configured) {
  if (configured !== true || state.dismissed) return false;
  const status = reminderStatus(state);
  if (status === 'off' || status === 'install') return true;
  return status === 'busy' && state.action === 'on' || Boolean(state.error);
}

const safeEnvironment = (push, win) => { try { return push.pushEnvironment(win); } catch { return 'unsupported'; } };

/**
 * The state machine for one account on this device. `get()` is `{ accountId, env, phase, action, message, error, dismissed }`.
 * `start()` reads the device once; `turnOn()` and `turnOff()` must be called from a tap; `dismiss()` retires the prompt.
 */
export function createReminderStore({ accountId = '', win = globalThis.window, push = PUSH, storage = deviceStorage() } = {}) {
  let state = { accountId, env: safeEnvironment(push, win), phase: 'checking', action: null, message: '', error: '', dismissed: promptDismissed(accountId, storage) };
  const listeners = new Set();
  let alive = true, started = false, reads = 0;
  const set = patch => {
    if (!alive) return;
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };

  /** Reads this device: the environment, then the server row only when a local subscription exists. Never asks permission. */
  async function refresh() {
    const read = ++reads;
    const env = safeEnvironment(push, win);
    if (env !== 'supported') { set({ env, phase: 'off' }); return state; }
    let phase = 'off';
    try {
      const subscription = await push.currentSubscription(win);
      // A failed server check reads as off: switching on again is harmless (the subscribe is an upsert), while a wrong
      // "on" would hide that this account gets nothing.
      if (subscription) phase = await push.pushStatus(subscription.endpoint).then(status => status?.subscribed === true ? 'on' : 'off', () => 'off');
    } catch { phase = 'off'; }
    if (read === reads) set({ env: safeEnvironment(push, win), phase });
    return state;
  }

  async function settle(pending, action, done) {
    let message = '', error = '';
    try { await pending; message = done; }
    catch (failure) { error = typeof failure?.message === 'string' && failure.message ? failure.message : REMINDER_COPY.failed; }
    await refresh();
    if (!error && action === 'on') { rememberPromptDismissed(accountId, storage); set({ dismissed: true }); }
    set({ action: null, message, error });
    return state;
  }

  function run(action) {
    if (!alive || state.phase === 'busy' || reminderStatus(state) !== (action === 'on' ? 'off' : 'on')) return Promise.resolve(state);
    reads += 1; // A read still on its way must not overwrite the answer to this tap.
    set({ phase: 'busy', action, message: '', error: '' });
    // Called synchronously from the tap: Notification.requestPermission is enablePush's first call, so iOS still sees
    // the gesture. A helper that throws before its first await is caught by the same settle.
    let pending;
    try { pending = action === 'on' ? push.enablePush(win) : push.disablePush(win); } catch (failure) { pending = Promise.reject(failure); }
    return settle(pending, action, action === 'on' ? REMINDER_COPY.doneOn : REMINDER_COPY.doneOff);
  }

  return {
    accountId,
    get: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() { if (started) return; started = true; refresh(); },
    refresh,
    turnOn: () => run('on'),
    turnOff: () => run('off'),
    dismiss() { rememberPromptDismissed(accountId, storage); set({ dismissed: true }); },
    dispose() { alive = false; listeners.clear(); },
  };
}

let current = null;
/** The one store for the signed-in account; another account replaces it with a fresh one (`deps` as createReminderStore). */
export function reminderStore(accountId, deps = {}) {
  if (!current || current.accountId !== accountId) {
    current?.dispose();
    current = createReminderStore({ ...deps, accountId });
  }
  return current;
}
/** Drops the store (tests, and nothing else needs it: an account change already replaces it). */
export function forgetReminders() { current?.dispose(); current = null; }

/** The state for `accountId` with the actions; reads the device once per account. */
export function useReminders(accountId) {
  const store = reminderStore(accountId);
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  useEffect(() => { store.start(); }, [store]);
  return { ...state, status: reminderStatus(state), turnOn: store.turnOn, turnOff: store.turnOff, dismiss: store.dismiss };
}
