import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { buildRankings, DEFAULT_FILTERS } from '../../shared/fantasy-rankings.mjs';
import { snapshotFileName, reviewFileName, updateFantasyIndex, FANTASY_REPOSITORY } from '../../shared/fantasy-index.mjs';
import { validateFantasyReview } from '../../shared/fantasy-review.mjs';

// The shipped public snapshot is exercised in both apps; authentication and community reads stay local in PGlite.
const snapshot = JSON.parse(fs.readFileSync(new URL('../../shared/fantasy/2026-week-06.json', import.meta.url), 'utf8'));
const expected = filters => buildRankings(snapshot, { ...DEFAULT_FILTERS, ...filters }).rows;
const root = (page, app) => page.locator(app === 'next' ? '.gx-fantasy' : '.fantasy-football');
const list = screen => screen.getByRole('list', { name: 'Ranked players', exact: true });
const rowNames = async screen => list(screen).locator('[data-player]').evaluateAll(rows => rows.map(row => row.querySelector('[class$="fantasy-player-main"] > strong').textContent));
// D-66 nesting cards: the extra filters sit under More filters; a row opens the player one layer in; the lip comes back.
const more = screen => screen.locator('[data-fantasy=more-filters]');
async function moreFilters(screen) { if (!(await more(screen).evaluate(el => el.open))) await more(screen).locator('summary').click(); }
async function resetFilters(screen) { await moreFilters(screen); await more(screen).getByRole('button', { name: 'Reset filters', exact: true }).click(); }
const backToFantasy = screen => screen.getByRole('button', { name: 'Back to Fantasy', exact: true }).click();

async function open(page, baseURL, app, worldOptions = {}) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, ...worldOptions });
  await signIn(page, 'luke');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.goto('/#fantasy');
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
  // Loaded Fantasy layers must keep the same centered reading column and gutters as the shared frame.
  // Overflow checks alone miss a full-width page whose content still fits the viewport (#388).
  const frame = await screen.evaluate(scope => {
    const bounds = scope.getBoundingClientRect(), header = document.querySelector('.gx-topbar-inner').getBoundingClientRect();
    const style = getComputedStyle(scope), title = scope.querySelector('h1').getBoundingClientRect();
    return { width: bounds.width, left: bounds.left, headerWidth: header.width, headerLeft: header.left,
      gutter: parseFloat(style.getPropertyValue('--gx-size-gutter')), leftInset: title.left - bounds.left,
      rightInset: bounds.right - title.right };
  });
  expect(frame.width, 'Loaded content stays in the shared reading column').toBeCloseTo(frame.headerWidth, 0);
  expect(frame.left, 'Loaded content stays centered with the header').toBeCloseTo(frame.headerLeft, 0);
  expect(frame.leftInset, 'Fantasy keeps its page gutter').toBeCloseTo(frame.gutter, 0);
  expect(frame.rightInset, 'Fantasy keeps its opposite page gutter').toBeCloseTo(frame.gutter, 0);
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
  for (const app of ['next']) test(`${app}: live snapshot filters, scoring, byes, trend details and reset`, async ({ page, baseURL }) => {
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
      await moreFilters(screen);
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
      await expect(list(screen).locator('[data-player]')).toContainText(`Overall ${selected.overallRank}`);
      await resetFilters(screen);

      await screen.getByLabel('Strong trends only', { exact: true }).check();
      await rowsMatch(screen, { trendsOnly: true });
      const trend = expected({ trendsOnly: true })[0];
      await list(screen).locator('[data-player]').first().click();
      await expect(screen.getByRole('heading', { level: 2, name: trend.name, exact: true })).toBeFocused();
      await expect(screen.getByText('Trends entering Week 6', { exact: true })).toBeVisible();
      await screen.getByRole('button', { name: `About ${trend.name}’s estimate`, exact: true }).click();
      await expect(page.getByRole('dialog', { name: `About ${trend.name}’s estimate`, exact: true })).toContainText(trend.trendHighlights[0].detail);
      await page.keyboard.press('Escape');
      await backToFantasy(screen);
      await resetFilters(screen);

      const bye = snapshot.players.find(player => player.weekly.status === 'bye' && expected({ scope: 'ros', search: player.name }).some(row => row.id === player.id));
      await screen.getByLabel('Find a player', { exact: true }).fill(bye.name);
      await expect(screen.getByText('No players match these filters.', { exact: true })).toBeVisible();
      await screen.getByRole('group', { name: 'Ranking period' }).getByRole('button', { name: 'Rest of season', exact: true }).click();
      await rowsMatch(screen, { scope: 'ros', search: bye.name });
      await expect(list(screen).getByText('Bye this week', { exact: true })).toBeVisible();
      await expect(list(screen).getByText(/\/ game · \d+ scheduled games/)).toBeVisible();
      await resetFilters(screen);
      await screen.getByRole('combobox', { name: 'Position', exact: true }).selectOption('DST');
      await expect(screen.getByText(/^Defense and special teams rankings are unavailable/)).toBeVisible();
      await resetFilters(screen);
      await screen.getByRole('button', { name: 'About Fantasy rankings', exact: true }).click();
      const about = page.getByRole('dialog', { name: 'About Fantasy rankings', exact: true });
      await expect(about.getByText(snapshot.method.description, { exact: true })).toBeVisible();
      await expect(about.getByRole('link', { name: snapshot.sources[0].name, exact: true })).toHaveAttribute('href', snapshot.sources[0].url);
      await page.keyboard.press('Escape');
      expect(world.errors).toEqual([]);
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      if (app === 'next') {
        await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Research', exact: true })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('heading', { name: 'Research', exact: true })).toBeFocused();
      }
      else await expect(page.getByRole('main')).toBeFocused();
    } finally { await world.db.close(); }
  });

  for (const app of ['next']) test(`${app}: mobile and desktop dark/light layout, keyboard and accessibility`, async ({ page, baseURL }, testInfo) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world } = await open(page, baseURL, app);
    try {
      for (const theme of ['dark', 'light']) {
        await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
        await page.reload();
        const screen = root(page, app);
        await expect(list(screen)).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        for (const width of [320, 390, 1390]) {
          await page.setViewportSize({ width, height: width === 1390 ? 869 : 844 });
          await page.evaluate(() => window.scrollTo(0, 0));
          await layout(page, screen);
          await page.screenshot({ path: testInfo.outputPath(`fantasy-top-${width}-${theme}.png`) });
          const middle = list(screen).locator('[data-player]').nth(24);
          await middle.scrollIntoViewIfNeeded();
          await expect(middle).toBeInViewport();
          await page.screenshot({ path: testInfo.outputPath(`fantasy-middle-${width}-${theme}.png`) });
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const morePlayers = screen.getByRole('button', { name: /^Show more players/ });
          await expect(morePlayers).toBeInViewport();
          expect(await morePlayers.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.gx-tabbar').getBoundingClientRect().top), 'Last list control clears the fixed navigation').toBe(true);
          await page.screenshot({ path: testInfo.outputPath(`fantasy-end-${width}-${theme}.png`) });
          const result = await new AxeBuilder({ page }).include(app === 'next' ? '.gx-fantasy' : '.fantasy-football').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          expect(result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
          await moreFilters(screen);
          await screen.getByLabel('Find a player', { exact: true }).focus();
          await page.keyboard.type('unlikely player name');
          await expect(screen.getByText('No players match these filters.', { exact: true })).toBeVisible();
          await page.keyboard.press('Tab');
          await expect(screen.getByLabel('Strong trends only', { exact: true })).toBeFocused();
          await resetFilters(screen);
          await screen.getByRole('combobox', { name: 'Position', exact: true }).selectOption('WR');
          await screen.getByLabel('Strong trends only', { exact: true }).check();
          await list(screen).locator('[data-player]').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath(`fantasy-${app}-${width}-${theme}.png`) });
          // The player layer at this width: the estimate, trends and tools, one layer in.
          await list(screen).locator('[data-player]').first().click();
          await expect(screen.getByRole('button', { name: 'Back to Fantasy', exact: true })).toBeVisible();
          await layout(page, screen);
          expect((await new AxeBuilder({ page }).include('.gx-fantasy').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map(issue => issue.id)).toEqual([]);
          await page.screenshot({ path: testInfo.outputPath(`fantasy-${app}-player-${width}-${theme}.png`), fullPage: true });
          await backToFantasy(screen);
          await resetFilters(screen);
          if (width === 320) {
            await screen.getByRole('button', { name: 'About Fantasy rankings', exact: true }).click();
            const about = page.getByRole('dialog', { name: 'About Fantasy rankings', exact: true });
            await about.getByRole('link', { name: snapshot.sources[0].name, exact: true }).scrollIntoViewIfNeeded();
            await page.screenshot({ path: testInfo.outputPath(`fantasy-${app}-sources-320-${theme}.png`) });
            await page.keyboard.press('Escape');
          }
        }
      }
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });

  test('new app: saved-copy fallback line, no ungated implied total, layout and axe at 390 px', async ({ page, baseURL }) => {
    test.skip(!pgliteAvailable, 'PGlite runtime absent');
    await page.setViewportSize({ width: 390, height: 844 });
    const { screen } = await open(page, baseURL, 'next');
    await expect(screen.getByText('Showing saved Week 6 · live refresh unavailable')).toBeVisible();
    await list(screen).locator('[data-player]').first().click();
    const matchup = screen.locator('[data-fantasy=context] > summary');
    if (await matchup.count()) await matchup.click();
    // The signed-in player has locked nothing for this week, so no implied total may appear anywhere.
    await expect(screen.getByText(/Implied team total \d/)).toHaveCount(0);
    await layout(page, screen);
    const results = await new AxeBuilder({ page }).include('.gx-fantasy').analyze();
    expect(results.violations).toEqual([]);
  });

  test('new app: hosted index serves the snapshot and a PROVISIONAL accuracy card; phone and desktop layout and axe in both themes', async ({ page, baseURL }, testInfo) => {
    test.skip(!pgliteAvailable, 'PGlite runtime absent');
    const sha = bytes => createHash('sha256').update(bytes).digest('hex');
    const snapshotBytes = fs.readFileSync(new URL('../../shared/fantasy/2026-week-06.json', import.meta.url));
    const snapshotSha = sha(snapshotBytes), generatedAt = snapshot.generatedAt;
    const graded = snapshot.players.filter(player => player.weekly.status === 'scheduled' && player.weekly.stats && player.history.some(row => row.week === 5) && ['QB', 'RB', 'WR'].includes(player.position)).slice(0, 3);
    expect(graded).toHaveLength(3);
    const review = {
      schemaVersion: 1, season: 2026, week: 5, generatedAt, status: 'PROVISIONAL',
      estimate: { file: snapshotFileName(2026, 5, 'a'.repeat(64)), sha256: 'a'.repeat(64), generatedAt, publishedBeforeFreeze: true },
      actuals: { name: 'nflverse stats_player_week', url: 'https://github.com/nflverse/nflverse-data/releases/tag/stats_player_week', retrievedAt: generatedAt },
      playedWithoutEstimate: 0,
      players: graded.map(player => ({ id: player.id, name: player.name, team: player.team, position: player.position, estimate: player.weekly.stats,
        actual: player.history.find(row => row.week === 5), baseline: player.history.find(row => row.week === 5) })).sort((a, b) => a.id.localeCompare(b.id)),
    };
    expect(validateFantasyReview(review).valid).toBe(true);
    const reviewBytes = Buffer.from(`${JSON.stringify(review)}
`), reviewSha = sha(reviewBytes);
    const index = updateFantasyIndex(updateFantasyIndex(null, { season: 2026, updatedAt: generatedAt, review: null, snapshot: {
      week: 6, file: snapshotFileName(2026, 6, snapshotSha), sha256: snapshotSha, bytes: snapshotBytes.byteLength, generatedAt, statsThroughWeek: 5, publishedAfterFreeze: false, rosterFallbackTeams: 0 } }),
    { season: 2026, updatedAt: generatedAt, snapshot: null, review: { week: 5, file: reviewFileName(2026, 5, reviewSha), sha256: reviewSha, bytes: reviewBytes.byteLength, generatedAt, status: 'PROVISIONAL' } });
    const base = `https://github.com/${FANTASY_REPOSITORY}/releases/download/fantasy-data-2026/`;
    const served = new Map([['index.json', Buffer.from(JSON.stringify(index))], [index.snapshots[0].file, snapshotBytes], [index.reviews[0].file, reviewBytes]]);
    const fantasyFetch = async url => {
      const name = String(url).startsWith(base) ? String(url).slice(base.length) : null;
      return served.has(name) ? new Response(served.get(name), { status: 200 }) : new Response(null, { status: 404 });
    };
    await page.setViewportSize({ width: 390, height: 844 });
    const { world } = await open(page, baseURL, 'next', { fantasyFetch });
    try {
      for (const theme of ['dark', 'light']) {
        await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
        await page.reload();
        for (const width of [320, 390, 1390]) {
          await page.setViewportSize({ width, height: width === 1390 ? 869 : 844 });
          const screen = root(page, 'next');
          await expect(list(screen)).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(screen.getByRole('status').filter({ hasText: /^Updated / })).toBeVisible();
          await expect(screen.getByText('Showing saved Week 6', { exact: false })).toHaveCount(0);
          // D-66: the report card is one layer in, from its tile on the rankings card.
          await screen.locator('[data-fantasy=report]').click();
          await expect(screen.getByRole('button', { name: 'Back to Fantasy', exact: true })).toBeVisible();
          const card = screen.getByLabel('Week 5 accuracy');
          await expect(card).toBeVisible();
          await expect(card.getByText('PROVISIONAL', { exact: true })).toBeVisible();
          await layout(page, screen);
          await page.screenshot({ path: testInfo.outputPath(`fantasy-report-${width}-${theme}.png`), fullPage: true });
          const results = await new AxeBuilder({ page }).include('.gx-fantasy').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          expect(results.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
          await backToFantasy(screen);
        }
      }
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });

  test('new app: player profile and comparison tools at phone and desktop widths in both themes, keyboard and axe', async ({ page, baseURL }, testInfo) => {
    test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
    const { world } = await open(page, baseURL, 'next');
    const [first, second] = expected({});
    try {
      for (const theme of ['dark', 'light']) {
        await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
        await page.reload();
        const screen = root(page, 'next');
        await expect(list(screen)).toBeVisible();
        for (const width of [320, 390, 1390]) {
          await page.setViewportSize({ width, height: 844 });
          await list(screen).locator('[data-player]').first().click();
          await screen.getByRole('button', { name: `Usage & production: ${first.name}`, exact: true }).click();
          const sheet = page.getByRole('dialog', { name: first.name, exact: true });
          await expect(sheet).toBeVisible();
          await expect(sheet.getByRole('heading', { name: 'Observed production', exact: true })).toBeVisible();
          await expect(sheet.getByRole('img', { name: /^Actual fantasy points by week\. Week 1: / })).toBeVisible();
          await expect(sheet.getByRole('table', { name: 'Usage and actual fantasy points by week' }).locator('tbody tr')).toHaveCount(snapshot.statsThroughWeek);
          await expect(sheet.getByRole('heading', { name: 'GTL pace estimate', exact: true })).toBeVisible();
          await expect(sheet.getByText('Opponent history is not included in this snapshot.', { exact: true })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow').toBe(true);
          await page.screenshot({ path: testInfo.outputPath(`fantasy-profile-${width}-${theme}.png`) });
          const axe = await new AxeBuilder({ page }).include('.gx-fantasy-profile').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          expect(axe.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
          await page.keyboard.press('Escape');
          await expect(sheet).toHaveCount(0);

          await screen.getByRole('button', { name: `Add to compare: ${first.name}`, exact: true }).click();
          // D-66: Compare is one layer in, from its tile on the rankings card.
          await backToFantasy(screen);
          await expect(screen.locator('[data-fantasy=compare]')).toContainText('1');
          await screen.locator('[data-fantasy=compare]').click();
          const compare = screen.getByRole('region', { name: 'Compare players', exact: true });
          await compare.getByLabel('Add a player', { exact: true }).fill(second.name);
          await compare.getByRole('button', { name: new RegExp(`^Add to compare: ${second.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · `) }).click();
          await expect(compare.getByRole('table')).toBeVisible();
          await expect(compare.getByRole('columnheader', { name: new RegExp(second.name) })).toBeVisible();
          await compare.getByRole('group', { name: 'Comparison scoring' }).getByRole('button', { name: 'Standard', exact: true }).click();
          await compare.getByRole('group', { name: 'Comparison period' }).getByRole('button', { name: 'This week', exact: true }).click();
          await expect(compare.getByText(/Week 6 GTL pace estimate, not a result/)).toBeVisible();
          await compare.scrollIntoViewIfNeeded();
          await layout(page, screen);
          const tableScroll = compare.getByRole('region', { name: 'Player comparison data', exact: true });
          await tableScroll.focus();
          await expect(tableScroll).toBeFocused();
          if (await tableScroll.evaluate(el => el.scrollWidth > el.clientWidth)) {
            await page.keyboard.press('ArrowRight');
            await expect.poll(() => tableScroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
          }
          await page.screenshot({ path: testInfo.outputPath(`fantasy-compare-${width}-${theme}.png`) });
          const compareAxe = await new AxeBuilder({ page }).include('.gx-fantasy-compare').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          expect(compareAxe.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
          for (const player of [first, second]) await compare.getByRole('button', { name: `Remove ${player.name} from comparison`, exact: true }).click();
          await expect(compare.getByRole('table')).toHaveCount(0);
          await backToFantasy(screen);
        }
      }
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });
});
