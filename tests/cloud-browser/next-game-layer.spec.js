// D-69 step 3: Research › Games › one game as a layer (in place of the game sheet on Research's paths), on the real app
// and the real handler with every migration on local PGlite. Fixture week: three games of the committed 2026 Week 6
// trends file; Luke has sent his Totals (his Total lines show) and keeps no Spread (every Spread is locked). Contracts:
// a row opens the layer as a step (its address names the game; its heading takes focus; the board stays mounted under
// it, hidden); the pager swaps the game in place (the address follows, history gains no entry, focus stays on the
// button); the movement chart reveals once on its disclosure's first opening, and never under reduced motion; a team
// opens Research › Teams › that team and Back returns to the game; Back lands on the board with focus on the opening row;
// a direct load moves no focus and Back closes the layer to the board; Trends' Game details opens the layer and Back
// returns to Trends. Fictional accounts only; never contacts hosted data.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import trendsSeed from '../../cloud/trends-seed.mjs';
import { parseCsvRows, writeCompactCsv } from '../../shared/trends.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { sendBallot, storeLines } from '../helpers/guess-week.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const TEAMS = { SEA: 'Seattle Seahawks', DEN: 'Denver Broncos', HOU: 'Houston Texans', JAX: 'Jacksonville Jaguars', NO: 'New Orleans Saints', NYG: 'New York Giants' };
const GAMES = ['SEA-DEN', 'HOU-JAX', 'NO-NYG'];
const WEEK6_SOURCE = writeCompactCsv(parseCsvRows(trendsSeed.seasonCsv).rows.filter(row => Number(row.week) <= 6));
const week6 = state => {
  state.league.season = 2026; state.league.week = 6;
  state.games = GAMES.map((id, i) => {
    const [away, home] = id.split('-');
    return { ...state.games[i], id, away: TEAMS[away], home: TEAMS[home], awayCode: away, homeCode: home, matchup: `${TEAMS[away]} @ ${TEAMS[home]}` };
  });
};
const LINES = { spread: { 'SEA-DEN': -1.5, 'HOU-JAX': 2.5, 'NO-NYG': -6.5 }, total: { 'SEA-DEN': 43.5, 'HOU-JAX': 41.5, 'NO-NYG': 40 } };

const layer = page => page.locator('[data-research="game"]');
const heading = (page, name) => layer(page).getByRole('heading', { level: 2, name, exact: true });
const historyLength = page => page.evaluate(() => history.length);

test('one game is a layer: a step to open, paging in place, the chart reveal, teams, Back to the row, direct loads and Trends', async ({ page, baseURL }, info) => {
  test.setTimeout(180000);
  const world = await communityWorld(page, baseURL, { migrations: ALL, games: GAMES.length, prepare: week6, optionalRpc: true, trendsReadSeason: async () => WEEK6_SOURCE });
  try {
    await storeLines(world.db, world.state, LINES);
    await sendBallot(world, 'luke', 'guess_total', { 'SEA-DEN': 41, 'HOU-JAX': 44, 'NO-NYG': 39 });
    // about:blank (between loads) refuses storage; the init script runs there too.
    await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible({ timeout: 30000 });
    await page.goto('about:blank'); await page.goto('/#research/games');
    const row = page.locator('#gx-l-row-SEA-DEN');
    await expect(row).toBeVisible({ timeout: 30000 });

    // A row opens the game as a step: the address names it, its heading takes focus, the board stays under it, hidden.
    const before = await historyLength(page);
    await row.click();
    await expect(heading(page, 'SEA @ DEN')).toBeFocused();
    await expect(page).toHaveURL(/#research\/games\?layer=game&item=SEA-DEN$/);
    expect(await historyLength(page)).toBe(before + 1);
    await expect(page.locator('.gx-kept')).toBeHidden();
    await expect(page.locator('.gx-kept')).toHaveCount(1);
    await expect(layer(page).getByRole('button', { name: 'Back to Games', exact: true })).toBeVisible();
    await expect(layer(page).getByRole('region', { name: 'Market lines', exact: true })).toBeVisible();
    await expect(layer(page).locator('[data-section="trends"]')).toBeVisible();

    // The movement chart reveals once on its disclosure's first opening (transform only), then rests.
    const total = layer(page).locator('[data-market-details="total"]');
    await expect(total).toBeVisible({ timeout: 30000 });
    await expect(total.locator('.gx-reveal')).toHaveCount(1);
    await expect(total.locator('.gx-reveal')).not.toHaveAttribute('data-reveal', /.*/);
    await total.locator('summary', { hasText: 'Line movement' }).click();
    await expect(total.locator('.gx-reveal[data-reveal="in"]')).toHaveCount(1);
    await expect(total.locator('.gx-reveal')).not.toHaveAttribute('data-reveal', /.*/, { timeout: 5000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.gx').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map(v => v.id)).toEqual([]);
    await page.screenshot({ path: info.outputPath('game-layer-390.png'), fullPage: true });

    // The pager swaps the game in place: no new history entry, the address follows, focus stays on the button.
    const opened = await historyLength(page);
    await layer(page).getByRole('button', { name: 'Next game, HOU @ JAX', exact: true }).click();
    await expect(heading(page, 'HOU @ JAX')).toBeVisible();
    await expect(page).toHaveURL(/#research\/games\?layer=game&item=HOU-JAX$/);
    expect(await historyLength(page)).toBe(opened);
    await expect(layer(page).getByRole('button', { name: 'Next game, NO @ NYG', exact: true })).toBeFocused();

    // Under reduced motion the chart is drawn whole: its disclosure opens with no reveal.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const houTotal = layer(page).locator('[data-market-details="total"]');
    await expect(houTotal).toBeVisible({ timeout: 30000 });
    await houTotal.locator('summary', { hasText: 'Line movement' }).click();
    await expect(houTotal.locator('.gx-md-plot svg')).toBeVisible();
    await expect(houTotal.locator('.gx-reveal[data-reveal]')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // A team opens Research › Teams › that team (a step); Back returns to the game.
    await layer(page).getByRole('button', { name: /^Houston Texans.*Open team$/ }).click();
    await expect(page).toHaveURL(/#research\/teams\?layer=team&item=HOU$/);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(heading(page, 'HOU @ JAX')).toBeVisible();
    await expect(page).toHaveURL(/item=HOU-JAX$/);

    // Back lands on the board, with focus on the row that opened the game.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(layer(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#research\/games$/);
    await expect(row).toBeFocused();

    // A direct load (a shared link, a reload) moves no focus; Back closes the layer to the board, not the landing.
    await page.goto('about:blank'); await page.goto('/#research/games?layer=game&item=NO-NYG');
    await expect(heading(page, 'NO @ NYG')).toBeVisible({ timeout: 30000 });
    await expect(heading(page, 'NO @ NYG')).not.toBeFocused();
    await expect(layer(page).getByRole('button', { name: 'Previous game, HOU @ JAX', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('#gx-l-row-NO-NYG')).toBeVisible();
    await expect(page).toHaveURL(/#research\/games$/);

    // Trends' Game details opens the layer (focus on its heading); Back returns to the trends with focus on the button.
    await page.goto('about:blank'); await page.goto('/#research/trends?weekGame=SEA-DEN');
    const details = page.getByRole('button', { name: 'Game details · SEA @ DEN', exact: true });
    await expect(details).toBeVisible({ timeout: 30000 });
    await details.click();
    await expect(heading(page, 'SEA @ DEN')).toBeFocused();
    await expect(page).toHaveURL(/#research\/games\?layer=game&item=SEA-DEN$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(details).toBeFocused();
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});

// CI's Linux runner falls back to wider letters than Windows draws; this probe reproduces the 320 px clipping seen only there.
const WIDE_FONT = '.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }';

test('the game layer’s Spread, Total and Bets buttons stay inside the layer at 320 px in a wide fallback font', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 320, height: 800 });
  const world = await communityWorld(page, baseURL, { migrations: ALL, games: GAMES.length, prepare: week6, optionalRpc: true, trendsReadSeason: async () => WEEK6_SOURCE });
  try {
    await storeLines(world.db, world.state, LINES);
    await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible({ timeout: 30000 });
    await page.goto('about:blank'); await page.goto('/#research/games?layer=game&item=SEA-DEN');
    await expect(heading(page, 'SEA @ DEN')).toBeVisible({ timeout: 30000 });
    await page.addStyleTag({ content: WIDE_FONT });
    const buttons = layer(page).locator('.gx-l-actions > button');
    await expect(buttons.first()).toBeVisible({ timeout: 30000 });
    // The edge that clips is the nearest ancestor with overflow-x clip/hidden (the pager), not the card around it.
    const edges = await page.evaluate(() => {
      const bar = document.querySelector('[data-research="game"] .gx-l-actions');
      let clip = bar.parentElement;
      while (clip && !['clip', 'hidden'].includes(getComputedStyle(clip).overflowX)) clip = clip.parentElement;
      return { right: (clip ?? document.documentElement).getBoundingClientRect().right, clipped: !!clip,
        buttons: [...bar.children].map(b => ({ text: b.textContent, right: b.getBoundingClientRect().right })) };
    });
    expect(edges.clipped).toBe(true);
    expect(edges.buttons.length).toBeGreaterThan(0);
    for (const b of edges.buttons) expect(b.right, `${b.text} inside the clipping edge`).toBeLessThanOrEqual(edges.right + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(world.errors).toEqual([]);
  } finally {
    await world.db.close();
  }
});
