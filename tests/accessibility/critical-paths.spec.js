import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { test, signIn } from '../fixtures/cloud-ui.mjs';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function scan(page, testInfo, name) {
  // Sample settled UI, rather than mixed old/new colors during a theme transition.
  await page.evaluate(() => Promise.all(document.getAnimations().filter(animation =>
    animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)
  ).map(animation => animation.finished.catch(() => {}))));
  const result = await new AxeBuilder({ page }).withTags(tags).analyze();
  fs.writeFileSync(testInfo.outputPath(`axe-${name}.json`), JSON.stringify(result, null, 2));
  await testInfo.attach(`axe-${name}`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect.soft(result.violations.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => ({ target: node.target, failure: node.failureSummary })) })), name).toEqual([]);
}
async function reflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal document overflow at 320 CSS pixels').toBe(true);
}
async function navigate(page, name) {
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name, exact: true }).click();
}

for (const theme of ['dark', 'light']) test(`${theme} critical flows: automated WCAG checks, keyboard and 320px reflow`, async ({ page, fixture }, testInfo) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByLabel('Color theme').selectOption(theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await scan(page, testInfo, 'sign-in');
  await page.setViewportSize({ width: 320, height: 844 }); await reflow(page);
  await scan(page, testInfo, 'sign-in-320');
  await signIn(page);
  await scan(page, testInfo, 'lobby-320'); await reflow(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.', exact: true })).toBeVisible();
  await scan(page, testInfo, 'dashboard-320'); await reflow(page);

  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.focus(); await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#game-navigation'))).toBe(true);
  await scan(page, testInfo, 'mobile-navigation');
  await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await navigate(page, 'My picks');
  await expect(page.locator('.prediction-input input')).toHaveCount(15);
  await scan(page, testInfo, 'blind-spread-320'); await reflow(page);
  await page.getByRole('button', { name: 'Guess the Total', exact: true }).click();
  await expect(page.locator('.prediction-input input')).toHaveCount(15);
  await scan(page, testInfo, 'blind-total-320'); await reflow(page);
  for (const input of await page.locator('.prediction-input input').all()) await input.fill('44.5');
  const review = page.getByRole('button', { name: 'Review & submit', exact: true });
  await review.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await page.getByRole('list', { name: 'Predictions to submit', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.getByRole('list', { name: 'Predictions to submit', exact: true }).evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await scan(page, testInfo, 'total-review-320'); await reflow(page);
  await page.screenshot({ path: testInfo.outputPath(`total-review-${theme}-320.png`) });
  await page.keyboard.press('Escape'); await expect(review).toBeFocused();
  page.on('dialog', dialog => dialog.accept());
  await navigate(page, 'Bet Tracker');
  await expect(page.getByRole('heading', { name: 'The bet feed', exact: true })).toBeVisible();
  await scan(page, testInfo, 'bet-tracker-320'); await reflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await scan(page, testInfo, 'bet-tracker-desktop');
  expect(fixture.apiRequests.filter(request => request.method !== 'GET' && !request.pathname.endsWith('/social/read'))).toHaveLength(0);
});
