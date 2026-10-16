import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { buildRankings, DEFAULT_FILTERS } from '../../shared/fantasy-rankings.mjs';

// The shipped public snapshot is exercised in both apps; authentication and community reads stay local in PGlite.
const snapshot = JSON.parse(fs.readFileSync(new URL('../../shared/fantasy/2026-week-06.json', import.meta.url), 'utf8'));
const expected = filters => buildRankings(snapshot, { ...DEFAULT_FILTERS, ...filters }).rows;
const root = (page, app) => page.locator(app === 'next' ? '.gx-fantasy' : '.fantasy-football');
const list = screen => screen.getByRole('list', { name: 'Ranked players', exact: true });
const rowNames = async screen => list(screen).locator('summary').evaluateAll(rows => rows.map(row => row.querySelector('[class$="fantasy-player-main"] > strong').textContent));

async function open(page, baseURL, app) {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await signIn(page, 'luke');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  if (app === 'next') {
    await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#fantasy');
    await page.reload();
  } else await page.getByRole('navigation', { name: 'Community sections' }).getByRole('button', { name: 'Fantasy Football', exact: true }).click();
  const screen = root(page, app);
  await expect(list(screen)).toBeVisible();
  return { world, screen };
}
async function rowsMatch(screen, filters) {
  const names = expected(filters).slice(0, 50).map(player => player.name);
  await expect.poll(() => rowNames(screen)).toEqual(names);
}
async function layout(page, screen) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow').toBe(true);
  const problems = await screen.evaluate(scope => {
    const issues = [];
    for (const el of scope.querySelectorAll('select,input,button,summary,a[href]')) {
      if (!el.getClientRects().length) continue;
      const target = el.type === 'checkbox' ? el.closest('label') : el;
      const bounds = target.getBoundingClientRect();
      if (bounds.width < 43.5 || bounds.height < 43.5) issues.push(`${el.tagName} ${el.textContent.trim().slice(0, 24)}: ${bounds.width}×${bounds.height}`);
      if (el.matches('select,input:not([type=checkbox]),button,a[href]') && parseFloat(getComputedStyle(el).fontSize) < 16) issues.push(`${el.tagName}: text under 16px`);
    }
    return issues;
  });
  expect(problems).toEqual([]);
}

test.describe('fantasy rankings', () => {
  test.use({ actionTimeout: 15000 });
  test.setTimeout(90000);
  for (const app of ['classic', 'next']) test(`${app}: live snapshot filters, scoring, byes, trend details and reset`, async ({ page, baseURL }) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world, screen } = await open(page, baseURL, app);
    try {
      await rowsMatch(screen, {});
      await expect(screen.getByRole('combobox', { name: 'Season', exact: true })).toHaveValue('2026');
      await expect(screen.getByRole('combobox', { name: 'Week', exact: true })).toHaveValue('2026-06');
      await expect(screen.getByText('Stats through Week 5', { exact: false })).toBeVisible();
      await expect(screen.locator('li[class$="fantasy-player-item"]')).toHaveCount(50);
      await screen.getByRole('button', { name: /^Show more players/ }).click();
      await expect(screen.locator('li[class$="fantasy-player-item"]')).toHaveCount(100);

      for (const scoring of ['standard', 'half-ppr', 'ppr']) {
        await screen.getByRole('combobox', { name: 'Scoring', exact: true }).selectOption(scoring);
        await rowsMatch(screen, { scoring });
      }
      await screen.getByRole('combobox', { name: 'Passing touchdowns', exact: true }).selectOption('6');
      await rowsMatch(screen, { passingTds: 6 });
      expect(expected({ passingTds: 6 }).slice(0, 50).map(row => row.id)).not.toEqual(expected({}).slice(0, 50).map(row => row.id));
      await screen.getByRole('combobox', { name: 'Passing touchdowns', exact: true }).selectOption('4');

      for (const position of ['QB', 'RB', 'WR', 'TE', 'K', 'FLEX']) {
        await screen.getByRole('combobox', { name: 'Position', exact: true }).selectOption(position);
        await rowsMatch(screen, { position });
      }
      await screen.getByRole('combobox', { name: 'Position', exact: true }).selectOption('WR');
      const selected = expected({ position: 'WR' })[0];
      await screen.getByRole('combobox', { name: 'Team', exact: true }).selectOption(selected.team);
      await screen.getByLabel('Find a player', { exact: true }).fill(selected.name);
      await rowsMatch(screen, { position: 'WR', team: selected.team, search: selected.name });
      await expect(list(screen).locator('summary')).toContainText(`Overall ${selected.overallRank}`);
      await screen.getByRole('button', { name: 'Reset filters', exact: true }).first().click();

      await screen.getByLabel('Strong trends only', { exact: true }).check();
      await rowsMatch(screen, { trendsOnly: true });
      const trend = expected({ trendsOnly: true })[0];
      await list(screen).locator('summary').first().click();
      await expect(list(screen).locator('li').first().getByText('Trends entering Week 6', { exact: true })).toBeVisible();
      await expect(list(screen).locator('li').first().getByText(trend.trendHighlights[0].detail, { exact: true })).toBeVisible();
      await screen.getByRole('button', { name: 'Reset filters', exact: true }).first().click();

      const bye = snapshot.players.find(player => player.weekly.status === 'bye' && expected({ scope: 'ros', search: player.name }).some(row => row.id === player.id));
      await screen.getByLabel('Find a player', { exact: true }).fill(bye.name);
      await expect(screen.getByText('No players match these filters.', { exact: true })).toBeVisible();
      await screen.getByRole('group', { name: 'Ranking period' }).getByRole('button', { name: 'Rest of season', exact: true }).click();
      await rowsMatch(screen, { scope: 'ros', search: bye.name });
      await expect(list(screen).getByText('Bye this week', { exact: true })).toBeVisible();
      await expect(list(screen).getByText(/\/ game · \d+ scheduled games/)).toBeVisible();
      await screen.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
      await screen.getByRole('combobox', { name: 'Position', exact: true }).selectOption('DST');
      await expect(screen.getByText(/^Defense and special teams rankings are unavailable/)).toBeVisible();
      await screen.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
      await screen.locator('summary').filter({ hasText: 'Method, scoring & sources' }).click();
      await expect(screen.getByText(snapshot.method.description, { exact: true })).toBeVisible();
      await expect(screen.getByRole('link', { name: snapshot.sources[0].name, exact: true })).toHaveAttribute('href', snapshot.sources[0].url);
      expect(world.errors).toEqual([]);
      await screen.getByRole('button', { name: 'Back to Home', exact: true }).click();
      if (app === 'next') await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Home', exact: true })).toBeFocused();
      else await expect(page.getByRole('main')).toBeFocused();
    } finally { await world.db.close(); }
  });

  for (const app of ['classic', 'next']) test(`${app}: mobile and desktop dark/light layout, keyboard and accessibility`, async ({ page, baseURL }, testInfo) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world } = await open(page, baseURL, app);
    try {
      for (const theme of ['dark', 'light']) {
        await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
        await page.reload();
        const screen = root(page, app);
        await expect(list(screen)).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          await layout(page, screen);
          const result = await new AxeBuilder({ page }).include(app === 'next' ? '.gx-fantasy' : '.fantasy-football').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          expect(result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
          await screen.getByLabel('Find a player', { exact: true }).focus();
          await page.keyboard.type('unlikely player name');
          await expect(screen.getByText('No players match these filters.', { exact: true })).toBeVisible();
          await page.keyboard.press('Tab');
          await expect(screen.getByLabel('Strong trends only', { exact: true })).toBeFocused();
          await screen.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
          await screen.getByRole('combobox', { name: 'Position', exact: true }).selectOption('WR');
          await screen.getByLabel('Strong trends only', { exact: true }).check();
          await list(screen).locator('summary').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`fantasy-${app}-${width}-${theme}.png`) });
          await screen.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
          if (width === 320) {
            const method = screen.locator('summary').filter({ hasText: 'Method, scoring & sources' });
            await method.click();
            await screen.getByRole('link', { name: snapshot.sources[0].name, exact: true }).scrollIntoViewIfNeeded();
            await layout(page, screen);
            await page.screenshot({ path: testInfo.outputPath(`fantasy-${app}-sources-320-${theme}.png`) });
            await method.click();
          }
        }
      }
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });
});
