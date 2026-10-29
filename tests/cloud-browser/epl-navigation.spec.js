import { test, expect } from '@playwright/test';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

test('EPL tab navigation opens the default Play section and preserves explicit sections through history', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await communityWorld(page, baseURL);
  const calls = [];
  try {
    await page.route('**/functions/v1/gtl-api/lobby', async route => {
      const req = route.request();
      const response = await world.handler(new Request(req.url(), { headers: req.headers() }));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...await response.json(), epl: true }) });
    });
    await page.route('**/functions/v1/gtl-api/epl/**', route => {
      const path = new URL(route.request().url()).pathname.split('/gtl-api/')[1];
      calls.push(path);
      return route.fulfill({ status: path === 'epl/draft/read' ? 200 : 503, contentType: 'application/json', body: JSON.stringify(path === 'epl/draft/read'
        ? { season: 2026, week: 9, status: 'open', deadline: '2099-10-31T12:30:00Z', order: [], picks: [], clubs: [], me: null }
        : { error: 'Fixture unavailable' }) });
    });
    await page.goto('/#epl/home');
    await signIn(page, 'luke', { navigate: false });
    const nav = page.getByRole('navigation', { name: 'EPL', exact: true });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'NBA', exact: true })).toHaveCount(0);
    const draft = page.getByRole('heading', { name: 'MW9 draft · order from MW8 score + bonus' });
    await nav.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(draft).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pick a Team', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await nav.getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Fantasy', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(draft).toBeVisible();
    await page.getByRole('button', { name: 'Guess the Line', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Coming next' })).toBeVisible();
    await page.getByRole('button', { name: 'Pick a Team', exact: true }).click();
    await expect(draft).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Guess the Line', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.goForward();
    await expect(draft).toBeVisible();
    expect(calls.every(path => ['epl/draft/read', 'epl/fantasy/read'].includes(path))).toBe(true);
    // Same app chrome in EPL, with shared account appearance and destination-preserving sport changes.
    await nav.getByRole('button', { name: 'Research', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Your menu', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'League: Premier League', exact: true })).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole('button', { name: 'Your menu', exact: true }).click();
      await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Appearance', exact: true }).click();
      const appearance = page.getByRole('dialog', { name: 'Appearance', exact: true });
      for (const theme of ['Light', 'Dark']) {
        await appearance.getByRole('button', { name: theme, exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
        await page.screenshot({ path: test.info().outputPath(`epl-menu-${width}-${theme}.png`) });
      }
      await appearance.getByRole('button', { name: 'Close', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'NFL', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Research', exact: true, level: 1 })).toBeVisible();
    await page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'EPL', exact: true }).click();
    await expect(page).toHaveURL(/#epl\/research\/fantasy$/);
    await expect(page.getByRole('heading', { name: 'Fantasy', exact: true })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
