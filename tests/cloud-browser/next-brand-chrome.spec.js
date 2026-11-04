// The browser's own chrome around the app (Board item 73, AUD-04): the theme-color the browser bar and an installed app's
// frame use, the webfonts the page asks for, and the favicon's color. Signed out (the sign-in screen), so no account data
// is involved; every request outside this origin is refused, and the Google Fonts requests are only recorded.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const next = JSON.parse(fs.readFileSync(new URL('../../design/tokens-next.json', import.meta.url), 'utf8'));
const old = JSON.parse(fs.readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'));
test.use({ viewport: { width: 390, height: 844 } });

/** Opens the sign-in screen with this device theme choice (none: the app's default) under this system color scheme. */
async function open(page, baseURL, { choice = null, system }) {
  const fonts = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (url.origin === 'https://fonts.googleapis.com') fonts.push(url.href);
    return route.abort();
  });
  await page.emulateMedia({ colorScheme: system });
  if (choice) await page.addInitScript(value => localStorage.setItem('gtl.theme', value), choice);
  await page.goto('/');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  return fonts;
}
const themeColors = page => page.locator('meta[name="theme-color"]').evaluateAll(metas => metas.map(meta => meta.getAttribute('content')));

test('the browser bar takes the new app canvas of the theme in use: Dark by default, Light when chosen, the system under System', async ({ page, baseURL }) => {
  // Dark is the app's default, so a light system still gets the dark bar around the dark app.
  await open(page, baseURL, { system: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await themeColors(page)).toEqual([next.themeColor.dark, next.themeColor.dark]);
  await page.evaluate(() => { localStorage.setItem('gtl.theme', 'light'); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: 'light' })); });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await themeColors(page)).toEqual([next.themeColor.light, next.themeColor.light]);
  expect(await themeColors(page)).not.toContain(old.colors.canvas);
});

test('System follows the device, live, and a chosen Light stays light on a dark device', async ({ page, baseURL }) => {
  await open(page, baseURL, { choice: 'system', system: 'dark' });
  expect(await themeColors(page)).toEqual([next.themeColor.dark, next.themeColor.dark]);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await themeColors(page)).toEqual([next.themeColor.light, next.themeColor.light]);
  await page.evaluate(() => { localStorage.setItem('gtl.theme', 'light'); window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: 'light' })); });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await themeColors(page)).toEqual([next.themeColor.light, next.themeColor.light]);
});

test('the page asks Google Fonts only for Figtree, Big Shoulders Display and Barlow Condensed', async ({ page, baseURL }) => {
  const fonts = await open(page, baseURL, { system: 'dark' });
  await expect.poll(() => fonts.length).toBeGreaterThan(0);
  const families = [...new Set(fonts.flatMap(href => new URL(href).searchParams.getAll('family').map(value => value.split(':')[0])))].sort();
  expect(families).toEqual(Object.keys(next.webfonts.weights).sort());
  expect(fonts.every(href => href === next.webfonts.stylesheet), 'one stylesheet, the new app’s').toBe(true);
});

test('AUD-04: the favicon G is deep green in a light browser and lime in a dark one (Chromium)', async ({ page }) => {
  for (const [scheme, color] of [['light', next.themes.light.color['accent-ink']], ['dark', next.themes.dark.color['accent-ink']]]) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/favicon.svg');
    const fill = await page.locator('path').evaluate(path => getComputedStyle(path).fill);
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    expect(fill, scheme).toBe(`rgb(${r}, ${g}, ${b})`);
  }
});
