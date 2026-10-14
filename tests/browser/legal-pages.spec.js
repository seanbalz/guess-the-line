import { test, expect } from '@playwright/test';

// Served from the built dist by scripts/test-server.mjs, the same files Cloudflare Pages serves.
for (const [route, heading] of [['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service']]) {
  test(`${route} returns 200 HTML that reads without JavaScript at 320px`, async ({ browser, request }) => {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^text\/html/);
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
    const page = await context.newPage();
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the app' })).toHaveAttribute('href', '/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await context.close();
  });
}
