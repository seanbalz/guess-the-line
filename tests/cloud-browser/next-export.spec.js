// Me › Menu › Export my data (redesign build plan stage 75; M-28, D-23, D-52), on the real handler, every migration and local
// PGlite with the Week 5 replay (history-world.mjs). Contracts, at 390 × 844:
// - one tap downloads one JSON file of your own account (/me/export): your rows only, the Late marker included, no push
//   device; the sheet's code loads only when it opens;
// - the file is made in the browser and sent nowhere else: the only request is POST /me/export;
// - no side scroll, 44px targets, nothing clipped (layoutProblems); axe clean at 390 and 320, Dark and Light.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ACCOUNTS, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';
import { historyWorld } from './history-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(150000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

test('Export my data downloads your own records as one file, made in the browser', async ({ page, baseURL }, testInfo) => {
  const world = await historyWorld(page, baseURL);
  try {
    await world.db.query("insert into public.gtl_push_subscriptions(endpoint,user_id,p256dh,auth) values('https://fcm.googleapis.com/fcm/send/luke-device-secret',$1,$2,$3)", [ACCOUNTS.luke.id, `B${'L'.repeat(86)}`, 'K'.repeat(22)]);
    const chunks = [], calls = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (/\/assets\/ExportSheet-[^/]+\.js$/.test(url.pathname)) chunks.push(url.pathname);
      if (url.origin === SUPABASE && url.pathname.endsWith('/me/export')) calls.push(request.method());
    });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('about:blank'); await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    expect(chunks).toHaveLength(0);
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Export my data', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Export my data' });
    await expect(sheet).toBeVisible();
    expect(chunks.length).toBeGreaterThan(0);

    const found = {};
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const problems = await page.evaluate(layoutProblems);
        if (problems.length) found[`${theme} ${width}`] = problems;
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations, `${theme} ${width}`).toEqual([]);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: testInfo.outputPath(`export-${theme}.png`) });
    }
    expect(found).toEqual({});

    const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Download my data', exact: true }).click()]);
    expect(download.suggestedFilename()).toMatch(/^guess-the-line-export-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(sheet.getByRole('status')).toHaveText(`Downloaded ${download.suggestedFilename()}.`);
    const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect([file.format, file.ownerId]).toEqual(['gtl-account-export-v1', ACCOUNTS.luke.id]);
    expect(file.ballots.map(b => [b.week, b.mode, b.late?.minutes])).toEqual([[5, 'guess_total', 12]]);
    expect(file.forfeits.map(f => f.reason)).toEqual(['reveal']);
    expect(file.virtualUnits.map(v => v.gameId)).toEqual(['SF-SEA']);
    const text = JSON.stringify(file);
    expect(text).not.toContain('luke-device-secret');
    expect(text).not.toContain('Steven Fixture');
    expect(calls).toEqual(['POST']);
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});
