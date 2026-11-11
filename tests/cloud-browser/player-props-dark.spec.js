// D-82 Player Props stays invisible in the default build (VITE_GTL_PLAYER_PROPS unset): even against a gtl-api with the
// props routes on and every migration applied on local PGlite, no Player Props control renders in Play › Your guesses,
// Bets › Your guess vs. market or Me › History, no /props request is made and no prop chunk loads. The flag-on build is
// tests/cloud-browser/player-props-on.spec.js (playwright.player-props.config.js).
import { test, expect } from '@playwright/test';
import { pgliteAvailable, signIn } from './community-world.mjs';
import { propsWorld } from './player-props-world.mjs';
import { openPicksWeek } from './play-nest.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => {
  test.skip(process.env.GTL_PLAYER_PROPS_BUILD === 'on', 'The flag-on build is checked by player-props-on.spec.js.');
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
});

test('flag off: no Player Props control, request or chunk anywhere', async ({ page, baseURL }) => {
  const world = await propsWorld(page, baseURL);
  const requests = [], chunks = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.includes('/props/')) requests.push(url.pathname);
    if (/\/assets\/(PlayerPropsEntry|PropRecord|HistoryProps|PropReceipt|PropReveal)-[^/]+\.js$/.test(url.pathname)) chunks.push(url.pathname);
  });
  try {
    await signIn(page, 'luke');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await tabs.getByRole('button', { name: /^Play(,|$)/ }).click();
    await openPicksWeek(page);
    await expect(page.getByRole('group', { name: 'Market', exact: true }).getByRole('button')).toHaveText(['Spread', 'Total']);
    await tabs.getByRole('button', { name: /^Bets(,|$)/ }).click();
    await page.getByRole('button', { name: /Your guess vs\. market/ }).click();
    await expect(page.getByRole('group', { name: 'Recommendation market' }).getByRole('button')).toHaveText(['All', 'Spreads', 'Totals']);
    await page.goto('/#history');
    const history = page.locator('[data-page="history"]');
    await expect(history.getByRole('group', { name: 'Market' }).getByRole('button')).toHaveText(['Spread', 'Total']);
    await expect(page.getByText('Player Props')).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(chunks).toEqual([]);
  } finally { await world.db.close(); }
});
