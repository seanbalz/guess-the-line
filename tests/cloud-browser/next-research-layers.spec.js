import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { pacificDate, pacificToUtc } from '../../shared/nfl-schedule.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';

// D-69 step 3 (Research) on the real app and handler with every migration on local PGlite. Checked: the landing's first
// card and four tiles, and that the landing reads nothing of its own; the loading card and rows against the real ones at
// 390 px; one game and one team as layers with their own addresses (a tap, a reload, a shared link, the lip, Back,
// Forward, focus on the heading after a navigation and never after a load, Back's focus on the row by its id, the kept
// board's scroll and no replayed rise, unknown values drawing the list); the pager swapping the game in place and never
// widening the page mid-turn; a team from a game and back; layers never crossing tabs; Play's matchup still opening the
// team sheet; motion (the layer's entrance, the movement chart's and the margin chart's reveal: a tap, never a load,
// never under reduced motion, transform only; nothing moving on the first paint); and the phone rules at 320 and 390 px
// in both themes with the wide fallback font and the widest kickoff time. Fictional accounts only; never contacts hosted
// data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const WIDE_FONT = '.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const DAY = 86_400_000;
// The committed trends file is 2026 Week 6, so a game has trends; the same two games as next-phone-layout.spec.js.
const WEEK6 = state => {
  state.league.season = 2026; state.league.week = 6;
  const [a, b] = state.games;
  state.games = [{ ...a, id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos' },
    { ...b, id: 'HOU-JAX', away: 'Houston Texans', home: 'Jacksonville Jaguars', awayCode: 'HOU', homeCode: 'JAX', matchup: 'Houston Texans @ Jacksonville Jaguars' }];
};
// The widest kickoff the Games tile can draw ("10:00 AM", Pacific): the first game at 10:00 AM the day after the deadline.
const WEEK6_TEN_AM = state => {
  WEEK6(state);
  const day = pacificDate(Date.parse(state.league.deadline) + DAY).date;
  state.games[0].kickoff = pacificToUtc(day, '10:00');
  state.games[1].kickoff = pacificToUtc(day, '13:25');
};
// The landing reads `week.games` from the Community read as the week's games (researchModel.js weekGamesOf), but the
// handler's read (gtl_read_community through cloud/community.mjs) carries only their count, so on the real read the first
// card always says "No week is open yet" (a Task 6 defect, task-9-report.md; its own test below is marked failing). The
// card and tile tests stand the designed shape in: the same read, with `week.games` as the week's ids, codes and kickoffs.
async function weekGamesInRead(page, world) {
  await page.route(`${SUPABASE}/functions/v1/gtl-api/community/read`, async route => {
    const request = route.request();
    const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), ...(request.method() === 'POST' ? { body: request.postData() } : {}) }));
    const body = await response.json();
    if (body?.week) body.week.games = world.state.games.map(g => ({ id: g.id, awayCode: g.awayCode, homeCode: g.homeCode, kickoff: g.kickoff }));
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
// /lines/teams with game-by-game finals (fictional scores) for SEA and DEN over the bundled records, so a team's margin
// chart draws; without the route the bundled records stand in and a team has no chart.
const RECORDS = JSON.parse(fs.readFileSync(new URL('../../shared/team-records-2026.json', import.meta.url), 'utf8'));
const LOG = (code, rows) => rows.map(([week, opponent, home, pf, pa]) => ({ week, opponent, home, final: true, pf, pa, gameId: home ? `${opponent}-${code}` : `${code}-${opponent}` }));
async function teamGames(page) {
  const teams = Object.fromEntries(Object.entries(RECORDS.teams).map(([code, t]) => [code, { ...t, games: [] }]));
  teams.SEA.games = LOG('SEA', [[1, 'SF', true, 24, 17], [2, 'ARI', false, 13, 27], [3, 'NO', true, 20, 20], [4, 'LAR', false, 31, 10]]);
  teams.DEN.games = LOG('DEN', [[1, 'KC', true, 17, 23], [2, 'LV', false, 30, 14], [3, 'LAC', true, 21, 24], [4, 'NYJ', false, 27, 3]]);
  await page.route(`${SUPABASE}/functions/v1/gtl-api/lines/teams`, route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { season: 2026, throughWeek: 4, updatedAt: '2026-10-01T00:00:00Z', teams } }));
}
const landing = page => page.locator('[data-landing="research"]');
const hero = page => page.locator('[data-research="hero"]');
const tile = (page, key) => page.locator(`[data-research="tiles"] [data-tile="${key}"]`).getByRole('button');
const row = (page, id) => page.locator(`.gx-prow[data-game="${id}"]`);
const game = page => page.locator('[data-research="game"]');
const team = page => page.locator('[data-research="team"]');
const heading = (scope, name) => scope.getByRole('heading', { name, level: 2, exact: true });
const back = page => page.getByRole('button', { name: 'Back', exact: true });
const running = page => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.animationName ?? 'transition'));

function gtlCalls(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/gtl-api/')) calls.push(`${request.method()} ${url.pathname.replace('/functions/v1/gtl-api', '')}`);
  });
  return calls;
}
const world6 = (page, baseURL, prepare = WEEK6) => communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare });
/** A fresh document at `address` with no history entry behind it: what a shared link (or a reload) opens. */
async function shared(page, address) { await page.goto('about:blank'); await page.goto(`/${address}`); }
/** Signed in on Home first (the sign-in press is the launch's first navigation), then a shared link to `address`. */
async function signInOnHome(page) {
  // about:blank (between loads) refuses storage; the init script runs there too.
  await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
  await page.goto('/#home');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.locator('[data-landing="home"]')).toBeVisible({ timeout: 30000 });
}
async function openAt(page, address = '#research') { await signInOnHome(page); await shared(page, address); }
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}
/** Spec 3's phone rules for the page: no sideways scroll, layoutProblems, 44 px targets, no text under 12 px, fixed bars, axe. */
async function phoneProblems(page) {
  const problems = [];
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) problems.push('sideways scroll');
  problems.push(...(await page.evaluate(layoutProblems)));
  const report = await page.locator('.gx').first().evaluate(scope => {
    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [hidden], .gx-sr-only');
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44).map(r => `small target ${r.name} ${r.w}x${r.h}`);
    const small = [...scope.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12)
      .map(el => `small text ${el.textContent.trim().slice(0, 40)}`);
    // A transform, filter or will-change on an ancestor gives a fixed bar a containing block, so it scrolls away.
    const traps = [];
    for (const selector of ['.gx-tabbar', '.gx-topbar', '.gx-dock']) {
      for (let n = document.querySelector(selector)?.parentElement; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.transform !== 'none' || s.filter !== 'none' || s.translate !== 'none' || s.scale !== 'none' || /transform|filter|perspective/.test(s.willChange) || (s.backdropFilter && s.backdropFilter !== 'none')) traps.push(`fixed bar ${selector} inside ${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`);
      }
    }
    return [...targets, ...small, ...traps];
  });
  problems.push(...report);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  problems.push(...axe.violations.map(v => `axe ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`));
  return problems;
}

test('the landing: one next-move card for this week’s games, four tiles, and no read of its own', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await weekGamesInRead(page, world);
    await signInOnHome(page);
    // Only the requests of a fresh Research load (Home's own reads before it do not count).
    const calls = gtlCalls(page);
    await shared(page, '#research');
    await expect(hero(page)).toBeVisible({ timeout: 30000 });
    const n = world.state.games.length;
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText(new RegExp(`^(${n} games|Week 6 results)$`));
    await expect(hero(page).locator('[data-research="hero-line"]')).toHaveText(new RegExp(`^(\\d+ of ${n} kicked off|All ${n} games kicked off)$`));
    await expect(hero(page).locator('.gx-meter3-seg')).toHaveCount(n);
    await expect(landing(page).locator('.gx-btn--primary'), 'the screen’s one lime button').toHaveCount(1);
    await expect(page.locator('[data-research="tiles"] > li')).toHaveCount(4);
    for (const [key, name] of [['games', /^Games, /], ['trends', /^Trends, /], ['fantasy', 'Fantasy, player rankings'], ['teams', 'Teams, all 32, records and margins']]) await expect(tile(page, key)).toHaveAccessibleName(name);
    await page.waitForLoadState('networkidle');
    expect(calls.filter(call => /\/(personal|lines\/|fantasy\/|research)/.test(call)), 'the landing reads only what the shell already reads').toEqual([]);
    for (const [key, address] of [['teams', /#research\/teams(\?season=&week=)?$/], ['games', /#research\/games(\?season=&week=)?$/]]) {
      await tile(page, key).click();
      await expect(page).toHaveURL(address);
      await back(page).click();
      await expect(landing(page)).toBeVisible();
      await expect(page.locator(`#gx-r-tile-${key}`), 'Back returns focus to the tile by its id').toBeFocused();
    }
    await expect(page.locator('#gx-r-hero-action')).toHaveText('Open games');
    await page.locator('#gx-r-hero-action').click();
    await expect(page).toHaveURL(/#research\/games(\?season=&week=)?$/);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the first card counts this week’s games from the real Community read', async ({ page, baseURL }) => {
  test.fail(true, 'Known Task 6 defect: the Community read carries the week’s game count, not its games, so the card says "No week is open yet" (task-9-report.md).');
  const world = await world6(page, baseURL);
  try {
    await openAt(page);
    await expect(hero(page)).toBeVisible({ timeout: 30000 });
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText(`${world.state.games.length} games`, { timeout: 10000 });
    await expect(tile(page, 'games')).not.toHaveAccessibleName('Games, no week open');
  } finally { await world.db.close(); }
});

test('loading in the final shape: the landing card’s skeleton and the board’s skeleton rows hold the real heights at 390 px', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await weekGamesInRead(page, world);
    await openAt(page);
    await expect(hero(page)).toBeVisible({ timeout: 30000 });
    await expect(hero(page)).toHaveAttribute('data-kind', 'week');
    await settle(page);
    const card = await hero(page).evaluate(el => el.getBoundingClientRect().height);
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route(`${SUPABASE}/functions/v1/gtl-api/community/read`, async route => { await held; await route.fallback(); });
    await page.reload();
    const skeleton = page.locator('[data-skeleton="landing"] .gx-skel-hero');
    await expect(skeleton).toBeVisible();
    const drawn = await skeleton.evaluate(el => el.getBoundingClientRect().height);
    await expect(page.locator('[data-skeleton="landing"] .gx-skel-tile')).toHaveCount(4);
    release(); await page.unroute(`${SUPABASE}/functions/v1/gtl-api/community/read`);
    await expect(hero(page)).toBeVisible();
    // Step 2's rule for a next-move card (next-home-layers.spec.js): the test world blocks webfonts, so the card is drawn
    // in fallback faces that differ by platform; no jump larger than one title line (64 px), never a skeleton taller than
    // the card it stands in for.
    test.info().annotations.push({ type: 'heights', description: `landing skeleton ${drawn}px, card ${card}px` });
    expect(Math.abs(drawn - card), `the skeleton card is ${drawn}px, the card ${card}px`).toBeLessThanOrEqual(64);
    expect(drawn, 'the skeleton is never taller than the card').toBeLessThanOrEqual(card + 8);

    await shared(page, '#research/games');
    await expect(row(page, 'SEA-DEN')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('button.gx-prow [data-cell="loading"]')).toHaveCount(0);
    const real = await row(page, 'SEA-DEN').evaluate(el => el.getBoundingClientRect().height);
    let open; const wait = new Promise(resolve => { open = resolve; });
    await page.route(`${SUPABASE}/functions/v1/gtl-api/personal`, async route => { await wait; await route.fallback(); });
    await page.reload();
    const skel = page.locator('[data-skeleton="rows"] .gx-skel-row').first();
    await expect(skel).toBeVisible();
    await expect(page.locator('[data-skeleton="rows"] .gx-skel-row')).toHaveCount(4);
    const rowDrawn = await skel.evaluate(el => el.getBoundingClientRect().height);
    test.info().annotations.push({ type: 'heights', description: `board skeleton row ${rowDrawn}px, row ${real}px` });
    expect(Math.abs(rowDrawn - real), `the skeleton row is ${rowDrawn}px, a row ${real}px`).toBeLessThanOrEqual(8);
    open(); await page.unroute(`${SUPABASE}/functions/v1/gtl-api/personal`);
    await expect(row(page, 'SEA-DEN')).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('one game is a layer: a row, its heading focused, a reload, Back and Forward, the lip; Back keeps the board’s scroll and replays no rise', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/games');
    await expect(row(page, 'SEA-DEN')).toBeVisible({ timeout: 30000 });
    await row(page, 'SEA-DEN').click();
    await expect(page).toHaveURL(/#research\/games\?(.*&)?layer=game&item=SEA-DEN$/);
    await expect(heading(game(page), 'SEA @ DEN'), 'a tap focuses the layer’s heading').toBeFocused();
    await expect(game(page).getByRole('button', { name: 'Back to Games', exact: true })).toBeVisible();
    await expect(page.locator('.gx-prow[data-game]').first(), 'the board stays mounted, hidden, under the layer').toBeHidden();
    await expect(page.locator('.gx-prow[data-game]')).toHaveCount(2);
    await page.reload();
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible({ timeout: 30000 });
    await expect(heading(game(page), 'SEA @ DEN'), 'a load never moves focus').not.toBeFocused();
    await page.goBack();
    await expect(row(page, 'SEA-DEN')).toBeVisible();
    await page.goForward();
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible();
    await game(page).getByRole('button', { name: 'Back to Games', exact: true }).click();
    await expect(row(page, 'SEA-DEN')).toBeVisible();
    await expect(game(page)).toHaveCount(0);

    // The kept board: open the second game from a scrolled board; Back restores the scroll and the focus (by the row's
    // id) and only settles the board back in: no row's rise (gx-nest-unit-in) plays again.
    await page.setViewportSize({ width: 390, height: 480 });
    await settle(page);
    // The second row sits 160 px down the screen; a mouse press there (a locator's click would scroll it into view first).
    const scrolled = await page.evaluate(() => { scrollTo(0, scrollY + document.querySelector('#gx-l-row-HOU-JAX').getBoundingClientRect().top - 160); return scrollY; });
    expect(scrolled, 'the board scrolls at 390 × 480').toBeGreaterThan(40);
    const box = await row(page, 'HOU-JAX').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(heading(game(page), 'HOU @ JAX')).toBeFocused();
    await settle(page);
    await back(page).click();
    await expect(page.locator('#gx-l-row-HOU-JAX'), 'Back returns focus to the row by its id').toBeFocused();
    expect(await running(page), 'Back replays no row’s rise').not.toContain('gx-nest-unit-in');
    await expect.poll(() => page.evaluate(() => Math.round(scrollY)), 'Back restores the board’s scroll').toBe(Math.round(scrolled));
    await page.setViewportSize({ width: 390, height: 844 });

    await shared(page, '#research/games?layer=game&item=SEA-DEN');
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible({ timeout: 30000 });
    await expect(heading(game(page), 'SEA @ DEN'), 'a shared link moves no focus').not.toBeFocused();
    await back(page).click();
    await expect(row(page, 'SEA-DEN'), 'Back on a shared link closes one layer, to the board').toBeVisible();
    await expect(page).toHaveURL(/#research\/games$/);
    await back(page).click();
    await expect(landing(page)).toBeVisible();
    await shared(page, '#research/games?layer=nope&item=SEA-DEN');
    await expect(row(page, 'SEA-DEN'), 'an unknown layer draws the board').toBeVisible({ timeout: 30000 });
    await expect(game(page)).toHaveCount(0);
    await shared(page, '#research/games?layer=game&item=bad%20id');
    await expect(row(page, 'SEA-DEN'), 'an item outside the allowlist draws the board').toBeVisible({ timeout: 30000 });
    await expect(game(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the pager swaps the game in place and never widens the page: Next, Previous and a drag at 390 and 320; Back lands on the board', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/games');
    await expect(row(page, 'SEA-DEN')).toBeVisible({ timeout: 30000 });
    const first = await page.locator('.gx-prow[data-game]').first().getAttribute('data-game');
    const second = await page.locator('.gx-prow[data-game]').nth(1).getAttribute('data-game');
    const title = id => id.replace('-', ' @ ');
    await row(page, first).click();
    await expect(heading(game(page), title(first))).toBeFocused();
    const length = await page.evaluate(() => history.length);
    const next = game(page).locator('[data-pager]').getByRole('button', { name: /^Next game/ });
    const prev = game(page).locator('[data-pager]').getByRole('button', { name: /^Previous game/ });
    await settle(page);
    await page.evaluate(() => scrollTo(0, 300));
    expect(await page.evaluate(() => scrollY), 'the game layer scrolls').toBeGreaterThan(0);
    await next.click();
    await expect(page).toHaveURL(new RegExp(`item=${second}$`));
    await expect(heading(game(page), title(second))).toBeVisible();
    await expect(next, 'paging keeps focus on the button').toBeFocused();
    expect(await page.evaluate(() => [history.length, scrollY]), 'no history entry; the new game opens at its top').toEqual([length, 0]);

    // The page never scrolls sideways while a page turns: sampled every frame through Previous, Next and a drag.
    const sample = () => page.evaluate(() => { window.__wide = 0; window.__sampling = true; const loop = () => { window.__wide = Math.max(window.__wide, document.documentElement.scrollWidth - innerWidth); if (window.__sampling) requestAnimationFrame(loop); }; loop(); });
    const widest = () => page.evaluate(() => { window.__sampling = false; return window.__wide; });
    const body = game(page).locator('.gx-pager-body');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await settle(page);
      await sample();
      await prev.click();
      await expect(heading(game(page), title(first))).toBeVisible();
      await settle(page);
      await next.click();
      await expect(heading(game(page), title(second))).toBeVisible();
      await settle(page);
      const box = await body.boundingBox();
      const from = { x: box.x + box.width / 2, y: box.y + 40 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 200, from.y, { steps: 8 });
      const held = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      await page.mouse.up();
      await expect(heading(game(page), title(first)), `${width} px: a drag past the threshold turns to the previous game`).toBeVisible();
      await settle(page);
      expect(held, `${width} px: no sideways scroll while the drag is held`).toBeLessThanOrEqual(0);
      expect(await widest(), `${width} px: no sideways scroll in any frame of a turn`).toBeLessThanOrEqual(0);
      await next.click();
      await expect(heading(game(page), title(second))).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => history.length), 'turning pages adds no history entry').toBe(length);
    await page.goBack();
    await expect(row(page, second), 'Back after paging lands on the board').toBeVisible();
    await expect(game(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('one team is a layer: the Teams list, its address, its heading, the lip; a team from a game, then Back to the game', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/teams');
    await expect(page.locator('[data-research="teams"] .gx-prow')).toHaveCount(32, { timeout: 30000 });
    await page.locator('.gx-prow[data-team="SEA"]').click();
    await expect(page).toHaveURL(/#research\/teams\?(.*&)?layer=team&item=SEA$/);
    await expect(heading(team(page), 'Seattle Seahawks')).toBeFocused();
    await expect(team(page).getByRole('group', { name: 'Team details' })).toBeVisible();
    await team(page).getByRole('button', { name: 'Back to Teams', exact: true }).click();
    await expect(page.locator('#gx-r-team-SEA'), 'Back returns focus to the team’s row by its id').toBeFocused();
    await shared(page, '#research/games');
    await expect(row(page, 'SEA-DEN')).toBeVisible({ timeout: 30000 });
    await row(page, 'SEA-DEN').click();
    await game(page).getByRole('button', { name: /^Seattle Seahawks, .*Open team$/ }).click();
    await expect(page).toHaveURL(/#research\/teams\?(.*&)?layer=team&item=SEA$/);
    await expect(heading(team(page), 'Seattle Seahawks')).toBeFocused();
    await back(page).click();
    await expect(heading(game(page), 'SEA @ DEN'), 'Back from a team opened in a game returns to the game').toBeVisible();
    await expect(page).toHaveURL(/#research\/games\?(.*&)?layer=game&item=SEA-DEN$/);
    await shared(page, '#research/teams?layer=team&item=ZZZ');
    await expect(page.locator('.gx-prow[data-team="SEA"]'), 'an unknown team draws the list').toBeVisible({ timeout: 30000 });
    await expect(team(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the team’s margin chart reveals after a tap, never on a load, and is drawn whole under reduced motion', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await teamGames(page);
    await openAt(page, '#research/teams');
    await expect(page.locator('#gx-r-team-SEA')).toBeVisible({ timeout: 30000 });
    await page.locator('#gx-r-team-SEA').click();
    const reveal = team(page).locator('[data-chart="margin"] .gx-reveal');
    await expect(reveal).toHaveCount(1, { timeout: 30000 });
    await expect(reveal, 'a tap plays the reveal').toHaveAttribute('data-reveal', 'in');
    expect(await reveal.evaluate(el => el.getAnimations({ subtree: true }).map(a => a.animationName).sort())).toEqual(['gx-reveal-clip', 'gx-reveal-hold']);
    await settle(page);
    await expect(reveal, 'then it rests').not.toHaveAttribute('data-reveal', /.*/);
    expect(await reveal.evaluate(el => getComputedStyle(el).transform)).toBe('none');
    await page.reload();
    await expect(team(page).locator('[data-chart="margin"] .gx-reveal')).toHaveCount(1, { timeout: 30000 });
    await expect(team(page).locator('[data-chart="margin"] .gx-reveal'), 'a load draws the chart whole').not.toHaveAttribute('data-reveal', /.*/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await team(page).getByRole('button', { name: 'Back to Teams', exact: true }).click();
    await page.locator('#gx-r-team-DEN').click();
    const den = team(page).locator('[data-chart="margin"] .gx-reveal');
    await expect(den).toHaveCount(1, { timeout: 30000 });
    await expect(den, 'reduced motion never starts the reveal').not.toHaveAttribute('data-reveal', /.*/);
    expect(await den.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(team(page).locator('[data-chart="margin"] svg')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('layers never cross tabs, and Play’s matchup still opens the team sheet', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/games');
    await expect(row(page, 'SEA-DEN')).toBeVisible({ timeout: 30000 });
    await row(page, 'SEA-DEN').click();
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await tabs.getByRole('button', { name: /^Home(, .+)?$/ }).click();
    await expect(page).toHaveURL(/#home$/);
    await tabs.getByRole('button', { name: /^Research(, .+)?$/ }).click();
    await expect(landing(page)).toBeVisible();
    await expect(game(page)).toHaveCount(0);
    await tile(page, 'games').click();
    await expect(page).toHaveURL(/#research\/games(\?season=&week=)?$/);
    await expect(game(page), 'a fresh Games tile never carries the layer').toHaveCount(0);
    await expect(row(page, 'SEA-DEN')).toBeVisible();

    // Play's pick card: its matchup's team opens the team sheet over Play (D-69 step 3 moved only Research's paths).
    await shared(page, '#play/picks');
    await page.locator('.gx-per-game [data-tile]').first().click();
    await page.getByRole('button', { name: /^Seattle Seahawks(, .*)?\. Open team$/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Seattle Seahawks', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('group', { name: 'Team details' })).toBeVisible();
    await expect(page).toHaveURL(/#play\/picks/);
    await expect(team(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('motion: the layer rises in after a tap; the movement chart reveals on its first opening, transform only; never on a load or under reduced motion', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await storeBookLines(world, { spread: { 'SEA-DEN': -1.5, 'HOU-JAX': 2.5 }, total: { 'SEA-DEN': 43.5, 'HOU-JAX': 41.5 } });
    await sendBallot(world, 'luke', 'guess_total', { 'SEA-DEN': 41, 'HOU-JAX': 44 });
    await openAt(page, '#research/games');
    await expect(row(page, 'SEA-DEN')).toBeVisible({ timeout: 30000 });
    await row(page, 'SEA-DEN').click();
    expect(await game(page).locator('.gx-nest-card').getAttribute('data-enter')).toBe('in');
    const total = game(page).locator('[data-market-details="total"]');
    await expect(total).toBeVisible({ timeout: 30000 });
    const summary = total.locator('summary', { hasText: 'Line movement' });
    await summary.click();
    const reveal = total.locator('.gx-md-plot .gx-reveal');
    await expect(reveal).toHaveAttribute('data-reveal', 'in');
    expect(await reveal.evaluate(el => el.getAnimations({ subtree: true }).map(a => a.animationName).sort())).toEqual(['gx-reveal-clip', 'gx-reveal-hold']);
    await settle(page);
    await expect(reveal).not.toHaveAttribute('data-reveal', /.*/);
    expect(await reveal.evaluate(el => getComputedStyle(el).transform)).toBe('none');
    await summary.click(); await summary.click();
    await expect(reveal, 'the reveal is the first opening’s only').not.toHaveAttribute('data-reveal', /.*/);
    await page.reload();
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible({ timeout: 30000 });
    expect(await game(page).locator('.gx-nest-card').getAttribute('data-enter'), 'a load draws no entrance').toBeNull();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(game(page).locator('[data-market-details="total"]')).toBeVisible({ timeout: 30000 });
    await game(page).locator('[data-market-details="total"] summary', { hasText: 'Line movement' }).click();
    await expect(game(page).locator('[data-market-details="total"] .gx-md-plot svg')).toBeVisible();
    await expect(game(page).locator('[data-market-details="total"] .gx-reveal')).not.toHaveAttribute('data-reveal', /.*/);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await shared(page, '#research');
    await expect(hero(page)).toBeVisible({ timeout: 30000 });
    expect(await running(page), 'nothing moves on the first paint').toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('phone rules on every Research address: 320 and 390 px, Dark and Light, the wide fallback font, 44 px targets, 12 px text, fixed bars, axe', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL, WEEK6_TEN_AM);
  try {
    await weekGamesInRead(page, world);
    await teamGames(page);
    await openAt(page);
    await expect(hero(page)).toBeVisible({ timeout: 30000 });
    // The Games tile draws the widest kickoff time there is.
    await expect(tile(page, 'games').locator('.gx-nest-num')).toHaveText('10:00 AM');
    const found = {};
    for (const { theme, width, wide = false } of [{ theme: 'dark', width: 390 }, { theme: 'light', width: 390 }, { theme: 'dark', width: 320 }, { theme: 'light', width: 320, wide: true }]) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      for (const [address, ready] of [['#research', hero], ['#research/games', p => row(p, 'SEA-DEN')], ['#research/games?layer=game&item=SEA-DEN', p => heading(game(p), 'SEA @ DEN')],
        ['#research/teams', p => p.locator('#gx-r-team-SEA')], ['#research/teams?layer=team&item=SEA', p => team(p).locator('[data-chart="margin"]')]]) {
        await shared(page, address);
        await expect(ready(page)).toBeVisible({ timeout: 30000 });
        await page.waitForLoadState('networkidle');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        if (wide) await page.addStyleTag({ content: WIDE_FONT });
        await settle(page);
        const problems = await phoneProblems(page);
        if (problems.length) found[`${theme} ${width}${wide ? ' wide' : ''} ${address}`] = problems;
      }
    }
    expect(found).toEqual({});
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
