import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { communityWorld, signIn, storeBookLines, sendBallot, ACCOUNTS, pgliteAvailable } from './community-world.mjs';

test.use({ viewport: { width: 390,height: 844 } });
test.skip(!pgliteAvailable,'Local PGlite runtime required');
// A confirmed save is three local-database round trips (fresh read, save, confirming read); on a loaded machine they
// can outlast the default five-second wait, so the confirmation gets longer. It still has to say "Settings saved.".
const SAVE_ROUND_TRIPS = 15_000;
async function ready(page, baseURL) {
  const world = await communityWorld(page,baseURL,{ migrations: ALL,optionalRpc: true,troyBallots: false,groupScreens: true });
  await storeBookLines(world,{ spread: Object.fromEntries(world.state.games.map((g,i) => [g.id,[-3.5,2.5][i]])),total: Object.fromEntries(world.state.games.map((g,i) => [g.id,[44.5,47.5][i]])) });
  await sendBallot(world,'luke','guess_spread',Object.fromEntries(world.state.games.map((g,i) => [g.id,[-3,2][i]])));
  await sendBallot(world,'troy','guess_spread',Object.fromEntries(world.state.games.map((g,i) => [g.id,[-4,2.5][i]])));
  await signIn(page,'luke');
  await expect(page.getByRole('heading',{ name: 'Home',exact: true })).toBeVisible();
  return world;
}
async function settings(page) {
  await page.getByRole('button', { name: 'Your menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings · sportsbooks and guidance', exact: true }).click();
}
async function guide(page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.getByText('How to play', { exact: true }).click();
}
test('Home guide and account settings persist; Compare is one head-to-head at a time, gated per game, on accessible phone layouts', async ({ page, baseURL }, testInfo) => {
  const world = await ready(page,baseURL);
  try {
    await guide(page);
    await expect(page.getByRole('heading',{ name: 'New here? Start here' })).toBeVisible();
    await page.getByRole('button',{ name: 'Collapse guide',exact: true }).click();
    await expect(page.getByRole('button',{ name: 'Show getting started guide' })).toBeVisible();
    await settings(page);
    await page.getByRole('checkbox',{ name: 'DraftKings',exact: true }).check();
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByText('Settings saved.',{ exact: true })).toBeVisible({ timeout: SAVE_ROUND_TRIPS });
    await page.keyboard.press('Escape');
    // D-69 step 1 Compare (P3B). Troy also sends a Total ballot Luke has not matched: it must stay hidden (D-31).
    await sendBallot(world,'troy','guess_total',Object.fromEntries(world.state.games.map((g,i) => [g.id,[41.5,52.5][i]])));
    await page.evaluate(() => { location.hash = '#play/compare'; });
    const layer = page.getByRole('region',{ name: 'Compare',exact: true });
    await expect(layer.getByRole('heading',{ name: 'Compare',exact: true })).toBeVisible();
    const faces = layer.getByRole('group',{ name: 'Compare with' });
    await expect(faces.getByRole('button',{ name: ACCOUNTS.troy.name })).toHaveAttribute('aria-pressed','true');
    await expect(layer.getByText('Troy leads by 1',{ exact: true })).toBeVisible();
    await expect(layer.getByText('Bullseyes 0–1 · Avg miss 0.5–0.3 · 2 shared games',{ exact: true })).toBeVisible();
    await expect(layer.getByText('EVEN',{ exact: true })).toBeVisible();
    await expect(layer.getByText('TROY +1',{ exact: true })).toBeVisible();
    await layer.getByRole('button',{ name: 'Total',exact: true }).click();
    await expect(layer.getByText('HIDDEN',{ exact: true })).toHaveCount(2);
    await expect(layer.getByText('Lock yours to see Troy’s guess',{ exact: true })).toHaveCount(2);
    for (const value of ['41.5','52.5']) await expect(layer).not.toContainText(value);
    await layer.getByRole('button',{ name: 'Spread',exact: true }).click();
    await faces.getByRole('button',{ name: 'Everyone',exact: true }).click();
    await expect(layer.getByText('Everyone leads by 0.5',{ exact: true })).toBeVisible();
    await faces.getByRole('button',{ name: ACCOUNTS.sean.name }).click();
    await expect(page).toHaveURL(new RegExp(`#play/compare\\?.*item=${ACCOUNTS.sean.id}`));
    await expect(layer.getByText('No shared games yet',{ exact: true })).toBeVisible();
    await expect(layer.getByText('Sean hasn’t locked in',{ exact: false }).first()).toBeVisible();
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
    await settings(page);
    await page.getByRole('checkbox',{ name: 'DraftKings',exact: true }).check();
    const concurrent = await world.api('luke','me/preferences/save',{ revision: 0,sportsbooks: ['fanduel'],guidanceCollapsed: true });
    expect(concurrent.status).toBe(200);
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Saved settings changed' })).toBeVisible();
    await expect(page.getByRole('checkbox',{ name: 'DraftKings',exact: true })).toBeChecked();
    expect((await world.api('luke','me/preferences',{})).body.sportsbooks).toEqual(['fanduel']);
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByText('Settings saved.',{ exact: true })).toBeVisible({ timeout: SAVE_ROUND_TRIPS });
    await page.keyboard.press('Escape');
    // Use the real menu sign-out so account-bound draft/cache cleanup runs.
    await page.getByRole('button',{ name: /Open menu|Your menu|Account menu/ }).click();
    await page.getByRole('button',{ name: 'Sign out',exact: true }).click();
    await signIn(page,'sean');
    await guide(page);
    await expect(page.getByRole('heading',{ name: 'New here? Start here' })).toBeVisible();
    await settings(page);
    await expect(page.getByRole('checkbox',{ name: 'DraftKings',exact: true })).not.toBeChecked();
  } finally { await world.db.close(); }
});


test('a failed settings save keeps the draft and retry checks the saved version first', async ({ page,baseURL }) => {
  const world = await ready(page,baseURL);
  try {
    await settings(page);
    await page.getByRole('checkbox',{ name: 'DraftKings',exact: true }).check();
    const pattern = '**/functions/v1/gtl-api/me/preferences/save';
    await page.route(pattern,route => route.fulfill({ status: 500,contentType: 'application/json',body: JSON.stringify({ error: 'Service unavailable.' }) }));
    await page.getByRole('button',{ name: 'Save settings',exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Your draft is kept' })).toBeVisible();
    await expect(page.getByRole('checkbox',{ name: 'DraftKings',exact: true })).toBeChecked();
    expect((await world.api('luke','me/preferences',{})).body.sportsbooks).toEqual([]);
    await page.unroute(pattern);
    await page.getByRole('button',{ name: 'Check saved settings',exact: true }).click();
    await expect(page.getByText('Settings saved.',{ exact: true })).toBeVisible({ timeout: SAVE_ROUND_TRIPS });
    expect((await world.api('luke','me/preferences',{})).body.sportsbooks).toEqual(['draftkings']);
  } finally { await world.db.close(); }
});
