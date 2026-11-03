import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { FANTASY_REPOSITORY, snapshotFileName, updateFantasyIndex } from '../../shared/fantasy-index.mjs';
import { CONTEXT_HOUSE, CONTEXT_SNAPSHOT_TIMES, pointsContextSnapshot } from '../fixtures/points-context-snapshot.mjs';

// Guess the Points in the new app (D-56 spec section 5; ballot card option D, the D-56 addendum; D-69 P4A: the week card and a
// slot layer) on local PGlite through the
// real gtl-api handler: the schema before P-01 shows "Points is coming soon" (what any project without P-01 serves);
// ALL (P-01 and P-02, hosted since October 23, 2026) plays a fixture week.
// Fixture accounts, players and guesses only; never a hosted project or a real pick.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const tabs = page => page.getByRole('navigation', { name: 'Main' });
const SENTINEL = 47; // Troy's locked QB guess: hidden from Luke until Luke locks in that slot.
const DAY = 86_400_000, iso = ms => new Date(ms).toISOString();
// 44 px touch targets, less subpixel rounding: a 44 px box can measure 43.99999 (as the other cloud specs allow).
const MIN_TARGET = 43.9;

async function seedWeek(world) {
  const now = Date.now();
  // Kickoffs on the hour, so no clock time can contain the sentinel's digits.
  const hour = Math.ceil(now / 3_600_000) * 3_600_000;
  const kick = [2 * DAY, 2 * DAY + 3 * 3_600_000, 3 * DAY, 3 * DAY + 3 * 3_600_000, 4 * DAY].map(ms => iso(hour + ms));
  const games = ['PIT_CLE', 'KC_LV', 'SEA_DEN', 'NYJ_BUF', 'MIA_NE'];
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-fixture-${i}`, name: `Fixture ${slot} Player`, team: games[i].slice(0, games[i].indexOf('_')),
    position: slot === 'FLEX' ? 'WR' : slot, gameKey: `2026_07_${games[i]}`, kickoff: kick[i] }));
  await world.db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at)
    values(2026,7,'published',$1,$2,$3,$4,$5,$6,$1)`, [iso(now - DAY), iso(now + 8 * DAY), { format: 'ppr', passingTds: 4, version: 'ppr4-v1' }, JSON.stringify(slots),
    { QB: 19.4, RB: 13.2, WR: 15.8, TE: 9.1, FLEX: 12.6 }, { snapshotSeason: 2026, snapshotWeek: 7, checksum: 'f'.repeat(64), selectionVersion: 'points-slate-v1', seed: 'fixture' }]);
  await world.db.query("insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at) values($1,2026,7,'QB',$2,now())", [ACCOUNTS.troy.id, SENTINEL]);
}
async function openNewApp(page) {
  await signIn(page, 'luke');
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await expect(page.locator('[data-landing="play"]')).toBeVisible();
}
const BEFORE_POINTS = ALL.filter(file => file < '20261023180000');
const guessRow = (world, slot) => world.db.query('select guess,locked_at from public.gtl_points_guesses where user_id=$1 and season=2026 and week=7 and slot=$2', [ACCOUNTS.luke.id, slot]).then(r => r.rows[0] ?? null);

/** A week under way: the QB kicked off a day ago with Luke's 21 locked in before it (written with triggers off, as
 * tests/points-sql.test.mjs writes played weeks); the other four slots are still open. */
async function seedPlayedWeek(world) {
  const now = Date.now(), hour = Math.ceil(now / 3_600_000) * 3_600_000;
  const kick = [hour - DAY, hour + 2 * DAY, hour + 3 * DAY, hour + 3 * DAY + 3 * 3_600_000, hour + 4 * DAY].map(iso);
  const games = ['PIT_CLE', 'KC_LV', 'SEA_DEN', 'NYJ_BUF', 'MIA_NE'];
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-fixture-${i}`, name: `Fixture ${slot} Player`, team: games[i].slice(0, games[i].indexOf('_')),
    position: slot === 'FLEX' ? 'WR' : slot, gameKey: `2026_07_${games[i]}`, kickoff: kick[i] }));
  await world.db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at)
    values(2026,7,'published',$1,$2,$3,$4,$5,$6,$1)`, [iso(now - 3 * DAY), iso(now + 8 * DAY), { format: 'ppr', passingTds: 4, version: 'ppr4-v1' }, JSON.stringify(slots),
    { QB: 19.4, RB: 13.2, WR: 15.8, TE: 9.1, FLEX: 12.6 }, { snapshotSeason: 2026, snapshotWeek: 7, checksum: 'f'.repeat(64), selectionVersion: 'points-slate-v1', seed: 'fixture' }]);
  await world.db.transaction(async tx => {
    await tx.exec('set local session_replication_role = replica');
    await tx.query("insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at) values($1,2026,7,'QB',21,$2)", [ACCOUNTS.luke.id, iso(now - 2 * DAY)]);
  });
}
/** The QB's stats land (one nflverse-shaped load through the real loader): `points` Full PPR. */
async function loadQbActual(world, points) {
  const now = Date.now();
  await world.db.query('select public.gtl_points_load_actuals($1::jsonb)', [{ season: 2026, week: 7,
    source: { url: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv', release: 'stats_player', publishedAt: iso(now - 3_600_000), retrievedAt: iso(now - 1_800_000), sha256: 'a'.repeat(64) },
    coverage: { expected: 1, received: 1, partial: false },
    players: [{ playerId: '00-fixture-0', name: 'Fixture QB Player', team: 'PIT', position: 'QB', gameKey: '2026_07_PIT_CLE', stats: { receptions: 0 }, points: { 'ppr4-v1': points }, played: true, playedBasis: 'snaps' }] }]);
}
/** The one Play layer the ballot draws its week card, a slot and a profile in (D-66 nesting cards). */
const pointsLayer = page => page.getByRole('region', { name: 'Guess the Points', exact: true });

test('without P-01 the routes answer 404 and Play and the League board say "Points is coming soon"', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: BEFORE_POINTS });
  expect((await world.api('luke', 'points/read', {})).status).toBe(404);
  await openNewApp(page);
  const row = page.getByRole('button', { name: 'Guess the Points, Points is coming soon', exact: true });
  await expect(row).toHaveClass(/gx-card--hero/);
  await row.click();
  await expect(page).toHaveURL(/#play\/points/);
  await expect(page.getByRole('heading', { name: 'Points is coming soon' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lock in/ })).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('[data-landing="play"]')).toBeVisible();
  await page.getByRole('button', { name: 'My league', exact: true }).click();
  await page.getByRole('group', { name: 'League sections' }).getByRole('button', { name: 'Boards', exact: true }).click();
  await page.getByRole('group', { name: 'Standings market' }).getByRole('button', { name: 'Points', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Points is coming soon' })).toBeVisible();
  expect(world.errors).toEqual([]);
});

test('a fixture week: draft, lock in with a confirm, then Everyone and the House open; restraint, themes and axe hold', async ({ page, baseURL }, info) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedWeek(world);
  await openNewApp(page);
  // Decision 1C: a glow card with a glass pill, a big "0/5" and "Next locks …"; Spread and Total stay plain rows.
  const landing = page.locator('[data-points-landing]');
  await expect(landing).toHaveAccessibleName(/^Guess the Points, 0 of 5 locked, Next locks /);
  await expect(landing).toHaveClass(/gx-card--hero/);
  await expect(landing).toContainText('0/5');
  await landing.click();
  await expect(page.getByRole('heading', { name: 'Week 7 Points', exact: true })).toBeVisible();
  const layer = pointsLayer(page);
  await expect(layer.locator('[data-points-bar]')).toHaveAccessibleName('0 of 5 slots locked');
  const cards = page.locator('[data-slot]');
  await expect(cards).toHaveCount(5);
  await expect(page.locator('[data-slot].gx-card--hero')).toHaveCount(5);
  await expect(page.locator('.gx-btn--primary:visible')).toHaveCount(0);
  const qb = page.locator('[data-slot="QB"]');
  await expect(qb).toContainText('To pick');
  await expect(qb).not.toContainText(String(SENTINEL));
  await expect(qb).not.toContainText('House');

  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(layoutProblems)).toEqual([]);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`points-ballot-${width}-${theme}.png`), fullPage: true });
    }
  }
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.setViewportSize({ width: 390, height: 844 });

  await qb.click();
  // P4A: the slot opens as the next layer with its own address; its heading takes focus, the week stays as a lip.
  await expect(page).toHaveURL(/#play\/points\?item=QB$/);
  const sheet = layer;
  await expect(sheet.getByRole('heading', { name: 'QB · Fixture QB Player', exact: true })).toBeFocused();
  await expect(sheet.getByRole('button', { name: 'Back to Week 7 Points', exact: true })).toBeVisible();
  // Decision 3B: the big stepper. A tap moves by 1; holding moves by 5 and the release does not add another 1.
  const plus = sheet.getByRole('button', { name: 'One point more, hold for 5' });
  const spin = sheet.getByRole('spinbutton', { name: 'Your guess' });
  await plus.click();
  await expect(spin).toHaveAttribute('aria-valuenow', '0');
  await plus.click();
  await expect(spin).toHaveAttribute('aria-valuenow', '1');
  const box = await plus.boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(56);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  const held = Number(await spin.getAttribute('aria-valuenow'));
  expect(held).toBeGreaterThan(1);
  expect((held - 1) % 5).toBe(0);
  await spin.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageUp');
  await page.keyboard.press('ArrowUp');
  await expect(spin).toHaveAttribute('aria-valuenow', '21');
  await expect(sheet.getByRole('button', { name: 'Lock in 21', exact: true })).toBeVisible();
  for (const target of await sheet.locator('button').all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    expect(Math.min(box.width, box.height), await target.innerText()).toBeGreaterThanOrEqual(MIN_TARGET);
  }
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: info.outputPath('points-slot-editor-390.png') });
  await sheet.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(sheet.getByText('Draft saved: 21.')).toBeVisible();
  expect(await guessRow(world, 'QB')).toMatchObject({ guess: 21, locked_at: null });
  await expect(sheet).not.toContainText(String(SENTINEL));
  // An unsaved guess asks before the lip leaves the slot; staying keeps it.
  await spin.focus();
  await page.keyboard.press('ArrowUp');
  let asked = null;
  page.once('dialog', dialog => { asked = dialog.message(); dialog.dismiss(); });
  await sheet.getByRole('button', { name: 'Back to Week 7 Points', exact: true }).click();
  expect(asked).toBe('Leave without saving your changes?');
  await expect(page).toHaveURL(/#play\/points\?item=QB$/);
  await expect(spin).toHaveAttribute('aria-valuenow', '22');
  await spin.focus();
  await page.keyboard.press('ArrowDown');

  await sheet.getByRole('button', { name: 'Lock in 21', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Lock in 21?' });
  await expect(confirm).toContainText('This guess is final.');
  await expect(confirm.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Confirm lock-in' }).click();
  await expect(sheet.getByText(/^Locked in 21\./)).toBeVisible();
  expect((await guessRow(world, 'QB')).locked_at).not.toBeNull();
  // The gate opened for Luke on this slot only (decision 5B): a number line whose faces and House tick name exact values.
  const line = sheet.getByRole('group', { name: /^Everyone’s guesses on a scale from 0 to 50$/ });
  await expect(line.getByRole('button', { name: 'You: 21' })).toBeVisible();
  await expect(line.getByRole('button', { name: 'House, unranked: 19.4' })).toBeVisible();
  await expect(line).toContainText('House 19.4');
  const troy = line.getByRole('button', { name: `Troy Fixture: ${SENTINEL}` });
  await expect(line).not.toContainText(String(SENTINEL));
  await troy.click();
  await expect(troy).toHaveAttribute('aria-pressed', 'true');
  await expect(line).toContainText(String(SENTINEL));
  for (const marker of await line.getByRole('button').all()) {
    const size = await marker.boundingBox();
    expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(MIN_TARGET);
  }
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([]);
  await expect(sheet.getByRole('button', { name: /^Lock in/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('points-slot-locked-390.png') });
  // Browser Back closes one layer and returns focus to the slot's tile, which now says Locked in and never another guess.
  await page.goBack();
  await expect(page).toHaveURL(/#play\/points$/);
  await expect(qb).toBeFocused();
  await expect(qb).toContainText('Locked in');
  await expect(qb).toContainText(/You\s*21/);
  await expect(qb).not.toContainText(String(SENTINEL));
  await expect(qb).toHaveAccessibleName(/, Locked in, You 21$/);
  await expect(layer.locator('[data-points-bar]')).toHaveAccessibleName('1 of 5 slots locked');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(layoutProblems)).toEqual([]);
  }
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('points-ballot-locked-390.png'), fullPage: true });
  await expect(page.locator('[data-slot="RB"]')).not.toContainText('13.2');
  // The sixth tile opens the League board on the Points market.
  await layer.getByRole('button', { name: /^Points board, / }).click();
  await expect(page.getByRole('heading', { name: 'Points standings' })).toBeVisible();
  expect(world.errors).toEqual([]);
});

test('keyboard only, with reduced motion: open a slot, use the stepper, and the week lip returns focus to its tile', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedWeek(world);
  await openNewApp(page);
  await page.locator('[data-points-landing]').click();
  const wr = page.locator('[data-slot="WR"]');
  await wr.focus();
  await page.keyboard.press('Enter');
  const sheet = pointsLayer(page);
  await expect(sheet.getByRole('heading', { name: 'WR · Fixture WR Player', exact: true })).toBeFocused();
  const spin = sheet.getByRole('spinbutton', { name: 'Your guess' });
  await spin.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageUp'); // From no guess the first move lands on 0.
  await expect(spin).toHaveAttribute('aria-valuenow', '15');
  await sheet.getByRole('button', { name: 'One point less, hold for 5' }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('button', { name: 'Lock in 14', exact: true })).toBeVisible();
  // Reduced motion: nothing in the layer is animating.
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  // The unsaved 14 asks first; leaving discards it and lands on the WR tile.
  page.once('dialog', dialog => dialog.accept());
  await sheet.getByRole('button', { name: 'Back to Week 7 Points', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#play\/points$/);
  await expect(wr).toBeFocused();
  expect(await world.db.query("select count(*)::int n from public.gtl_points_guesses where user_id=$1", [ACCOUNTS.luke.id]).then(r => r.rows[0].n)).toBe(0);
  expect(world.errors).toEqual([]);
});

// Board i39, Pick reminders: the one-time prompt under the Points card and Menu › Pick reminders, with the server able to
// send pushes (a fixture VAPID public key, so /community/read says pushConfigured). The browser's permission question is
// stubbed to count asks and answer "not now", so nothing subscribes and no push service is contacted.
const VAPID = `B${'A'.repeat(86)}`;
const AXE = ['wcag2a', 'wcag2aa', 'wcag21aa'];
async function stubPermission(page) {
  await page.addInitScript(() => {
    window.__permissionAsks = 0;
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' });
    Notification.requestPermission = () => { window.__permissionAsks += 1; return Promise.resolve('default'); };
  });
}
/**
 * Console errors from now on. The world aborts web font requests (no external request in a spec), which Chromium logs as
 * "Failed to load resource"; those are left out only while every failed request was a font.
 */
function consoleErrors(page) {
  const errors = [], failed = [];
  // Only ERR_FAILED (a route abort) logs that line; a read cut short by the reload is ERR_ABORTED and logs nothing.
  page.on('requestfailed', request => { if (request.failure()?.errorText === 'net::ERR_FAILED') failed.push(new URL(request.url()).hostname); });
  page.on('console', message => { if (message.type() === 'error' && message.text() !== 'Failed to load resource: net::ERR_FAILED') errors.push(message.text()); });
  return { errors, check: () => { expect(failed.filter(host => !/^fonts\.(googleapis|gstatic)\.com$/.test(host))).toEqual([]); expect(errors).toEqual([]); } };
}
async function pushCalls(page) {
  const calls = [];
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.includes('/push/')) calls.push(path.slice(path.indexOf('/push/'))); });
  return calls;
}
/** Phone layout, axe and a screenshot in Dark and Light at 390 and 320. */
async function themesAndWidths(page, info, name) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(layoutProblems), `${name} ${theme} ${width}`).toEqual([]);
      expect((await new AxeBuilder({ page }).withTags(AXE).analyze()).violations.map(v => v.id), `${name} ${theme} ${width}`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${theme}.png`), fullPage: true });
    }
  }
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.setViewportSize({ width: 390, height: 844 });
}

test('Pick reminders: the Points prompt and the Menu switch ask permission only on a tap, and "Not now" is remembered', async ({ page, baseURL }, info) => {
  await stubPermission(page);
  const logs = consoleErrors(page), calls = await pushCalls(page);
  const world = await communityWorld(page, baseURL, { migrations: ALL, pushPublicKey: VAPID });
  await seedWeek(world);
  await openNewApp(page);
  const prompt = page.getByRole('region', { name: 'Get a nudge before picks are due' });
  await expect(prompt).toBeVisible();
  // The prompt follows the Points card and offers no lime button (one primary action per screen stays the hero's).
  await expect(page.locator('[data-points-landing] + [data-reminder-prompt]')).toHaveCount(1);
  await expect(prompt.locator('.gx-btn--primary')).toHaveCount(0);
  expect(await page.evaluate(() => window.__permissionAsks), 'never asked on load').toBe(0);
  await themesAndWidths(page, info, 'reminders-prompt');

  // Menu › Pick reminders: the switch, off and switchable, 56 tall.
  await page.getByRole('button', { name: 'Your menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Pick reminders', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Pick reminders' });
  const toggle = sheet.getByRole('switch', { name: 'Pick reminders' });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  await expect(sheet).toContainText('One push 2 hours before picks are due');
  expect((await sheet.locator('.gx-switch-row').boundingBox()).height).toBeGreaterThanOrEqual(MIN_TARGET);
  expect(await page.evaluate(() => window.__permissionAsks), 'opening the switch asks nothing').toBe(0);
  await themesAndWidths(page, info, 'reminders-switch');
  // A tap asks once; "not now" keeps reminders off, says so, and nothing reaches the subscribe route.
  await sheet.locator('.gx-switch-row').click();
  await expect(sheet.getByRole('alert')).toHaveText('Reminders stay off. You can turn them on any time.');
  await expect(toggle).not.toBeChecked();
  await expect(toggle, 'the answer keeps focus on the switch').toBeFocused();
  expect(await page.evaluate(() => window.__permissionAsks)).toBe(1);
  expect(calls).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // "Not now" retires the prompt for this account on this device, focus returns to the Points card, and a reload keeps it away.
  await prompt.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.locator('[data-points-landing]')).toBeFocused();
  await page.reload();
  await expect(page.locator('[data-landing="play"]')).toBeVisible();
  await expect(page.locator('[data-points-landing]')).toBeVisible();
  await expect(page.locator('[data-reminder-prompt]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__permissionAsks)).toBe(0);
  logs.check();
  expect(world.errors).toEqual([]);
});

test('Pick reminders on an iPhone Safari tab: one line to add the app to the Home Screen; the switch is off and disabled', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' });
  const page = await context.newPage();
  // A Safari tab has no PushManager; push works only from the Home Screen app (iOS 16.4+).
  await page.addInitScript(() => { delete window.PushManager; });
  const logs = consoleErrors(page);
  try {
    const world = await communityWorld(page, baseURL, { migrations: ALL, pushPublicKey: VAPID });
    await seedWeek(world);
    await openNewApp(page);
    const prompt = page.getByRole('region', { name: 'Get a nudge before picks are due' });
    await expect(prompt).toContainText('add the app to your Home Screen first');
    await expect(prompt.getByRole('button', { name: 'Turn on reminders' })).toHaveCount(0);
    await themesAndWidths(page, info, 'reminders-iphone-prompt');
    await page.getByRole('button', { name: 'Your menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Pick reminders', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Pick reminders' });
    await expect(sheet.getByRole('switch', { name: 'Pick reminders' })).toBeDisabled();
    await expect(sheet).toContainText('Share › Add to Home Screen');
    await themesAndWidths(page, info, 'reminders-iphone-switch');
    logs.check();
    expect(world.errors).toEqual([]);
  } finally { await context.close(); }
});

// Board i63, player context on the Points ballot: the slot sheet's strip from the week's Fantasy snapshot, served signed in
// through the real /fantasy/week route from a fixture release (index and file checked by size and SHA-256), and the
// Fantasy profile as the sheet's sub-view. GTL's weekly estimate for the QB is the House (19.4): hidden until lock-in.
function fixtureRelease(snapshot) {
  const bytes = Buffer.from(JSON.stringify(snapshot)), sha256 = createHash('sha256').update(bytes).digest('hex');
  const index = updateFantasyIndex(null, { season: snapshot.season, updatedAt: snapshot.generatedAt, review: null, snapshot: {
    week: snapshot.week, file: snapshotFileName(snapshot.season, snapshot.week, sha256), sha256, bytes: bytes.byteLength, generatedAt: snapshot.generatedAt,
    statsThroughWeek: snapshot.statsThroughWeek, publishedAfterFreeze: false, rosterFallbackTeams: 0 } });
  const base = `https://github.com/${FANTASY_REPOSITORY}/releases/download/fantasy-data-${snapshot.season}/`;
  const served = new Map([['index.json', Buffer.from(JSON.stringify(index))], [index.snapshots[0].file, bytes]]);
  return async url => {
    const name = String(url).startsWith(base) ? String(url).slice(base.length) : null;
    return served.has(name) ? new Response(served.get(name), { status: 200 }) : new Response(null, { status: 404 });
  };
}
/** Every visible button under `scope` is at least 44 px both ways. */
async function targets(scope) {
  for (const target of await scope.locator('button').all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    expect(Math.min(box.width, box.height), await target.innerText()).toBeGreaterThanOrEqual(MIN_TARGET);
  }
}
/** Phone and desktop layout, 44 px targets, axe and a screenshot in Dark and Light at 320, 390 and 1280; `extra` runs at each. */
async function contextChecks(page, scope, info, name, extra = async () => {}) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      // The layer is part of the page now (no sheet over it): check from the top, where nothing sits under the sticky bar.
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(layoutProblems), `${name} ${theme} ${width}`).toEqual([]);
      await targets(scope);
      await extra(`${theme} ${width}`);
      expect((await new AxeBuilder({ page }).withTags(AXE).analyze()).violations.map(v => v.id), `${name} ${theme} ${width}`).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${theme}.png`) });
    }
  }
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.setViewportSize({ width: 390, height: 844 });
}

test('Player context: averages with game counts, the opponent, the report and its time; the House stays hidden until lock-in, per account', async ({ page, baseURL }, info) => {
  const logs = consoleErrors(page);
  const world = await communityWorld(page, baseURL, { migrations: ALL, fantasyFetch: fixtureRelease(pointsContextSnapshot()) });
  await seedWeek(world);
  await openNewApp(page);
  await page.locator('[data-points-landing]').click();
  await page.locator('[data-slot="QB"]').click();
  const sheet = pointsLayer(page);
  await expect(sheet.getByRole('heading', { name: 'QB · Fixture QB Player', exact: true })).toBeVisible();
  const strip = sheet.getByRole('region', { name: 'Player context' });
  await expect(strip.getByText('15.3', { exact: true })).toBeVisible();
  await expect(strip).toContainText(/Last 3\s*15\.3\s*3 games/);
  await expect(strip).toContainText(/Season\s*15\.6\s*5 games/);
  await expect(strip).toContainText(/@ CLE allows\s*15\.2\s*to QBs · 5 games/);
  await expect(strip).toContainText(`Limited Participation in Practice · as of ${CONTEXT_SNAPSHOT_TIMES.asOfText}`);
  await expect(sheet).not.toContainText(String(CONTEXT_HOUSE.QB));
  await expect(sheet).not.toContainText(/implied/i);
  // The glow card keeps its full height above the strip : nothing in it is covered.
  const uncovered = async where => {
    for (const control of [sheet.getByRole('button', { name: 'Save draft', exact: true }), strip.getByRole('button', { name: 'Open profile: Fixture QB Player' })]) {
      await control.scrollIntoViewIfNeeded();
      expect(await control.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === el; }), where).toBe(true);
    }
  };
  await contextChecks(page, sheet, info, 'points-context-strip', uncovered);

  // A guess in progress survives the profile: set 21, open the profile, come back.
  const spin = sheet.getByRole('spinbutton', { name: 'Your guess' });
  await spin.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageUp');
  await page.keyboard.press('ArrowUp');
  await expect(spin).toHaveAttribute('aria-valuenow', '21');
  await strip.getByRole('button', { name: 'Open profile: Fixture QB Player' }).click();
  // The profile is the slot's next layer, with its own address; the unsaved 21 goes with it, so nothing asks.
  await expect(page).toHaveURL(/#play\/points\?layer=profile&item=QB$/);
  const profile = sheet;
  await expect(profile.getByRole('heading', { name: 'Fixture QB Player', exact: true })).toBeVisible();
  await expect(profile.getByRole('group', { name: 'Player profile' })).toBeFocused();
  await expect(profile.getByRole('heading', { name: 'Observed production' })).toBeVisible();
  await expect(profile).toContainText('GTL’s estimate for this week is the House. It opens once you lock in this player, or at his kickoff.');
  await expect(profile).not.toContainText(String(CONTEXT_HOUSE.QB));
  await expect(profile).not.toContainText('Rest of season');
  await contextChecks(page, profile, info, 'points-context-profile-locked');
  await profile.getByRole('button', { name: 'Back to QB · Fixture QB Player', exact: true }).click();
  await expect(page).toHaveURL(/#play\/points\?item=QB$/);
  await expect(sheet.getByRole('spinbutton', { name: 'Your guess' })).toHaveAttribute('aria-valuenow', '21');

  // Lock in: the read now carries the House for Luke, so the profile shows the estimate.
  await sheet.getByRole('button', { name: 'Lock in 21', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Lock in 21?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
  await expect(sheet.getByText(/^Locked in 21\./)).toBeVisible();
  await expect(strip).not.toContainText(String(CONTEXT_HOUSE.QB));
  await strip.getByRole('button', { name: 'Open profile: Fixture QB Player' }).click();
  await expect(profile).toContainText(String(CONTEXT_HOUSE.QB));
  await expect(profile).not.toContainText('GTL’s estimate for this week is the House');

  // Missing values read "—", never 0: the WR has no recorded games, the FLEX is not in the snapshot. Back closes one
  // layer at a time: the profile, then the slot.
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/#play\/points$/);
  await page.locator('[data-slot="WR"]').click();
  await expect(sheet.getByRole('heading', { name: 'WR · Fixture WR Player', exact: true })).toBeVisible();
  const wr = sheet.getByRole('region', { name: 'Player context' });
  await expect(wr).toContainText(/Last 3\s*—\s*no recorded games\s*no games/);
  await expect(wr).toContainText(/@ DEN allows\s*15\.0\s*to WRs · 2 games/);
  await page.goBack();
  await page.locator('[data-slot="FLEX"]').click();
  await expect(sheet.getByRole('heading', { name: 'FLEX · Fixture FLEX Player', exact: true })).toBeVisible();
  const flex = sheet.getByRole('region', { name: 'Player context' });
  await expect(flex).toContainText('Not in this week’s player data');
  await expect(flex.getByRole('button', { name: /Open profile/ })).toHaveCount(0);
  expect(await flex.innerText()).not.toMatch(/(^|\s)0(\.0)?(\s|$)/);
  await page.goBack();

  // An account switch starts clean: Sean has locked nothing, so his QB profile is locked again.
  await page.getByRole('button', { name: 'Your menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'sean', { navigate: false });
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.locator('[data-points-landing]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-slot="QB"]').click();
  const seanSheet = pointsLayer(page);
  await expect(seanSheet.getByRole('spinbutton', { name: 'Your guess' })).toHaveAttribute('aria-valuetext', 'No guess yet');
  await seanSheet.getByRole('region', { name: 'Player context' }).getByRole('button', { name: 'Open profile: Fixture QB Player' }).click();
  await expect(seanSheet).toContainText('GTL’s estimate for this week is the House');
  await expect(seanSheet).not.toContainText(String(CONTEXT_HOUSE.QB));
  logs.check();
  expect(world.errors).toEqual([]);
});

// D-69 "Guess the Points exact" (big): stats that land while the member is away wait (NEW), never play on a page load,
// and play once, through the moments engine's one celebration card, when the ballot is next opened.
test('an exact guess plays once when the ballot is opened after the launch, never on a page load, and never again', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedPlayedWeek(world);
  await openNewApp(page);
  await page.locator('[data-points-landing]').click();
  const qb = page.locator('[data-slot="QB"]');
  await expect(qb).toContainText('Pending stats');
  // This device's first Points read seeded the moments record; now the QB's 21 lands while Luke is away.
  await loadQbActual(world, 21);
  await page.reload();
  await expect(qb).toContainText('10 / 10');
  const flash = page.getByRole('dialog', { name: 'Exact guess' });
  await expect(flash).toHaveCount(0);
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.locator('[data-points-landing]').click();
  await expect(flash).toBeVisible();
  await expect(flash).toContainText('Week 7 · QB · Fixture QB Player · 21 points');
  await flash.getByRole('button', { name: 'Nice', exact: true }).click();
  await expect(flash).toHaveCount(0);
  await qb.click();
  await expect(pointsLayer(page)).toContainText('Exact · 10 points');
  await page.goBack();
  await page.goBack();
  await page.locator('[data-points-landing]').click();
  await expect(qb).toBeVisible();
  await expect(flash).toHaveCount(0);
  expect(world.errors).toEqual([]);
});
