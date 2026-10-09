import { test, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createEngine } from '../../server/engine.mjs';

test('lost Challenge acknowledgement requires readback and never records twice', async ({ page }) => {
  const state = seed();
  state.bets = {};
  const engine = createEngine(state, { clock: () => Date.parse('2026-10-08T16:00:00Z') });
  let attempts = 0, readFailure = false;
  await page.route('**/api/state?**', route => {
    if (readFailure) return route.fulfill({ status: 503, json: { error: 'Saved data cannot be read yet.' } });
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: engine.view(query.get('player'), query.get('mode')) });
  });
  await page.route('**/api/bet?**', async route => {
    attempts++;
    engine.saveBet('sean', route.request().postDataJSON());
    await route.abort('failed');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await page.getByRole('button', { name: 'Betting Challenge', exact: true }).click();
  await page.getByRole('button', { name: 'Record selection', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await page.getByLabel('Selected team’s spread').fill('-3.5');
  await page.getByLabel('American odds').fill('-110');
  await page.getByLabel('Quote source').fill('Synthetic review source');
  const localTime = await page.evaluate(() => {
    const time = new Date('2026-10-08T15:59:00Z');
    return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  await page.getByLabel('Quote timestamp', { exact: false }).fill(localTime);
  await dialog.getByRole('button', { name: 'Review selection', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm immutable selection', exact: true }).click();
  await expect(dialog).toContainText('Save outcome unknown');
  await expect(dialog).not.toContainText('Not recorded until confirmation');
  await expect(dialog.getByRole('button', { name: 'Confirm immutable selection', exact: true })).toBeDisabled();
  expect(attempts).toBe(1);
  readFailure = true;
  await dialog.getByRole('button', { name: 'Check saved data', exact: true }).click();
  await expect(dialog).toContainText('Saved data cannot be read yet.');
  await expect(dialog.getByRole('button', { name: 'Confirm immutable selection', exact: true })).toBeDisabled();
  expect(attempts).toBe(1);
  readFailure = false;
  await dialog.getByRole('button', { name: 'Check saved data', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.recorded-bet').first()).toContainText('Synthetic review source');
  expect(attempts).toBe(1);
  expect(Object.keys(state.bets.sean)).toHaveLength(1);
});
