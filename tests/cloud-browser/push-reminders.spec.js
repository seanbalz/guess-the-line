import { test, expect } from '@playwright/test';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// D-28 opt-in web push on the real community home and Settings, with the real handler and
// migrations on PGlite for everything except /push/*, which a spec-owned mock answers.
// PushManager, the service worker container and the permission prompt are mocked where a
// test turns reminders on: headless Chrome has no push service to subscribe to.
const REMIND = 'Remind me 2 hours before picks lock';
const PUBLIC_KEY = `B${'Q'.repeat(86)}`;

async function mockPushRoutes(page) {
  const push = { subscribed: false, requests: [] };
  await page.route(`${SUPABASE}/functions/v1/gtl-api/push/**`, async route => {
    const req = route.request(), action = new URL(req.url()).pathname.split('/').at(-1), body = req.postDataJSON();
    push.requests.push({ action, body, auth: req.headers().authorization });
    if (action === 'subscribe') push.subscribed = true;
    if (action === 'unsubscribe') push.subscribed = false;
    const reply = action === 'status' ? { configured: true, publicKey: PUBLIC_KEY, subscribed: push.subscribed, devices: push.subscribed ? 1 : 0 }
      : { subscribed: push.subscribed, devices: push.subscribed ? 1 : 0, ...(action === 'unsubscribe' ? { removed: true } : {}) };
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  return push;
}

/** A browser that supports push, with a counting service worker container and permission prompt. */
const mockPushBrowser = () => {
  const state = window.__push = { registered: 0, subscribed: 0, unsubscribed: 0, unregistered: 0, permissionRequests: 0, permission: 'default', keyBytes: 0, url: null };
  let registration = null, current = null;
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/playwright-device',
    toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) } }; },
    async unsubscribe() { state.unsubscribed++; current = null; return true; },
  };
  const pushManager = { getSubscription: async () => current, subscribe: async options => { state.subscribed++; state.keyBytes = options.applicationServerKey.length; current = subscription; return subscription; } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: async url => { state.registered++; state.url = url; registration = { pushManager, unregister: async () => { state.unregistered++; registration = null; return true; } }; return registration; },
    getRegistration: async () => registration, getRegistrations: async () => (registration ? [registration] : []),
  } });
  if (!('PushManager' in window)) window.PushManager = function PushManager() {};
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => state.permission });
  Notification.requestPermission = async () => { state.permissionRequests++; state.permission = 'granted'; return 'granted'; };
};

async function openSettings(page) {
  await page.getByRole('button', { name: /Groups & games/ }).click();
  await page.locator('.hub-game').filter({ hasText: 'Triple Threat' }).getByRole('button', { name: 'Open game' }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.' })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Settings & setup', exact: true }).click();
  return page.getByRole('region', { name: 'Pick reminders' });
}

test('no service worker is registered and no push request is made before the player opts in', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { groupScreens: true }), push = await mockPushRoutes(page);
  try {
    await signIn(page, 'luke');
    await expect(page.locator('.picks-due')).toContainText('picks due');
    const panel = await openSettings(page);
    await expect(panel).toContainText('Get one notification 2 hours before picks lock');
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    expect(await page.evaluate(() => caches.keys())).toEqual([]);
    expect(push.requests).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) test(`picks-due reminder prompt fits, reads at 16px and has 44px targets at ${width}px ${theme}`, async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await page.addInitScript(mockPushBrowser);
  await page.addInitScript(value => { try { localStorage.setItem('gtl.theme', value); } catch { /* Private mode. */ } }, theme);
  const world = await communityWorld(page, baseURL), push = await mockPushRoutes(page);
  try {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'luke');
    const prompt = page.locator('.picks-due').getByRole('button', { name: REMIND, exact: true });
    await expect(prompt).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    const box = await prompt.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await prompt.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.__push.registered)).toBe(0);
    expect(push.requests).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('turning reminders on from the picks-due card, then off from Settings', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await page.addInitScript(mockPushBrowser);
  const world = await communityWorld(page, baseURL, { groupScreens: true }), push = await mockPushRoutes(page);
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await signIn(page, 'luke');
    await page.locator('.picks-due').getByRole('button', { name: REMIND, exact: true }).click();
    await expect(page.locator('.picks-due')).toContainText('Reminder on.');
    const counts = await page.evaluate(() => window.__push);
    expect(counts).toMatchObject({ permissionRequests: 1, registered: 1, subscribed: 1, url: '/sw.js', keyBytes: 65 });
    // The key is read only on the click; one status read afterwards confirms the server row.
    await expect.poll(() => push.requests.map(r => r.action)).toEqual(['status', 'subscribe', 'status']);
    expect(push.requests[1].body).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/playwright-device', keys: { p256dh: `B${'A'.repeat(86)}`, auth: 'A'.repeat(22) } });
    expect(push.requests.every(r => /^Bearer /.test(r.auth))).toBe(true);

    const panel = await openSettings(page);
    await expect(panel).toContainText('This device: On');
    const off = panel.getByRole('button', { name: 'Turn off reminders', exact: true });
    expect((await off.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await off.click();
    await expect(panel).toContainText('Reminders are off on this device.');
    await expect(panel).toContainText('This device: Off');
    expect(await page.evaluate(() => window.__push)).toMatchObject({ unsubscribed: 1, unregistered: 1 });
    expect(push.requests.at(-1)).toMatchObject({ action: 'unsubscribe', body: { endpoint: 'https://fcm.googleapis.com/fcm/send/playwright-device' } });
    expect(push.subscribed).toBe(false);
    await expect(panel.getByRole('button', { name: REMIND, exact: true })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an iPhone Safari tab without PushManager explains Add to Home Screen and iOS 16.4', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await page.addInitScript(() => {
    delete window.PushManager;
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  });
  const world = await communityWorld(page, baseURL, { groupScreens: true }), push = await mockPushRoutes(page);
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await signIn(page, 'luke');
    await expect(page.locator('.picks-due')).toContainText('Reminders on iPhone: add Guess The Line to your Home Screen first (iOS 16.4 or later).');
    await expect(page.locator('.picks-due').getByRole('button', { name: REMIND })).toHaveCount(0);
    const panel = await openSettings(page);
    await expect(panel).toContainText('iOS 16.4 or later');
    await expect(panel).toContainText('Add to Home Screen');
    await expect(panel.getByRole('button')).toHaveCount(0);
    expect(push.requests).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
