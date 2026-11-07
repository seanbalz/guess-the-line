import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { seedFinishedWeek } from '../helpers/features-week.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { countUpKey } from '../../web/src/next/moments/countUp.js';
import { rankKey } from '../../web/src/next/league/rankMoment.js';
import { momentsKey } from '../../web/src/next/moments/seen.js';

// Design lane ("game feel" and the Home and League pass) at 390 x 844 (build plan section 4.1), on the real app and the
// real handler with every migration (ALL, M-25 included) on local PGlite, with the finished fixture Week 4 of
// tests/helpers/features-week.mjs and the features job run. In that world Luke leads Spread with 20 (Troy 12) and has the
// only Total total (16); Luke's Pick streak is 1 week; Week 4's awards and badges are in. Checked here:
// 1. the count-up runs from the value this device saw to the server's, never outside the two, and rests on the server's
//    value; under reduced motion it shows the final value at once;
// 2. the rank moment: nothing on page load, the arrow in your chip, then once when League opens after the launch (1st is big),
//    a drop quiet;
// 3. Home's one primary card, the week meter, the Pick streak and the Awards tile;
// 4. the League board's faces, leader, week badges (no race strip), the recap post, and the shared read states with retry;
// and on every screen: no sideways scroll at 390 and 320, 44px targets, no text under 12px, nothing clipped, axe clean in
// Dark and Light. Fixture accounts, games and numbers only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const LUKE = ACCOUNTS.luke.id, TROY = ACCOUNTS.troy.id;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = path.resolve('.local/design-home-league');
const spreadFigure = id => `community.guess_spread.season.${id}`;

async function featuresWorld(page, baseURL) {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedFinishedWeek(world);
  expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
  return world;
}

/**
 * Opens the new app as `account` at `address`. `storage` is what this device "saw" before (seeded once per tab, so a
 * reload keeps what the app itself wrote), and every count-up frame is recorded for the honesty checks.
 */
async function openAs(page, account, address, storage = {}) {
  await page.addInitScript(entries => {
    localStorage.setItem('gtl.app', 'next');
    if (!sessionStorage.getItem('gtl-test-seeded')) {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      sessionStorage.setItem('gtl-test-seeded', '1');
    }
    window.__frames = [];
    new MutationObserver(records => {
      for (const record of records) {
        const node = record.target.nodeType === 3 ? record.target.parentElement : record.target;
        const el = node?.closest?.('.gx-countup');
        if (!el) continue;
        const where = el.closest('[data-tile]')?.dataset.tile ?? el.closest('[data-board-row]')?.dataset.boardRow ?? '';
        const shown = el.dataset.count === 'run' ? el.querySelector('[aria-hidden="true"]')?.textContent : el.textContent;
        window.__frames.push({ where, state: el.dataset.count, text: shown, t: performance.now() });
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-count'] });
  }, storage);
  await page.goto(`/${address}`);
  await signIn(page, account, { navigate: false });
  await expect(page.locator('.gx')).toBeVisible();
}
const frames = (page, where) => page.evaluate(w => window.__frames.filter(f => f.where === w), where);
const toNumber = text => Number(String(text).replace('−', '-'));
const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
  await expect(page.locator('.gx-countup[data-count="run"]')).toHaveCount(0);
}

/** CI draws every font token in DejaVu Sans (the app's fonts never load here), the widest case for clipping. */
async function ciFonts(page) {
  await page.evaluate(() => {
    if (document.getElementById('ci-fonts')) return;
    const style = document.createElement('style');
    style.id = 'ci-fonts';
    style.textContent = 'html .gx { --gx-font-home: "DejaVu Sans", sans-serif; --gx-font-body: "DejaVu Sans", sans-serif; --gx-font-num: "DejaVu Sans", sans-serif; --gx-font-display: "DejaVu Sans", sans-serif; }';
    document.head.append(style);
  });
}

/** Section 4.1 at one width: no side scroll, 44px targets, no text under 12px, nothing clipped, the layout checks and axe. */
async function phoneRules(page, where) {
  // From the top: content scrolled under the fixed top bar is not an overlap a player would see as broken.
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no side scroll`).toBe(true);
  const report = await page.locator('.gx').first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open]), .gx-sr-only:not(.gx-skip-link:focus)'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    // A chip rail scrolls inside its own track on purpose (the page never does), so a chip scrolled out of it is fine.
    const scroller = el => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/(auto|scroll)/.test(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1) return true; return false; };
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || el.closest('.gx-sr-only:not(.gx-skip-link:focus)') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      if ((r.right > innerWidth + 0.5 || r.left < -0.5) && !scroller(el)) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report, where).toEqual({ targets: [], small: [], clipped: [] });
  expect(await page.evaluate(layoutProblems), where).toEqual([]);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${where}: axe`).toEqual([]);
}

/** Dark and Light, 390 and 320 (CI fonts), with full-page 390 screenshots in the app's own fonts for the PR. */
async function everyTheme(page, info, name) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    // The screenshot is one tall 390-wide phone (the fixed top and tab bars at its ends, not over the middle).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page);
    const tall = await page.evaluate(() => Math.max(844, Math.ceil(document.documentElement.scrollHeight)));
    await page.setViewportSize({ width: 390, height: tall });
    await settle(page);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}-390-${theme}.png`) });
    await page.screenshot({ path: info.outputPath(`${name}-390-${theme}.png`) });
    await ciFonts(page);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await phoneRules(page, `${name} ${theme} ${width}`);
    }
    await page.evaluate(() => document.getElementById('ci-fonts')?.remove());
  }
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.setViewportSize({ width: 390, height: 844 });
}

test('Approved Home: separate season stats count honestly; compact action, graphics and all awards remain accessible', async ({ page, baseURL }, info) => {
  const world = await featuresWorld(page, baseURL);
  try {
    const reply = (await world.api('luke', 'community/read', {})).body;
    const own = mode => reply.standings.find(row => row.userId === LUKE && row.mode === mode).seasonPoints;
    expect([own('guess_spread'), own('guess_total')]).toEqual([20, 16]);
    // This device last saw 12 Spread points for Luke, and nothing for Total.
    await openAs(page, 'luke', '#home', { [countUpKey(LUKE, spreadFigure(LUKE))]: '12' });
    const hero = page.locator('[data-home="hero"]');
    await expect(hero).toBeVisible();

    // 1. The count-up (D-69): a page load shows the server's 20 at once and remembers nothing; once Luke has used the
    // app, opening Home again counts from the 12 this device saw, stays between 12 and 20, rests on 20 and remembers it.
    const spreadPoints = page.locator('[data-tile="spread"] [data-home="points"] .gx-countup');
    await expect(spreadPoints).toHaveAttribute('data-count', 'rest');
    await expect(spreadPoints).toHaveText('20');
    expect((await frames(page, 'spread')).filter(f => f.state === 'run'), 'nothing counts on page load').toEqual([]);
    expect(await page.evaluate(key => localStorage.getItem(key), countUpKey(LUKE, spreadFigure(LUKE)))).toBe('12');
    await page.evaluate(() => { window.__frames = []; });
    await tab(page, 'Play').click();
    await tab(page, 'Home').click();
    await expect(spreadPoints).toHaveAttribute('data-count', 'rest');
    await expect(spreadPoints).toHaveText('20');
    const spread = await frames(page, 'spread');
    const counted = spread.filter(f => f.state === 'run').map(f => toNumber(f.text));
    expect(counted[0], 'the count starts from the value this device saw').toBe(12);
    expect(counted.every(n => n >= 12 && n <= 20), `frames ${counted}`).toBe(true);
    expect(spread.at(-1)).toMatchObject({ state: 'rest', text: '20' });
    const firstRun = spread.find(f => f.state === 'run'), rest = spread.at(-1);
    expect(rest.t - firstRun.t, 'count-up duration in ms').toBeGreaterThan(550);
    expect(rest.t - firstRun.t, 'count-up duration in ms').toBeLessThan(3000);
    expect(await page.evaluate(key => localStorage.getItem(key), countUpKey(LUKE, spreadFigure(LUKE)))).toBe('20');
    // Total: the first sighting on this device shows the number at once, from no made-up start.
    await page.getByRole('group', { name: 'Season market' }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(page.locator('[data-tile="total"] [data-home="points"]')).toHaveText('16');
    expect((await frames(page, 'total')).filter(f => f.state === 'run')).toEqual([]);

    // The approved compact card replaces the countdown/meters and six shortcuts; no fabricated numbers.
    await expect(hero.getByRole('heading', { level: 2 })).toHaveText('Finish your picks');
    await expect(hero.getByRole('img')).toHaveAccessibleName('0 of 2 picks drafted');
    await expect(hero.getByRole('button', { name: 'Continue picks', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Research. Explore games and trends', exact: true })).toBeVisible();
    // Awards are still available through their existing Play card.
    await tab(page, 'Play').click();
    await page.locator('[data-play-tile="badges"]').getByRole('button').click();
    await expect(page).toHaveURL(/#play\/features/);
    await expect(page.locator('[data-landing="features"]').getByRole('heading', { name: 'Badges and awards', level: 2 })).toBeVisible();
    await tab(page, 'Home').click();
    await expect(hero).toBeVisible();

    await everyTheme(page, info, 'home');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('reduced motion: a changed total shows its final value at once, with no frame in between', async ({ page, baseURL }) => {
  const world = await featuresWorld(page, baseURL);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAs(page, 'luke', '#play/league?view=board', { [countUpKey(LUKE, spreadFigure(LUKE))]: '12', [countUpKey(LUKE, spreadFigure(TROY))]: '4',
      [rankKey(LUKE, 'community', 'guess_spread')]: JSON.stringify({ rank: 2, from: null }) });
    const board = page.getByRole('list', { name: 'Spread season standings' });
    await expect(board.locator(`[data-board-row="${TROY}"] .gx-countup`)).toHaveText('12');
    await expect(board.locator(`[data-board-row="${LUKE}"] .gx-countup`)).toHaveText('20');
    for (const who of [LUKE, TROY]) expect((await frames(page, who)).filter(f => f.state === 'run'), who).toEqual([]);
    expect(await page.evaluate(key => localStorage.getItem(key), countUpKey(LUKE, spreadFigure(TROY)))).toBe('4');
    // D-69: a page load remembers nothing; the next opening after the launch moves the record on.
    await expect(board.locator(`[data-board-row="${LUKE}"] .gx-move`)).toHaveText('▲1up 1');
    await expect(board.locator('[data-moment="pop"]')).toHaveCount(0);
    await expect(page.locator('.gx-toast')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('League board: faces, the leader, week badges and counting totals; reaching 1st waits on the launch, then plays once', async ({ page, baseURL }, info) => {
  const world = await featuresWorld(page, baseURL);
  try {
    // This device last saw Luke 3rd on the Spread board and Troy's total at 4.
    await openAs(page, 'luke', '#play/league?view=board', { [rankKey(LUKE, 'community', 'guess_spread')]: JSON.stringify({ rank: 3, from: null }), [countUpKey(LUKE, spreadFigure(TROY))]: '4',
      [momentsKey(LUKE)]: JSON.stringify(['source:rank:community:guess_spread']) });
    const board = page.getByRole('list', { name: 'Spread season standings' });
    await expect(board).toBeVisible();
    const luke = board.locator(`[data-board-row="${LUKE}"]`), flash = page.getByRole('dialog', { name: 'You’re 1st' });

    // 2. The rank moment: the up arrow in Luke's chip; nothing plays on page load.
    await expect(luke.locator('[data-board="chip"] .gx-move')).toHaveText('▲2up 2');
    await expect(luke.locator('[data-board="chip"]')).toContainText('1st');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), rankKey(LUKE, 'community', 'guess_spread'))).toEqual({ rank: 1, from: 3, n: 1 });
    await page.waitForTimeout(800); await expect(flash).toHaveCount(0); await expect(page.locator('.gx-toast')).toHaveCount(0);

    // 4. Weight: 40px faces, the leader in words, the week's badges, no race strip; Troy's total counted 4 to 12.
    const rows = board.locator('[data-board-row]');
    await expect(rows).toHaveCount(3);
    for (const row of await rows.all()) await expect(row.locator('.gx-av--40')).toHaveCount(1);
    await expect(luke).toHaveAttribute('data-leader', 'true');
    await expect(luke.locator('.gx-pill')).toHaveText('Leader');
    await expect(luke.locator('.gx-row-sub')).toContainText('· Won Week 4 · Leads by 8');
    await expect(luke.locator('[data-board="total"]')).toHaveText('20');
    await expect(board.locator('[data-leader]')).toHaveCount(1);
    const lukeBadges = luke.getByRole('group', { name: 'Your Week 4 badges' });
    await expect(lukeBadges).toContainText('Week 4');
    await expect(lukeBadges.getByRole('button')).toHaveCount(4);
    await expect(lukeBadges.getByRole('button', { name: 'Bullseye, 3 times, Week 4' })).toContainText('×3');
    await expect(board.getByRole('group', { name: 'Troy Fixture’s Week 4 badges' }).getByRole('button', { name: 'Sharp, 2 times, Week 4' })).toBeVisible();
    await expect(page.locator('.gx-strip')).toHaveCount(0);
    const troyTotal = board.locator(`[data-board-row="${TROY}"] .gx-countup`);
    await expect(troyTotal).toHaveAttribute('data-count', 'rest');
    await expect(troyTotal).toHaveText('12');
    expect((await frames(page, TROY)).filter(f => f.state === 'run'), 'nothing counts on page load').toEqual([]);
    await page.evaluate(() => { window.__frames = []; });
    await tab(page, 'Home').click();
    await page.evaluate(() => { location.hash = '#play/league?view=board'; });
    await expect(troyTotal).toHaveAttribute('data-count', 'rest');
    const counted = (await frames(page, TROY)).filter(f => f.state === 'run').map(f => toNumber(f.text));
    expect(counted[0], 'Troy’s total counts from the 4 this device saw, once the card is opened again').toBe(4);
    expect(counted.every(n => n >= 4 && n <= 12), `frames ${counted}`).toBe(true);
    await expect(flash).toBeVisible(); await expect(flash).toContainText('Spread board · up 2'); await flash.getByRole('button', { name: 'Nice' }).click();
    // No ballot is never 0: Sean has no Spread total.
    await expect(board.locator(`[data-board-row="${ACCOUNTS.sean.id}"] [data-board="total"]`)).toHaveText('—');

    await everyTheme(page, info, 'league-board');

    // Once per change: a reload shows the arrow still, and the moment does not play again.
    await page.reload();
    await expect(board.locator(`[data-board-row="${LUKE}"] .gx-move`)).toHaveText('▲2up 2');
    await page.waitForTimeout(800); await expect(flash).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// D-69 section 4.1: a row's badge opens that player's badge layer (Play › Badges and awards, its own address), and
// Back returns to the board. The test above checks the board's count-ups without leaving it, so this one is separate.
test("League board: a row's badge opens that player's badge layer; Back returns to the board", async ({ page, baseURL }) => {
  const world = await featuresWorld(page, baseURL);
  try {
    await openAs(page, 'luke', '#play/league?view=board');
    const board = page.getByRole('list', { name: 'Spread season standings' });
    await board.getByRole('group', { name: 'Your Week 4 badges' }).getByRole('button', { name: 'Bullseye, 3 times, Week 4' }).click();
    await expect(page).toHaveURL(/#play\/features\?layer=badge&item=bullseye$/);
    const layer = page.locator('[data-landing="features"]');
    await expect(layer.getByRole('heading', { name: 'Bullseye', level: 2 })).toBeVisible();
    await expect(layer).toContainText('Earned 3 times');
    await expect(layer).toContainText('Week 4 · Seattle Seahawks at Denver Broncos'); // D-62: the game as marks, read as one sentence
    await page.goBack();
    await expect(board).toBeVisible();
    await board.getByRole('group', { name: 'Troy Fixture’s Week 4 badges' }).getByRole('button', { name: 'Sharp, 2 times, Week 4' }).click();
    await expect(page).toHaveURL(new RegExp(`#play/features\\?layer=badge&item=sharp%40${TROY}$`));
    await expect(layer).toContainText('Troy Fixture: earned 2 times');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('League board: a drop stays quiet', async ({ page, baseURL }) => {
  const world = await featuresWorld(page, baseURL);
  try {
    await openAs(page, 'troy', '#play/league?view=board', { [rankKey(TROY, 'community', 'guess_spread')]: JSON.stringify({ rank: 1, from: null }), [momentsKey(TROY)]: JSON.stringify(['source:rank:community:guess_spread']) });
    const troy = page.getByRole('list', { name: 'Spread season standings' }).locator(`[data-board-row="${TROY}"]`);
    await expect(troy.locator('.gx-move')).toHaveClass(/gx-move--down/);
    await expect(troy.locator('.gx-move')).toHaveText('▼1down 1');
    await tab(page, 'Home').click(); await page.evaluate(() => { location.hash = '#play/league?view=board'; }); await expect(troy).toBeVisible(); await page.waitForTimeout(800);
    await expect(page.locator('.gx-toast')).toHaveCount(0); await expect(page.locator('[role="dialog"]')).toHaveCount(0); await expect(troy.locator('[data-moment="pop"]')).toHaveCount(0);
    // Total: Troy is unranked there ("—"), so switching to it neither plays a moment nor draws an arrow.
    await page.getByRole('group', { name: 'Standings market' }).getByRole('button', { name: 'Total', exact: true }).click();
    const total = page.getByRole('list', { name: 'Total season standings' });
    await expect(total).toBeVisible();
    await expect(total.locator('.gx-move')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('League feed: the weekly recap post as a card above the feed; History shares the read states, with a retry', async ({ page, baseURL }, info) => {
  const world = await featuresWorld(page, baseURL);
  try {
    await openAs(page, 'luke', '#play/league');
    const post = page.locator('[data-feed="recap"]');
    await expect(post.getByRole('heading', { name: 'Week 4 recap' })).toBeVisible();
    await expect(post).toContainText('7 awards in · You won Spread winner');
    await expect(post.getByRole('list', { name: 'Week 4 awards' }).getByRole('listitem')).toHaveCount(4);
    await everyTheme(page, info, 'league-feed');
    await post.getByRole('button', { name: 'All badges and awards' }).click();
    await expect(page).toHaveURL(/#play\/features/);

    // A failed read: the shared error card says why and offers "Try again", which reads again.
    const history = '**/functions/v1/gtl-api/community/history';
    await page.route(history, route => route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Community history is unavailable right now.' }) }));
    await page.goto('/#play/league?view=history');
    const failed = page.locator('[data-league-state="error"]');
    await expect(failed).toBeVisible();
    await expect(failed).toHaveAttribute('role', 'alert');
    await phoneRules(page, 'league history error');
    await page.unroute(history);
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'History · Spread', level: 2 })).toBeVisible();
    await expect(page.locator('[data-league-state]')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
