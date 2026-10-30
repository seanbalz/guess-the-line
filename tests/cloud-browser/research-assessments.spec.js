import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { HOSTED } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines } from './community-world.mjs';
import { fixture as assessmentFixture } from '../fixtures/research-assessments.mjs';

test('independent research filters, nested evidence and durable source intake at phone widths', async ({ page, baseURL }, info) => {
  test.skip(!pgliteAvailable, 'Local PGlite is required.'); test.setTimeout(180000);
  const world = await communityWorld(page, baseURL, { games: 2, migrations: [...HOSTED, '20261030204548_gtl_research_assessments.sql'] });
  try {
    const lines = Object.fromEntries(world.state.games.map(g => [g.id, -3]));
    await storeBookLines(world, { spread: lines, total: Object.fromEntries(world.state.games.map(g => [g.id, 45])) });
    await sendBallot(world, 'luke', 'guess_spread', lines);
    await sendBallot(world, 'luke', 'guess_total', Object.fromEntries(world.state.games.map(g => [g.id, 45])));
    const { snapshot } = assessmentFixture(), g = world.state.games[0], stamp = new Date(Date.now() - 5000).toISOString();
    snapshot.season = world.state.league.season; snapshot.week = world.state.league.week; snapshot.generatedAt = stamp;
    snapshot.candidates[0].gameId = g.id; snapshot.candidates[0].kickoff = g.kickoff; snapshot.candidates[0].dependencies[0].gameId = g.id;
    for (const key of ['publishedAt', 'observedAt', 'asOf']) snapshot.candidates[0].evidence[0][key] = stamp;
    Object.assign(snapshot.quotes[0], { gameId: g.id, kickoff: g.kickoff, observedAt: stamp, capturedAt: stamp });
    await world.db.query("insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quote_payload) values($1,$2,$3,$4,$5,$6,1,'finished',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '80 seconds',$7)",
      [randomUUID(),randomUUID(),snapshot.season,snapshot.week,g.id,['player_reception_yds'],snapshot.quotes]);
    await world.db.query('insert into public.gtl_research_snapshots(id,season,week,payload) values($1,$2,$3,$4)', [randomUUID(), snapshot.season, snapshot.week, snapshot]);
    await page.goto('/#bets/research'); await signIn(page, 'luke', { navigate: false });
    await expect(page.getByRole('heading', { name: 'Research recommendations', exact: true })).toBeVisible();
    const tile = page.getByRole('button', { name: /Synthetic Receiver over 65.5 yards Research lean/ });
    await expect(tile).toBeVisible();
    await page.getByLabel('Market', { exact: true }).selectOption('prop');
    await page.getByLabel('Assessment', { exact: true }).selectOption('red');
    await expect(tile).toHaveCount(0);
    await page.getByLabel('Assessment', { exact: true }).selectOption('yellow');
    await expect(tile).toBeVisible();
    for (const width of [320, 390]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.getByRole('heading', { name: 'Research recommendations', exact: true }).evaluate(h => {
        const node = h.firstChild, word = 'recommendations', start = node.textContent.indexOf(word);
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + word.length);
        return range.getClientRects().length === 1;
      })).toBe(true);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map(v => v.id)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`research-assessments-${width}-${theme}.png`), fullPage: true });
    }
    await tile.click(); await expect(page.getByRole('heading', { name: 'Synthetic Receiver over 65.5 yards', exact: true })).toBeVisible();
    expect(page.url()).toMatch(/assessment=r-[a-f0-9]{24}/); expect(page.url()).not.toContain('65.5');
    await page.getByText('Supporting evidence · Source-reported · not independently reproduced', { exact: true }).click();
    await expect(page.getByText('Synthetic coverage matchup supports the receiving over.', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Original source', exact: true })).toHaveAttribute('href', 'https://x.com/rotobot_ai/status/1000001');
    await page.goBack(); await expect(tile).toBeVisible();
    await page.getByText('Sources and submitted links', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Research post URL' }).fill('https://x.com/ActionNetworkHQ/status/123456?a=tracking');
    await page.getByRole('button', { name: 'Submit research link', exact: true }).click();
    await expect(page.getByText('Link saved · pending source checks.', { exact: true })).toBeVisible();
    expect((await world.db.query('select count(*) n from public.gtl_research_submissions')).rows[0].n).toBe(1);
    await page.reload(); await page.getByText('Sources and submitted links', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'actionnetworkhq · submitted post', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Your guess vs. market', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your guess vs. market', exact: true })).toBeVisible();
  } finally { await world.db.close(); }
});
