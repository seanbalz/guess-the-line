import { setCaptureTheme } from './theme-capture.mjs';
import { test, expect } from '@playwright/test';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`private note keyboard focus clears fixed bars at ${viewport.width}`, async ({ page, baseURL }, info) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; no hosted data.');
    const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
    try {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
      await page.goto('/#home'); await signIn(page, 'luke', { navigate: false });
      await page.goto('/#research/games?layer=game&item=TB-DAL');
      const field = page.getByRole('textbox', { name: 'Your note', exact: true });
      await expect(field).toBeVisible();
      await expect(field).toBeEnabled();
      await setCaptureTheme(page, viewport.width === 390 ? 'dark' : 'light');
      await page.locator('.gx-main').evaluate(main => { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); main.removeAttribute('tabindex'); });
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        if (await field.evaluate(el => el === document.activeElement)) break;
      }
      await expect(field).toBeFocused();
      const box = await field.evaluate(async el => {
        const read = () => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, tab: document.querySelector('.gx-tabbar').getBoundingClientRect().top, header: document.querySelector('.gx-topbar').getBoundingClientRect().bottom, scroll: scrollY, padding: getComputedStyle(document.documentElement).scrollPaddingBottom });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return read();
      });
      expect(box.top).toBeGreaterThanOrEqual(box.header);
      expect(box.bottom).toBeLessThanOrEqual(box.tab);
      await page.screenshot({ path: info.outputPath(`note-clearance-${viewport.width}.png`) });
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });
}
