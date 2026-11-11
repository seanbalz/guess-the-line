import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';
import { setNativeActionTheme } from '../helpers/native-action-theme.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.use({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(90000);

// Offline Linux CI reaches sans-serif without the preferred system/webfonts.
// Arial provides representative wider sans fallback metrics on Windows, where
// Segoe UI otherwise masks the reported Leaderboard overflow. This exercises
// that real fallback failure without claiming an exact Linux font inventory.
for (const metrics of ['native', 'sans-fallback']) for (const theme of ['dark', 'light']) {
  test(`EPL Play keeps full labels, targets and focus at compact widths: ${metrics} ${theme}`, async ({ page, baseURL }, info) => {
    expect(pgliteAvailable, 'Disposable local PGlite required').toBe(true);
    const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
    const measurements = [];
    try {
      await page.route(`${SUPABASE}/functions/v1/gtl-api/lobby`, async r => {
        const req = r.request(), response = await world.handler(new Request(req.url(), { headers: req.headers() }));
        await r.fulfill({ status: response.status, json: { ...await response.json(), epl: true } });
      });
      await page.route('**/functions/v1/gtl-api/epl/**', r => {
        const action = new URL(r.request().url()).pathname.split('/epl/')[1], kickoff = '2099-10-31T12:30:00Z';
        const data = action === 'draft/read' ? { season: 2026, week: 17, status: 'open', deadline: kickoff, order: [{ ownerId: 'manager-luke', name: 'Luke Fixture' }], picks: [], clubs: [{ code: 'ARS', name: 'Arsenal', opponent: 'CHE', home: true, kickoff }], me: 'manager-luke', onTheClock: 'manager-luke', myQueue: [] }
          : action === 'guess/read' ? { available: true, season: 2026, week: 17, ownerId: 'manager-luke', fixtures: [{ eventId: 'label-ars-che', home: 'ARS', away: 'CHE', commenceTime: kickoff, status: 'scheduled', kickedOff: false }], guesses: [] }
            : action === 'guess/leaderboard' ? { season: 2026, rows: [{ ownerId: 'manager-luke', name: 'Luke Fixture', average: 12.5, guessed: 4, unscored: 1 }] } : null;
        return r.fulfill(data ? { json: data } : { status: 404, json: { error: 'Fixture unavailable' } });
      });
      await page.goto('/#epl/play/guess');
      await signIn(page, 'luke', { navigate: false });
      await expect(page.locator('[data-epl-section=guess]')).toBeVisible();
      await setNativeActionTheme(page, theme);
      if (metrics === 'sans-fallback') await page.addStyleTag({ content: '.gx.gx-epl .gx-epl-play-tabs .gx-seg-btn { font-family: Arial, sans-serif; }' });
      const tabs = page.getByRole('group', { name: 'Play', exact: true });
      const choices = [['Guess the Line', 'guess'], ['Pick a Team', 'pick'], ['Leaderboard', 'leaderboard']];
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const [label, section] of choices) {
          const button = tabs.getByRole('button', { name: label, exact: true });
          await page.keyboard.press('Tab');
          await button.focus();
          await expect(button).toBeFocused();
          await expect(button).toHaveCSS('outline-style', 'solid');
          await page.keyboard.press('Enter');
          await expect(page.locator(`[data-epl-section=${section}]`)).toBeVisible();
          await expect(button).toHaveAttribute('aria-pressed', 'true');
          const proof = await tabs.locator('button').evaluateAll(buttons => buttons.map(el => {
            const box = el.getBoundingClientRect(), css = getComputedStyle(el), range = document.createRange();
            range.selectNodeContents(el);
            return { label: el.textContent, width: box.width, height: box.height, font: css.font, fontSize: parseFloat(css.fontSize), padding: css.padding, overflow: css.overflow, textOverflow: css.textOverflow, transform: css.transform,
              text: [...range.getClientRects()].filter(r => r.width).map(r => ({ width: r.width, left: r.left - box.left, right: box.right - r.right })) };
          }));
          measurements.push({ width, section, proof });
          await info.attach(`metrics-${width}-${section}`, { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
          for (const item of proof) {
            expect(item.width).toBeGreaterThanOrEqual(44);
            expect(item.height).toBeGreaterThanOrEqual(44);
            expect(item.fontSize).toBe(16);
            expect(item.overflow).toBe('visible');
            expect(item.textOverflow).toBe('clip');
            expect(item.transform).toBe('none');
            for (const line of item.text) {
              expect(line.left, `${item.label} left inset at ${width}`).toBeGreaterThanOrEqual(1);
              expect(line.right, `${item.label} right inset at ${width}`).toBeGreaterThanOrEqual(1);
            }
          }
          expect(await page.evaluate(layoutProblems)).toEqual([]);
        }
        await page.screenshot({ path: info.outputPath(`epl-play-${width}.png`) });
      }
      await page.setViewportSize({ width: 320, height: 844 });
      const normalAudit = await new AxeBuilder({ page }).include('.gx-epl-play-tabs').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(normalAudit.violations.map(v => v.id)).toEqual([]);
      await page.emulateMedia({ forcedColors: 'active' });
      await expect(tabs.getByRole('button', { name: 'Leaderboard', exact: true })).toHaveCSS('border-top-width', '2px');
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      const audit = await new AxeBuilder({ page }).include('.gx-epl-play-tabs').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations.map(v => v.id)).toEqual([]);
      expect(world.errors).toEqual([]);
    } finally {
      const proofPath = info.outputPath('label-measurements.json');
      fs.writeFileSync(proofPath, JSON.stringify(measurements, null, 2) + '\n');
      await info.attach('label-measurements', { path: proofPath, contentType: 'application/json' });
      await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close();
    }
  });
}
