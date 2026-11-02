// Pick reminders in the new app (Board i39): the state machine behind Menu › Pick reminders and the one-time prompt under
// Play's Points card (web/src/next/me/reminders.js, PickReminders.jsx), driven through the real client helper
// (web/src/webPush.js) on a fake browser and a fake /push/* server. Contracts:
// - unsupported, iPhone-Safari-tab (add to Home Screen first), blocked and on/off each draw their own switch state;
// - reading the state never asks for permission, registers a worker or calls the server without a local subscription;
//   permission is asked only by a tap (turnOn), synchronously inside it, exactly once;
// - the prompt's dismissal is remembered per account on this device, and storage that throws never breaks it;
// - another account gets a fresh store: no "on", message, error or dismissal carries over.
// Fixture accounts and endpoints only; nothing here reaches a network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';

const VAPID = `B${'A'.repeat(86)}`;
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/fixture-device';
const LUKE = '33333333-3333-4333-8333-333333333333', TROY = '22222222-2222-4222-8222-222222222222';
// The fake /push/* routes: one row per (account, endpoint), as gtl_push_subscriptions keeps them.
const server = vi.hoisted(() => ({ user: null, rows: new Set(), fail: null, calls: [] }));
vi.mock('../web/src/api.js', () => ({
  communityApi: vi.fn(), meApi: vi.fn(), pointsApi: vi.fn(),
  cloudApi: vi.fn(async (route, body = {}) => {
    server.calls.push(route);
    if (server.fail === route) throw Object.assign(new Error('Reminders are temporarily unavailable.'), { status: 503 });
    const key = endpoint => `${server.user}|${endpoint}`;
    if (route === 'push/status') return { configured: true, publicKey: VAPID, subscribed: Boolean(body.endpoint) && server.rows.has(key(body.endpoint)), devices: server.rows.size };
    if (route === 'push/subscribe') { server.rows.add(key(body.endpoint)); return { subscribed: true, devices: server.rows.size }; }
    if (route === 'push/unsubscribe') { const removed = server.rows.delete(key(body.endpoint)); return { subscribed: false, removed, devices: server.rows.size }; }
    throw new Error(`unexpected route ${route}`);
  }),
}));
const ui = vi.hoisted(() => ({ app: null, toasts: [] }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ui.app }));
vi.mock('../web/src/Theme.jsx', () => ({ useThemePreference: () => null }));
vi.mock('../web/src/dashboardPreferences.js', () => ({ useDashboardPreferences: () => [{ motion: 'system' }, vi.fn(), { storageAvailable: true }] }));

const reminders = await import('../web/src/next/me/reminders.js');
const { createReminderStore, forgetReminders, promptDismissed, reminderStatus, reminderStore, reminderSwitch, showPrompt, REMINDER_COPY, REMINDER_PROMPT_PREFIX } = reminders;
const { PickReminderSettings, ReminderPrompt } = await import('../web/src/next/me/PickReminders.jsx');
const { MenuSheet } = await import('../web/src/next/me/MenuSheet.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');

/** A browser as webPush.js sees it. `push: false` drops PushManager and the worker (an iPhone Safari tab, or an old browser). */
function fakeBrowser({ permission = 'default', answer = 'granted', ios = false, standalone = false, push = true, subscribed = false } = {}) {
  const calls = { requestPermission: 0, register: 0, getRegistration: 0, subscribe: 0, unsubscribe: 0, unregister: 0 };
  const makeSubscription = () => ({
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'fixture-p256dh', auth: 'fixture-auth' } }),
    unsubscribe: async () => { calls.unsubscribe += 1; subscription = null; return true; },
  });
  const makeRegistration = () => ({
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => { calls.subscribe += 1; subscription = makeSubscription(); return subscription; },
    },
    unregister: async () => { calls.unregister += 1; registration = null; return true; },
  });
  let subscription = subscribed ? makeSubscription() : null;
  let registration = subscribed ? makeRegistration() : null;
  const Notification = {
    permission,
    requestPermission: () => { calls.requestPermission += 1; Notification.permission = answer; return Promise.resolve(answer); },
  };
  const navigator = {
    userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
    platform: ios ? 'iPhone' : 'Win32', maxTouchPoints: ios ? 5 : 0, standalone,
  };
  if (push) navigator.serviceWorker = {
    getRegistration: async () => { calls.getRegistration += 1; return registration; },
    register: async () => { calls.register += 1; registration ??= makeRegistration(); return registration; },
  };
  const win = { isSecureContext: true, navigator, matchMedia: () => ({ matches: standalone }) };
  if (push) Object.assign(win, { PushManager: function PushManager() {}, Notification });
  return { win, calls };
}
function memoryStorage() {
  const map = new Map();
  return { map, getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => { map.set(key, String(value)); }, removeItem: key => { map.delete(key); } };
}
const throwingStorage = () => ({ getItem() { throw new DOMException('blocked', 'SecurityError'); }, setItem() { throw new DOMException('quota', 'QuotaExceededError'); } });

beforeEach(() => { server.user = LUKE; server.rows = new Set(); server.fail = null; server.calls = []; ui.toasts = []; forgetReminders(); });
afterEach(() => forgetReminders());

describe('Pick reminders: the device states', () => {
  it('no PushManager, worker or Notification: unsupported, the switch cannot be turned on and the prompt stays away', async () => {
    const { win } = fakeBrowser({ push: false });
    const store = createReminderStore({ accountId: LUKE, win, storage: memoryStorage() });
    await store.refresh();
    expect(reminderStatus(store.get())).toBe('unsupported');
    expect(reminderSwitch(store.get())).toEqual({ status: 'unsupported', checked: false, disabled: true, sub: REMINDER_COPY.unsupported });
    expect(showPrompt(store.get(), true)).toBe(false);
    // No window at all (a server render) is unsupported too, never a throw.
    expect(reminderStatus(createReminderStore({ accountId: LUKE, win: undefined, storage: memoryStorage() }).get())).toBe('unsupported');
  });

  it('an iPhone Safari tab: add the app to the Home Screen first, in one line; nothing can be switched on there', async () => {
    const { win, calls } = fakeBrowser({ push: false, ios: true });
    const store = createReminderStore({ accountId: LUKE, win, storage: memoryStorage() });
    await store.refresh();
    expect(reminderSwitch(store.get())).toEqual({ status: 'install', checked: false, disabled: true, sub: REMINDER_COPY.install });
    expect(REMINDER_COPY.install).toMatch(/Home Screen/);
    expect(REMINDER_COPY.install).not.toMatch(/\n/);
    expect(showPrompt(store.get(), true)).toBe(true);
    await store.turnOn();
    expect(calls.requestPermission).toBe(0);
    // The same iPhone from the Home Screen app (standalone, iOS 16.4+) has PushManager and can switch on.
    const home = fakeBrowser({ ios: true, standalone: true });
    const installed = createReminderStore({ accountId: LUKE, win: home.win, storage: memoryStorage() });
    await installed.refresh();
    expect(reminderStatus(installed.get())).toBe('off');
  });

  it('notifications blocked for the site: blocked, disabled, no prompt, and no permission question', async () => {
    const { win, calls } = fakeBrowser({ permission: 'denied' });
    const store = createReminderStore({ accountId: LUKE, win, storage: memoryStorage() });
    await store.refresh();
    expect(reminderSwitch(store.get())).toEqual({ status: 'blocked', checked: false, disabled: true, sub: REMINDER_COPY.blocked });
    expect(showPrompt(store.get(), true)).toBe(false);
    await store.turnOn();
    expect(calls.requestPermission).toBe(0);
  });

  it('supported and never subscribed: off, read without asking permission, registering a worker or calling the server', async () => {
    const { win, calls } = fakeBrowser();
    const store = createReminderStore({ accountId: LUKE, win, storage: memoryStorage() });
    expect(reminderStatus(store.get())).toBe('checking');
    expect(reminderSwitch(store.get()).disabled).toBe(true);
    store.start();
    store.start(); // Mounting twice (StrictMode, the Menu and the prompt) reads once.
    await vi.waitFor(() => expect(reminderStatus(store.get())).toBe('off'));
    expect(reminderSwitch(store.get())).toEqual({ status: 'off', checked: false, disabled: false, sub: REMINDER_COPY.off });
    expect(calls).toMatchObject({ requestPermission: 0, register: 0, subscribe: 0, getRegistration: 1 });
    expect(server.calls).toEqual([]);
    expect(showPrompt(store.get(), true)).toBe(true);
    expect(showPrompt(store.get(), false), 'never while the server cannot send pushes').toBe(false);
  });

  it('a device subscribed for this account reads on; for another account or a failed check it reads off', async () => {
    server.rows.add(`${LUKE}|${ENDPOINT}`);
    const luke = createReminderStore({ accountId: LUKE, win: fakeBrowser({ permission: 'granted', subscribed: true }).win, storage: memoryStorage() });
    await luke.refresh();
    expect(reminderSwitch(luke.get())).toMatchObject({ status: 'on', checked: true, disabled: false, sub: REMINDER_COPY.on });
    expect(showPrompt(luke.get(), true)).toBe(false);
    server.user = TROY;
    const troy = createReminderStore({ accountId: TROY, win: fakeBrowser({ permission: 'granted', subscribed: true }).win, storage: memoryStorage() });
    await troy.refresh();
    expect(reminderStatus(troy.get())).toBe('off');
    server.user = LUKE; server.fail = 'push/status';
    const offline = createReminderStore({ accountId: LUKE, win: fakeBrowser({ permission: 'granted', subscribed: true }).win, storage: memoryStorage() });
    await offline.refresh();
    expect(reminderStatus(offline.get())).toBe('off');
  });
});

describe('Pick reminders: a tap turns them on or off', () => {
  it('permission is asked only by the tap, synchronously and once; then the device subscribes and reads on', async () => {
    const { win, calls } = fakeBrowser();
    const storage = memoryStorage();
    const store = createReminderStore({ accountId: LUKE, win, storage });
    await store.refresh();
    expect(calls.requestPermission).toBe(0);
    const done = store.turnOn();
    // Still inside the tap: iOS shows the permission question only for a user gesture.
    expect(calls.requestPermission).toBe(1);
    // Busy keeps the switch enabled (focus stays on it); the store ignores another tap until this one is answered.
    expect(reminderSwitch(store.get())).toEqual({ status: 'busy', checked: true, disabled: false, sub: REMINDER_COPY.turningOn });
    expect(showPrompt(store.get(), true), 'the prompt stays while its tap is answered').toBe(true);
    store.turnOn(); store.turnOff(); // Another tap while busy does nothing.
    expect(calls.requestPermission).toBe(1);
    const after = await done;
    expect(calls).toMatchObject({ requestPermission: 1, register: 1, subscribe: 1 });
    expect(server.calls).toEqual(['push/status', 'push/subscribe', 'push/status']);
    expect([...server.rows]).toEqual([`${LUKE}|${ENDPOINT}`]);
    expect(after).toMatchObject({ phase: 'on', message: REMINDER_COPY.doneOn, error: '', dismissed: true });
    // Switched on once, the prompt has done its job for this account on this device.
    expect(storage.map.get(`${REMINDER_PROMPT_PREFIX}${LUKE}`)).toBe('1');
    expect(showPrompt(store.get(), true)).toBe(false);
  });

  it('a declined permission keeps reminders off and says why; a blocked answer turns the switch to blocked', async () => {
    const declined = fakeBrowser({ answer: 'default' });
    const store = createReminderStore({ accountId: LUKE, win: declined.win, storage: memoryStorage() });
    await store.refresh();
    await store.turnOn();
    expect(store.get()).toMatchObject({ phase: 'off', message: '', error: 'Reminders stay off. You can turn them on any time.', dismissed: false });
    expect(declined.calls.register).toBe(0);
    expect(server.calls).toEqual([]);
    expect(showPrompt(store.get(), true)).toBe(true);
    const blocked = fakeBrowser({ answer: 'denied' });
    const other = createReminderStore({ accountId: LUKE, win: blocked.win, storage: memoryStorage() });
    await other.refresh();
    await other.turnOn();
    expect(reminderStatus(other.get())).toBe('blocked');
    expect(other.get().error).toMatch(/blocked for this site/);
    expect(showPrompt(other.get(), true), 'the answer to the tap stays on screen').toBe(true);
  });

  it('a server failure while subscribing leaves no subscription or worker behind and keeps reminders off', async () => {
    const { win, calls } = fakeBrowser();
    server.fail = 'push/subscribe';
    const store = createReminderStore({ accountId: LUKE, win, storage: memoryStorage() });
    await store.refresh();
    await store.turnOn();
    expect(store.get()).toMatchObject({ phase: 'off', error: 'Reminders are temporarily unavailable.', dismissed: false });
    expect(calls).toMatchObject({ subscribe: 1, unsubscribe: 1, unregister: 1 });
  });

  it('turning off unsubscribes, deletes the server row and unregisters the worker', async () => {
    server.rows.add(`${LUKE}|${ENDPOINT}`);
    const { win, calls } = fakeBrowser({ permission: 'granted', subscribed: true });
    const store = createReminderStore({ accountId: LUKE, win, storage: memoryStorage() });
    await store.refresh();
    const done = store.turnOff();
    expect(reminderSwitch(store.get())).toEqual({ status: 'busy', checked: false, disabled: false, sub: REMINDER_COPY.turningOff });
    expect(showPrompt(store.get(), true), 'turning off in the Menu does not bring the prompt back mid-tap').toBe(false);
    await done;
    expect(store.get()).toMatchObject({ phase: 'off', message: REMINDER_COPY.doneOff, error: '' });
    expect(calls).toMatchObject({ requestPermission: 0, unsubscribe: 1, unregister: 1 });
    expect(server.rows.size).toBe(0);
  });
});

describe('Pick reminders: the prompt and the account', () => {
  it('"Not now" is remembered per account on this device', async () => {
    const storage = memoryStorage();
    const { win } = fakeBrowser();
    const first = createReminderStore({ accountId: LUKE, win, storage });
    await first.refresh();
    expect(showPrompt(first.get(), true)).toBe(true);
    first.dismiss();
    expect(showPrompt(first.get(), true)).toBe(false);
    expect(promptDismissed(LUKE, storage)).toBe(true);
    const reload = createReminderStore({ accountId: LUKE, win, storage });
    await reload.refresh();
    expect(showPrompt(reload.get(), true), 'still dismissed after a reload').toBe(false);
    const troy = createReminderStore({ accountId: TROY, win, storage });
    await troy.refresh();
    expect(showPrompt(troy.get(), true), 'another account on the same device still sees it').toBe(true);
  });

  it('storage that throws never breaks the prompt: dismissed for this page, asked again next time', async () => {
    const { win } = fakeBrowser();
    const store = createReminderStore({ accountId: LUKE, win, storage: throwingStorage() });
    await store.refresh();
    expect(() => store.dismiss()).not.toThrow();
    expect(showPrompt(store.get(), true)).toBe(false);
    expect(promptDismissed(LUKE, throwingStorage())).toBe(false);
  });

  it('an account switch gets a fresh store: no "on", message, error or dismissal carries over, and late answers are dropped', async () => {
    const storage = memoryStorage();
    const { win } = fakeBrowser();
    const luke = reminderStore(LUKE, { win, storage });
    expect(reminderStore(LUKE)).toBe(luke);
    await luke.refresh();
    await luke.turnOn();
    expect(luke.get()).toMatchObject({ phase: 'on', message: REMINDER_COPY.doneOn, dismissed: true });
    server.user = TROY;
    const troy = reminderStore(TROY, { win, storage });
    expect(troy).not.toBe(luke);
    expect(troy.get()).toMatchObject({ accountId: TROY, phase: 'checking', message: '', error: '', dismissed: false });
    await troy.refresh();
    // The device still holds Luke's subscription; the server row is Luke's, so Troy reads off.
    expect(reminderStatus(troy.get())).toBe('off');
    expect(showPrompt(troy.get(), true)).toBe(true);
    // Luke's store is retired: a late answer from it changes nothing.
    const before = luke.get();
    await luke.refresh();
    expect(luke.get()).toBe(before);
  });
});

describe('Pick reminders: what the screens draw', () => {
  const SHELL = { you: { id: LUKE, name: 'Luke Fixture', email: 'luke@example.test' }, communityAdmin: false, setSheetArgs: vi.fn(), closeSheet: vi.fn(), openPage: vi.fn(), signOut: vi.fn(), toast: text => ui.toasts.push(text) };
  // The shell carries the same push guard as the Community read (Shell.jsx `pushConfigured`, from `data.community`).
  const render = (node, configured = true) => {
    ui.app = { accountId: LUKE, community: { status: 'ready', data: { pushConfigured: configured } } };
    return renderToStaticMarkup(<ShellContext.Provider value={{ ...SHELL, pushConfigured: configured }}><div className="gx">{node}</div></ShellContext.Provider>);
  };
  async function deviceFor(options) {
    const store = reminderStore(LUKE, { win: fakeBrowser(options).win, storage: memoryStorage() });
    await store.refresh();
    return store;
  }

  it('the Menu offers Pick reminders only while the server can send pushes', async () => {
    await deviceFor({});
    expect(render(<MenuSheet args={{}}/>)).toContain('>Pick reminders<');
    expect(render(<MenuSheet args={{}}/>, false)).not.toContain('Pick reminders');
    const sheet = render(<MenuSheet args={{ sub: 'reminders' }}/>);
    expect(markupProblems(sheet)).toEqual([]);
    expect(sheet).toContain('role="switch"');
    expect(sheet).toContain(REMINDER_COPY.device);
  });

  it('the switch: off can be switched; on is checked; blocked, unsupported and iPhone-tab are disabled with their line', async () => {
    const cases = [
      [{}, { checked: false, disabled: false, line: REMINDER_COPY.off }],
      [{ push: false }, { checked: false, disabled: true, line: REMINDER_COPY.unsupported }],
      [{ push: false, ios: true }, { checked: false, disabled: true, line: REMINDER_COPY.install }],
      [{ permission: 'denied' }, { checked: false, disabled: true, line: REMINDER_COPY.blocked }],
    ];
    for (const [options, want] of cases) {
      forgetReminders();
      await deviceFor(options);
      const html = render(<PickReminderSettings/>);
      expect(markupProblems(html)).toEqual([]);
      const input = html.match(/<input[^>]*role="switch"[^>]*>/)[0];
      expect(/\schecked=""/.test(input), JSON.stringify(options)).toBe(want.checked);
      expect(/\sdisabled=""/.test(input), JSON.stringify(options)).toBe(want.disabled);
      expect(html).toContain(want.line);
    }
    forgetReminders();
    server.rows.add(`${LUKE}|${ENDPOINT}`);
    await deviceFor({ permission: 'granted', subscribed: true });
    expect(render(<PickReminderSettings/>)).toMatch(/<input[^>]*checked=""[^>]*role="switch"|<input[^>]*role="switch"[^>]*checked=""/);
    expect(render(<PickReminderSettings/>, false)).not.toContain('role="switch"');
  });

  it('the prompt: one secondary "Turn on reminders" and "Not now", no lime button; the iPhone tab gets the Home Screen line only', async () => {
    await deviceFor({});
    const html = render(<ReminderPrompt/>);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain(REMINDER_COPY.promptTitle);
    expect(html).toContain('>Turn on reminders<');
    expect(html).toContain('>Not now<');
    expect(html).not.toContain('gx-btn--primary');
    expect(render(<ReminderPrompt/>, false)).toBe('<div class="gx"></div>');
    forgetReminders();
    await deviceFor({ push: false, ios: true });
    const tab = render(<ReminderPrompt/>);
    expect(tab).toContain(REMINDER_COPY.install);
    expect(tab).not.toContain('Turn on reminders');
    expect(tab).toContain('>Not now<');
    forgetReminders();
    (await deviceFor({})).dismiss();
    expect(render(<ReminderPrompt/>)).toBe('<div class="gx"></div>');
  });
});
