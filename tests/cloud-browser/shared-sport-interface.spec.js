import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Disposable PGlite required.'));
const nav = page => page.getByRole('navigation', { name: 'Main', exact: true });
const sport = (page, name) => page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name, exact: true });
async function fixture(page, baseURL) {
  const world = await communityWorld(page, baseURL), calls = [];
  page.on('request', request => {
    if (request.url().includes('/gtl-api/')) calls.push(new URL(request.url()).pathname.split('/gtl-api/')[1]);
  });
  await page.route('**/functions/v1/gtl-api/lobby', async route => {
    const request = route.request();
    const response = await world.handler(new Request(request.url(), { headers: request.headers() }));
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify({ ...await response.json(), epl: true }) });
  });
  await page.route('**/functions/v1/gtl-api/epl/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ season: 2026, week: 9, status: 'open', deadline: '2099-10-31T12:30:00Z', order: [], picks: [], clubs: [], me: null }) }));
  return { ...world, calls };
}
async function openProfile(page) {
  await page.getByRole('button', { name: 'Your menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Profile', exact: true }).click();
  return page.getByRole('dialog', { name: 'Profile', exact: true });
}

for (const name of ['NFL', 'EPL']) test(`${name} keyboard skip link reveals a full target, keeps the sport address and respects modal focus`, async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  const route = name === 'EPL' ? '/#epl/bets' : '/#bets';
  try {
    await page.goto(route);
    await signIn(page, 'luke', { navigate: false });
    await expect(nav(page)).toBeVisible();
    for (const theme of ['dark', 'light']) for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.reload();
      await expect(nav(page)).toBeVisible();
      await expect(sport(page, name)).toHaveAttribute('aria-pressed', 'true');
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const address = page.url(), skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
      // Unfocused skip links have a box, but are intentionally clipped. Phone helpers
      // exclude that state only; a focused skip link must meet all ordinary target/layout checks.
      expect(await skip.evaluate(el => getComputedStyle(el).clip)).not.toBe('auto');
      await page.keyboard.press('Tab');
      await expect(skip).toBeFocused();
      await expect(skip).toBeInViewport();
      expect(await skip.evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.width >= 44 && box.height >= 44 && getComputedStyle(el).clip === 'auto';
      })).toBe(true);
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      expect(page.url()).toBe(address);
      await expect(sport(page, name)).toHaveAttribute('aria-pressed', 'true');
    }
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    await expect(menu).toBeVisible();
    await expect(page.locator('.gx-app')).toHaveAttribute('inert', '');
    const skip = page.locator('.gx-skip-link');
    await skip.evaluate(el => el.focus());
    await expect(skip).not.toBeFocused();
    await page.keyboard.press('Tab');
    expect(await menu.evaluate(el => el.contains(document.activeElement))).toBe(true);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('NFL and EPL keep the current tab, shared header and account; profile saves carry across sports', async ({ page, baseURL }, testInfo) => {
  const world = await fixture(page, baseURL);
  try {
    await page.goto('/#epl/home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.getByRole('button', { name: 'Your menu', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'League: FEPL. Switch league', exact: true })).toBeVisible();
    expect(world.calls.filter(path => !['lobby', 'epl/draft/read'].includes(path))).toEqual([]);
    const firstLobbyCount = world.calls.filter(path => path === 'lobby').length;
    for (const tab of ['Research', 'Bets', 'Play', 'Home']) {
      await nav(page).getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator(`.gx-tab[data-tab="${tab.toLowerCase()}"]`)).toHaveAttribute('aria-current', 'page');
      await sport(page, 'NFL').click();
      await expect(sport(page, 'NFL')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`.gx-tab[data-tab="${tab.toLowerCase()}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('button', { name: 'Your menu', exact: true })).toBeVisible();
      await sport(page, 'EPL').click();
      await expect(sport(page, 'EPL')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`.gx-tab[data-tab="${tab.toLowerCase()}"]`)).toHaveAttribute('aria-current', 'page');
      expect(await nav(page).getByRole('button').count()).toBe(4);
    }
    expect(world.calls.filter(path => path === 'lobby')).toHaveLength(firstLobbyCount);
    await page.goBack();
    await expect(sport(page, 'NFL')).toHaveAttribute('aria-pressed', 'true');
    await page.goForward();
    await expect(sport(page, 'EPL')).toHaveAttribute('aria-pressed', 'true');
    let profile = await openProfile(page);
    await expect(profile.getByLabel('Display name', { exact: true })).toHaveValue('Luke Fixture');
    await profile.getByLabel('Display name', { exact: true }).fill('Luke Across Sports');
    await profile.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(profile.getByRole('status')).toHaveText('Your name is saved.');
    await profile.getByRole('button', { name: 'Close', exact: true }).click();
    await sport(page, 'NFL').click();
    profile = await openProfile(page);
    await expect(profile.getByLabel('Display name', { exact: true })).toHaveValue('Luke Across Sports');
    await profile.getByRole('button', { name: 'Close', exact: true }).click();
    await sport(page, 'EPL').click();
    await nav(page).getByRole('button', { name: 'Bets', exact: true }).click();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.getByRole('button', { name: 'Your menu', exact: true })).toBeInViewport();
        await expect(nav(page)).toBeInViewport();
        expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`shared-epl-${theme}-${width}.png`) });
      }
    }
    await page.getByRole('button', { name: 'League: FEPL. Switch league', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Your leagues', exact: true })).toContainText('FEPL');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('EPL profile drafts guard leaving, survive sport switches, and commissioner access remains in the shared menu', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  try {
    await page.goto('/#epl/bets');
    await signIn(page, 'sean', { navigate: false });
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    await expect(menu.getByRole('button', { name: 'Commissioner tools', exact: true })).toBeVisible();
    await menu.getByRole('button', { name: 'Profile', exact: true }).click();
    const profile = page.getByRole('dialog', { name: 'Profile', exact: true });
    await profile.getByLabel('Display name', { exact: true }).fill('Unfinished profile');
    page.once('dialog', dialog => dialog.dismiss());
    await profile.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(profile).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await profile.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(profile).toBeHidden();
    await sport(page, 'NFL').click();
    const reopened = await openProfile(page);
    await expect(reopened.getByLabel('Display name', { exact: true })).toHaveValue('Unfinished profile');
    expect(world.calls.filter(path => path === 'profile')).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
