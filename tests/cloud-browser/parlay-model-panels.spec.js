import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { propModelBrowserFixture } from '../fixtures/prop-model-browser.mjs';

test('Parlay model controls paginate, scope position/category, change matchup period and fit phones', async ({ page, baseURL }, info) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; no hosted requests.'); test.setTimeout(180000);
  const world = await communityWorld(page, baseURL, { games: 2, migrations: ALL, optionalRpc: true });
  let reads = 0;
  try {
    // Only this authenticated UI read is replaced; auth/navigation retain the
    // existing isolated community world. The returned values use real helpers.
    await page.route('**/lines/assessments', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      reads++;
      const payload = propModelBrowserFixture({ game: world.state.games[0], ...world.state.league, now: Date.now() });
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#bets/research'); await signIn(page, 'luke', { navigate: false });
    const lab = page.locator('section[aria-labelledby="gx-parlay-title"]');
    const projected = lab.locator('.gx-parlay-compare');
    await expect(lab.getByRole('heading', { name: 'Suggested parlays', exact: true })).toBeVisible();
    await lab.getByRole('button', {name:'Projections',exact:true}).click();
    await expect(lab.getByRole('heading', { name: 'Player projections', exact: true })).toBeVisible();
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(projected).toHaveCount(6);
    await expect(lab.getByText('1 / 2', { exact: true })).toBeVisible();
    await expect(lab.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await lab.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(projected).toHaveCount(2);
    await expect(lab.getByRole('heading', { name: 'Synthetic 07', exact: true })).toBeVisible();
    await expect(lab.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await lab.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(projected).toHaveCount(6);
    await expect(lab.getByRole('heading', { name: 'Synthetic 01', exact: true })).toBeVisible();
    // Filter while on page2: reset page, do not strand a valid subset offscreen.
    await lab.getByRole('button', { name: 'Next', exact: true }).click();
    await lab.getByRole('button', {name:'WR',exact:true}).click();
    await expect(projected).toHaveCount(4);
    await expect(lab.getByRole('heading', { name: 'Synthetic 01', exact: true })).toBeVisible();
    await expect(lab.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
    await lab.getByLabel('Research board', { exact: true }).selectOption('Rushing');
    await expect(projected).toHaveCount(0);
    await expect(lab.getByText('No eligible player projections', { exact: false })).toBeVisible();
    await lab.getByRole('button', {name:'All',exact:true}).click();
    await expect(projected).toHaveCount(4);
    await expect(lab.getByRole('heading', { name: 'Synthetic 05', exact: true })).toBeVisible();
    await expect(lab.getByRole('heading', { name: 'Synthetic 01', exact: true })).toHaveCount(0);
    await lab.getByLabel('Research board', { exact: true }).selectOption('Receiving');
    await lab.getByRole('button',{name:'Matchups',exact:true}).click();
    const spotlight = lab.locator('.gx-lab-matchup');
    await expect(spotlight).toHaveCount(1);
    await expect(spotlight).toContainText('70.0');
    await expect(spotlight).toContainText('Coverage: 6 of 6 games');
    await lab.getByLabel('Matchup period', { exact: true }).selectOption('last5');
    await expect(spotlight).toContainText('80.0');
    await expect(spotlight).toContainText('Coverage: 5 of 5 games');
    await lab.getByLabel('Matchup period', { exact: true }).selectOption('season');
    await expect(spotlight).toContainText('70.0');
    await lab.getByRole('button',{name:'Projections',exact:true}).click();
    await lab.getByLabel('Research board', { exact: true }).selectOption('All props');
    await expect(projected).toHaveCount(6);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include('section[aria-labelledby="gx-parlay-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.map(v => v.id)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`parlay-model-${width}.png`), fullPage: true });
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
