import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn, switchAccount } from './community-world.mjs';

// Redesign build plan, stage 9: the switch (section 3.2; D-38, D-39), on the real Community home with the real
// handler and every migration (ALL) on local PGlite, at 390 x 844. "Try the new app" is in the Community footer
// for every signed-in member; the choice is kept on this device and the page reloads into the lazy NextApp (the
// stage 10 shell, reading through the stage 11 data layer); "Use the old app" comes back; a blocked chunk falls
// back to the old app; ?app=classic always forces the old app; storage that refuses the choice keeps the old app and
// says so. Never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });

const TRY = 'Try the new app', OLD = 'Use the old app';
const NOTE = { blocked: 'This browser isn’t saving settings, so the new app can’t open here.', fellBack: 'The new app couldn’t open, so you’re back in the current app.' };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const communityHome = page => page.getByRole('heading', { name: 'Community', exact: true });
// The new app's frame (stage 10): its tab bar, on Home.
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
const tryButton = page => page.locator('.hub-bottom').getByRole('button', { name: TRY, exact: true });
/** The new app's "Use the old app": in the avatar menu (section 3.2), since stage 12 replaced Home's "coming next" card. */
async function oldAppButton(page) {
  await page.getByRole('button', { name: 'Your menu' }).click();
  return page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: OLD, exact: true });
}
const saved = page => page.evaluate(() => localStorage.getItem('gtl.app'));
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
      if (el.getBoundingClientRect().right > innerWidth + 0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report).toEqual({ targets: [], small: [], clipped: [] });
}
async function axe(page, include) {
  const result = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze();
  return result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

test('a signed-in member sees "Try the new app", switches to the new app, and comes back', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(communityHome(page)).toBeVisible();
    await expect(tryButton(page)).toBeVisible();
    expect(await saved(page), 'nothing is chosen until the member taps').toBeNull();
    expect(named(await assets(page), 'NextApp'), 'the old app never downloads the new one').toEqual([]);
    await phoneChecks(page, '.hub-bottom');

    const calls = apiCalls(page);
    await tryButton(page).click();
    await expect(newApp(page)).toBeVisible();
    expect(await saved(page)).toBe('next');
    await expect(page.locator('.hub-shell')).toHaveCount(0);
    const loaded = await assets(page);
    expect(named(loaded, 'NextApp').length, 'the new app is its own chunk and stylesheet').toBe(2);
    expect(named(loaded, 'GameHub'), 'the new app never downloads the old one').toEqual([]);
    await expect(page.locator('.gx')).toHaveCount(1);
    await expect(await oldAppButton(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await phoneChecks(page, '.gx');

    // A reload keeps the device's choice.
    await page.reload();
    await expect(newApp(page)).toBeVisible();
    // Stage 11: the new app reads the account and the Community once per page load, and writes nothing.
    expect(calls).toEqual(['GET /functions/v1/gtl-api/lobby', 'POST /functions/v1/gtl-api/community/read', 'GET /functions/v1/gtl-api/lobby', 'POST /functions/v1/gtl-api/community/read']);

    await (await oldAppButton(page)).click();
    await expect(communityHome(page)).toBeVisible();
    expect(await saved(page)).toBe('classic');
    await expect(page.locator('.gx')).toHaveCount(0);
    expect(named(await assets(page), 'NextApp')).toEqual([]);
    await expect(tryButton(page)).toBeVisible();
    await expect(page.locator('.try-new-app-note')).toHaveText('');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('every signed-in member sees the button, the commissioner and players alike (D-39), and can sign out of the new app', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'sean');
    await expect(communityHome(page)).toBeVisible();
    await expect(tryButton(page)).toBeVisible();
    await switchAccount(page, 'troy');
    await expect(communityHome(page)).toBeVisible();
    await expect(tryButton(page)).toBeVisible();
    await tryButton(page).click();
    await expect(newApp(page)).toBeVisible();
    expect(await signedInAs(page, 'Troy Fixture')).toBe('Signed in as troy@example.test');
    await page.getByRole('button', { name: 'Your menu' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
    // The choice belongs to the device, not the account: the next member on this device lands in the new app too.
    await signIn(page, 'luke', { navigate: false });
    await expect(newApp(page)).toBeVisible();
    expect(await signedInAs(page, 'Luke Fixture')).toBe('Signed in as luke@example.test');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a blocked new-app chunk falls back to the old app, forgets the choice and says so', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  const blocked = '**/assets/NextApp-*.js';
  await page.route(blocked, route => route.abort('failed'));
  try {
    await signIn(page, 'luke');
    await expect(communityHome(page)).toBeVisible();
    await tryButton(page).click();
    await expect(page.locator('.try-new-app-note')).toHaveText(new RegExp(`^${NOTE.fellBack}`));
    await expect(communityHome(page)).toBeVisible();
    await expect(page.locator('.gx')).toHaveCount(0);
    expect(await saved(page), 'the fallback clears gtl.app').toBeNull();
    await phoneChecks(page, '.hub-bottom');
    // With the chunk back, the same button opens the new app.
    await page.unroute(blocked);
    await tryButton(page).click();
    await expect(newApp(page)).toBeVisible();
    expect(await saved(page)).toBe('next');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('?app=classic always forces the old app; "Try the new app" from there drops the parameter', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await tryButton(page).click();
    await expect(newApp(page)).toBeVisible();
    await page.goto('/?app=classic');
    await expect(communityHome(page)).toBeVisible();
    await expect(page.locator('.gx')).toHaveCount(0);
    expect(await saved(page), 'the escape hatch is kept as this device\'s choice').toBe('classic');
    await page.goto('/');
    await expect(communityHome(page)).toBeVisible();
    await page.goto('/?app=classic');
    await expect(communityHome(page)).toBeVisible();
    await tryButton(page).click();
    await expect(newApp(page)).toBeVisible();
    expect(new URL(page.url()).searchParams.has('app')).toBe(false);
    expect(await saved(page)).toBe('next');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('storage that refuses the choice keeps the old app open and says why', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'gtl.app') throw new DOMException('Blocked for this test.', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(communityHome(page)).toBeVisible();
    await page.evaluate(() => { window.__sameDocument = true; });
    await tryButton(page).click();
    await expect(page.locator('.try-new-app-note')).toHaveText(new RegExp(`^${NOTE.blocked}`));
    expect(await page.evaluate(() => window.__sameDocument), 'no reload into an app the next load would not open').toBe(true);
    await expect(communityHome(page)).toBeVisible();
    expect(await saved(page)).toBeNull();
    await phoneChecks(page, '.hub-bottom');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('axe in dark and light at 390 and 320: the new-app frame and the old footer', async ({ page, baseURL }, testInfo) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await signIn(page, 'luke');
    await expect(communityHome(page)).toBeVisible();
    const found = {};
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.evaluate(() => localStorage.setItem('gtl.app', 'classic'));
      await page.reload();
      await expect(communityHome(page)).toBeVisible();
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await phoneChecks(page, '.hub-bottom');
        found[`old footer ${theme} ${width}`] = await axe(page, '.hub-bottom');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await tryButton(page).click();
      await expect(newApp(page)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await phoneChecks(page, '.gx');
        found[`new app ${theme} ${width}`] = await axe(page, 'body');
        await testInfo.attach(`new-app-${theme}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await (await oldAppButton(page)).click();
      await expect(communityHome(page)).toBeVisible();
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
    await expect(communityHome(page)).toBeVisible();
    await tryButton(page).click();
    const note = page.locator('.try-new-app-note');
    await expect(note).toHaveText(new RegExp(`^${NOTE.fellBack}`));
    await expect(note).toHaveAttribute('role', 'status');
    // A status region that appears with its words already in it is not announced reliably: it must arrive empty, then change.
    const inserted = await page.evaluate(() => window.__notesInserted);
    expect(inserted.length, 'the note was put on the page after the reload').toBeGreaterThan(0);
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
    await expect(communityHome(page)).toBeVisible();
    await tryButton(page).click();
    await expect(page.locator('.try-new-app-note')).toHaveText(new RegExp(`^${NOTE.fellBack}`));
    await expect(communityHome(page)).toBeVisible();
    await expect(page.locator('.gx')).toHaveCount(0);
    expect(served, 'the new app\'s chunk was served').toBeGreaterThan(0);
    expect(await saved(page), 'the fallback clears gtl.app').toBeNull();
    // A reload stays in the old app: the choice is gone, so the failing chunk is never asked for again.
    served = 0;
    await page.reload();
    await expect(communityHome(page)).toBeVisible();
    await expect(page.locator('.try-new-app-note')).toHaveText('');
    expect(served).toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
