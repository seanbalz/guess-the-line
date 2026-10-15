import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { ALL } from '../migrations.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Redesign build plan, stage 10: the shell frame, at 390 x 844 (section 4.1).
// Part 1 runs the real app (main.jsx, AuthGate, the lazy NextApp) on the real handler with every migration (ALL) on
// local PGlite: the tabs, the address and Back, a reload, the old app's links, the avatar menu, no unexpected origins,
// no writes while browsing (since stage 11 the data layer reads /lobby and /community/read, nothing else), axe and
// screenshots.
// Part 2 mounts the same Shell in a test harness (tests/fixtures/next-shell/harness.jsx, bundled here with Vite and
// served from a fake origin) with test screens and layers for what the stage 10 tabs do not use yet: the dock, a tab
// and a layer that throw, the dialog, toast and sheet fixes the stage 8 review asked for, popover, overlay and page.
// Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const OLD = 'Use the old app';
const TABS = ['Home', 'Play', 'Bets', 'Lines', 'League'];
const tabBar = page => page.getByRole('navigation', { name: 'Main' });
// A tab by its label; its name may add the counter's words ("Play, 2 ballots due", stage 11).
const tab = (page, name) => tabBar(page).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const title = (page, name) => page.getByRole('heading', { name, level: 1, exact: true });
const sheet = (page, name) => page.getByRole('dialog', { name, exact: true });
const inside = (page, selector) => page.evaluate(sel => !!document.activeElement?.closest(sel), selector);
const focusOnBody = page => page.evaluate(() => document.activeElement === document.body || !document.activeElement);

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/** Phone rules for everything under `root` (section 4.1): no side scroll, 44px targets, no text under 12px, nothing clipped. */
async function phoneChecks(page, root = '.gx') {
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no side scroll').toBe(true);
  const report = await page.locator(root).first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open])'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || el.closest('.gx-sr-only, .sr-only') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 0.5 || r.left < -0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report).toEqual({ targets: [], small: [], clipped: [] });
}

async function axe(page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

/** Every request to gtl-api from now on. */
function apiCalls(page) {
  const calls = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/')) calls.push(`${request.method()} ${url.pathname}`); });
  return calls;
}
/**
 * What is left of `calls` after the shared reads (stage 11, and stage 13's `/personal` and the board's one `/wind/read`
 * for its D-45 weather chips on Lines): the writes, of which browsing makes none.
 */
const writes = calls => calls.filter(call => !['GET /functions/v1/gtl-api/lobby', 'POST /functions/v1/gtl-api/community/read', 'GET /functions/v1/gtl-api/personal', 'POST /functions/v1/gtl-api/wind/read', 'POST /functions/v1/gtl-api/social/read'].includes(call));

/** Loads the page at `fragment` as a new document (a fragment change alone stays in the page that is open). */
async function load(page, fragment = '') {
  await page.goto('about:blank');
  await page.goto(`/${fragment}`);
}

/** Signs in on the old app, then opens the new one on this device (gtl.app = next), at `fragment`. */
async function openNewApp(page, baseURL, fragment = '') {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await signIn(page, 'luke');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  const calls = apiCalls(page);
  await load(page, fragment);
  await expect(tabBar(page)).toBeVisible();
  return { world, calls };
}

test.describe('the real app', () => {
  test('five working tabs; the tab is in the address, survives a reload, and Back moves between tabs', async ({ page, baseURL }) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world, calls } = await openNewApp(page, baseURL);
    try {
      await expect(title(page, 'Home')).toBeVisible();
      await expect(tabBar(page).locator('.gx-tab-label')).toHaveText(TABS);
      await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('button', { name: 'League: Community. Switch league' })).toContainText('Community');
      await expect(page.getByRole('button', { name: 'Your menu' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Guess The Line, home' })).toBeVisible();
      // Home shows already, so it comes last: tapping the tab showing adds no history entry.
      for (const name of [...TABS.slice(1), 'Home']) {
        await tab(page, name).click();
        await expect(title(page, name)).toBeVisible();
        await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
        await expect(tabBar(page).locator('[aria-current]')).toHaveCount(1);
        if (name === 'Lines') {
          // Stage 13: Lines is the read-only board (tests/cloud-browser/next-lines.spec.js covers it).
          await expect(page.locator('.gx-l-group').first()).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Coming next', level: 2 })).toHaveCount(0);
        } else if (name === 'Home') {
          // Stage 12: Home is the read-only hero and tiles (tests/cloud-browser/next-home.spec.js covers it).
          await expect(page.locator('[data-home="hero"]')).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Coming next', level: 2 })).toHaveCount(0);
        } else {
          await expect(page.getByRole('heading', { name: 'Coming next', level: 2 })).toHaveCount(0);
        }
        expect(new URL(page.url()).hash).toBe(`#${name.toLowerCase()}`);
        await phoneChecks(page);
      }
      // The tab bar and top bar stay put while the page scrolls under them.
      const bar = await tabBar(page).boundingBox();
      expect(Math.round(bar.y + bar.height)).toBe(844);
      await tab(page, 'Lines').click();
      await page.reload();
      await expect(title(page, 'Lines')).toBeVisible();
      await expect(tab(page, 'Lines')).toHaveAttribute('aria-current', 'page');
      // Entries: Play, Bets, Lines, League, Home, Lines (reloaded).
      await page.goBack();
      await expect(title(page, 'Home')).toBeVisible();
      await page.goBack();
      await expect(title(page, 'League')).toBeVisible();
      await page.goForward();
      await expect(title(page, 'Home')).toBeVisible();
      expect(writes(calls), 'browsing writes nothing').toEqual([]);
      expect(world.errors, 'no unexpected origins and no page errors').toEqual([]);
    } finally { await world.db.close(); }
  });

  test('the old app\'s links: /#picks opens Play, /#feed opens League, /#groups opens the switcher and Back closes it', async ({ page, baseURL }) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world, calls } = await openNewApp(page, baseURL, '#picks');
    try {
      await expect(title(page, 'Play')).toBeVisible();
      expect(new URL(page.url()).hash, 'read once, then written as the new app\'s own').toBe('#play');
      // Followed in the page (a fragment change, no new document), then on a fresh load.
      for (const [fragment, name, hash] of [['#feed', 'League', '#league'], ['#picks-total', 'Play', '#play'], ['#main', 'Home', '#main']]) {
        await page.goto(`/${fragment}`);
        await expect(title(page, name)).toBeVisible();
        expect(new URL(page.url()).hash).toBe(hash);
        await load(page, fragment);
        await expect(title(page, name)).toBeVisible();
        expect(new URL(page.url()).hash).toBe(hash);
      }
      const switcher = sheet(page, 'Your leagues');
      for (const fresh of [false, true]) {
        if (fresh) await load(page, '#groups');
        else await page.goto('/#groups');
        await expect(switcher).toBeVisible();
        await expect(switcher).toBeFocused();
        await expect(page.locator('.gx-app h1')).toHaveText('Home');
        await phoneChecks(page);
        await page.goBack();
        await expect(switcher).toHaveCount(0);
        await expect(title(page, 'Home')).toBeVisible();
        expect(new URL(page.url()).hash).toBe('#home');
      }
      expect(writes(calls)).toEqual([]);
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });

  test('the avatar menu: Appearance opens in place with focus kept inside, Back and Escape close it, the old app is one tap away, and Sign out works', async ({ page, baseURL }) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world, calls } = await openNewApp(page, baseURL);
    try {
      const avatar = page.getByRole('button', { name: 'Your menu' });
      await avatar.click();
      const menu = sheet(page, 'Menu');
      await expect(menu).toBeVisible();
      await expect(menu).toBeFocused();
      await expect(menu).toContainText('Signed in as luke@example.test');
      await expect(page.locator('.gx-app')).toHaveAttribute('inert', '');
      await phoneChecks(page);
      // Back (the phone's button) closes the menu and focus returns to the avatar.
      await page.goBack();
      await expect(menu).toHaveCount(0);
      await expect(avatar).toBeFocused();
      await expect(title(page, 'Home')).toBeVisible();

      // Keyboard: the menu wraps in both directions, then Profile precedes Appearance in the tab order.
      // Appearance changes the view in place and focus stays in the sheet.
      await avatar.focus();
      await page.keyboard.press('Enter');
      await expect(menu).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(menu.getByRole('button', { name: 'Close' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(menu.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(menu.getByRole('button', { name: 'Close' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(menu.getByRole('button', { name: 'Profile', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(menu.getByRole('button', { name: 'Appearance', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      const appearance = sheet(page, 'Appearance');
      await expect(appearance).toBeVisible();
      expect(await focusOnBody(page), 'focus did not fall out of the sheet').toBe(false);
      expect(await inside(page, '.gx-sheet')).toBe(true);
      await expect(appearance.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
      await expect(appearance.getByRole('switch', { name: 'Reduce motion' })).not.toBeChecked();
      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.press('Tab');
        expect(await inside(page, '.gx-sheet')).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(appearance).toHaveCount(0);
      await expect(avatar).toBeFocused();

      // "‹ Menu" goes back to the menu in place; focus stays in and Escape still closes.
      await avatar.click();
      await page.getByRole('button', { name: 'Appearance' }).click();
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(menu).toBeVisible();
      expect(await inside(page, '.gx-sheet')).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);

      expect(writes(calls), 'the menu writes nothing').toEqual([]);

      // Use the old app from the menu.
      await avatar.click();
      await menu.getByRole('button', { name: OLD }).click();
      await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('gtl.app'))).toBe('classic');
      await expect(page.locator('.gx')).toHaveCount(0);

      // Back to the new app, then Sign out from the menu.
      await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
      await load(page);
      await page.getByRole('button', { name: 'Your menu' }).click();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });

  test('axe in dark and light at 390 and 320, on a tab and with the menu open; 390 screenshots', async ({ page, baseURL }, testInfo) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world, calls } = await openNewApp(page, baseURL);
    try {
      const found = {};
      for (const theme of ['dark', 'light']) {
        await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
        await load(page, '#play');
        await expect(title(page, 'Play')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        // D-44: the top bar's logo is the G alone in the theme's accent-ink, with no tile, edge or shadow behind it or
        // on its svg.
        for (const part of ['.gx-mono', '.gx-mono-svg']) {
          const mark = page.locator(`.gx-topbar ${part}`);
          await expect(mark).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(mark).toHaveCSS('background-image', 'none');
          await expect(mark).toHaveCSS('box-shadow', 'none');
          await expect(mark).toHaveCSS('color', theme === 'dark' ? 'rgb(184, 243, 75)' : 'rgb(59, 99, 9)');
        }
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          await phoneChecks(page);
          found[`play ${theme} ${width}`] = await axe(page);
          if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-shell-play-390-${theme}.png`) });
          await page.getByRole('button', { name: 'Your menu' }).click();
          await expect(sheet(page, 'Menu')).toBeVisible();
          await phoneChecks(page);
          found[`menu ${theme} ${width}`] = await axe(page);
          if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-shell-menu-390-${theme}.png`) });
          await page.getByRole('button', { name: 'Appearance' }).click();
          await expect(sheet(page, 'Appearance')).toBeVisible();
          await phoneChecks(page);
          found[`appearance ${theme} ${width}`] = await axe(page);
          if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-shell-appearance-390-${theme}.png`) });
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: 'League: Community. Switch league' }).click();
          await expect(sheet(page, 'Your leagues')).toBeVisible();
          found[`switcher ${theme} ${width}`] = await axe(page);
          if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-shell-switcher-390-${theme}.png`) });
          await page.keyboard.press('Escape');
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      expect(found).toEqual(Object.fromEntries(Object.keys(found).map(key => [key, []])));
      expect(writes(calls)).toEqual([]);
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });
});

// ---------- part 2: the shell harness ----------
const ORIGIN = 'http://next-shell.test';
let bundle = null;
async function harnessBundle() {
  if (bundle) return bundle;
  const out = await build({
    configFile: false,
    root: path.join(ROOT, 'tests/fixtures/next-shell'),
    envDir: path.join(ROOT, 'tests/fixtures/next-shell'),
    publicDir: false,
    logLevel: 'warn',
    mode: 'production',
    plugins: [react()],
    build: {
      write: false,
      minify: false,
      modulePreload: false,
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      rollupOptions: { input: path.join(ROOT, 'tests/fixtures/next-shell/harness.jsx'), output: { entryFileNames: 'harness.js', assetFileNames: '[name][extname]', inlineDynamicImports: true } },
    },
  });
  const files = (Array.isArray(out) ? out : [out]).flatMap(o => o.output);
  const js = files.filter(f => f.type === 'chunk');
  const css = files.filter(f => f.type === 'asset' && f.fileName.endsWith('.css'));
  expect(js.map(f => f.fileName)).toEqual(['harness.js']);
  expect(css).toHaveLength(1);
  bundle = { js: js[0].code, css: String(css[0].source), cssName: css[0].fileName };
  return bundle;
}

/** Serves the harness at `fragment`; every other origin is refused and recorded. */
async function harness(page, fragment = '') {
  const { js, css, cssName } = await harnessBundle();
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shell</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/${cssName}"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`;
  const seen = { other: [] };
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) { seen.other.push(url.href); return route.abort(); }
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (url.pathname === '/harness.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: js });
    if (url.pathname === `/${cssName}`) return route.fulfill({ status: 200, contentType: 'text/css', body: css });
    return route.fulfill({ status: 404, body: '' });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/failed on purpose|The above error occurred/.test(message.text())) errors.push(message.text()); });
  await page.goto(`${ORIGIN}/${fragment}`);
  await expect(tabBar(page)).toBeVisible();
  return { seen, errors };
}
const events = page => page.evaluate(() => window.__events.slice());

test.describe('the shell harness', () => {
  test.beforeAll(async () => { test.setTimeout(120000); await harnessBundle(); });

  test('a sheet\'s sub-view changes in place: focus stays inside, Tab stays inside and Escape still closes it (stage 8 review a)', async ({ page }) => {
    const { seen, errors } = await harness(page);
    const opener = page.getByRole('button', { name: 'Open the test sheet' });
    await opener.click();
    await expect(sheet(page, 'Test sheet')).toBeFocused();
    // The control that opens the detail is gone once it shows, and the head swaps its title for the back button.
    await page.getByRole('button', { name: 'Show the detail' }).click();
    await expect(sheet(page, 'Detail')).toBeVisible();
    expect(await focusOnBody(page), 'focus did not drop to the page').toBe(false);
    await expect(sheet(page, 'Detail')).toBeFocused();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await inside(page, '.gx-sheet')).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    // The back button goes away too when it is used.
    await opener.click();
    await page.getByRole('button', { name: 'Show the detail' }).click();
    await page.getByRole('button', { name: 'Test sheet', exact: true }).click();
    await expect(sheet(page, 'Test sheet')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(seen.other).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('stacked sheets: only the top one shows; closing it returns to the one under it and to the control that opened it', async ({ page }) => {
    await harness(page);
    await page.getByRole('button', { name: 'Open the test sheet' }).click();
    await page.getByRole('button', { name: 'Show the detail' }).click();
    const another = page.getByRole('button', { name: 'Open another sheet' });
    await another.click();
    await expect(sheet(page, 'Test sheet 2')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(sheet(page, 'Detail')).toBeVisible();
    await expect(another).toBeFocused();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(title(page, 'Shell harness')).toBeVisible();
  });

  test('a dialog whose onClose leaves it open stays open and in sync, and hears each Escape once (stage 8 review c)', async ({ page }) => {
    await harness(page);
    const opener = page.getByRole('button', { name: 'Open the busy dialog' });
    await opener.click();
    const dialog = page.locator('dialog.gx-dialog');
    await expect(dialog).toHaveJSProperty('open', true);
    await expect(page.getByRole('button', { name: 'Keep playing' })).toBeFocused();
    // Two Escapes in a row with no tap between: the browser lets a page refuse only the first, then closes the dialog
    // itself. The parent still wants it open, so it comes back; onClose ran once per press.
    for (const presses of [1, 2, 3]) {
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await events(page)).filter(e => e === 'dialog-onClose').length).toBe(presses);
      await expect(dialog).toHaveJSProperty('open', true);
      await expect(page.getByRole('alertdialog', { name: 'Skip Week 6?' })).toBeVisible();
    }
    expect((await events(page)).filter(e => e === 'dialog-onClose')).toHaveLength(3);
    await page.evaluate(() => { window.__allowClose = true; });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveJSProperty('open', false);
    expect((await events(page)).filter(e => e === 'dialog-onClose')).toHaveLength(4);
    await expect(opener).toBeFocused();
    // Its own buttons close it; over a sheet, the sheet stays.
    await page.getByRole('button', { name: 'Open the test sheet' }).click();
    await sheet(page, 'Test sheet').getByRole('button', { name: 'Open the busy dialog' }).click();
    await expect(dialog).toHaveJSProperty('open', true);
    await page.getByRole('button', { name: 'Skip this week' }).click();
    await expect(dialog).toHaveJSProperty('open', false);
    await expect(sheet(page, 'Test sheet')).toBeVisible();
    expect(await events(page)).toContain('dialog-confirm');
  });

  test('toasts are announced from one live region that is always there; the toast itself has no role (stage 8 review b)', async ({ page }) => {
    await harness(page);
    const region = page.locator('.gx-sr-only[aria-live]');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveText('');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await page.evaluate(() => {
      const node = document.querySelector('.gx-sr-only[aria-live]');
      window.__region = node;
      window.__said = [];
      new MutationObserver(() => window.__said.push(`${node.getAttribute('aria-live')}:${node.textContent}`)).observe(node, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    await page.getByRole('button', { name: 'Show a toast', exact: true }).click();
    const toast = page.locator('.gx-toast');
    await expect(toast).toContainText('Change saved · SEA @ DEN');
    await expect(region).toHaveText('Change saved · SEA @ DEN');
    expect(await toast.getAttribute('role')).toBeNull();
    expect(await page.locator('.gx [role=status], .gx [role=alert]').count(), 'one region (plus the offline banner\'s)').toBe(2);
    await toast.getByRole('button', { name: 'Dismiss' }).click();
    await expect(region).toHaveText('');
    // The same words again are announced again: the region empties, then fills.
    await page.getByRole('button', { name: 'Show a toast', exact: true }).click();
    await expect(region).toHaveText('Change saved · SEA @ DEN');
    await toast.getByRole('button', { name: 'Dismiss' }).click();
    // An error is assertive, set before its words arrive, and stays until dismissed.
    await page.getByRole('button', { name: 'Show an error toast' }).click();
    await expect(region).toHaveText('Couldn’t save your reaction. Try again.');
    await expect(region).toHaveAttribute('aria-live', 'assertive');
    await page.waitForTimeout(4500);
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Dismiss' }).click();
    await expect(toast).toHaveCount(0);
    // The region resets in the effect after the toast leaves, a render later; wait for it before reading what was said.
    await expect(region).toHaveText('');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    expect(await page.evaluate(() => window.__region.isConnected && window.__region === document.querySelector('.gx-sr-only[aria-live]')), 'the same element throughout').toBe(true);
    const said = (await page.evaluate(() => window.__said)).filter((entry, i, all) => entry !== all[i - 1]);
    expect(said).toEqual([
      'polite:Change saved · SEA @ DEN', 'polite:',
      'polite:Change saved · SEA @ DEN', 'polite:',
      'assertive:', 'assertive:Couldn’t save your reaction. Try again.', 'polite:',
    ]);
    // A toast's action runs once and the toast goes.
    await page.getByRole('button', { name: 'Show a toast with an action' }).click();
    await toast.getByRole('button', { name: 'Show friends' }).click();
    await expect(toast).toHaveCount(0);
    expect((await events(page)).filter(e => e === 'toast-action')).toHaveLength(1);
  });

  test('the dock sits 8 above the tab bar, and a toast 8 above the dock (or the tab bar without one)', async ({ page }) => {
    await harness(page);
    const tabTop = (await tabBar(page).boundingBox()).y;
    await page.getByRole('button', { name: 'Show a toast', exact: true }).click();
    await settle(page);
    let toast = await page.locator('.gx-toast').boundingBox();
    expect(Math.round(tabTop - (toast.y + toast.height))).toBe(8);
    await page.locator('.gx-toast').getByRole('button', { name: 'Dismiss' }).click();
    await page.getByRole('button', { name: 'Show the dock' }).click();
    await settle(page);
    const dock = await page.locator('.gx-dock-bar').boundingBox();
    expect(Math.round(tabTop - (dock.y + dock.height))).toBe(8);
    await page.getByRole('button', { name: 'Review' }).click({ trial: true });
    await page.getByRole('button', { name: 'Show a toast', exact: true }).click();
    await settle(page);
    toast = await page.locator('.gx-toast').boundingBox();
    expect(Math.round(dock.y - (toast.y + toast.height))).toBe(8);
    await phoneChecks(page);
    // The dock goes with its tab.
    await tab(page, 'Lines').click();
    await expect(page.locator('.gx-dock-bar')).toHaveCount(0);
  });

  test('a tab that fails shows its own error card with Try again and Use the old app; the other tabs keep working', async ({ page }) => {
    const { errors } = await harness(page, '#play');
    await page.getByRole('button', { name: 'Break this tab' }).click();
    const card = page.getByRole('alert');
    await expect(card).toContainText('This tab couldn’t load.');
    await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(card.getByRole('button', { name: OLD })).toBeVisible();
    await expect(tabBar(page)).toBeVisible();
    await phoneChecks(page);
    await card.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Break this tab' })).toBeVisible();
    await page.getByRole('button', { name: 'Break this tab' }).click();
    await tab(page, 'Home').click();
    await expect(title(page, 'Shell harness')).toBeVisible();
    await tab(page, 'Play').click();
    await expect(page.getByRole('button', { name: 'Break this tab' }), 'a fresh start on the way back').toBeVisible();
    await page.getByRole('button', { name: 'Break this tab' }).click();
    await page.getByRole('alert').getByRole('button', { name: OLD }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('gtl.app'))).toBe('classic');
    expect(errors.filter(e => !/failed on purpose/.test(e))).toEqual([]);
  });

  test('a layer that fails closes and says so, with Use the old app', async ({ page }) => {
    await harness(page);
    await page.getByRole('button', { name: 'Open a broken sheet' }).click();
    await expect(page.locator('.gx-toast')).toContainText('That couldn’t open.');
    await expect(page.locator('.gx-toast').getByRole('button', { name: OLD })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.gx-app')).not.toHaveAttribute('inert', '');
  });

  test('a sheet that fails while hidden under another closes itself; the sheet showing stays and the frame is not left inert', async ({ page }) => {
    const { errors } = await harness(page);
    await page.getByRole('button', { name: 'Open a fragile sheet' }).click();
    await sheet(page, 'Fragile sheet').getByRole('button', { name: 'Open the test sheet' }).click();
    const top = sheet(page, 'Test sheet');
    await expect(top).toBeFocused();
    await top.evaluate(node => { node.dataset.probe = 'same'; });
    // The next change to the shell's state draws every sheet again, and the hidden one under the top one throws.
    await page.evaluate(() => { window.__breakFragile = true; });
    await top.getByRole('button', { name: 'Show the detail' }).click();
    await expect(page.locator('.gx-toast')).toContainText('That couldn’t open.');
    await expect(page.locator('.gx-toast').getByRole('button', { name: OLD })).toBeVisible();
    const detail = sheet(page, 'Detail');
    await expect(detail, 'the sheet the member was using stays').toBeVisible();
    await expect(detail, 'and is not drawn again from scratch').toHaveAttribute('data-probe', 'same');
    expect(await inside(page, '.gx-sheet')).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await page.locator('.gx-layer--sheet').count(), 'the failed sheet left the stack').toBe(1);
    // Closing it leaves nothing over the frame.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.gx-app')).not.toHaveAttribute('inert', '');
    await expect(title(page, 'Shell harness')).toBeVisible();
    await page.getByRole('button', { name: 'Open the test sheet' }).click();
    await expect(sheet(page, 'Test sheet')).toBeFocused();
    expect(errors.filter(e => !/failed on purpose/.test(e))).toEqual([]);
  });

  test('Back closes the top layer of each kind: page, popover, overlay; Escape too, and focus comes back', async ({ page }) => {
    await harness(page);
    await page.getByRole('button', { name: 'Open a page' }).click();
    await expect(title(page, 'Test page')).toBeVisible();
    await expect(tabBar(page)).toBeVisible();
    await page.goBack();
    await expect(title(page, 'Shell harness')).toBeVisible();
    await page.getByRole('button', { name: 'Open a page' }).click();
    await page.keyboard.press('Escape');
    await expect(title(page, 'Shell harness')).toBeVisible();
    await page.getByRole('button', { name: 'Open a page' }).click();
    await tab(page, 'Home').click();
    await expect(title(page, 'Shell harness'), 'the tab showing pops its page').toBeVisible();

    await page.getByRole('button', { name: 'Open a popover' }).click();
    await expect(page.getByRole('group', { name: 'Reactions' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('group', { name: 'Reactions' })).toHaveCount(0);

    // An overlay holds the toast queue until it closes.
    await page.getByRole('button', { name: 'Show a toast', exact: true }).click();
    await page.locator('.gx-toast').getByRole('button', { name: 'Dismiss' }).click();
    const opener = page.getByRole('button', { name: 'Show an overlay' });
    await opener.click();
    const overlay = page.getByRole('dialog', { name: 'Bullseye' });
    await expect(overlay).toBeFocused();
    await expect(page.locator('.gx-app')).toHaveAttribute('inert', '');
    await page.goBack();
    await expect(overlay).toHaveCount(0);
    await opener.click();
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('offline: the banner says so in a status region that is always there; Retry checks again', async ({ page, context }) => {
    await harness(page);
    await expect(page.locator('.gx-offline')).toHaveCount(0);
    await context.setOffline(true);
    const banner = page.locator('.gx-offline');
    await expect(banner).toContainText('You’re offline.');
    expect(await banner.evaluate(node => node.parentElement.getAttribute('role'))).toBe('status');
    await phoneChecks(page);
    await banner.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('.gx-toast')).toContainText('Can’t refresh yet.');
    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
  });

  test('Appearance and Reduce motion use the old app\'s keys, apply at once and survive a reload', async ({ page }) => {
    await harness(page);
    await page.getByRole('button', { name: 'Your menu' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('gtl.theme'))).toBe('light');
    const motion = page.getByRole('switch', { name: 'Reduce motion' });
    // Named by its words alone and described by its meta line, so a screen reader reads each once.
    await expect(motion).toHaveAccessibleName('Reduce motion');
    await expect(motion).toHaveAccessibleDescription('Your device’s own setting also stops motion.');
    await motion.check();
    await expect(page.locator('.gx').first()).toHaveAttribute('data-motion', 'reduce');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gtl.dashboard.preferences.v1')).motion)).toBe('reduced');
    await expect(page.getByText('Saved on this device, not your account.')).toBeVisible();
    await phoneChecks(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.gx').first()).toHaveAttribute('data-motion', 'reduce');
    await page.getByRole('button', { name: 'Your menu' }).click();
    const names = await page.evaluate(() => [...document.querySelectorAll('.gx *')].map(el => getComputedStyle(el).animationName).filter(n => n !== 'none'));
    expect(names, 'the setting stops the sheet\'s motion').toEqual([]);
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('switch', { name: 'Reduce motion' }).uncheck();
    await expect(page.locator('.gx').first()).not.toHaveAttribute('data-motion', 'reduce');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gtl.dashboard.preferences.v1')).motion)).toBe('system');
  });

  test('Sign out: a failure says why in a toast and keeps the menu usable', async ({ page }) => {
    await harness(page);
    await page.evaluate(() => { window.__failSignOut = true; });
    await page.getByRole('button', { name: 'Your menu' }).click();
    const button = page.getByRole('button', { name: 'Sign out' });
    await button.click();
    await expect(page.locator('.gx-toast')).toContainText('We could not sign you out. Please try again.');
    await expect(button).toHaveText('Sign out');
    await page.evaluate(() => { window.__failSignOut = false; });
    await button.click();
    expect((await events(page)).filter(e => e === 'sign-out')).toHaveLength(2);
  });
});
