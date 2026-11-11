import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

// Local fictional account responses only: checks the approved score/history layouts without changing the scorer.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

test('Prism score: authoritative points, zero, pending, hidden, separate markets, history and responsive native controls', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED, optionalRpc: true, games: 4 });
  try {
    const personal = structuredClone((await world.api('luke', 'personal')).body);
    personal.rules = { sentFinal: true, lateWindow: 'kickoff', perGameScoring: true };
    const games = Array.from({ length: 8 }, (_, i) => ({ ...personal.games[i % personal.games.length], id: `score-${i}` }));
    const points = [0, 8, null, null, null, 6, 4, 10];
    const picks = games.map((game, i) => ({ gameId: game.id, guess: i === 4 ? 934 : i === 0 ? 5 : -3, lockedIn: i !== 3, lockedAt: i === 3 ? null : personal.now, hidden: i === 4,
      points: i === 4 ? 10 : points[i], reference: i === 4 ? { value: 999, source: 'HIDDEN SENTINEL' } : i === 2 ? { value: null, status: 'pending' } : { value: i === 0 ? -3 : -4, source: 'Fixture saved reference', observedAt: personal.now } }));
    const entry = { userId: ACCOUNTS.luke.id, mode: 'guess_spread', status: 'draft', eligible: true, scoreTiming: 'immediate', weekPoints: 28, picks };
    const history = { viewer: ACCOUNTS.luke.id, season: 2026, seasons: [2026], now: personal.now, weeks: [
      { season: 2026, week: 8, games: games.slice(0, 1), entries: [{ ...entry, weekPoints: 0, picks: [picks[0]] }] },
      { season: 2026, week: 9, games, entries: [entry, { ...entry, mode: 'guess_total', weekPoints: 3, picks: [{ ...picks[1], gameId: games[0].id, guess: 48, points: 3, reference: { value: 44.5, source: 'Fixture Total reference' } }] }] }
    ] };
    await page.route(`${SUPABASE}/functions/v1/gtl-api/personal`, route => route.fulfill({ json: personal }));
    await page.route(`${SUPABASE}/functions/v1/gtl-api/community/history`, route => route.fulfill({ json: history }));
    const communityRead = await world.api('luke', 'community/read', {});
    expect(communityRead.status).toBe(200);
    const community = structuredClone(communityRead.body);
    community.standings = [{ userId: ACCOUNTS.sean.id, mode: 'guess_spread', seasonPoints: 40, seasonScored: 5 }, { userId: ACCOUNTS.luke.id, mode: 'guess_spread', seasonPoints: 28, seasonScored: 5 }];
    await page.route(`${SUPABASE}/functions/v1/gtl-api/community/read`, route => route.fulfill({ json: community }));
    await signIn(page, 'luke');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Play(,|$)/ }).click();
    await expect(page.locator('.gx-play-overview-games [data-overview-game]')).toHaveCount(2);
    await expect(page.locator('.gx-play-score-card')).toContainText('Personal season accuracy points · Spread');
    await expect(page.locator('.gx-play-score-chart')).toHaveAttribute('aria-label', /Week 8: 0 cumulative personal points, Week 9: 28 cumulative personal points/);
    await expect(page.locator('.gx-play-league-podium [data-you="true"]')).toHaveAttribute('data-place', '2');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; window.scrollTo(0, 0); }, theme);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(layoutProblems), `${theme} overview ${width}`).toEqual([]);
        await page.locator('[data-landing="play"]').screenshot({ path: info.outputPath(`prism-play-${width}-${theme}.png`) });
      }
    }
    await page.getByRole('button', { name: 'Open score & history' }).click();
    const summary = page.getByRole('region', { name: 'Personal score summary' });
    await expect(summary.getByRole('img', { name: '28 of 50 possible points' })).toBeVisible();
    await expect(summary.locator('.gx-ys-hero-head')).toContainText('5 scored games');
    await expect(summary.locator('.gx-ys-hero-head')).toContainText('1 exact guess');
    await expect(page.locator('.gx-ys-row-meta').first()).toContainText('Off by 8');
    await expect(page.locator('.gx-ys-row-meta').first()).not.toContainText(/Line|You/);
    await expect(page.locator('.gx-ys-row')).toHaveCount(6);
    await expect(page.locator('.gx-ys-row').first()).toContainText('0 / 10');
    await expect(page.locator('.gx-ys-row').nth(2)).toContainText('Waiting');
    await expect(page.locator('.gx-ys-row').nth(3)).toContainText('Draft');
    await expect(page.locator('.gx-ys-row').nth(4)).toContainText('Hidden');
    await expect(page.locator('[data-play="score"]')).not.toContainText('934');
    await expect(page.locator('[data-play="score"]')).not.toContainText('999');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: info.outputPath(`weekly-score-${width}-${theme}.png`), fullPage: true });
      }
    }
    await page.getByRole('button', { name: 'Show all 8 games' }).click();
    await expect(page.locator('.gx-ys-row')).toHaveCount(8);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.evaluate(layoutProblems), `${theme} ${width}`).toEqual([]);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.map(v => v.id)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`prism-score-${theme}-phone.png`), fullPage: true });
    }
    await page.getByRole('group', { name: 'Score view' }).getByRole('button', { name: 'History', exact: true }).click();
    const bars = page.getByRole('region', { name: 'Score history' });
    await expect(bars.getByRole('button', { name: /Week 8, 0 points, 0 per scored game/ })).toBeVisible();
    await expect(bars.getByRole('button', { name: /Week 9, 28 points, 5.6 per scored game/ })).toBeVisible();
    await page.screenshot({ path: info.outputPath('prism-score-history-light-phone.png'), fullPage: true });
    await bars.getByRole('button', { name: /Week 9/ }).click();
    await page.getByRole('group', { name: 'Score market' }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(summary.getByRole('img', { name: '3 of 10 possible points' })).toBeVisible();
    await page.locator('.gx-ys-row').first().click();
    await expect(page.getByRole('img', { name: /^Line 44.5, you 48, off by 3.5$/ })).toBeVisible();
    expect(await page.locator('.gx-ys-game-detail').evaluate(el => el.querySelector('.gx-ys-line').compareDocumentPosition(el.querySelector('.gx-ys-pair')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(layoutProblems), `${theme} game ${width}`).toEqual([]);
        await page.screenshot({ path: info.outputPath(`score-game-${width}-${theme}.png`), fullPage: true });
        await page.locator('.gx-ys-pair').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`score-game-values-${width}-${theme}.png`) });
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
