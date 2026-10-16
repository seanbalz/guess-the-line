import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, signIn, storeBookLines, sendBallot, ACCOUNTS, pgliteAvailable } from './community-world.mjs';

test.use({ viewport: { width: 390,height: 844 } });
test.skip(!pgliteAvailable,'Local PGlite runtime required');
async function ready(page, baseURL) {
  const world = await communityWorld(page,baseURL,{ migrations: ALL,optionalRpc: true,troyBallots: false,groupScreens: true });
  await storeBookLines(world,{ spread: Object.fromEntries(world.state.games.map((g,i) => [g.id,[-3.5,2.5][i]])),total: Object.fromEntries(world.state.games.map((g,i) => [g.id,[44.5,47.5][i]])) });
  await sendBallot(world,'luke','guess_spread',Object.fromEntries(world.state.games.map((g,i) => [g.id,[-3,2][i]])));
  await sendBallot(world,'troy','guess_spread',Object.fromEntries(world.state.games.map((g,i) => [g.id,[-4,2.5][i]])));
  await signIn(page,'luke');
  await page.getByRole('button',{ name: 'Try the new app',exact: true }).click();
  await expect(page.getByRole('heading',{ name: 'Home',exact: true })).toBeVisible();
  return world;
}
test('Home guide and account settings persist; comparisons use revealed common games, markets and mobile accessible tables', async ({ page, baseURL }, testInfo) => {
  const world = await ready(page,baseURL);
  try {
    await expect(page.getByRole('heading',{ name: 'New here? Start here' })).toBeVisible();
    await expect(page.getByText('Ranked wagers unavailable:',{ exact: false })).toBeVisible();
    await page.getByRole('button',{ name: 'Collapse guide',exact: true }).click();
    await expect(page.getByRole('button',{ name: 'Show getting started guide' })).toBeVisible();
    await page.getByRole('button',{ name: 'Choose sportsbooks',exact: true }).click();
    await page.getByRole('checkbox',{ name: 'DraftKings',exact: true }).check();
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByText('Settings saved.',{ exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{ name: 'Compare players',exact: true }).click();
    await expect(page.getByRole('heading',{ name: 'Compare players',exact: true })).toBeVisible();
    await expect(page.getByText('2 included · 0 excluded of 2 games in these filters')).toBeVisible();
    await expect(page.getByText('2 contributors including you',{ exact: false }).first()).toBeVisible();
    await page.getByRole('button',{ name: 'Choose players',exact: true }).click();
    await expect(page.getByText('Select at least one other player.',{ exact: true })).toBeVisible();
    await page.getByRole('checkbox',{ name: ACCOUNTS.troy.name }).check();
    await expect(page.getByText('2 included · 0 excluded of 2 games in these filters')).toBeVisible();
    await page.getByRole('checkbox',{ name: ACCOUNTS.sean.name }).check();
    await expect(page.getByText('No common scored games yet.',{ exact: false })).toBeVisible();
    await page.getByRole('checkbox',{ name: ACCOUNTS.sean.name }).uncheck();
    await page.getByRole('combobox',{ name: 'Period',exact: true }).selectOption('season');
    await expect(page.getByText('2 included · 0 excluded of 2 games in these filters')).toBeVisible();
    await page.getByRole('button',{ name: 'Total',exact: true }).click();
    await expect(page.getByText('No common scored games yet.',{ exact: false })).toBeVisible();
    await page.getByRole('button',{ name: 'Spread',exact: true }).click();
    for (const theme of ['dark','light']) {
      await page.evaluate(theme => document.documentElement.setAttribute('data-theme',theme),theme);
      await page.setViewportSize({ width: 320,height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const audit = await new AxeBuilder({ page }).include('.gx').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      expect(audit.violations.map(v => ({ id: v.id,nodes: v.nodes.map(n => n.target) }))).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`comparison-320-${theme}.png`),fullPage: true });
    }
  } finally { await world.db.close(); }
});
test('settings retain the draft on a concurrent account write; Home resets for the next account', async ({ page, baseURL }, testInfo) => {
  const world = await ready(page,baseURL);
  try {
    await page.getByRole('button',{ name: 'Choose sportsbooks',exact: true }).click();
    await page.getByRole('checkbox',{ name: 'DraftKings',exact: true }).check();
    const concurrent = await world.api('luke','me/preferences/save',{ revision: 0,sportsbooks: ['fanduel'],guidanceCollapsed: true });
    expect(concurrent.status).toBe(200);
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Saved settings changed' })).toBeVisible();
    await expect(page.getByRole('checkbox',{ name: 'DraftKings',exact: true })).toBeChecked();
    expect((await world.api('luke','me/preferences',{})).body.sportsbooks).toEqual(['fanduel']);
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByText('Settings saved.',{ exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    // Use the real menu sign-out so account-bound draft/cache cleanup runs.
    await page.getByRole('button',{ name: /Open menu|Your menu|Account menu/ }).click();
    await page.getByRole('button',{ name: 'Sign out',exact: true }).click();
    await signIn(page,'sean');
    await expect(page.getByRole('heading',{ name: 'New here? Start here' })).toBeVisible();
    await page.getByRole('button',{ name: 'Choose sportsbooks',exact: true }).click();
    await expect(page.getByRole('checkbox',{ name: 'DraftKings',exact: true })).not.toBeChecked();
  } finally { await world.db.close(); }
});


test('a failed settings save keeps the draft and retry checks the saved version first', async ({ page,baseURL }) => {
  const world = await ready(page,baseURL);
  try {
    await page.getByRole('button',{ name: 'Choose sportsbooks',exact: true }).click();
    await page.getByRole('checkbox',{ name: 'DraftKings',exact: true }).check();
    const pattern = '**/functions/v1/gtl-api/me/preferences/save';
    await page.route(pattern,route => route.fulfill({ status: 500,contentType: 'application/json',body: JSON.stringify({ error: 'Service unavailable.' }) }));
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Your draft is kept' })).toBeVisible();
    await expect(page.getByRole('checkbox',{ name: 'DraftKings',exact: true })).toBeChecked();
    expect((await world.api('luke','me/preferences',{})).body.sportsbooks).toEqual([]);
    await page.unroute(pattern);
    await page.getByRole('button',{ name: 'Check saved settings',exact: true }).click();
    await expect(page.getByText('Settings saved.',{ exact: true })).toBeVisible();
    expect((await world.api('luke','me/preferences',{})).body.sportsbooks).toEqual(['draftkings']);
  } finally { await world.db.close(); }
});
