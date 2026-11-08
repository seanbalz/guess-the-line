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
    // D-69 step 3: the board is picture rows, and a row opens the game as a layer (it was the game sheet).
    const card = page.locator('button[data-game]').first(); await expect(card).toBeVisible();
    // Root styles are already loaded. Fail only new detail stylesheet requests.
    await page.route('**/assets/*.css', route => {
      if (fail) { failed++; return route.abort('failed'); }
      return route.continue();
    });
    await card.click(); const game = page.locator('[data-research="game"]');
    await expect(game.getByRole('alert')).toContainText('Game details couldn’t load.');
    expect(failed).toBeGreaterThan(0);
    // Back closes the layer to the board (Escape closed the sheet).
    await page.goBack(); await expect(game).toHaveCount(0); await expect(card).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Open weekly research', exact: true }).click();
    const research = page.getByRole('dialog', { name: 'Trends', exact: true });
    await expect(research.getByRole('combobox', { name: 'Evidence period', exact: true })).toBeVisible();
    await expect(research.locator('.gx-r-filter').first()).toHaveCSS('display', 'flex');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
