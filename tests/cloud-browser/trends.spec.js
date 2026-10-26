// Situational trends in the browser: the Community Picks toggle and per-game expander, the panel's
// reveal gating, and the commissioner's referee dropdown saved through the real handler and the game
// officials migration on local PGlite (the community-world pattern). Never contacts hosted data.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { communityWorld, pgliteAvailable, signIn, switchAccount, ACCOUNTS } from './community-world.mjs';

// The committed trends file is 2026 Week 6; the fixture week uses two of its games so the panel has real data.
const WEEK6 = state => {
  state.league.season = 2026; state.league.week = 6;
  const [a, b] = state.games;
  state.games = [{ ...a, id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos' },
    { ...b, id: 'HOU-JAX', away: 'Houston Texans', home: 'Jacksonville Jaguars', awayCode: 'HOU', homeCode: 'JAX', matchup: 'Houston Texans @ Jacksonville Jaguars' }];
};

test.beforeEach(() => { test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'); });
const FIRST_LOAD = 15000;

test('trends: off by default, one expander per game, gated by ballot, referee set by the commissioner for everyone', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { prepare: WEEK6, troyBallots: false });
  await signIn(page, 'luke');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Picks/ }).click();
  const toggle = page.getByRole('button', { name: 'Show trends', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  // Off by default: no expander, so each game keeps its keyboard order.
  await expect(page.getByRole('button', { name: /^Trends for/ })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('gtl.trends.show'))).toBe('on');
  const expander = page.getByRole('button', { name: 'Trends for SEA at DEN', exact: true });
  await expect(page.getByRole('button', { name: /^Trends for/ })).toHaveCount(2);
  await expect(expander).toHaveAttribute('aria-expanded', 'false');
  await expander.click();
  await expect(expander).toHaveAttribute('aria-expanded', 'true');
  await expect(expander).toBeFocused();
  const panel = page.locator(`#${await expander.getAttribute('aria-controls')}`);
  // The panel's first open waits for the lazy panel and the authenticated week read (#166), which took 4.4 s on CI's
  // fixture database; give that first load room instead of the default 5 s. Later checks keep the default.
  await expect(panel.getByRole('heading', { name: 'Strongest historical evidence' })).toBeVisible({ timeout: FIRST_LOAD });
  // D-34: without a stored forecast (this spec's world has no Open-Meteo provider) the panel keeps the fallback note.
  await expect(panel).toContainText('Applies only if kickoff wind is 10+ mph; no current forecast for this game');
  await expect(panel).toContainText('Referee not assigned yet.');
  await expect(panel.getByRole('heading', { name: 'Unlocks after your Spread ballot' })).toBeVisible();
  await expect(panel).toContainText('Data: nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), modified');
  const axe = await new AxeBuilder({ page }).include(`#${await expander.getAttribute('aria-controls')}`).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  // A player cannot set a referee, even by calling the route directly.
  const refused = await world.api('luke', 'officials/set', { season: 2026, week: 6, gameId: 'SEA-DEN', referee: 'Scott Novak' });
  expect(refused.status).toBe(403);
  expect((await world.db.query('select count(*)::int n from public.gtl_game_officials')).rows[0].n).toBe(0);

  // The commissioner sets the referee from the dropdown in the commissioner area of the feed.
  await switchAccount(page, 'sean');
  await expect(page.getByRole('heading', { name: 'Community', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await page.getByText('Game referees (commissioner)', { exact: true }).click();
  const select = page.getByLabel('Referee for SEA at DEN', { exact: true });
  await expect(select).toBeVisible();
  await expect(select.locator('option')).toHaveCount(19);
  await select.selectOption('Scott Novak');
  await page.getByRole('button', { name: 'Save 1 referee', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Referees saved for everyone. SEA at DEN: Scott Novak.' })).toBeVisible();
  const saved = (await world.db.query('select game_id,referee,set_by,revision from public.gtl_game_officials')).rows;
  expect(saved).toEqual([{ game_id: 'SEA-DEN', referee: 'Scott Novak', set_by: ACCOUNTS.sean.id, revision: 1 }]);

  // Every member now sees the assignment and that referee's records.
  await switchAccount(page, 'luke');
  await page.getByRole('button', { name: /^Picks/ }).click();
  await expect(page.getByRole('button', { name: 'Show trends', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Trends for SEA at DEN', exact: true }).click();
  await expect(page.getByText('Assigned referee: Scott Novak (set by the commissioner)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Referee Scott Novak: career over/under' })).toBeVisible();
  await page.getByRole('button', { name: 'Trends for HOU at JAX', exact: true }).click();
  await expect(page.getByText('Referee not assigned yet.').first()).toBeVisible();
  expect(world.errors).toEqual([]);
});

test('trends: without a ballot both markets stay locked while the consistent-not-proven cards still show', async ({ page, baseURL }) => {
  await communityWorld(page, baseURL, { prepare: WEEK6, troyBallots: false });
  await signIn(page, 'luke');
  await page.getByRole('button', { name: /^Picks/ }).click();
  await page.getByRole('button', { name: 'Show trends', exact: true }).click();
  // A Spread submission is required before spread bands unlock; with none, both markets stay locked.
  await page.getByRole('button', { name: 'Trends for HOU at JAX', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlocks after your Total ballot' })).toBeVisible({ timeout: FIRST_LOAD });
  await expect(page.getByRole('heading', { name: 'Spread-dependent records' })).toHaveCount(0);
  // The fixture moves kickoff into the current open week. HOU's later scheduled games
  // have no finals in the pinned season CSV, so previous-game trends may correctly wait.
  // The wind condition is stable and needs neither a current line nor a previous final.
  const consistent = page.getByRole('region', { name: 'Consistent, not proven', exact: true });
  await expect(consistent.locator('summary').getByText('Very strong wind', { exact: true })).toBeVisible();
  await expect(consistent).toContainText('Applies only if kickoff wind is 15+ mph; no current forecast for this game');
});
