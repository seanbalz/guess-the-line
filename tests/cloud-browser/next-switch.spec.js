import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// D-60, step 1 of retiring the old app: everyone uses the new app. On the real app with the real handler and every
// migration (ALL) on local PGlite, at 390 x 844. Contracts:
// - every signed-in member (commissioner and players) lands in the new app; the old app's chunks never load;
// - Menu › "Older records and tools" opens the old app for that address only (`?app=classic`, never saved); a reload
//   stays there; its footer's "Back to the new app" drops the parameter; the next plain visit is the new app;
// - a device's old saved "classic" choice no longer counts and is forgotten, other preferences kept; storage that
//   throws still opens the new app;
// - a new app that cannot load (blocked chunk) or throws while rendering falls back to the old app on that page and
//   says so through a status note that arrives empty; the next visit tries the new app again;
// - phone checks and axe in Dark and Light at 390 and 320 on the new app and the old footer.
// Never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });

const OLDER = 'Older records and tools', BACK = 'Back to the new app';
const NOTE = { fellBack: 'The new app couldn’t open, so the old app opened instead.' };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const communityHome = page => page.getByRole('heading', { name: 'Community', exact: true });
// The new app's frame (stage 10): its tab bar.
const newApp = page => page.getByRole('navigation', { name: 'Main' });
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
const backButton = page => page.locator('.hub-bottom').getByRole('button', { name: BACK, exact: true });
/** The Menu's one everyday way into the old app. */
async function olderRecords(page) {
  await page.getByRole('button', { name: 'Your menu' }).click();
  return page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: OLDER, exact: true });
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

test('a signed-in member lands in the new app; Older records and tools opens the old app for that visit only', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    const calls = apiCalls(page);
    await signIn(page, 'luke');
    await expect(newApp(page)).toBeVisible();
    expect(await saved(page), 'nothing is saved').toBeNull();
    const loaded = await assets(page);
    expect(named(loaded, 'NextApp').length, 'the new app is its own chunk and stylesheet').toBe(2);
    expect(named(loaded, 'GameHub'), 'the new app never downloads the old one').toEqual([]);
    await expect(page.locator('.hub-shell')).toHaveCount(0);
    await phoneChecks(page, '.gx');
    // Shared account and Community reads happen once per page load.
    await expect.poll(() => calls.filter(call => call === 'GET /functions/v1/gtl-api/lobby').length).toBe(1);

    // The Menu's one way into the old app: a new page at ?app=classic, nothing saved.
    await (await olderRecords(page)).click();
    await expect(communityHome(page)).toBeVisible();
    expect(appParam(page)).toBe('classic');
    expect(await saved(page)).toBeNull();
    // The only new-app styled element in the old app is the NBA section's NFL/NBA selector (PR #167); no new-app frame mounts.
    await expect(page.locator('.gx:not(.gx-nba-sport-entry)')).toHaveCount(0);
    expect(named(await assets(page), 'NextApp'), 'the old page never downloads the new app').toEqual([]);
    await expect(backButton(page)).toBeVisible();
    await expect(page.locator('.try-new-app-note')).toHaveText('');
    await phoneChecks(page, '.hub-bottom');

    // A reload keeps the address, so it stays in the old app.
    await page.reload();
    await expect(communityHome(page)).toBeVisible();

    // Back to the new app drops the parameter.
    await backButton(page).click();
    await expect(newApp(page)).toBeVisible();
    expect(appParam(page)).toBeNull();

    // And any plain visit is the new app.
    await page.goto('/');
    await expect(newApp(page)).toBeVisible();
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

test('a blocked new-app chunk falls back to the old app on that page and says so; the next visit tries again', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  const blocked = '**/assets/NextApp-*.js';
  await page.route(blocked, route => route.abort('failed'));
  try {
    await signIn(page, 'luke');
    await expect(page.locator('.try-new-app-note')).toHaveText(new RegExp(`^${NOTE.fellBack}`));
    await expect(communityHome(page)).toBeVisible();
    // The fallback is the old app, which keeps the NBA section's NFL/NBA selector (PR #167) and no new-app frame.
    await expect(page.locator('.gx:not(.gx-nba-sport-entry)')).toHaveCount(0);
    await expect(backButton(page)).toBeVisible();
    await phoneChecks(page, '.hub-bottom');
    // With the chunk back, the next visit is the new app.
    await page.unroute(blocked);
    await page.reload();
    await expect(newApp(page)).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('axe in dark and light at 390 and 320: the new app and the old footer', async ({ page, baseURL }, testInfo) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(newApp(page)).toBeVisible();
    const found = {};
    for (const theme of ['dark', 'light']) {
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
      await (await olderRecords(page)).click();
      await expect(communityHome(page)).toBeVisible();
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await phoneChecks(page, '.hub-bottom');
        found[`old footer ${theme} ${width}`] = await axe(page, '.hub-bottom');
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(found).toEqual(Object.fromEntries(Object.keys(found).map(key => [key, []])));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

/** Records the text each `.try-new-app-note` holds when it is put on the page (reset on every page load). */
async function recordNoteInsertions(page) {
  await page.addInitScript(() => {
    window.__notesInserted = [];
    const record = node => {
      if (node.nodeType !== 1) return;
      for (const el of [node, ...node.querySelectorAll('.try-new-app-note')]) if (el.matches('.try-new-app-note')) window.__notesInserted.push(el.textContent);
    };
    new MutationObserver(changes => { for (const change of changes) change.addedNodes.forEach(record); }).observe(document, { childList: true, subtree: true });
  });
}

test('after a fallback the note is on the page before its words arrive, so a screen reader announces why the old app came back', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await recordNoteInsertions(page);
  await page.route('**/assets/NextApp-*.js', route => route.abort('failed'));
  try {
    await signIn(page, 'luke');
    const note = page.locator('.try-new-app-note');
    await expect(note).toHaveText(new RegExp(`^${NOTE.fellBack}`));
    await expect(note).toHaveAttribute('role', 'status');
    // A status region that appears with its words already in it is not announced reliably: it must arrive empty, then change.
    const inserted = await page.evaluate(() => window.__notesInserted);
    expect(inserted.length, 'the note was put on the page').toBeGreaterThan(0);
    expect(inserted.filter(text => text !== ''), 'every insertion was empty').toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a new app that throws while rendering, after its chunk has loaded, falls back to the old app the same way', async ({ page, baseURL }) => {
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
    await expect(page.locator('.try-new-app-note')).toHaveText(new RegExp(`^${NOTE.fellBack}`));
    await expect(communityHome(page)).toBeVisible();
    await expect(page.locator('.gx:not(.gx-nba-sport-entry)')).toHaveCount(0);
    expect(served, 'the new app\'s chunk was served').toBeGreaterThan(0);
    expect(await saved(page)).toBeNull();
    // Nothing is remembered: the next visit asks for the new app again.
    served = 0;
    await page.reload();
    await expect(page.locator('.try-new-app-note')).toHaveText(new RegExp(`^${NOTE.fellBack}`));
    expect(served).toBeGreaterThan(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
