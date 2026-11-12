// Real-build phone captures of NBA milestone N1 (mockups 01 to 09) at 320 and 390 px, Dark and Light, with the official
// NBA logos (D-85). The layout checks run on every pass; PNGs are written only with GTL_NBA_CAPTURE=1, into
// design/nba-n1-2026-11-11/. Synthetic slate and tickets only (nba-fixture.mjs): no real player's ticket or pick.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pgliteAvailable, signIn } from './community-world.mjs';
import { nbaFixture, NBA_NOW } from './nba-fixture.mjs';
import { setCaptureTheme } from './theme-capture.mjs';
test.use({ actionTimeout: 10000, timezoneId: 'America/Los_Angeles' });

const DIR = 'design/nba-n1-2026-11-11';
const WRITE = process.env.GTL_NBA_CAPTURE === '1';

/** Loads every lazy image on the page, then returns to the top. */
async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(resolve => requestAnimationFrame(resolve)); }
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.locator('.gx-nba-badge[data-mark="nba-logo"]:not(.gx-team--loaded)').count(), { timeout: 10000 }).toBe(0);
  await expect.poll(() => page.locator('.gx-home-sport img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
}

/** The checks every capture passes: no sideways scroll, 44px targets, 12px text, 16px fields, round marks, loaded logos. */
async function layoutChecks(page, label, scope) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} sideways scroll`).toBe(true);
  const report = await page.locator(scope).first().evaluate(root => {
    const visible = el => el.getClientRects().length && !el.closest('details:not([open]) > :not(summary)') && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
    const targets = [...root.querySelectorAll('button, input, select, textarea, summary, a[href]')].filter(visible).filter(el => !el.matches('.gx-sr-only')).flatMap(el => {
      const r = el.getBoundingClientRect();
      return r.width < 43.9 || r.height < 43.9 ? [{ text: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }] : [];
    });
    const fields = [...root.querySelectorAll('input, select, textarea')].filter(visible).filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.getAttribute('aria-label') || el.closest('label')?.textContent.trim().slice(0, 30));
    let smallest = Infinity;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent.trim() || !parent || !visible(parent) || parent.closest('svg, .gx-sr-only, [aria-hidden="true"] .gx-team-code, .gx-team--loaded')) continue;
      smallest = Math.min(smallest, parseFloat(getComputedStyle(parent).fontSize));
    }
    const circles = [...document.querySelectorAll('.gx-nba-badge, .gx-home-sport')].filter(visible).filter(el => {
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      return Math.abs(r.width - r.height) > 0.5 || !(css.borderTopLeftRadius.includes('%') || parseFloat(css.borderTopLeftRadius) >= r.width / 2);
    }).map(el => el.className);
    const sports = [...document.querySelectorAll('.gx-home-sport')].filter(visible).map(el => Math.round(el.getBoundingClientRect().width));
    return { targets, fields, smallest, circles, sports, logos: root.querySelectorAll('.gx-nba-badge[data-mark="nba-logo"]').length };
  });
  expect(report.targets, `${label} 44px targets`).toEqual([]);
  expect(report.fields, `${label} 16px fields`).toEqual([]);
  expect(report.smallest, `${label} no text under 12px`).toBeGreaterThanOrEqual(12);
  expect(report.circles, `${label} every team and league mark has its own circle`).toEqual([]);
  return report;
}

async function capture(page, file, { sheet = false, viewport = false, scope = sheet ? '.gx-sheet' : '.gx.gx-nba', widths = [320, 390], themes = ['dark', 'light'] } = {}) {
  const shots = [];
  for (const theme of themes) for (const width of widths) {
    await setCaptureTheme(page, theme);
    await page.setViewportSize({ width, height: 844 });
    await settle(page);
    // A sheet's body scrolls inside the phone; the capture frame grows until the whole sheet shows at once.
    if (sheet) for (let pass = 0; pass < 3; pass += 1) {
      const overflow = await page.locator('.gx-sheet-body').last().evaluate(body => body.scrollHeight - body.clientHeight);
      if (overflow <= 0) break;
      await page.setViewportSize({ width, height: page.viewportSize().height + overflow });
    }
    const report = await layoutChecks(page, `${file}/${theme}/${width}`, scope);
    // Three league circles are 44px below 360px wide and 52px from 360px (D-85); two keep 52px.
    if (report.sports.length === 3) expect(report.sports.every(size => size === (width < 360 ? 44 : 52)), `${file}/${width} circle size`).toBe(true);
    if (!WRITE) continue;
    fs.mkdirSync(DIR, { recursive: true });
    const name = `${file}-${width}-${theme}.png`, path = `${DIR}/${name}`;
    // The whole phone page in one frame, with the floating tab bar at its foot (as a phone shows it after scrolling).
    if (!sheet && !viewport) for (let pass = 0; pass < 3; pass += 1) {
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      if (height === page.viewportSize().height) break;
      await page.setViewportSize({ width, height });
      await settle(page);
    }
    await page.screenshot({ path, animations: 'disabled', caret: 'hide' });
    const bytes = fs.readFileSync(path);
    shots.push({ file: name, screen: file, width, theme, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), ...report });
  }
  if (WRITE) for (const shot of shots) fs.appendFileSync(`${DIR}/captures.jsonl`, `${JSON.stringify(shot)}\n`);
  return shots;
}

test('N1 captures: Home, Research, Bets, Confirm, History, Track bet and Play hold every layout check in both themes', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  test.setTimeout(240000);
  if (WRITE) fs.rmSync(`${DIR}/captures.jsonl`, { force: true });
  const world = await nbaFixture(page, baseURL);
  try {
    await world.seedCaptured();
    await page.clock.setFixedTime(NBA_NOW);
    await page.goto('/#nba/home'); await signIn(page, 'luke', { navigate: false });
    await expect(page.getByRole('heading', { name: 'NBA', exact: true })).toBeVisible();
    await expect(page.locator('.gx-nba-queue').getByText('Final PHI 112–108 · Suggested: Win', { exact: false })).toBeVisible();
    await expect(page.getByText('4 settled', { exact: true })).toBeVisible();
    await capture(page, '01-sport-switch', { viewport: true });
    await capture(page, '03-home');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Research/ }).click();
    await expect(page.getByRole('heading', { name: 'NBA games', exact: true })).toBeVisible();
    await expect(page.getByText('LIVE', { exact: true })).toHaveCount(1);
    await capture(page, '04-research-games');
    await page.getByRole('group', { name: 'Game day' }).getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await expect(page.locator('main .gx-nba-game')).toHaveCount(15);
    const all30 = await capture(page, '02-team-badges');
    expect(new Set(await page.locator('main .gx-nba-badge').evaluateAll(marks => marks.map(mark => mark.dataset.nbaTeam))).size).toBe(30);
    if (WRITE) expect(all30.every(shot => shot.logos === 30)).toBe(true);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Bets/ }).click();
    await expect(page.getByRole('heading', { name: 'NBA bets', exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: '3-leg parlay, Open' })).toBeVisible();
    await capture(page, '05-bets-open');

    await page.getByRole('article', { name: '76ers moneyline, Open' }).getByRole('button', { name: 'Confirm result', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm result' })).toBeVisible();
    await capture(page, '06-confirm-result', { sheet: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Confirm result' })).toHaveCount(0);

    await page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name: 'History', exact: true }).click();
    const knicks = page.getByRole('article', { name: 'Knicks total, Lost' });
    await knicks.getByText('Ticket details and correction history', { exact: true }).click();
    await expect(knicks.getByText('Revision 2 · Confirmed from final score')).toBeVisible();
    await capture(page, '07-bets-history');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Research/ }).click();
    await page.getByRole('group', { name: 'Game day' }).getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByRole('article', { name: 'Boston Celtics at New York Knicks' }).getByRole('button', { name: 'Track bet', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Track NBA bet' });
    await sheet.getByLabel('Ticket label', { exact: true }).fill('Celtics spread');
    await sheet.getByRole('combobox', { name: 'Market 1' }).selectOption('spread');
    await sheet.getByLabel('Team 1', { exact: true }).fill('Celtics');
    await sheet.getByLabel('Line 1', { exact: true }).fill('-4.5');
    await sheet.getByLabel('Ticket price', { exact: true }).fill('-110');
    await sheet.getByLabel('Stake (Units)', { exact: true }).fill('1.1');
    await capture(page, '08-track-bet', { sheet: true });
    page.once('dialog', dialog => dialog.accept());
    await sheet.getByRole('button', { name: 'Cancel editor', exact: true }).click();
    await expect(sheet).toHaveCount(0);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Play/ }).click();
    await expect(page.getByText('NBA Guess the Spread is coming', { exact: true })).toBeVisible();
    await capture(page, '09-play-held');
    expect(world.calls.filter(call => call.path === 'nba/save')).toHaveLength(0);
    expect(world.calls.map(call => call.path).filter(path => !['lobby', 'nba/games', 'nba/read'].includes(path))).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

// NBA_ON_SWITCH is on (D-85 item 6): NFL Home with the NBA circle unselected at 320px, where three circles are 44px.
test('N1 capture: the NFL sport switch at 320px with three 44px circles', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Disposable PGlite required.');
  const world = await nbaFixture(page, baseURL);
  try {
    await page.clock.setFixedTime(NBA_NOW);
    await page.goto('/#home'); await signIn(page, 'luke', { navigate: false });
    await expect(page.getByRole('button', { name: 'National Basketball Association', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'National Football League', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await capture(page, '01-sport-switch-flag-on', { viewport: true, scope: '.gx-topbar', widths: [320], themes: ['dark'] });
  } finally { await world.db.close(); }
});
