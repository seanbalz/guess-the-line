import { test, expect } from '@playwright/test';
import { chartFixture } from '../fixtures/dashboard-charts.mjs';
import { emptySocialState, socialView } from '../../shared/social-bets.mjs';

const actorId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
function fixtures(entries = true) {
  const dashboard = chartFixture();
  // A shared betting summary must remain independent of the hidden guess ballot.
  dashboard.revealed = false; dashboard.submittedAt = null;
  dashboard.standings[0].submitted = false;
  const state = emptySocialState();
  const base = { ownerId: actorId, season: 2026, week: 5, kind: 'single', origin: 'tracked', legs: [{ gameId: 'PHI-JAX', market: 'spread', side: 'away', line: 7.5, selection: 'Synthetic test selection' }], odds: 100, stakeUnits: 1, source: 'Synthetic browser fixture', recordedAt: '2026-10-08T15:00:00Z', placedAt: null, quotedAt: null, outcome: 'pending', actualReturnUnits: null, sourceEntryId: null, countsForRecord: true, revision: 1 };
  if (entries) state.entries = [
    { ...base, id: 'won', outcome: 'win' },
    { ...base, id: 'lost', outcome: 'loss', stakeUnits: 2, odds: -110 },
    { ...base, id: 'pending', stakeUnits: 4, odds: null },
    { ...base, id: 'missing', stakeUnits: null, odds: null },
    { ...base, id: 'excluded', outcome: 'win', stakeUnits: 50, countsForRecord: false },
    { ...base, id: 'other', ownerId: otherId, outcome: 'win', stakeUnits: 999, legs: [{ ...base.legs[0], selection: 'Another player selection' }] },
  ];
  const response = filters => ({ ...socialView(state, { actorId, profiles: [{ id: actorId, displayName: 'Fixture owner' }, { id: otherId, displayName: 'Fixture rival' }], games: dashboard.games, season: 2026, week: 5, filters, now: Date.parse('2026-10-08T16:00:00Z') }), actorId, games: dashboard.games, availableWeeks: [{ season: 2026, week: 5 }], weekRevision: 0 });
  return { dashboard, response };
}
async function setup(page, options = {}) {
  const fixture = fixtures(options.entries ?? true);
  await page.route('**/api/state?**', route => route.fulfill({ json: fixture.dashboard }));
  await page.route('**/api/social/read?**', route => route.fulfill({ json: fixture.response(route.request().postDataJSON()?.filters || {}) }));
  return fixture;
}

test('dashboard attaches the current player shared record with honest ROI coverage and both destinations', async ({ page }) => {
  await setup(page); await page.goto('/');
  const card = page.getByRole('region', { name: 'Your betting week', exact: true });
  await expect(card).toContainText('1-1-0');
  await expect(card).toContainText('Win–loss–push · 4 bets');
  await expect(card).toContainText('7u');
  await expect(card).toContainText('1 stake unknown');
  await expect(card).toContainText('4u known pending risk');
  await expect(card).toContainText('-33.3%');
  await expect(card).toContainText('2 bets · 3u settled risk');
  await expect(card).toContainText('2 of 4 included bets have odds and unit stakes · 1 excluded');
  await expect(card).not.toContainText('Another player selection');
  await expect(page.getByRole('heading', { name: 'Your ballot comes first' })).toBeVisible();
  await card.getByRole('button', { name: 'Open Bet Tracker' }).click();
  await expect(page.getByRole('heading', { name: 'Bet Tracker', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'My Unit Betting week' }).click();
  await expect(page.getByRole('heading', { name: 'Unit Betting', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'My week', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('dashboard bet summary handles an empty week and a recoverable feed failure', async ({ page }) => {
  const fixture = await setup(page, { entries: false });
  await page.route('**/api/social/read?**', route => route.fulfill({ status: 503, json: { error: 'Fixture service unavailable.' } }));
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Your betting week', exact: true });
  await expect(card).toContainText('Your betting week is unavailable');
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Open Bet Tracker' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Your ballot comes first' })).toBeVisible();
  await page.route('**/api/social/read?**', route => route.fulfill({ json: fixture.response({}) }));
  await card.getByRole('button', { name: 'Retry betting summary' }).click();
  await expect(card.getByRole('heading', { name: 'No shared bets this week yet' })).toBeVisible();
  await expect(card).toContainText('0 bets · 0u settled risk');
  await expect(card.locator('dl > div').filter({ hasText: 'Settled ROI' }).locator('dd')).toHaveText('—');
});

test('dashboard shared bet card fits 320 pixels in both themes with accessible destinations', async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 320, height: 844 }); await page.goto('/');
  const card = page.getByRole('region', { name: 'Your betting week', exact: true });
  await expect(card).toContainText('1-1-0');
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Settings & setup', exact: true }).click();
    await page.getByLabel('Color theme').selectOption(theme);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(card).toContainText('1-1-0');
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    for (const label of ['Open Bet Tracker', 'My Unit Betting week']) {
      const button = card.getByRole('button', { name: label });
      await expect(button).toBeVisible();
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await card.screenshot({ path: `test-results/social-dashboard-${theme}-320.png` });
  }
});
