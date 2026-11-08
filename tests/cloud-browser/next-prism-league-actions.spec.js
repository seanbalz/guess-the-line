import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { seedFinishedWeek } from '../helpers/features-week.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Real native readers/writers and local SQL, with fictional fixture records only.
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180_000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required.'));
const shots = path.resolve('design/prism-league-actions-native-2026-11-07');

async function pointsWeek(world) {
  const now = Date.now(), day = 86_400_000, at = ms => new Date(ms).toISOString();
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-fixture-${i}`, name: `Fixture ${slot} Player`, team: 'PIT', position: slot === 'FLEX' ? 'WR' : slot, gameKey: '2026_07_PIT_CLE', kickoff: at(now + (i === 0 ? -1 : i) * day) }));
  await world.db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at)
    values(2026,7,'published',$1,$2,$3,$4,$5,$6,$1)`, [at(now - 3 * day), at(now + 8 * day), { format: 'ppr', passingTds: 4, version: 'ppr4-v1' }, JSON.stringify(slots), { QB: 19.4, RB: 13.2, WR: 15.8, TE: 9.1, FLEX: 12.6 }, { snapshotSeason: 2026, snapshotWeek: 7, checksum: 'f'.repeat(64), selectionVersion: 'points-slate-v1', seed: 'fixture' }]);
  await world.db.transaction(async tx => {
    await tx.exec('set local session_replication_role = replica');
    for (const user of ['luke', 'troy']) await tx.query("insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at) values($1,2026,7,'QB',21,$2)", [ACCOUNTS[user].id, at(now - 2 * day)]);
  });
  await world.db.query('select public.gtl_points_load_actuals($1::jsonb)', [{ season: 2026, week: 7, source: { url: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv', release: 'stats_player', publishedAt: at(now - 3_600_000), retrievedAt: at(now - 1_800_000), sha256: 'a'.repeat(64) }, coverage: { expected: 1, received: 1, partial: false }, players: [{ playerId: '00-fixture-0', name: 'Fixture QB Player', team: 'PIT', position: 'QB', gameKey: '2026_07_PIT_CLE', stats: { receptions: 0 }, points: { 'ppr4-v1': 21 }, played: true, playedBasis: 'snaps' }] }]);
}

async function inspect(page, name, { capture = true } = {}) {
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(layoutProblems), `${name} full page`).toEqual([]);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), name).toEqual([]);
  const small = await page.locator('.gx').evaluate(root => [...root.querySelectorAll('button, a[href], textarea')].filter(el => el.getClientRects().length && !el.closest('[inert], [hidden], .gx-sr-only:not(.gx-skip-link:focus)')).map(el => ({ name: el.getAttribute('aria-label') || el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })).filter(r => r.width < 43.5 || r.height < 43.5));
  expect(small, `${name} touch targets`).toEqual([]);
  if (capture) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
  // Check the end of the actual scroll area as well as the first viewport.
  const body = page.locator('.gx-sheet-body').last();
  if (await body.isVisible()) {
    if (await body.getAttribute('tabindex') === '0' && await body.evaluate(el => el.scrollHeight > el.clientHeight)) {
      await body.focus();
      await page.keyboard.press('End');
      await expect.poll(() => body.evaluate(el => el.scrollTop), `${name} keyboard scroll`).toBeGreaterThan(0);
    }
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await page.evaluate(layoutProblems), `${name} lower sheet`).toEqual([]);
    if (capture) await page.screenshot({ path: path.join(shots, `${name}-scrolled.png`) });
    await body.evaluate(el => { el.scrollTop = 0; });
  } else {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // Content naturally passes under the sticky header while scrolling. Check the
    // final action's reachability instead of treating that normal overlay as a collision.
    const end = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('.gx-league button')].filter(el => el.getClientRects().length && !el.closest('[hidden], [inert]'));
      const rect = shown.at(-1).getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, header: document.querySelector('.gx-topbar').getBoundingClientRect().bottom, dock: document.querySelector('.gx-tabbar').getBoundingClientRect().top, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(end.overflow, `${name} lower page width`).toBe(false);
    expect(end.top, `${name} final action below header`).toBeGreaterThanOrEqual(end.header);
    expect(end.bottom, `${name} final action above dock`).toBeLessThanOrEqual(end.dock);
  }
}

test('approved League cards and long comment thread fit full pages, scroll bodies and forced colors', async ({ page, baseURL }) => {
  fs.mkdirSync(shots, { recursive: true });
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    await seedFinishedWeek(world);
    await pointsWeek(world);
    await world.db.query('update public.gtl_profiles set display_name=$2 where user_id=$1', [ACCOUNTS.luke.id, 'Luke Fixture With A Long Display Name']);
    const shared = await world.api('luke', 'league/share-result', { requestId: randomUUID(), season: 2026, week: 4, mode: 'guess_spread', gameId: 'SEA-DEN' });
    expect(shared.status).toBe(200);
    const postId = shared.body.postId;
    for (let i = 0; i < 8; i++) expect((await world.api('troy', 'community/comment', { requestId: randomUUID(), postId, body: `Comment ${i + 1}. ${'Long fictional game discussion with wrapped status text. '.repeat(6)}` })).status).toBe(200);
    expect((await world.api('troy', 'league/react', { postId, reaction: 'fire' })).status).toBe(200);
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#play/league?view=board');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('.gx-league-standing')).toBeVisible();
    for (const theme of ['dark', 'light']) for (const width of [390, 320]) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await page.setViewportSize({ width, height: 844 });
      await inspect(page, `league-board-${theme}-${width}`);
      const markets = page.getByRole('group', { name: 'Standings market' });
      await markets.getByRole('button', { name: 'Total', exact: true }).click();
      await expect(page.locator('.gx-league-standing')).toContainText('Total points');
      await inspect(page, `league-total-${theme}-${width}`);
      await markets.getByRole('button', { name: 'Points', exact: true }).click();
      await expect(page.getByRole('list', { name: 'Points season standings' })).toBeVisible();
      await expect(page.locator('.gx-league-house')).toContainText('House · unranked');
      await inspect(page, `league-points-${theme}-${width}`);
      await markets.getByRole('button', { name: 'Spread', exact: true }).click();
      await page.getByRole('button', { name: 'Open the feed', exact: true }).click();
      await expect(page.locator(`[data-post="${postId}"]`).getByRole('meter')).toHaveAttribute('aria-valuenow', '10');
      await inspect(page, `league-feed-${theme}-${width}`);
      const post = page.locator(`[data-post="${postId}"]`);
      await post.getByRole('button', { name: '8 comments. Open comments' }).click();
      const sheet = page.getByRole('dialog', { name: 'Comments · 8' });
      await expect(sheet).toBeVisible();
      await sheet.getByRole('textbox', { name: 'Add a comment' }).fill('Kept fictional draft. '.repeat(10));
      await inspect(page, `league-comments-${theme}-${width}`);
      await page.keyboard.press('Escape');
      await expect(post.getByRole('button', { name: '8 comments. Open comments' })).toBeFocused();
      await page.getByRole('button', { name: 'Back to League', exact: true }).click();
    }
    await page.emulateMedia({ forcedColors: 'active' });
    await inspect(page, 'league-board-forced-320');
    await page.getByRole('button', { name: 'Open the feed', exact: true }).click();
    await inspect(page, 'league-feed-forced-320');
    await page.locator(`[data-post="${postId}"]`).getByRole('button', { name: '8 comments. Open comments' }).click();
    await inspect(page, 'league-comments-forced-320');
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});
