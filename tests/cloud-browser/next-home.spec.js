import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, storeBookLines } from './community-world.mjs';
import { assertNoLeak, lineSecrets, pickSecrets } from '../helpers/leak-scan.mjs';
import { HOME_COPY, homeHero } from '../../shared/home-view.mjs';
import { heroHeadline } from '../../web/src/next/home/homeModel.js';

// Redesign build plan stage 12: the read-only Home at 390 x 844 (section 4.1), on the real app (main.jsx, AuthGate, the
// lazy NextApp) and the real handler with every migration (ALL) on local PGlite. The fixture week is open: Troy has sent
// both markets, Sean has sat out Spread, Luke keeps a Spread draft of two picks and no Total ballot. Checked: Home is the
// default screen when a member signs in (D-60); exactly one primary "Make picks" action opens the retained editor;
// compact score/ticket/league shortcuts; the rendered-page leak scan; no writes; axe in Dark and Light at 390 and 320
// with CI's fallback font. Score missing/zero semantics are separately covered in four-tab-landings.test.jsx.
// Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Stage 71: Home's recap row reads POST /league/features (badges and awards; nothing is written).
const READS = ['GET /lobby', 'POST /community/read', 'POST /social/read', 'POST /community/history', 'POST /me/preferences', 'POST /league/features'];
// Luke's own draft (whole numbers: his own picks are never secrets, and whole numbers collide with counts in the scan).
const LUKE_SPREAD_DRAFT = [4, -9];
// Stored book lines for the week (fixture values, never live odds), half-points so the scan can tell them from counts.
const STORED = { spread: [-2.5, 6.5], total: [41.5, 47.5] };

const tabBar = page => page.getByRole('navigation', { name: 'Main' });
const tab = (page, name) => tabBar(page).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const title = (page, name) => page.getByRole('heading', { name, level: 1, exact: true });
const communityHome = page => page.getByRole('heading', { name: 'Community', exact: true });
const hero = page => page.locator('[data-home="hero"]');
const whosIn = page => page.locator('[data-home="whos-in"]');
const rankTile = (page, market) => page.locator(`[data-tile="${market}"]`);

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/** The app's fonts never load here, so every font token is drawn in DejaVu Sans where it is installed: what CI measures. */
async function ciFonts(page) {
  await page.evaluate(() => {
    if (document.getElementById('ci-fonts')) return;
    const style = document.createElement('style');
    style.id = 'ci-fonts';
    style.textContent = 'html .gx { --gx-font-body: "DejaVu Sans", sans-serif; --gx-font-num: "DejaVu Sans", sans-serif; --gx-font-display: "DejaVu Sans", sans-serif; }';
    document.head.append(style);
  });
}

/** Phone rules for everything under `root` (section 4.1): no side scroll, 44px targets, no text under 12px, nothing clipped. */
async function phoneChecks(page, root = '.gx') {
  await ciFonts(page);
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no side scroll').toBe(true);
  const report = await page.locator(root).first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open]), .gx-sr-only:not(.gx-skip-link:focus)'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || el.closest('.gx-sr-only:not(.gx-skip-link:focus)') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 0.5 || r.left < -0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report).toEqual({ targets: [], small: [], clipped: [] });
}

async function axe(page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

/** Every gtl-api call from now on, as "METHOD /route". */
function apiCalls(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/gtl-api/')) calls.push(`${request.method()} ${url.pathname.replace('/functions/v1/gtl-api', '')}`);
  });
  return calls;
}

/** The world: the open fixture week, stored lines, Troy's sent ballots, Sean's Spread sit-out and Luke's Spread draft. */
async function lukesWeek(page, baseURL) {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  const { season, week } = world.state.league;
  const byGame = values => Object.fromEntries(world.state.games.map((game, i) => [game.id, values[i]]));
  const lines = { spread: byGame(STORED.spread), total: byGame(STORED.total) };
  await storeBookLines(world, lines);
  expect((await world.api('sean', 'community/sit-out', { season, week, mode: 'guess_spread' })).status).toBe(200);
  const workspace = await world.api('luke', 'personal');
  expect(workspace.status).toBe(200);
  const draft = await world.api('luke', 'personal/ballot', { season, week, mode: 'guess_spread', picks: byGame(LUKE_SPREAD_DRAFT), submit: false,
    revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() });
  expect(draft.status).toBe(200);
  return { world, lines };
}

/** Signs Luke in: since D-60 everyone lands in the new app, on Home. Calls are recorded from the first read. */
async function tryNewApp(page) {
  const calls = apiCalls(page);
  await signIn(page, 'luke');
  await expect(tabBar(page)).toBeVisible();
  await expect(hero(page)).toBeVisible();
  return calls;
}

const halves = map => Object.fromEntries(Object.entries(map).filter(([, value]) => !Number.isInteger(value)));
/** The leak scan (tests/helpers/leak-scan.mjs) on the rendered page: no other player's pick and no stored line. */
async function noLeak(page, world, lines, where) {
  const secrets = [
    ...pickSecrets(halves(world.troyPicks.guess_spread), { market: 'spread', owner: 'troy' }), ...pickSecrets(halves(world.troyPicks.guess_total), { market: 'total', owner: 'troy' }),
    ...lineSecrets(lines.spread, { market: 'spread' }), ...lineSecrets(lines.total, { market: 'total' }),
  ];
  expect(secrets.length).toBeGreaterThan(4);
  const { text, attributes } = await page.evaluate(() => ({
    text: document.body.innerText,
    attributes: [...document.body.querySelectorAll('*')].flatMap(el => [...el.attributes]
      .filter(a => (el.closest('svg') ? a.name === 'aria-label' : a.name !== 'style' && a.name !== 'class'))
      .map(a => `${a.name}=${a.value}`)),
  }));
  expect(attributes.some(a => a.startsWith('aria-label=')), 'the scan reads attributes').toBe(true);
  assertNoLeak({ text, attributes }, { viewer: ACCOUNTS.luke.id, secrets }, where);
}

test.beforeEach(() => { test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'); });

test('Home has one primary task and compact shortcuts, with no writes or hidden-market leaks', async ({ page, baseURL }) => {
  const { world, lines } = await lukesWeek(page, baseURL);
  try {
    const calls = await tryNewApp(page);
    await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
    await expect(title(page, 'Home')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#home');
    await expect(page.getByRole('heading', { name: 'Coming next', level: 2 })).toHaveCount(0);

    // What the shared view model makes of the same reply the screen reads.
    const reply = (await world.api('luke', 'community/read', {})).body;
    const expectedHero = homeHero({ community: reply });
    expect(expectedHero.state).toBe('due');
    expect(expectedHero.statusLines).toEqual([`Spread ${LUKE_SPREAD_DRAFT.length} of ${world.state.games.length} picked`, `Total 0 of ${world.state.games.length} picked`]);
    await expect(hero(page)).toHaveAttribute('data-state', 'due');
    // The design lane's hierarchy pass: the headline names the games left and the deadline, the week sits above it.
    const expectedHeadline = heroHeadline({ hero: expectedHero, community: reply });
    expect(expectedHeadline.title).toBe(`Lock in ${world.state.games.length} games`);
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText(expectedHeadline.title);
    await expect(hero(page).locator('[data-home="when"]')).toHaveText(expectedHeadline.sub);
    expect(expectedHeadline.sub).toMatch(/^before (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}:\d{2} (AM|PM) PT$/);
    await expect(hero(page).locator('[data-home="status"] li')).toHaveText(expectedHero.statusLines);

    // The countdown: a timer named with its words and the time left, digits in tiles, not read every tick.
    const timer = hero(page).getByRole('timer');
    await expect(timer).toBeVisible();
    await expect(timer).toHaveAttribute('aria-label', new RegExp(`^${HOME_COPY.picksDueIn} (\\d+ days? )?\\d+ hours? \\d+ minutes?$`));
    await expect(timer).toHaveAttribute('aria-live', 'off');
    expect(await timer.locator('.gx-cd-tile').count()).toBeGreaterThanOrEqual(2);

    // Exactly one lime button in view, and it is the hero's "Make picks" (the "Sign in again" prompt's own primary sits
    // outside the frame in a closed dialog, so it is counted among the visible ones and never shows here).
    const lime = page.locator('.gx-app .gx-btn--primary');
    await expect(lime).toHaveCount(1);
    await expect(lime).toHaveText(HOME_COPY.makePicks);
    await expect(page.locator('.gx .gx-btn--primary:visible')).toHaveCount(1);
    await expect(page.getByRole('button', { name: HOME_COPY.seeLines })).toHaveCount(0);

    // D-55 round 3 (approved October 21): three stat tiles, who's in for the league with Standings and Invite, and
    // the week meter (one segment per game) under each market's status words.
    for (const market of ['spread', 'total', 'tickets']) await expect(rankTile(page, market)).toBeVisible();
    await expect(whosIn(page)).toHaveCount(1);
    await expect(whosIn(page).getByRole('button', { name: 'Standings', exact: true })).toBeVisible();
    await expect(whosIn(page).getByRole('button', { name: 'Invite', exact: true })).toBeVisible();
    await expect(hero(page).locator('[data-home="status"] .gx-meter3')).toHaveCount(expectedHero.statusLines.length);

    await phoneChecks(page);
    await noLeak(page, world, lines, 'Home');
    expect(calls.filter(call => !READS.includes(call)), 'Home writes nothing and reads only the shared feed, score history and own settings').toEqual([]);
    expect(calls.filter(call => call.startsWith('POST ')).every(call => READS.includes(call)), 'POSTs are read-only feed, scores and own settings').toBe(true);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('"Make picks" opens the live Play tab without leaving the new app; "See Lines" never shows while picks are due', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  try {
    await tryNewApp(page);
    await page.locator('.gx-app .gx-btn--primary').click();
    await expect(title(page, 'Your guesses')).toBeVisible();
    await expect(tab(page, 'Play')).toHaveAttribute('aria-current', 'page');
    expect(new URL(page.url()).hash).toMatch(/^#play\/picks/);
    expect(new URL(page.url()).searchParams.get('app'), 'still the new app (D-60: nothing is saved)').toBeNull();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('axe in Dark and Light at 390 and 320 on Home; 390 screenshots', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(90000);
  const { world } = await lukesWeek(page, baseURL);
  try {
    await tryNewApp(page);
    const found = {};
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.goto('about:blank');
      await page.goto('/');
      await expect(hero(page)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await phoneChecks(page);
        found[`home ${theme} ${width}`] = await axe(page);
        if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-home-390-${theme}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(found).toEqual(Object.fromEntries(Object.keys(found).map(key => [key, []])));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
