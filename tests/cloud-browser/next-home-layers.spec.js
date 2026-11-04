import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { seedFinishedWeek } from '../helpers/features-week.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn } from './community-world.mjs';
import { rankKey } from '../../web/src/next/league/rankMoment.js';
import { momentsKey } from '../../web/src/next/moments/seen.js';
import { WEEK_LOCKED_SOURCE } from '../../web/src/next/play/landing.js';
import { weekLockedId } from '../../web/src/next/play/moments.js';

// D-69 step 2 (Home, H1A with C9) on the real app and handler with every migration on local PGlite. Checked: Who's in's
// address (tile, reload, lip, the top bar's Back, browser Back and Forward, the Home tab, the logo) and where focus goes;
// This week's game tiles, where they lead and where focus goes when a focused game kicks off; a rank move from while you
// were away is NEW on its rank tile and plays when its Your score card draws, never on launch or while that card loads;
// Whole week locked waits on launch and pops on Home's card after a navigation; the landing skeleton holds the card's
// height; C9's meter row and the phone rules (no sideways scroll, 44 px targets, no text under 12 px, nothing clipped,
// the layout checks, axe) on every Home state and the layer at 320 and 390 px in both themes and the wide fallback font.
// Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const LUKE = ACCOUNTS.luke.id;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// CI's Linux runner falls back to wider letters than Windows draws; this probe reproduces a 320 px overflow seen only there.
const WIDE_FONT = '.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }';
const api = name => url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${name}`;
const tabs = page => page.getByRole('navigation', { name: 'Main' });
const homeTab = page => tabs(page).getByRole('button', { name: /^Home(, .+)?$/ });
const hero = page => page.locator('[data-home="hero"]');
const whoLayer = page => page.locator('[data-home="who-layer"]');
const tileButton = (page, name) => page.locator(`[data-tile="${name}"]`).getByRole('button');
const gameTiles = page => page.locator('[data-home="week"] [data-game-tile]');
/** What has focus, in words: 'body', `#id`, or the tag (with [data-route-focus]) and its text. */
const focused = page => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return 'body';
  if (el.id) return `#${el.id}`;
  return `${el.tagName.toLowerCase()}${el.hasAttribute('data-route-focus') ? '[data-route-focus]' : ''}${el.closest('.gx-sr-only') ? '.gx-sr-only' : ''}: ${el.textContent.trim().slice(0, 30)}`;
});
const seen = (page, account = LUKE) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), momentsKey(account));

/** Answers `name` from the world's real handler, with `edit(body)` applied to the reply. */
async function rewrite(page, world, name, edit) {
  await page.route(api(name), async route => {
    const req = route.request();
    const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    const body = await response.json();
    if (response.ok) edit(body);
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

/** Luke's open week with a saved Spread draft on every game (whole numbers: his own picks are never secrets). */
async function draftWeek(page, baseURL, options = {}) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, ...options });
  const { season, week } = world.state.league;
  const workspace = await world.api('luke', 'personal');
  expect(workspace.status).toBe(200);
  const picks = Object.fromEntries(world.state.games.map((game, i) => [game.id, i % 2 ? 4 : -9]));
  expect((await world.api('luke', 'personal/ballot', { season, week, mode: 'guess_spread', picks, submit: false,
    revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() })).status).toBe(200);
  return world;
}

/** Opens Home as `account`; `storage` is what this device saw before (seeded once per tab, so a reload keeps the app's own writes). */
async function openHome(page, storage = {}, account = 'luke') {
  await page.addInitScript(entries => {
    try {
      localStorage.setItem('gtl.app', 'next');
      if (sessionStorage.getItem('gtl-test-seeded')) return;
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      sessionStorage.setItem('gtl-test-seeded', '1');
    } catch { /* about:blank has no storage. */ }
  }, storage);
  await page.goto('/#home');
  await signIn(page, account, { navigate: false });
  await expect(hero(page)).toBeVisible();
}

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/** Phone rules (spec section 3) for the screen: no sideways scroll, 44 px targets, no text under 12 px, nothing clipped, layoutProblems, axe. */
async function phoneRules(page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no sideways scroll`).toBe(true);
  expect(await page.evaluate(layoutProblems), label).toEqual([]);
  const report = await page.locator('.gx').first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open]), .gx-sr-only:not(.gx-skip-link:focus)'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 0.5 || r.left < -0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report, label).toEqual({ targets: [], small: [], clipped: [] });
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${label}: axe`).toEqual([]);
}

/** 390 and 320 px in Dark and Light, and the wide fallback font at both widths. */
const PASSES = [{ theme: 'dark', width: 390 }, { theme: 'light', width: 390 }, { theme: 'dark', width: 320 }, { theme: 'light', width: 320 },
  { theme: 'dark', width: 390, wide: true }, { theme: 'light', width: 320, wide: true }];

/** Loads `address` fresh in one pass's theme, width and font, waiting for `ready` (a locator maker). */
async function load(page, { theme, width, wide = false }, address, ready) {
  await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
  await page.setViewportSize({ width, height: 844 });
  await page.goto('about:blank');
  await page.goto(`/${address}`);
  await expect(ready(page)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.waitForLoadState('networkidle');
  if (wide) await page.addStyleTag({ content: WIDE_FONT });
}

/** The phone rules on Home in every pass; `also(pass)` checks the state's own words in each. */
async function sweepHome(page, name, also = async () => {}) {
  for (const pass of PASSES) {
    await load(page, pass, '#home', hero);
    await also(pass);
    await phoneRules(page, `${name} ${pass.theme} ${pass.width}${pass.wide ? ' wide font' : ''}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('Who’s in is a Home layer: the tile opens #home?layer=who with its heading focused; a reload reopens it without moving focus; Back, the lip, the top bar, the Home tab and the logo close it', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  try {
    await openHome(page);
    const who = tileButton(page, 'who');
    // Troy has sent his Spread ballot; Luke keeps a draft and Sean has none.
    await expect(who).toHaveAccessibleName('Who’s in, 1 of 3 Spread ballots in');
    await who.click();
    await expect(page).toHaveURL(/#home\?layer=who$/);
    const layer = whoLayer(page);
    const heading = layer.getByRole('heading', { name: 'Who’s in', level: 2 });
    // The layer's own heading takes focus, not the screen-reader-only Home h1 the shell would fall back to.
    await expect(heading).toBeFocused();
    expect(await focused(page)).toBe('h2[data-route-focus]: Who’s in');
    await expect(layer.getByRole('button', { name: 'Standings', exact: true })).toBeVisible();
    await expect(layer.getByRole('button', { name: 'Invite', exact: true })).toBeVisible();
    // Every member, you first or not, with one status word each.
    await expect(layer.locator('.gx-h-person')).toHaveCount(3);
    await expect(layer.locator('.gx-h-person', { hasText: 'Troy Fixture' })).toContainText('In');
    await expect(layer.locator('.gx-h-person', { hasText: 'Luke Fixture · You' })).toContainText('Not yet');
    // The next-move card is not mounted behind the layer (Home's moment scope is closed while it shows).
    await expect(hero(page)).toHaveCount(0);

    // Browser Back closes the layer, and focus returns to the tile that opened it.
    await page.goBack();
    await expect(page).toHaveURL(/#home$/);
    await expect(hero(page)).toBeVisible();
    await expect(page.locator('#gx-h-tile-who')).toBeFocused();

    // A reload at the address reopens the layer and moves focus nowhere (it is not a navigation).
    await who.click();
    await expect(heading).toBeFocused();
    await page.reload();
    await expect(layer).toBeVisible();
    await expect(heading).toBeVisible();
    expect(await focused(page), 'a reload at #home?layer=who moves focus nowhere').toBe('body');
    await expect(hero(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/#home$/);
    await expect(hero(page)).toBeVisible();
    await page.goForward();
    await expect(layer).toBeVisible();

    // The lip goes back to Home.
    await layer.getByRole('button', { name: 'Back to Home', exact: true }).click();
    await expect(hero(page)).toBeVisible();
    await expect(page).toHaveURL(/#home$/);
    // The top bar shows Back on the layer (it is a detail), and Back closes it.
    await who.click();
    await expect(heading).toBeFocused();
    await page.locator('.gx-detail-nav').getByRole('button', { name: 'Back', exact: true }).click();
    await expect(hero(page)).toBeVisible();
    await expect(page.locator('#gx-h-tile-who')).toBeFocused();
    // The Home tab and the logo close it too.
    await who.click();
    await homeTab(page).click();
    await expect(hero(page)).toBeVisible();
    await expect(page).toHaveURL(/#home$/);
    await who.click();
    await page.getByRole('button', { name: 'Guess The Line, home' }).click();
    await expect(hero(page)).toBeVisible();
    await expect(page).toHaveURL(/#home$/);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('This week: the next games as tiles with your own Spread word; a tile opens that game’s picks card and Back returns to the tile; "All N games" opens Research › Games', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  try {
    await openHome(page);
    const { week } = world.state.league;
    const section = page.locator('[data-home="week"]');
    await expect(section.getByRole('heading', { name: 'This week', level: 2 })).toBeVisible();
    await expect(section).toContainText(`Week ${week} · ${world.state.games.length} games`);
    await expect(gameTiles(page)).toHaveCount(Math.min(4, world.state.games.length));
    // The window's first tile is the first game not yet kicked off by the server's clock.
    const firstId = await gameTiles(page).first().getAttribute('data-game-tile');
    expect(firstId).toBe(world.state.games[0].id);
    const first = world.state.games.find(game => game.id === firstId);
    const firstTile = page.locator(`[data-game-tile="${first.id}"]`).getByRole('button');
    // Nicknames are one word ("Seahawks", "49ers"); the word is Luke's own saved draft, in the picks card's words.
    await expect(firstTile).toHaveAccessibleName(/^\S+ at \S+, (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}:\d{2} (AM|PM) PT, Spread draft$/);
    await expect(firstTile.locator('.gx-h-game-state')).toHaveText('Draft');
    await expect(firstTile).toHaveAttribute('id', `gx-h-game-${first.id}`);
    await firstTile.click();
    expect(new URL(page.url()).hash).toContain(`pickGame=${first.id}`);
    expect(new URL(page.url()).hash).toContain('market=spread');
    await expect(page.getByRole('heading', { name: `${first.awayCode} @ ${first.homeCode}`, exact: true })).toBeFocused();
    await page.goBack();
    await expect(hero(page)).toBeVisible();
    await expect(page.locator(`#gx-h-game-${first.id}`)).toBeFocused();
    await section.getByRole('button', { name: `All ${world.state.games.length} games` }).click();
    await expect(page).toHaveURL(/#research\/games/);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a focused game tile that kicks off and leaves the window hands focus to the first tile still in it, never to the page', async ({ page, baseURL }) => {
  // Six games, an hour apart, so the four-tile window moves as games kick off. The server's clock is /personal's `now`:
  // the PGlite world answers with the database's real time, so the reply's `now` is moved forward here, and a refresh
  // (the app's own "back online" read) brings it in, as a later read would.
  const world = await draftWeek(page, baseURL, { games: 6 });
  let serverNow = null;
  await rewrite(page, world, 'personal', body => { if (serverNow) body.now = serverNow; });
  try {
    await openHome(page);
    const games = world.state.games, ids = () => gameTiles(page).evaluateAll(items => items.map(li => li.dataset.gameTile));
    const kickoff = i => Date.parse(games[i].kickoff);
    expect(await ids()).toEqual(games.slice(0, 4).map(game => game.id));
    await page.locator(`#gx-h-game-${games[0].id}`).focus();
    expect(await focused(page)).toBe(`#gx-h-game-${games[0].id}`);

    // The first game kicks off: its tile leaves the window, and focus goes to the first tile that remains.
    serverNow = new Date(kickoff(0) + 60_000).toISOString();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(ids).toEqual(games.slice(1, 5).map(game => game.id));
    await expect(page.locator(`#gx-h-game-${games[1].id}`)).toBeFocused();
    expect(await focused(page)).not.toBe('body');

    // Every game kicks off: the window is the week's last four, each "Closed at kickoff", and focus moves on again.
    serverNow = new Date(kickoff(games.length - 1) + 60_000).toISOString();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(ids).toEqual(games.slice(-4).map(game => game.id));
    await expect(page.locator(`#gx-h-game-${games[2].id}`)).toBeFocused();
    await expect(gameTiles(page).locator('.gx-h-game-state')).toHaveText(Array(4).fill('Closed at kickoff'));
    // The window never empties while the week has games, so the heading fallback (no tile left) is a unit test only
    // (tests/next-home-focus.test.jsx); here focus never drops to the page.
    expect(await focused(page)).not.toBe('body');
    await sweepHome(page, 'kicked off', async () => {
      await expect(gameTiles(page).locator('.gx-h-game-state')).toHaveText(Array(4).fill('Closed at kickoff'));
    });
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

/**
 * A Community rank move from while `account` was away (this device last saw `from`; the features world puts Luke 1st
 * with 20 and Troy 2nd with 12): NEW on Home's Spread rank tile, nothing on launch, nothing while Your score's season
 * history is held (its rank chip is not drawn, Task 5's fix), then it plays once the chip draws: a small rank-up pops the
 * chip; reaching 1st is the big card. Back returns focus to the tile by its id though its name lost ", new"; a reload
 * never replays it.
 */
async function rankMoveOnYourScore(page, baseURL, { account, from, name, big }) {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await seedFinishedWeek(world);
    expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
    const id = ACCOUNTS[account].id;
    await openHome(page, { [rankKey(id, 'community', 'guess_spread')]: JSON.stringify({ rank: from, from: null }),
      [momentsKey(id)]: JSON.stringify(['source:rank:community:guess_spread']) }, account);
    const spread = tileButton(page, 'spread'), flash = page.getByRole('dialog');
    const pop = page.locator('.gx-ys-rank[data-moment="pop"]'), momentId = 'rank:community:guess_spread:1';
    await expect(spread).toHaveAccessibleName(`${name}, new`);
    await expect(page.locator('[data-tile="spread"] .gx-new')).toBeVisible();
    await expect(tileButton(page, 'total')).not.toHaveAccessibleName(/, new$/);
    await page.waitForTimeout(800);
    await expect(flash, 'nothing plays on the launch screen').toHaveCount(0);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    expect(await seen(page, id)).not.toContain(momentId);

    // Your score's season history is held: its rank chip is not drawn, so the move waits.
    let letHistory, holding = true, asked = 0;
    const held = new Promise(resolve => { letHistory = resolve; });
    await page.route(api('community/history'), async route => { asked += 1; if (holding) await held; return route.fallback(); });
    await spread.click();
    await expect(page).toHaveURL(/#play\/score/);
    await expect.poll(() => asked, 'Your score asks for the season history').toBeGreaterThan(0);
    await expect(page.locator('[data-play="score"]').getByRole('status').first()).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 300)))));
    await expect(page.locator('.gx-ys-rank')).toHaveCount(0);
    await expect(page.locator('[data-moment="pop"]'), 'nothing pops while Your score loads').toHaveCount(0);
    await expect(flash).toHaveCount(0);
    expect(await seen(page, id), 'the move still waits (the tile still counts it as NEW)').not.toContain(momentId);

    // The read lands: the season rank chip draws and the move plays there.
    holding = false; letHistory();
    await expect(page.locator('.gx-ys-rank')).toContainText(name.match(/, (\w+), up/)[1]);
    if (big) {
      // Reaching 1st is the big card (rankFirst); the chip stays still under it.
      await expect(page.getByRole('dialog', { name: 'You’re 1st' }), 'it plays when the tile’s card draws').toBeVisible();
      await expect(pop).toHaveCount(0);
      await page.getByRole('dialog', { name: 'You’re 1st' }).getByRole('button', { name: 'Nice', exact: true }).click();
      await expect(flash).toHaveCount(0);
    } else {
      // A rank-up is small: the chip pops in place, and no card covers the screen.
      await expect(pop, 'it plays when the tile’s card draws').toBeVisible();
      await page.waitForTimeout(400);
      await expect(flash).toHaveCount(0);
    }
    expect(await seen(page, id)).toContain(momentId);

    // Back: focus returns to the tile by its id, though its spoken name lost ", new".
    await page.goBack();
    await expect(page).toHaveURL(/#home$/);
    await expect(hero(page)).toBeVisible();
    await expect(page.locator('#gx-h-tile-spread')).toBeFocused();
    await expect(spread).toHaveAccessibleName(name);
    await expect(page.locator('[data-tile="spread"] .gx-new')).toHaveCount(0);
    // Once: after a reload the tile has no NEW and Your score plays nothing.
    await page.reload();
    await expect(spread).toHaveAccessibleName(name);
    await spread.click();
    await expect(page.locator('.gx-ys-rank')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(flash).toHaveCount(0);
    await expect(pop).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
}

test('a rank-up from while you were away is NEW on its rank tile, waits while Your score loads, pops the season rank chip when it draws, never on launch; Back returns focus to the tile', async ({ page, baseURL }) => {
  // Troy: this device saw him 3rd; he is 2nd with 12 (a small moment).
  await rankMoveOnYourScore(page, baseURL, { account: 'troy', from: 3, name: 'Spread rank, 2nd, up 1, 12 points', big: false });
});

test('reaching 1st from while you were away is NEW on its rank tile and plays as the big card when Your score’s chip draws, never on launch or while it loads', async ({ page, baseURL }) => {
  // Luke: this device saw him 2nd; he now leads with 20 (a big moment).
  await rankMoveOnYourScore(page, baseURL, { account: 'luke', from: 2, name: 'Spread rank, 1st, up 1, 20 points', big: true });
});

test('a waiting Whole week locked moment never plays on launch; it pops on Home’s card when the card draws after a navigation, once', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  // The Community read says per-game rules, every Spread game locked by Luke and Total still open (a fixture reply),
  // and this device read that source before: the Spread Whole week locked moment waits.
  await rewrite(page, world, 'community/read', body => {
    body.rules = { ...body.rules, perGameScoring: true };
    body.due = body.due.map(row => (row.mode === 'guess_spread' ? { ...row, locked: row.games, openGames: 0, filled: row.games } : { ...row, locked: 0, openGames: row.games }));
  });
  try {
    const { season, week } = world.state.league, games = world.state.games.length, momentId = weekLockedId(season, week, 'guess_spread');
    await page.addInitScript(() => {
      window.__anims = [];
      document.addEventListener('animationstart', event => window.__anims.push({ name: event.animationName, cls: event.target.getAttribute?.('class') ?? '', market: event.target.closest?.('[data-market]')?.dataset.market ?? '' }), true);
    });
    await openHome(page, { [momentsKey(LUKE)]: JSON.stringify([`source:${WEEK_LOCKED_SOURCE}`]) });
    const spreadMeter = hero(page).locator('[data-home="status"] > li[data-market="guess_spread"]');
    await expect(spreadMeter).toHaveText(`Spread · ${games} of ${games} locked`);
    await expect(hero(page).locator('[data-home="status"] > li[data-market="guess_total"]')).toHaveText(`Total · 0 of ${games} locked`);
    await page.waitForTimeout(1200);
    // The LIVE dot is the one loop, and the countdown's digit tick belongs to the clock, not to the page load.
    const onLoad = await page.evaluate(() => window.__anims.filter(a => a.name !== 'gx-live-pulse' && !(a.name === 'gx-rise-in' && /(^|\s)gx-cd-tick(\s|$)/.test(a.cls))));
    expect(onLoad, 'nothing animates during the first paint').toEqual([]);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    expect(await seen(page), 'the moment still waits').not.toContain(momentId);

    // Research holds no Whole week locked scope; back on Home the card draws after a navigation and the Spread meter pops.
    await tabs(page).getByRole('button', { name: /^Research(, .+)?$/ }).click();
    await expect(page.locator('[data-landing="research"]')).toBeVisible();
    expect(await seen(page)).not.toContain(momentId);
    await page.evaluate(() => { window.__anims = []; });
    await homeTab(page).click();
    await expect(spreadMeter).toHaveAttribute('data-moment', 'pop');
    await expect(hero(page).locator('[data-home="status"] > li[data-market="guess_total"]')).not.toHaveAttribute('data-moment', /./);
    await expect.poll(() => page.evaluate(() => window.__anims.some(a => a.market === 'guess_spread' && /gx-h-meter/.test(a.cls)))).toBe(true);
    expect(await seen(page)).toContain(momentId);
    // Once: a reload and another visit never replay it.
    await page.reload();
    await expect(spreadMeter).toHaveText(`Spread · ${games} of ${games} locked`);
    await tabs(page).getByRole('button', { name: /^Research(, .+)?$/ }).click();
    await homeTab(page).click();
    await expect(hero(page)).toBeVisible();
    await page.waitForTimeout(600);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    await sweepHome(page, 'week locked', async () => {
      await expect(spreadMeter).toHaveText(`Spread · ${games} of ${games} locked`);
    });
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the landing skeleton holds the next-move card’s height at 390 px, so the first card does not jump when the read lands', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  let release, holding = true;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(api('community/read'), async route => { if (holding) await held; return route.fallback(); });
  try {
    await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    const skeleton = page.locator('[data-skeleton="landing"] .gx-skel-hero');
    await expect(skeleton).toBeVisible();
    const skeletonHeight = await skeleton.evaluate(el => el.getBoundingClientRect().height);
    holding = false; release();
    await expect(hero(page)).toBeVisible();
    await expect(hero(page)).toHaveAttribute('data-state', 'due');
    await settle(page);
    const cardHeight = await hero(page).evaluate(el => el.getBoundingClientRect().height);
    test.info().annotations.push({ type: 'heights', description: `skeleton ${skeletonHeight}px, card ${cardHeight}px` });
    expect(Math.abs(cardHeight - skeletonHeight), `skeleton ${skeletonHeight}px vs card ${cardHeight}px`).toBeLessThanOrEqual(24);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('C9 and the phone rules: the meters share a row on a 390 px phone and stack at 320, in both themes and the wide font; Home and Who’s in pass the phone rules', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  try {
    await openHome(page);
    const games = world.state.games.length;
    await expect(hero(page).locator('[data-home="eyebrow"]')).toHaveText(`Week ${world.state.league.week} · Your next move`);
    await expect(hero(page).locator('[data-home="status"] > li')).toHaveText([`Spread · ${games} of ${games} picked`, `Total · 0 of ${games} picked`]);
    // Distinct row tops: 1 = the two meters share a row, 2 = stacked.
    const rows = () => hero(page).locator('[data-home="status"] > li').evaluateAll(items => new Set(items.map(li => Math.round(li.getBoundingClientRect().top))).size);
    for (const { theme, width, wide = false, columns } of [{ theme: 'dark', width: 390, columns: 1 }, { theme: 'light', width: 390, columns: 1 },
      { theme: 'light', width: 390, wide: true, columns: 1 }, { theme: 'dark', width: 320, columns: 2 }, { theme: 'light', width: 320, wide: true, columns: 2 }]) {
      const label = `${theme} ${width}${wide ? ' wide font' : ''}`;
      await load(page, { theme, width, wide }, '#home', hero);
      expect(await rows(), `${label}: ${columns === 1 ? 'one row' : 'stacked'}`).toBe(columns);
      // 24 px padding on the card, a 12 px gap between the meters (C9's 332 px rule counts on both).
      expect(await hero(page).evaluate(el => getComputedStyle(el).paddingLeft)).toBe('24px');
      expect(await hero(page).locator('[data-home="status"]').evaluate(el => getComputedStyle(el).columnGap)).toBe('12px');
      await phoneRules(page, `${label} #home`);
      await load(page, { theme, width, wide }, '#home?layer=who', whoLayer);
      await phoneRules(page, `${label} #home?layer=who`);
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the phone rules on Home when every ballot is sent: "Your week", "Week N locked in", each game "Locked in"', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    const { week } = world.state.league, games = world.state.games;
    const picks = values => Object.fromEntries(games.map((game, i) => [game.id, values[i % values.length]]));
    await sendBallot(world, 'luke', 'guess_spread', picks([4, -9]));
    await sendBallot(world, 'luke', 'guess_total', picks([44, 51]));
    await openHome(page);
    await sweepHome(page, 'sent', async () => {
      await expect(hero(page).locator('[data-home="eyebrow"]')).toHaveText('Your week');
      await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText(`Week ${week} locked in`);
      await expect(hero(page).locator('[data-home="status"] > li')).toHaveText(['Spread · sent', 'Total · sent']);
      await expect(gameTiles(page).locator('.gx-h-game-state')).toHaveText(Array(games.length).fill('Locked in'));
    });
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the phone rules on Home when every market is sat out: "Week N sat out", each game "Skipped"', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    const { season, week } = world.state.league, games = world.state.games;
    for (const mode of ['guess_spread', 'guess_total']) expect((await world.api('luke', 'community/sit-out', { season, week, mode })).status).toBe(200);
    await openHome(page);
    await sweepHome(page, 'sat out', async () => {
      await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText(`Week ${week} sat out`);
      await expect(hero(page).locator('[data-home="status"] > li')).toHaveText(['Spread · sat out', 'Total · sat out']);
      await expect(gameTiles(page).locator('.gx-h-game-state')).toHaveText(Array(games.length).fill('Skipped'));
    });
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
