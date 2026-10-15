import { expect } from '@playwright/test';
import { ACCOUNTS, SUPABASE, communityWorld, signIn, sendBallot, storeBookLines } from './community-world.mjs';
import { HOSTED } from '../migrations.mjs';

// Fictional accounts and retained quotes only. The real handler and additive
// recommendation writers run on PGlite; the network fixture rejects live traffic.
export const migrations = [...new Set([...HOSTED,
  '20261015143006_gtl_recommended_virtual_pick.sql',
  '20261015190955_gtl_edit_recommended_virtual_pick.sql',
])].sort();
export const cards = page => page.locator('.recommended-bet-card');
export const placements = calls => calls.filter(call => call.path === 'bets/recommendations/place');
export const edits = calls => calls.filter(call => call.path === 'bets/recommendations/edit');
export const picksCount = async world => Number((await world.db.query('select count(*) as n from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.luke.id])).rows[0].n);
export function requests(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.includes('/gtl-api/')) calls.push({
      path: url.pathname.split('/gtl-api/')[1], query: url.search,
      body: request.method() === 'POST' ? request.postDataJSON() : null,
    });
  });
  return calls;
}

export async function fixture(page, baseURL, { games = 4, spread = true, total = true } = {}) {
  const world = await communityWorld(page, baseURL, { games, groupScreens: true, virtualUnits: true, optionalRpc: true, migrations });
  world.lines = {
    spread: Object.fromEntries(world.state.games.map(game => [game.id, -3.5])),
    total: Object.fromEntries(world.state.games.map(game => [game.id, 44.5])),
  };
  world.observedAt = await storeBookLines(world, world.lines);
  world.guesses = {
    spread: Object.fromEntries(world.state.games.map((game, i) => [game.id, [-10, -7, -5, -3][i]])),
    total: Object.fromEntries(world.state.games.map((game, i) => [game.id, [55, 49, 43, 44.5][i]])),
  };
  if (spread) await sendBallot(world, 'luke', 'guess_spread', world.guesses.spread);
  if (total) await sendBallot(world, 'luke', 'guess_total', world.guesses.total);
  return world;
}

export async function openRecommended(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#bets');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'Bets', level: 1, exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Bets view' }).getByRole('button', { name: 'Recommended', exact: true }).click();
  await expect(page.locator('.virtual-units')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh lines', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Choose league', exact: true })).toHaveCount(0);
}
