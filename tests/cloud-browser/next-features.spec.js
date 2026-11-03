import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL, HOSTED } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { seedFinishedWeek } from '../helpers/features-week.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Redesign build plan stage 71: badges, streaks and awards in the new app, on local PGlite through the real gtl-api handler.
// The schema before M-25 (hosted until its October 27, 2026 apply) shows nothing new; ALL (M-25) with a finished fixture Week 4
// (tests/helpers/features-week.mjs) shows the
// recap, streaks, the shelf, a badge's detail and one celebration. Fixture accounts, games and numbers only.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(180000);
// HOSTED before the M-25 and M-26 apply (RELEASE_2026_10_27_FEED_MIGRATIONS.md).
const BEFORE_M25 = HOSTED.filter(file => file < '20261026234000_gtl_league_features.sql');
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
  // Contrast is measured on what stays on screen: an overlay still fading in (opacity under 1) reads as low contrast,
  // so finite animations finish first (the LIVE dot's loop is left running).
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
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
  const world = await communityWorld(page, baseURL, { migrations: BEFORE_M25 });
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
  // D-69 (Sean's P5A): the page is a nesting layer under the Play lip.
  await expect(screen.getByRole('heading', { name: 'Badges and awards', level: 2 })).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Back to Play' })).toBeVisible();
  const streaksTile = screen.locator('[data-features="streaks-tile"]'), awardsTile = screen.locator('[data-features="awards-tile"]');
  await expect(awardsTile).toContainText('Posts once the week is final', { timeout: 2000 });
  await expect(awardsTile).not.toContainText(/\d/);
  await expect(streaksTile).toContainText('Pick streak');
  await expect(screen.locator('[data-features="shelf"]')).toContainText('0 of 9 earned');
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

  await expect(awardsTile).toContainText('You won Spread winner');
  await expect(screen.locator('[data-features="shelf"]')).toContainText('4 of 9 earned'); // Bullseye, Double Bullseye, Dialed In, Dog Day
  await expect(streaksTile.getByRole('button')).toHaveAttribute('aria-label', 'Your streaks: Pick streak, 1 week');
  await phoneChecks(page, info, 'features-top');
  await targets44(screen);

  // The awards layer: its own address, its heading focused, the week's awards; Back closes one layer.
  await awardsTile.getByRole('button').click();
  await expect(page).toHaveURL(/#play\/features\?layer=awards$/);
  await expect(screen.getByRole('heading', { name: 'Week 4 awards', level: 2 })).toBeFocused();
  await expect(screen.locator('[data-features="awards"]')).toContainText('Worst beat');
  await expect(screen.locator('[data-features="awards"]')).toContainText('Lost by 12.5');
  await phoneChecks(page, info, 'features-awards');
  await page.goBack();
  await expect(screen.getByRole('heading', { name: 'Badges and awards', level: 2 })).toBeVisible();

  // The streaks layer: both streaks with their meter and best; its lip returns to the first card.
  await streaksTile.getByRole('button').click();
  await expect(page).toHaveURL(/#play\/features\?layer=streaks$/);
  await expect(screen.getByRole('img', { name: 'Pick streak, 1 week' })).toBeVisible();
  await expect(screen.locator('[data-features="streaks"]')).toContainText('Weeks you sent both ballots · Best 1');
  await phoneChecks(page, info, 'features-streaks');
  await screen.getByRole('button', { name: 'Back to Badges and awards' }).click();
  await expect(page).toHaveURL(/#play\/features$/);

  // A badge's layer: the 96 tile, rarity in words, the rule, how often and when; a reload reopens it.
  await screen.getByRole('button', { name: /^Bullseye, Uncommon, earned 3 times/ }).click();
  await expect(page).toHaveURL(/#play\/features\?layer=badge&item=bullseye$/);
  await expect(screen.getByRole('heading', { name: 'Bullseye', level: 2 })).toBeFocused();
  await expect(screen).toContainText('Guess a line exactly (10 points).');
  await expect(screen).toContainText('Earned 3 times');
  // D-62: the game is drawn as marks (read as one sentence); the codes beside the marks sit between in textContent.
  await expect(screen).toContainText(/Week 4 · Seattle Seahawks at Denver Broncos[A-Z@]* · Spread DEN −8\.5 exact/);
  await phoneChecks(page, info, 'features-badge');
  await page.reload();
  await expect(screen.getByRole('heading', { name: 'Bullseye', level: 2 })).toBeVisible();
  await screen.getByRole('button', { name: 'Back to Badges and awards' }).click();
  await screen.getByRole('button', { name: /^Hot Hand, Rare, not earned yet\./ }).click();
  await expect(screen).toContainText('Not earned yet');
  expect(world.errors).toEqual([]);
});

test('reduced motion: the celebration still says what happened, with no animation', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedFinishedWeek(world);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNewApp(page, '#play/features');
  await expect(page.locator('[data-landing="features"]')).toContainText('0 of 9 earned');
  expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const flash = page.getByRole('dialog', { name: 'New results' });
  await expect(flash).toBeVisible();
  for (const selector of ['.gx-fx-burst', '.gx-ov-card']) expect(await flash.evaluate((el, s) => getComputedStyle(el.matches(s) ? el : el.querySelector(s)).animationName, selector)).toBe('none');
  await expect(flash).toContainText('Bullseye');
  expect(world.errors).toEqual([]);
});

test('Home\'s recap card and the League board\'s "Won Week 4" show once the job has run, and open the screen', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedFinishedWeek(world);
  expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
  await openNewApp(page, '#home');
  await expect(page.locator('[data-landing="home"]')).toBeVisible();
  // The design lane's hierarchy pass turned the one-line recap row into the awards card (the chips, one award open).
  const recap = page.locator('[data-home="awards"]');
  await expect(recap.getByRole('heading', { name: 'Week 4 awards' })).toBeVisible();
  await expect(recap).toContainText('You won Spread winner');
  // The first read on this device seeds what Luke has seen: no celebration on page load.
  await expect(page.getByRole('dialog', { name: 'New results' })).toHaveCount(0);
  await recap.getByRole('button', { name: 'All badges and awards' }).click();
  await expect(page).toHaveURL(/#play\/features/);
  await page.goto('/#play/league?view=board');
  const board = page.getByRole('list', { name: 'Spread season standings' });
  await expect(board).toContainText('Won Week 4');
  expect(await page.evaluate(layoutProblems)).toEqual([]);
  expect(world.errors).toEqual([]);
});

test('D-69 (the review race): a scroll press on the launch screen is not a navigation; an away badge waits as NEW and plays when Play opens', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedFinishedWeek(world);
  expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
  // Yesterday this device read the community's features before the job ran: the record holds only the source's marker.
  await page.addInitScript(key => {
    if (sessionStorage.getItem('gtl-test-seeded')) return;
    localStorage.setItem(key, JSON.stringify(['source:features:community']));
    sessionStorage.setItem('gtl-test-seeded', '1');
  }, `gtl.next.moments.v1.${ACCOUNTS.luke.id}`);
  // The session's first features read is held until after Luke's first press.
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let first = true;
  await page.route(url => url.pathname.endsWith('/league/features'), async route => {
    if (first) { first = false; await held; }
    await route.fallback();
  });
  await openNewApp(page, '#home');
  const hero = page.locator('[data-home="hero"]');
  await expect(hero).toBeVisible();
  await hero.getByRole('heading', { level: 2 }).click(); // a trusted press on words (a scroll touch), not a navigation
  release();
  const awards = page.locator('[data-home="awards"]');
  await expect(awards.getByRole('heading', { name: 'Week 4 awards' })).toBeVisible();
  // Let the read's effects and any overlay they open commit before looking.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))));
  const flash = page.getByRole('dialog', { name: 'New results' });
  await expect(flash, 'nothing plays on the launch screen, even after a press').toHaveCount(0);
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await expect(flash, 'it plays when a card holding it opens after a navigation').toBeVisible();
  await expect(flash).toContainText('Bullseye');
  expect(world.errors).toEqual([]);
});
