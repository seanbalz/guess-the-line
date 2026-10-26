import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL, HOSTED } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { seedFinishedWeek } from '../helpers/features-week.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Redesign build plan stage 71: badges, streaks and awards in the new app, on local PGlite through the real gtl-api handler.
// HOSTED (no M-25) shows nothing new; ALL (M-25) with a finished fixture Week 4 (tests/helpers/features-week.mjs) shows the
// recap, streaks, the shelf, a badge's detail and one celebration. Fixture accounts, games and numbers only.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(180000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const tabs = page => page.getByRole('navigation', { name: 'Main' });
const SAMPLE = /Sunday Crew|Office Pool|Marcus|Priya|Jules|Kenny|\bDre\b|sample/i;
async function openNewApp(page, address = '#play') {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto(`/${address}`);
  await signIn(page, 'luke', { navigate: false });
  await expect(page.locator('.gx')).toBeVisible();
}
async function axe(page) {
  return (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id);
}
async function phoneChecks(page, info, name) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(layoutProblems), `${name} ${theme} ${width}`).toEqual([]);
      expect(await axe(page), `${name} ${theme} ${width}`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${theme}.png`), fullPage: true });
    }
  }
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.setViewportSize({ width: 390, height: 844 });
}
async function targets44(scope) {
  for (const target of await scope.locator('button, a[href], summary').all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    expect(Math.min(box.width, box.height), await target.innerText()).toBeGreaterThanOrEqual(44);
  }
}

test('without M-25: no new row on Play or Home, and the screen says "coming soon"', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED });
  expect((await world.api('luke', 'league/features', {})).status).toBe(404);
  await openNewApp(page);
  await expect(page.locator('[data-landing="play"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'My league' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Badges and awards' })).toHaveCount(0);
  await tabs(page).getByRole('button', { name: /^Home(,|$)/ }).click();
  await expect(page.locator('[data-landing="home"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /awards$/ })).toHaveCount(0);
  await page.goto('/#play/features');
  await expect(page.getByText('Badges and awards are coming soon.')).toBeVisible();
  expect(world.errors).toEqual([]);
});

test('before the job has run: an empty recap with no sample, streaks at 0 and the badges to earn; then the run brings one celebration', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedFinishedWeek(world);
  await openNewApp(page);
  const row = page.getByRole('button', { name: 'Badges and awards' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/#play\/features/);
  const screen = page.locator('[data-landing="features"]');
  await expect(screen.getByRole('heading', { name: 'Badges and awards', level: 1 })).toBeVisible();
  await expect(screen.locator('[data-features="recap"]')).toHaveCount(0, { timeout: 2000 });
  await expect(screen).toContainText('Weekly awards post here once every game of the week is final.');
  await expect(screen.locator('[data-features="streaks"]')).toContainText('Pick streak');
  await expect(screen.locator('[data-features="shelf"]')).toContainText('Badges · 0 of 9');
  await expect(screen).not.toContainText(SAMPLE);
  await phoneChecks(page, info, 'features-empty');

  // The commissioner's run records Week 4. Nothing moves on page load: Luke's next read (Refresh) brings one overlay.
  expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
  await screen.getByRole('button', { name: 'Refresh', exact: true }).click();
  const flash = page.getByRole('dialog', { name: 'New results' });
  await expect(flash).toBeVisible();
  await expect(flash).toContainText('Bullseye');
  // One overlay however many arrived (Luke has 7 badges and 4 awards): three lines and the count of the rest.
  await expect(flash.locator('.gx-fx-lines li')).toHaveCount(3);
  await expect(flash).toContainText('and 8 more');
  expect(await flash.locator('.gx-fx-burst').evaluate(el => getComputedStyle(el).animationName)).toBe('gx-fx-burst');
  expect(await axe(page)).toEqual([]);
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  await targets44(flash);
  await page.screenshot({ path: info.outputPath('features-flash-390.png') });
  await flash.getByRole('button', { name: 'Nice', exact: true }).click();
  await expect(flash).toHaveCount(0);

  const recap = screen.locator('[data-features="recap"]');
  await expect(recap.getByRole('heading', { name: 'Week 4 awards' })).toBeVisible();
  await expect(recap).toContainText('You won Spread winner');
  await expect(recap).toContainText('Worst beat');
  await expect(recap).toContainText('Lost by 12.5');
  await expect(screen.locator('[data-features="shelf"]')).toContainText('Badges · 4 of 9'); // Bullseye, Double Bullseye, Dialed In, Dog Day
  await expect(screen.locator('[data-features="streaks"]')).toContainText('week · Best 1');
  await expect(screen.locator('[data-features="streaks"]')).not.toContainText('weeks · Best 1', { timeout: 1000 });
  await phoneChecks(page, info, 'features-recap');
  await targets44(screen);

  // A badge's detail: the 96 tile, rarity in words, the rule, how often and when.
  await screen.getByRole('button', { name: /^Bullseye, Uncommon, earned 3 times$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Bullseye' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Guess a line exactly (10 points).');
  await expect(sheet).toContainText('Earned 3 times');
  await expect(sheet).toContainText('Week 4 · SEA @ DEN · Spread DEN −8.5 exact');
  await phoneChecks(page, info, 'features-badge');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await screen.getByRole('button', { name: /^Hot Hand, Rare, not earned yet\./ }).click();
  await expect(page.getByRole('dialog', { name: 'Hot Hand' })).toContainText('Not earned yet');
  expect(world.errors).toEqual([]);
});

test('reduced motion: the celebration still says what happened, with no animation', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedFinishedWeek(world);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNewApp(page, '#play/features');
  await expect(page.locator('[data-landing="features"]')).toContainText('Badges · 0 of 9');
  expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const flash = page.getByRole('dialog', { name: 'New results' });
  await expect(flash).toBeVisible();
  for (const selector of ['.gx-fx-burst', '.gx-ov-card']) expect(await flash.evaluate((el, s) => getComputedStyle(el.matches(s) ? el : el.querySelector(s)).animationName, selector)).toBe('none');
  await expect(flash).toContainText('Bullseye');
  expect(world.errors).toEqual([]);
});

test('Home\'s recap row and the League board\'s "Won Week 4" show once the job has run, and open the screen', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedFinishedWeek(world);
  expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
  await openNewApp(page, '#home');
  await expect(page.locator('[data-landing="home"]')).toBeVisible();
  const recapRow = page.getByRole('button', { name: 'Week 4 awards' });
  await expect(recapRow).toHaveAccessibleDescription('You won Spread winner');
  // The first read this session sets what Luke has seen: no celebration on page load.
  await expect(page.getByRole('dialog', { name: 'New results' })).toHaveCount(0);
  await recapRow.click();
  await expect(page).toHaveURL(/#play\/features/);
  await page.goto('/#play/league?view=board');
  const board = page.getByRole('list', { name: 'Spread season standings' });
  await expect(board).toContainText('Won Week 4');
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  expect(world.errors).toEqual([]);
});
