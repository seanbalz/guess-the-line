// Fixture-only commissioner review UI. Existing auth/commissioner navigation uses local PGlite; this new read returns
// fabricated normalized API data. Separate Node adapter tests enforce the new endpoint's real server-side admin guard.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!pgliteAvailable, 'Install the local PGlite test runtime.');
test.setTimeout(120000);
const review = { week: 9, nextWeek: 10, nextPickCount: 1, totalsComplete: true,
  original: { capturedAt: '2026-11-03T02:00:00Z' }, corrected: { capturedAt: '2026-11-03T20:05:00Z' },
  changes: [{ name: 'Sean', before: { points: 500.25, against: 400 }, after: { points: 501.25, against: 400 }, pointsChange: 1, againstChange: 0 }] };

test('commissioner loads correction evidence only when opening its tool, with a read-only flag and honest refresh states', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  let calls = 0, status = 'ready';
  const chunks = [];
  page.on('request', request => { if (/\/assets\/EplCorrectionReviews-[^/]+\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url()); });
  await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/epl/admin/corrections/read'), async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({ status: status === 'error' ? 503 : status === 'forbidden' ? 403 : 200, contentType: 'application/json', body: JSON.stringify(status === 'error' || status === 'forbidden'
      ? { error: 'Unavailable' } : { available: status !== 'unavailable', season: 2026, reviews: status === 'ready' ? [review] : [] }) });
  });
  try {
    await page.goto('/'); await signIn(page, 'sean', { navigate: false });
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Commissioner tools', exact: true }).click();
    const sheet = page.getByRole('dialog').last();
    await expect(sheet.getByRole('button', { name: 'EPL stat corrections', exact: true })).toBeVisible();
    expect(calls).toBe(0); expect(chunks).toHaveLength(0);
    await sheet.getByRole('button', { name: 'EPL stat corrections', exact: true }).click();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toBeVisible();
    expect(calls).toBe(1); expect(chunks).toHaveLength(1);
    await expect(sheet.getByText('MW10 has 1 recorded pick. Its stored picks and draft order are preserved.')).toBeVisible();
    await expect(sheet.getByText('500.25 → 501.25 (+1)')).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await page.setViewportSize({ width: theme === 'dark' ? 390 : 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`epl-correction-review-${theme}.png`) });
    }
    status = 'error'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('Could not refresh. Showing the last loaded reviews.')).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toBeVisible();
    status = 'unavailable'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('EPL correction checks are not available yet.')).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toHaveCount(0);
    status = 'empty'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('No EPL stat corrections are awaiting review.')).toBeVisible();
    status = 'ready'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toBeVisible();
    status = 'forbidden'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('Only the Community commissioner can view these corrections.')).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toHaveCount(0);
  } finally { await world.db.close(); }
});
