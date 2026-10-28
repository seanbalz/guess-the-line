import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// The new app is the only app (D-60 step 2, RETIRE-02, October 28, 2026). On the real app with the real handler and every
// migration (ALL) on local PGlite, at 390 x 844. Contracts:
// - every signed-in member (commissioner and players) lands in the new app; no old-app chunk exists or loads;
// - an old `?app=classic` bookmark opens the new app, and the parameter is dropped from the address (the rest kept);
// - a device's old saved "classic" choice is forgotten, other preferences kept; storage that throws still opens the new app;
// - a new app that cannot load (blocked chunk) or throws while rendering shows a "Reload the app" screen, never the old
//   app; once the chunk is back, the reload opens the new app;
// - phone checks and axe in Dark and Light at 390 and 320 on the new app and the reload screen.
// Never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });

const RELOAD = 'Reload the app';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// The new app's frame (stage 10): its tab bar.
const newApp = page => page.getByRole('navigation', { name: 'Main' });
const reloadScreen = page => page.getByRole('alert').filter({ has: page.getByRole('button', { name: RELOAD, exact: true }) });
/** Who the new app's menu says is signed in, read from the avatar menu (then closed again). */
async function signedInAs(page, displayName) {
  await page.getByRole('button', { name: 'Your menu' }).click();
  const account = page.getByRole('dialog', { name: 'Menu' }).locator('.gx-menu-account');
  await expect(account.getByText(displayName, { exact: true })).toBeVisible();
  const identity = account.getByText(/^Signed in as /);
  await expect(identity).toHaveCount(1);
  const text = await identity.textContent();
  await page.keyboard.press('Escape');
  return text;
}
const saved = page => page.evaluate(() => localStorage.getItem('gtl.app'));
const appParam = page => new URL(page.url()).searchParams.get('app');
/** Script and style files this document loaded (resource timing, so a reload starts a fresh list). */
const assets = page => page.evaluate(() => performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname).filter(p => /\/assets\/[^/]+\.(js|css)$/.test(p)));
const named = (list, name) => list.filter(p => new RegExp(`/assets/${name}-[^/]+\\.(js|css)$`).test(p));
/** gtl-api calls from now on. */
function apiCalls(page) {
  const calls = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/')) calls.push(`${request.method()} ${url.pathname}`); });
  return calls;
}

/** Phone checks for everything under `root`: no side scroll, 44px targets, no text under 12px, nothing clipped. */
async function phoneChecks(page, root) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no side scroll').toBe(true);
  const report = await page.locator(root).first().evaluate(scope => {
    const visible = el => el.getClientRects().length > 0;
    const targets = [...scope.querySelectorAll('button,a[href],input,select,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      // Screen-reader-only text (the kit's .gx-sr-only, since stage 12's Home ranks) is clipped by design, as the later specs read it.
      if (!visible(el) || el.closest('.gx-sr-only') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 0.5 || r.left < -0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report).toEqual({ targets: [], small: [], clipped: [] });
}
async function axe(page, include) {
  const result = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze();
  return result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

test('a signed-in member lands in the new app; the Menu has no way into an old app', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    const calls = apiCalls(page);
    await signIn(page, 'luke');
    await expect(newApp(page)).toBeVisible();
    expect(await saved(page), 'nothing is saved').toBeNull();
    const loaded = await assets(page);
    expect(named(loaded, 'NextApp').length, 'the new app is its own chunk and stylesheet').toBe(2);
    expect(named(loaded, 'GameHub'), 'there is no old app to download').toEqual([]);
    await expect(page.locator('.hub-shell')).toHaveCount(0);
    await phoneChecks(page, '.gx');
    // Shared account and Community reads happen once per page load.
    await expect.poll(() => calls.filter(call => call === 'GET /functions/v1/gtl-api/lobby').length).toBe(1);
    await page.getByRole('button', { name: 'Your menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Older records and tools' })).toHaveCount(0);
    await expect(menu.getByText(/old app/i)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an old ?app=classic bookmark opens the new app and drops the parameter, keeping the rest of the address', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(newApp(page)).toBeVisible();
    await page.goto('/?app=classic&keep=1#home');
    await expect(newApp(page)).toBeVisible();
    expect(appParam(page)).toBeNull();
    expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
    expect(new URL(page.url()).hash).toBe('#home');
    await expect(page.locator('.hub-shell')).toHaveCount(0);
    expect(await saved(page)).toBeNull();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an old saved "classic" choice on a device no longer counts and is forgotten; other preferences stay', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(newApp(page)).toBeVisible();
    await page.evaluate(() => { localStorage.setItem('gtl.app', 'classic'); localStorage.setItem('gtl.theme', 'light'); });
    await page.reload();
    await expect(newApp(page)).toBeVisible();
    expect(await saved(page), 'the old choice is forgotten').toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('gtl.theme')), 'other preferences are kept').toBe('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('storage that throws still opens the new app', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await page.addInitScript(() => {
    const original = { getItem: Storage.prototype.getItem, setItem: Storage.prototype.setItem, removeItem: Storage.prototype.removeItem };
    for (const name of Object.keys(original)) {
      Storage.prototype[name] = function (key, ...rest) {
        if (key === 'gtl.app') throw new DOMException('Blocked for this test.', 'SecurityError');
        return original[name].call(this, key, ...rest);
      };
    }
  });
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(newApp(page)).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the commissioner and players alike land in the new app, and the next member on the device does too', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'sean');
    await expect(newApp(page)).toBeVisible();
    expect(await signedInAs(page, 'Sean Fixture')).toBe('Signed in as sean@example.test');
    await page.getByRole('button', { name: 'Your menu' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
    await signIn(page, 'troy', { navigate: false });
    await expect(newApp(page)).toBeVisible();
    expect(await signedInAs(page, 'Troy Fixture')).toBe('Signed in as troy@example.test');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a blocked new-app chunk shows "Reload the app", never the old app; with the chunk back the reload opens the new app', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  const blocked = '**/assets/NextApp-*.js';
  await page.route(blocked, route => route.abort('failed'));
  try {
    await signIn(page, 'luke');
    await expect(reloadScreen(page)).toBeVisible();
    await expect(page.locator('.hub-shell')).toHaveCount(0);
    await phoneChecks(page, '#main');
    await page.unroute(blocked);
    await reloadScreen(page).getByRole('button', { name: RELOAD, exact: true }).click();
    await expect(newApp(page)).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a new app that throws while rendering, after its chunk has loaded, shows the same reload screen', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  // The chunk is served and runs (it loads the real chunk too), but its root component throws while rendering: a bug outside
  // the shell's own error boundaries. main.jsx's outer boundary must catch it like a chunk that never loaded.
  let served = 0;
  await page.route('**/assets/NextApp-*.js', route => {
    served += 1;
    const real = new URL(route.request().url());
    real.searchParams.set('loaded', '1');
    return route.fulfill({ contentType: 'text/javascript', body: `import ${JSON.stringify(real.href)};\nexport default function NextApp() { throw new Error('The new app failed while rendering (fixture).'); }\n` });
  });
  try {
    await signIn(page, 'luke');
    await expect(reloadScreen(page)).toBeVisible();
    await expect(page.locator('.hub-shell')).toHaveCount(0);
    expect(served, 'the new app\'s chunk was served').toBeGreaterThan(0);
    expect(await saved(page)).toBeNull();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('axe in dark and light at 390 and 320: the new app and the reload screen', async ({ page, baseURL }, testInfo) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(newApp(page)).toBeVisible();
    const found = {};
    for (const theme of ['dark', 'light']) {
      await page.unroute('**/assets/NextApp-*.js');
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.goto('/');
      await expect(newApp(page)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await phoneChecks(page, '.gx');
        found[`new app ${theme} ${width}`] = await axe(page, 'body');
        await testInfo.attach(`new-app-${theme}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.route('**/assets/NextApp-*.js', route => route.abort('failed'));
      await page.goto('/');
      await expect(reloadScreen(page)).toBeVisible();
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await phoneChecks(page, '#main');
        found[`reload screen ${theme} ${width}`] = await axe(page, '#main');
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(found).toEqual(Object.fromEntries(Object.keys(found).map(key => [key, []])));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
