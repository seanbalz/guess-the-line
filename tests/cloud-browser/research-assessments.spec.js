import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { HOSTED } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn, sendBallot, storeBookLines } from './community-world.mjs';
import { fixture as assessmentFixture } from '../fixtures/research-assessments.mjs';

test('independent research filters, nested evidence and durable source intake at phone widths', async ({ page, baseURL }, info) => {
  test.skip(!pgliteAvailable, 'Local PGlite is required.'); test.setTimeout(180000);
  const world = await communityWorld(page, baseURL, { games: 2, migrations: [...new Set([...HOSTED, '20261030204548_gtl_research_assessments.sql'])] });
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
    await expect(page.getByRole('heading', { name: 'Recommended', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Game research', exact: true })).toBeVisible();
    await page.getByText(/Data coverage ·/).click();
    await expect(page.getByText('No reviewed snapshot published for this week', { exact: false })).toHaveCount(0);
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
      expect(await page.getByRole('heading', { name: 'Recommended', exact: true }).evaluate(h => {
        const node = h.firstChild, word = 'Recommended', start = node.textContent.indexOf(word);
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
    // D-69 step 4: Recommended reaches Your gap through Bets (no switch between the sections).
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.locator('#gx-b-tile-gap').click();
    await expect(page.getByRole('heading', { name: 'Your gap', level: 1, exact: true })).toBeVisible();
  } finally { await world.db.close(); }
});

test('empty research still shows game facts, current published week and honest coverage', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite is required.'); test.setTimeout(180000);
  let stats = [];
  const requests = [];
  page.on('request', request => { if (request.url().endsWith('/lines/assessments')) requests.push(request.postDataJSON()); });
  const world = await communityWorld(page, baseURL, { games: 2, research: { read: async () => ({ statistics: stats, history: { status: 'unavailable', reasons: ['snapshot_unavailable'] } }) } });
  try {
    // Exercise the real handler with no imported evidence or synthetic provider quotes.
    // A separate public history provider supplies completed-game facts only.
    stats = world.state.games.map(g => ({ gameId: g.id, teams: g.id.split('-').map(team => ({ team, sample: 1, from: '2026-09-01', to: '2026-09-01', pointsPerGame: 0, pointsAllowedPerGame: 21, recent: { sample: 1, pointsPerGame: 0, pointsAllowedPerGame: 21 }, games: [{ gameId: 'completed-fixture', date: '2026-09-01', scored: 0, allowed: 21 }], definition: 'Completed synthetic fixture game; no current market data.' })) }));
    await page.goto('/#bets/research'); await signIn(page, 'luke', { navigate: false });
    await expect(page.getByRole('heading', { name: 'Recommended', exact: true })).toBeVisible();
    await expect(page.getByText(/Lock in a game’s guess in Play/)).toBeVisible();
    const gameButton = page.getByRole('button', { name: `${world.state.games[0].id.replace('-', ' at ')} · Team statistics`, exact: true });
    await expect(gameButton).toBeVisible(); await gameButton.click();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(r => r.season === undefined && r.week === undefined)).toBe(true);
    await page.getByText(/Observed team statistics ·/).click();
    await expect(page.getByText('0.0', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'All games research', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All games research', exact: true }).click();
    await expect(gameButton).toBeVisible();
  } finally { await world.db.close(); }
});
