import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Guess the Points in the new app (D-56 spec section 5; ballot card option D, the D-56 addendum) on local PGlite through the
// real gtl-api handler: the schema before P-01 shows "Points is coming soon" (what any project without P-01 serves);
// ALL (P-01 and P-02, hosted since October 23, 2026) plays a fixture week.
// Fixture accounts, players and guesses only; never a hosted project or a real pick.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const tabs = page => page.getByRole('navigation', { name: 'Main' });
const SENTINEL = 47; // Troy's locked QB guess: hidden from Luke until Luke locks in that slot.
const DAY = 86_400_000, iso = ms => new Date(ms).toISOString();

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
  await expect(page.getByRole('heading', { name: 'WEEK 7 POINTS' })).toBeVisible();
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
  const sheet = page.getByRole('dialog', { name: 'QB · Fixture QB Player' });
  await expect(sheet).toBeVisible();
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
    expect(Math.min(box.width, box.height), await target.innerText()).toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([]);
  await page.screenshot({ path: info.outputPath('points-sheet-editor-390.png') });
  await sheet.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(sheet.getByText('Draft saved: 21.')).toBeVisible();
  expect(await guessRow(world, 'QB')).toMatchObject({ guess: 21, locked_at: null });
  await expect(sheet).not.toContainText(String(SENTINEL));

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
    expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => v.id)).toEqual([]);
  await expect(sheet.getByRole('button', { name: /^Lock in/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('points-sheet-locked-390.png') });
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(qb).toContainText('Locked in');
  await expect(qb).toContainText(/You\s*21/);
  await expect(qb).not.toContainText(String(SENTINEL));
  await expect(qb).toHaveAccessibleName(new RegExp(`Troy Fixture ${SENTINEL}.*House 19\\.4`));
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(layoutProblems)).toEqual([]);
  }
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('points-ballot-locked-390.png'), fullPage: true });
  await expect(page.locator('[data-slot="RB"]')).not.toContainText('13.2');
  expect(world.errors).toEqual([]);
});

test('keyboard only, with reduced motion: open a slot, use the stepper, and Escape returns focus to its card', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedWeek(world);
  await openNewApp(page);
  await page.locator('[data-points-landing]').click();
  const wr = page.locator('[data-slot="WR"]');
  await wr.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'WR · Fixture WR Player' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();
  const spin = sheet.getByRole('spinbutton', { name: 'Your guess' });
  await spin.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageUp'); // From no guess the first move lands on 0.
  await expect(spin).toHaveAttribute('aria-valuenow', '15');
  await sheet.getByRole('button', { name: 'One point less, hold for 5' }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('button', { name: 'Lock in 14', exact: true })).toBeVisible();
  // Reduced motion: nothing in the sheet is animating.
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(wr).toBeFocused();
  expect(await world.db.query("select count(*)::int n from public.gtl_points_guesses where user_id=$1", [ACCOUNTS.luke.id]).then(r => r.rows[0].n)).toBe(0);
  expect(world.errors).toEqual([]);
});
