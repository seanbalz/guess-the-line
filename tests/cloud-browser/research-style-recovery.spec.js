import { test, expect } from '@playwright/test';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

test('a failed game-detail stylesheet cannot leave the full Research view unstyled', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; no hosted requests.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  let fail = true, failed = 0;
  try {
    await signIn(page, 'luke');
    // The sign-in helper clicks Submit; wait for the session before navigating away.
    await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
    await page.goto('about:blank'); await page.goto('/#lines');
    const card = page.locator('.gx-l-card').first(); await expect(card).toBeVisible();
    // Root styles are already loaded. Fail only new detail stylesheet requests.
    await page.route('**/assets/*.css', route => {
      if (fail) { failed++; return route.abort('failed'); }
      return route.continue();
    });
    await card.click(); const game = page.getByRole('dialog').last();
    await expect(game.getByRole('alert')).toContainText('Game details couldn’t load.');
    expect(failed).toBeGreaterThan(0);
    await page.keyboard.press('Escape'); await expect(game).not.toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Open weekly research', exact: true }).click();
    const research = page.getByRole('dialog', { name: 'Trends', exact: true });
    await expect(research.getByRole('combobox', { name: 'Evidence period', exact: true })).toBeVisible();
    await expect(research.locator('.gx-r-filter').first()).toHaveCSS('display', 'flex');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
