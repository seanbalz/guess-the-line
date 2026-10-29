import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';

test.use({ viewport: { width: 320, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; no hosted requests.'));
const nav = page => page.getByRole('navigation', { name: 'Main' });
const tab = (page, name) => nav(page).getByRole('button', { name: new RegExp(`^${name}(,|$)`) });
const content = page => page.getByRole('region', { name: 'Fantasy content', exact: true });
async function landing(page, baseURL, beforeOpen = async () => {}) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  await beforeOpen();
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#research'); await signIn(page, 'luke', { navigate: false });
  await expect(page.locator('[data-landing="research"]')).toBeVisible();
  return world;
}
const open = page => page.locator('[data-landing="research"]').getByRole('button', { name: /^Fantasy/ }).click();
async function capture(page, info, state) {
  for (const theme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
    await page.evaluate(theme => { localStorage.setItem('gtl.theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme })); }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.emulateMedia({ forcedColors, colorScheme: theme, reducedMotion: 'reduce' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const short = await page.locator('.gx').evaluate(root => [...root.querySelectorAll('button,a[href]')].filter(el => el.getClientRects().length && !el.closest('[hidden],[inert],.gx-sr-only:not(.gx-skip-link:focus)')).filter(el => { const r = el.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(el => el.textContent));
    expect(short).toEqual([]);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`fantasy-${state}-${theme}-${forcedColors}.png`) });
  }
}

test('Fantasy detail code waits for a visit; Back, navigation, late failures and local retry keep working', async ({ page, baseURL }, info) => {
  let mode = 'hold', release, codeRequests = 0, reads = 0;
  let waiting = new Promise(resolve => { release = resolve; });
  const world = await landing(page, baseURL, async () => {
    page.on('request', req => { const url = new URL(req.url()); if (url.origin === SUPABASE && url.pathname.includes('/gtl-api/fantasy/')) reads++; });
    await page.route('**/assets/FantasyScreen-*.js', async route => {
      codeRequests++; if (mode === 'hold') await waiting;
      return mode === 'fail' ? route.abort('failed') : route.continue();
    });
  });
  try {
    expect(codeRequests).toBe(0); expect(reads).toBe(0);
    await open(page); await expect(content(page).getByRole('status')).toHaveText('Loading Fantasy…');
    await expect(content(page)).toBeFocused();
    await expect.poll(() => codeRequests).toBe(1); expect(reads).toBe(0);
    await capture(page, info, 'loading');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-landing="research"]')).toBeVisible();
    const failed = page.waitForEvent('requestfailed', req => /\/assets\/FantasyScreen-[^/]+\.js$/.test(req.url()));
    mode = 'fail'; release(); await failed;
    await expect(content(page)).toHaveCount(0);
    await open(page); await expect(content(page).getByRole('alert')).toContainText('Fantasy couldn’t load.');
    await capture(page, info, 'error');
    mode = 'hold'; waiting = new Promise(resolve => { release = resolve; });
    await content(page).getByRole('button', { name: 'Try Fantasy again', exact: true }).click();
    await expect(content(page)).toBeFocused(); await expect(content(page).getByRole('status')).toHaveText('Loading Fantasy…');
    expect(reads).toBe(0); mode = 'ready'; release();
    const screen = page.locator('.gx-fantasy');
    await expect(screen.getByRole('list', { name: 'Ranked players', exact: true })).toBeVisible();
    expect(reads).toBeGreaterThan(0);
    await expect(content(page)).toBeFocused();
    await screen.getByRole('combobox', { name: 'Position', exact: true }).selectOption('QB');
    const week = await screen.getByRole('combobox', { name: 'Week', exact: true }).inputValue();
    const loaded = codeRequests;
    await tab(page, 'Home').click(); await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await tab(page, 'Research').click(); await open(page);
    await expect(screen.getByRole('combobox', { name: 'Position', exact: true })).toHaveValue('QB');
    await expect(screen.getByRole('combobox', { name: 'Week', exact: true })).toHaveValue(week);
    expect(codeRequests).toBe(loaded);
    // The existing URL contract restores the week; filters are retained in memory only.
    await page.reload(); await expect(screen.getByRole('combobox', { name: 'Position', exact: true })).toHaveValue('ALL');
    await expect(screen.getByRole('combobox', { name: 'Week', exact: true })).toHaveValue(week);
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('Fantasy stylesheet retry stays local and waits for repaired styles before rendering details', async ({ page, baseURL }) => {
  const world = await landing(page, baseURL);
  let allow = false, requests = 0, release;
  const waiting = new Promise(resolve => { release = resolve; });
  try {
    await page.route('**/assets/FantasyScreen-*.css', async route => {
      requests++; if (allow) await waiting;
      return allow ? route.continue() : route.abort('failed');
    });
    await open(page); await expect(content(page).getByRole('alert')).toContainText('Fantasy couldn’t load.');
    await expect(page.locator('.gx-fantasy')).toHaveCount(0);
    await content(page).getByRole('button', { name: 'Try Fantasy again', exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(content(page).getByRole('alert')).toContainText('Fantasy couldn’t load.');
    allow = true; await content(page).getByRole('button', { name: 'Try Fantasy again', exact: true }).click();
    await expect.poll(() => requests).toBe(3); await expect(content(page)).toBeFocused();
    await page.getByRole('button', { name: 'Back', exact: true }).click(); await open(page);
    await expect(content(page).getByRole('status')).toHaveText('Loading Fantasy…');
    await expect(page.locator('.gx-fantasy')).toHaveCount(0); expect(requests).toBe(3);
    release(); await expect(page.locator('.gx-fantasy-filter-grid')).toHaveCSS('display', 'grid');
    await expect(page.getByRole('list', { name: 'Ranked players', exact: true })).toBeVisible();
    await expect(content(page)).toBeFocused();
    expect(requests).toBe(3); expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});
