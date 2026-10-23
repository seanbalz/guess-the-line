import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL, HOSTED } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Guess the Points in the new app (D-56 spec section 5; ballot card option D, the D-56 addendum) on local PGlite through the
// real gtl-api handler: HOSTED (no P-01) shows "Points is coming soon"; ALL (P-01 applied locally only) plays a fixture week.
// Fixture accounts, players and guesses only; never a hosted project or a real pick.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const tabs = page => page.getByRole('navigation', { name: 'Main' });
const SENTINEL = 47; // Troy's locked QB guess: hidden from Luke until Luke locks in that slot.
const DAY = 86_400_000, iso = ms => new Date(ms).toISOString();

async function seedWeek(world) {
  const now = Date.now();
  const kick = [2 * DAY, 2 * DAY + 3 * 3_600_000, 3 * DAY, 3 * DAY + 3 * 3_600_000, 4 * DAY].map(ms => iso(now + ms));
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
  await page.getByRole('button', { name: 'Try the new app', exact: true }).click();
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await expect(page.locator('[data-landing="play"]')).toBeVisible();
}
const guessRow = (world, slot) => world.db.query('select guess,locked_at from public.gtl_points_guesses where user_id=$1 and season=2026 and week=7 and slot=$2', [ACCOUNTS.luke.id, slot]).then(r => r.rows[0] ?? null);

test('without P-01 the routes answer 404 and Play and the League board say "Points is coming soon"', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED });
  expect((await world.api('luke', 'points/read', {})).status).toBe(404);
  await openNewApp(page);
  const row = page.getByRole('button', { name: 'Guess the Points', exact: true });
  await expect(row).toHaveAttribute('aria-description', 'Points is coming soon');
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
  await expect(page.getByRole('button', { name: 'Guess the Points', exact: true })).toHaveAttribute('aria-description', /^0 of 5 locked · next locks /);
  await page.getByRole('button', { name: 'Guess the Points', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'WEEK 7 POINTS' })).toBeVisible();
  const cards = page.locator('[data-slot]');
  await expect(cards).toHaveCount(5);
  await expect(page.locator('[data-slot].gx-card--hero')).toHaveCount(1);
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
  await sheet.getByRole('button', { name: '20 points' }).click();
  await sheet.getByRole('button', { name: 'One point more' }).click();
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
  // The gate opened for Luke on this slot only: Troy's guess and the House show, faces first.
  const everyone = sheet.getByRole('region', { name: 'Everyone’s guesses' });
  await expect(everyone).toContainText('Troy Fixture');
  await expect(everyone).toContainText(String(SENTINEL));
  await expect(everyone).toContainText('House · unranked');
  await expect(everyone).toContainText('19.4');
  await expect(sheet.getByRole('button', { name: /^Lock in/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('points-sheet-locked-390.png') });
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(qb).toContainText('Locked in');
  await page.screenshot({ path: info.outputPath('points-ballot-locked-390.png'), fullPage: true });
  await expect(qb).toContainText(String(SENTINEL));
  await expect(page.locator('[data-slot="RB"]')).not.toContainText('13.2');
  expect(world.errors).toEqual([]);
});

test('keyboard only, with reduced motion: open a slot, choose a chip, step, and Escape returns focus to its card', async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedWeek(world);
  await openNewApp(page);
  await page.getByRole('button', { name: 'Guess the Points', exact: true }).click();
  const wr = page.locator('[data-slot="WR"]');
  await wr.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'WR · Fixture WR Player' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();
  const chip = sheet.getByRole('button', { name: '15 points' });
  await chip.focus();
  await page.keyboard.press('Space');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  // Reduced motion: the chip's selection pop does not run.
  expect(await chip.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await sheet.getByRole('button', { name: 'One point less' }).focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('button', { name: 'Lock in 14', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(wr).toBeFocused();
  expect(await world.db.query("select count(*)::int n from public.gtl_points_guesses where user_id=$1", [ACCOUNTS.luke.id]).then(r => r.rows[0].n)).toBe(0);
  expect(world.errors).toEqual([]);
});
