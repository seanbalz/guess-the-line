import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.skip(!pgliteAvailable, 'Local PGlite is required.');
const main = page => page.getByRole('navigation', { name: 'Main' });
const tab = (page, name) => main(page).getByRole('button', { name: new RegExp(`^${name}(,|$)`) });

test('four simple roots, detail origins, reload and phone geometry', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await expect(main(page).getByRole('button')).toHaveCount(4);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const name of ['Home', 'Play', 'Bets', 'Research']) {
          await tab(page, name).click();
          const root = page.locator(`[data-landing="${name.toLowerCase()}"]`);
          await expect(root).toBeVisible();
          await expect(root.locator('.gx-btn--primary')).toHaveCount(1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
          const geometry = await main(page).evaluate(el => {
            const rect = el.getBoundingClientRect();
            return { bottom: rect.bottom, viewport: innerHeight, labels: [...el.querySelectorAll('.gx-tab-label')].map(label => parseFloat(getComputedStyle(label).fontSize)) };
          });
          expect(Math.abs(geometry.bottom - geometry.viewport)).toBeLessThan(2);
          expect(geometry.labels.every(size => size >= 16)).toBe(true);
          const result = await new AxeBuilder({ page }).include('.gx').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          expect(result.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
          if (width === 390) {
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: `.local/four-tab-review/${name.toLowerCase()}-${theme}.png`, fullPage: true });
          }
        }
      }
    }
    await tab(page, 'Home').click();
    await page.getByRole('button', { name: /^Your scores/ }).click();
    await expect(page.getByRole('heading', { name: 'Your weekly score', exact: true })).toBeVisible();
    await expect(tab(page, 'Play')).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Your scores/ })).toBeFocused();
    await tab(page, 'Research').click();
    await page.getByRole('button', { name: /^Fantasy/ }).click();
    await expect(page.getByRole('heading', { name: 'Fantasy Football', exact: true })).toBeVisible();
    const fantasyWeek = await page.getByLabel('Week', { exact: true }).inputValue();
    await expect(page).toHaveURL(/research\/fantasy\?.*week=/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Fantasy Football', exact: true })).toBeVisible();
    await expect(page.getByLabel('Week', { exact: true })).toHaveValue(fantasyWeek);
    await expect(tab(page, 'Research')).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-landing="research"]')).toBeVisible();
    await page.getByRole('button', { name: /^Trends/ }).click();
    await expect(page.getByRole('heading', { name: 'Trends', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Game details/ }).first().click();
    await expect(page.getByRole('dialog').last()).toBeVisible();
    await page.getByRole('button', { name: /^All trends/ }).click();
    await expect(page.getByRole('dialog', { name: 'All trends', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-landing="research"]')).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
