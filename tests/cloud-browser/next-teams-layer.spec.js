// D-69 step 3: Research › Teams on the real app (local PGlite world, fictional accounts, never hosted data). Contracts:
// the list draws every team as a picture row with a stable id; a row opens the team as a layer (a step; its heading takes
// focus; the list stays mounted under it, hidden); Back returns to the list with focus on the row; a direct load moves no
// focus and Back closes the layer to the list, not the landing; the margin chart reveals only after the member's tap.
import { test, expect } from '@playwright/test';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const layer = page => page.locator('[data-research="team"]');
const historyLength = page => page.evaluate(() => history.length);

test('one team is a layer: a step to open, focus on its heading, Back to the row, a direct load moves no focus', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  const world = await communityWorld(page, baseURL, { migrations: ALL, games: 3, optionalRpc: true });
  try {
    await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible({ timeout: 30000 });
    await page.goto('about:blank'); await page.goto('/#research/teams');
    await expect(page.locator('[data-research="teams"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('button.gx-prow[data-team]')).toHaveCount(32);
    const row = page.locator('#gx-r-team-SEA');
    const before = await historyLength(page);
    await row.click();
    await expect(page).toHaveURL(/#research\/teams\?layer=team&item=SEA$/);
    expect(await historyLength(page)).toBe(before + 1);
    await expect(layer(page).getByRole('heading', { level: 2, name: 'Seattle Seahawks', exact: true })).toBeFocused();
    await expect(page.locator('.gx-kept')).toBeHidden();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(layer(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#research\/teams$/);
    await expect(row).toBeFocused();

    await page.goto('about:blank'); await page.goto('/#research/teams?layer=team&item=DEN');
    const heading = layer(page).getByRole('heading', { level: 2, name: 'Denver Broncos', exact: true });
    await expect(heading).toBeVisible({ timeout: 30000 });
    await expect(heading).not.toBeFocused();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('#gx-r-team-DEN')).toBeVisible();
    await expect(page).toHaveURL(/#research\/teams$/);
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});
