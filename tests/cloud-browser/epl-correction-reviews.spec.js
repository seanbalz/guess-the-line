// Fixture-only commissioner review UI. Existing auth/commissioner navigation uses local PGlite; this new read returns
// fabricated normalized API data. Separate Node adapter tests enforce the new endpoint's real server-side admin guard.
import { test, expect } from '@playwright/test';
import { captureCommissioner } from './commissioner-capture.mjs';
import { setCaptureTheme } from './theme-capture.mjs';
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
    await expect(sheet.getByRole('button', { name: 'Premier League stat corrections', exact: true })).toBeVisible();
    expect(calls).toBe(0); expect(chunks).toHaveLength(0);
    await sheet.getByRole('button', { name: 'Premier League stat corrections', exact: true }).click();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toBeVisible();
    expect(calls).toBe(1); expect(chunks).toHaveLength(1);
    await expect(sheet.getByText('MW10 has 1 recorded pick. Its stored picks and draft order are preserved.')).toBeVisible();
    await expect(sheet.locator('.gx-cm-comparison').filter({ hasText: 'Season points' })).toContainText('501.25');
    await captureCommissioner(page, testInfo, 'corrections-ready');
    status = 'error'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('Could not refresh. Showing the last loaded reviews.')).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toBeVisible();
    await captureCommissioner(page, testInfo, 'corrections-stale', { compact: true });
    status = 'unavailable'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('Premier League correction checks are not available yet.')).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toHaveCount(0);
    await captureCommissioner(page, testInfo, 'corrections-unavailable', { compact: true });
    status = 'empty'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('No Premier League stat corrections are awaiting review.')).toBeVisible();
    await captureCommissioner(page, testInfo, 'corrections-empty', { compact: true });
    status = 'ready'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toBeVisible();
    status = 'forbidden'; await sheet.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await expect(sheet.getByText('Only the Community commissioner can view these corrections.')).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'MW9 stat correction needs review' })).toHaveCount(0);
    await captureCommissioner(page, testInfo, 'corrections-denied', { compact: true });
  } finally { await world.db.close(); }
});

// D-83 (Sean, November 11, 2026: "Yes, import wins"). Fabricated reply in the brief's worked-week shape (MW11 to MW12):
// a Tuesday correction drops Casey below Alex, but the confirmed import keeps Alex first. Fictional names and scores only.
const KEPT = ['Alex', 'Casey', 'Jordan', 'Riley', 'Taylor', 'Morgan', 'Drew', 'Quinn'];
const importKept = { week: 11, nextWeek: 12, nextPickCount: 0, totalsComplete: true,
  original: { capturedAt: '2026-11-23T08:10:00Z' }, corrected: { capturedAt: '2026-11-24T20:05:00Z' },
  changes: [{ name: 'Casey', before: { points: 412.6, against: 398.15 }, after: { points: 409.4, against: 398.15 }, pointsChange: -3.2, againstChange: 0 }],
  keptOrder: KEPT, candidateOrder: ['Casey', 'Alex', ...KEPT.slice(2)] };

test('a confirmed import keeps the order: both orders and how to use the correction, still read-only (D-83)', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { groupScreens: true });
  await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/epl/admin/corrections/read'), route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, season: 2026, reviews: [importKept] }) }));
  try {
    await page.goto('/'); await signIn(page, 'sean', { navigate: false });
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Commissioner tools', exact: true }).click();
    const sheet = page.getByRole('dialog').last();
    await sheet.getByRole('button', { name: 'Premier League stat corrections', exact: true }).click();
    await expect(sheet.getByRole('heading', { name: 'MW11 stat correction needs review' })).toBeVisible();
    await expect(sheet.getByText('Tuesday’s totals would put Casey first. Because you confirmed an import, MW12 keeps Alex first.')).toBeVisible();
    const order = sheet.getByRole('region', { name: 'MW12 pick order' });
    await expect(order.locator('ol').first().locator('li')).toHaveText(KEPT);
    await expect(order.locator('ol').last().locator('li')).toHaveText(importKept.candidateOrder);
    await expect(sheet.getByText(/record it as a correction before the first MW12 pick/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Apply|Reorder|Use corrected order/ })).toHaveCount(0);
    // Position n of each list sits on the same line, at every width (a wrapped label must not shift one column).
    const rows = async () => order.locator('ol').evaluateAll(lists => lists.map(list => [...list.children].map(li => Math.round(li.getBoundingClientRect().top))));
    await captureCommissioner(page, testInfo, 'corrections-import-kept');
    for (const [theme, width] of [['dark', 320], ['light', 320], ['dark', 390], ['light', 390]]) {
      await page.setViewportSize({ width, height: 844 });
      await setCaptureTheme(page, theme, { forcedColors: 'none' });
      const [kept, candidate] = await rows();
      expect(kept, `${theme} ${width} aligned order rows`).toEqual(candidate);
      // The full lists, centred: the top and bottom captures cut through the middle of the card.
      await order.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await expect(order).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath(`corrections-import-kept-${theme}-${width}-order.png`) });
    }
  } finally { await world.db.close(); }
});
