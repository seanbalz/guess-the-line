// Me › History: Guess and Bets weeks (redesign build plan stage 73), on the real handler, every migration and local PGlite
// with the 2026 Week 5 replay (history-world.mjs). Contracts, at 390 × 844:
// - History opens from Me › Menu and from #history, its code loading only then; Back closes it;
// - Guess weeks for any member, removed members listed; Week 5 Spread: Sean 95.8 (original time not recorded, ruled
//   eligible), Steven 91.4 (ruled eligible), Ben 37.6 (commissioner-ruled lines, labelled on every game);
// - your own weeks: "Saw picks early", the Late pill, the draft closed at kickoff and your changes in plain words; no other
//   member's week shows a change list or a draft;
// - Bets weeks: who placed each Virtual Units pick, with its result and units;
// - no side scroll, 44px targets, no text under 12px, nothing clipped (layoutProblems); axe clean at 390 and 320, Dark and Light.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNTS, pgliteAvailable, signIn } from './community-world.mjs';
import { historyWorld, ANCHORS, BEN, STEVEN } from './history-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(180000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const AXE = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const history = page => page.locator('[data-page="history"]');
const people = page => history(page).getByRole('group', { name: 'Player', exact: true });
const weekRow = (page, week = 5) => history(page).locator(`[data-week="${week}"]`);

async function openNext(page, account = 'luke', fragment = '#home') {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank'); await page.goto(`/${fragment}`);
  await signIn(page, account, { navigate: false });
}
/** Layout at the current width, then axe in Dark and Light at 390 and 320. */
async function phoneChecks(page, label, testInfo) {
  const found = {};
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      // The shell's sport row scrolls under the fixed top bar; check each screen from its top, as the phone layout spec does.
      await page.evaluate(() => window.scrollTo(0, 0));
      const problems = await page.evaluate(layoutProblems);
      if (problems.length) found[`${label} ${theme} ${width}`] = problems;
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} ${theme} ${width} side scroll`).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(AXE).analyze()).violations, `${label} ${theme} ${width}`).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath(`history-${label}-${theme}.png`), fullPage: true });
  }
  expect(found).toEqual({});
}

test('Guess weeks: any member\'s week with its anchors and labels; your own week with your changes', async ({ page, baseURL }, testInfo) => {
  const world = await historyWorld(page, baseURL);
  try {
    await world.db.query('insert into public.gtl_community_removals(user_id,removed_by) values($1,$2)', [ACCOUNTS.troy.id, ACCOUNTS.sean.id]);
    const chunks = [];
    page.on('request', request => { if (/\/assets\/History-[^/]+\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url()); });
    await openNext(page);
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    expect(chunks).toHaveLength(0);
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'History', exact: true }).click();
    await expect(history(page).getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
    expect(chunks.length).toBeGreaterThan(0);

    // Person chips: you first, then everyone; a removed member is listed with the word.
    await expect(people(page).getByRole('button')).toHaveText(['You', 'Ben Fixture', 'Sean Fixture', 'Steven Fixture', 'Troy Fixture · Removed']);
    await expect(people(page).getByRole('button', { name: 'You' })).toHaveAttribute('aria-pressed', 'true');

    // Your Spread: sat out by "See picks now".
    await expect(weekRow(page)).toContainText('Saw picks early');
    await phoneChecks(page, 'weeks', testInfo);

    // Sean's Week 5 Spread: 95.8, original time not recorded, ruled eligible (D-08, D-27).
    await people(page).getByRole('button', { name: 'Sean Fixture' }).click();
    await expect(weekRow(page)).toContainText(`${ANCHORS.sean} pts`);
    await weekRow(page).click();
    const detail = history(page).locator('[data-week-detail="5"]');
    await expect(detail.locator('[data-week-points]')).toHaveText(`${ANCHORS.sean} pts · 15 of 15 scored`);
    await expect(detail).toContainText('Original time not recorded');
    await expect(detail).toContainText('Ruled eligible');
    await expect(detail).toContainText('Submitted');
    await expect(detail.locator('[data-own-changes]')).toHaveCount(0);
    await expect(detail.locator('[data-closed-draft]')).toHaveCount(0);
    // A game's provenance opens on a tap: compared at the stored submission time.
    await detail.locator('[data-game="TB-DAL"] summary').click();
    await expect(detail.locator('[data-game="TB-DAL"]')).toContainText('Compared at the stored submission time');
    await expect(detail.locator('[data-game="TB-DAL"]')).toContainText('DAL −9.5');
    await phoneChecks(page, 'week-sean', testInfo);
    await detail.getByRole('button', { name: 'All weeks' }).click();

    // Steven: 91.4 on his practice-origin, ruled-eligible Spread.
    await people(page).getByRole('button', { name: 'Steven Fixture' }).click();
    await expect(weekRow(page)).toContainText(`${ANCHORS.steven} pts`);
    await weekRow(page).click();
    await expect(detail.locator('[data-week-points]')).toHaveText(`${ANCHORS.steven} pts · 15 of 15 scored`);
    await expect(detail).toContainText('Ruled eligible');
    await detail.getByRole('button', { name: 'All weeks' }).click();

    // Ben: 37.6 against the commissioner-ruled lines (D-25), labelled on each game.
    await people(page).getByRole('button', { name: 'Ben Fixture' }).click();
    await weekRow(page).click();
    await expect(detail.locator('[data-week-points]')).toHaveText(`${ANCHORS.ben} pts · 15 of 15 scored`);
    await expect(detail).toContainText('Commissioner-ruled lines');
    await expect(detail.locator('[data-game]')).toHaveCount(15);
    await expect(detail.locator('[data-game]').filter({ hasText: 'Commissioner-ruled line' })).toHaveCount(15);

    // Your own Total: one game locked in on time, one Late, one draft closed at kickoff, and your changes in plain words.
    await detail.getByRole('button', { name: 'All weeks' }).click();
    await people(page).getByRole('button', { name: 'You' }).click();
    await history(page).getByRole('group', { name: 'Market' }).getByRole('button', { name: 'Total' }).click();
    await expect(weekRow(page)).toContainText('2 locked in');
    await expect(weekRow(page)).toContainText('Late · 12 min');
    await weekRow(page).click();
    await expect(detail.getByText('Late · 12 min').first()).toBeVisible();
    await expect(detail.locator('[data-closed-draft]')).toHaveText([/^Chicago Bears at Green Bay Packers[A-Z@]* · Closed at kickoff · draft 47\.5 not locked in$/]); // D-62 marks
    const changes = detail.locator('[data-own-changes]');
    await expect(changes.locator('li')).toHaveCount(5);
    // D-62: each change leads with the game as marks, read as one sentence; the codes beside the marks follow it.
    const TB_DAL = 'Tampa Bay Buccaneers at Dallas Cowboys[A-Z@]*', PHI_JAX = 'Philadelphia Eagles at Jacksonville Jaguars[A-Z@]*';
    await expect(changes).toContainText(new RegExp(`${TB_DAL}: draft 43\\.5`));
    await expect(changes).toContainText(new RegExp(`${TB_DAL}: locked in 44\\.5 · line pending`));
    await expect(changes).toContainText(new RegExp(`${PHI_JAX}: draft 41\\.5`));
    await expect(changes).toContainText(/Chicago Bears at Green Bay Packers[A-Z@]*: draft 47\.5/);
    await expect(changes).toContainText(new RegExp(`${PHI_JAX}: locked in 41\\.5 · line 46\\.5`));
    await expect(changes.locator('li').filter({ hasText: new RegExp(`${PHI_JAX}: locked in`) })).toContainText('Late · 12 min');
    await phoneChecks(page, 'week-own', testInfo);

    // Back closes the page; #history opens it again directly.
    await history(page).getByRole('button', { name: 'Back', exact: true }).first().click();
    await expect(history(page)).toHaveCount(0);
    await page.goto('about:blank'); await page.goto('/#history');
    await expect(history(page).getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});

test('Bets weeks: everyone\'s Virtual Units picks for the week, who placed each one, results and units', async ({ page, baseURL }, testInfo) => {
  const world = await historyWorld(page, baseURL);
  try {
    await openNext(page, 'luke', '#history/bets');
    await expect(history(page).getByRole('group', { name: 'History view' }).getByRole('button', { name: 'Bets' })).toHaveAttribute('aria-pressed', 'true');
    await expect(history(page).getByRole('combobox', { name: 'Week', exact: true })).toHaveValue('5');
    const you = history(page).locator(`[data-bets-player="${ACCOUNTS.luke.id}"]`), troy = history(page).locator(`[data-bets-player="${ACCOUNTS.troy.id}"]`);
    await expect(you).toContainText('You');
    await expect(you).toContainText(/San Francisco 49ers at Seattle Seahawks[A-Z@]* · Over 45\.5 · 2U/); // D-62 marks
    await expect(you).toContainText('LOST');
    await expect(you).toContainText('−2U');
    await expect(troy).toContainText('Troy Fixture');
    await expect(troy).toContainText(/Tampa Bay Buccaneers at Dallas Cowboys[A-Z@]* · DAL −8\.5 · 1U/);
    await expect(troy).toContainText('WIN');
    await expect(troy).toContainText('+0.91U');
    await expect(history(page).locator('[data-bets-player]')).toHaveCount(2);
    await phoneChecks(page, 'bets', testInfo);
    // Steven and Ben have no bets: not listed; their names appear only in Guess.
    await expect(history(page)).not.toContainText(STEVEN.name);
    await expect(history(page)).not.toContainText(BEN.name);
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});
