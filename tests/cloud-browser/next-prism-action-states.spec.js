import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from '../migrations.mjs';
import { nativeActionPairs } from '../helpers/native-action-captures.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn, sendBallot as sendCommunityBallot, storeBookLines } from './community-world.mjs';
import { sendBallot, storeLines } from '../helpers/guess-week.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { assertNativeActionTheme, setNativeActionTheme } from '../helpers/native-action-theme.mjs';

// Native mounted controllers with authenticated local fixtures and deliberately
// held/failed reads. No preview adapter, production fixture or hosted request.
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180_000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required.'));
const routeFor = name => url => url.origin === SUPABASE && url.pathname.endsWith(`/gtl-api/${name}`);
const checks = page => async () => {
  const small = await page.locator('.gx').evaluate(root => [...root.querySelectorAll('button, a[href], textarea, input')]
    .filter(el => el.getClientRects().length && !el.closest('[inert], [hidden], dialog:not([open]), .gx-sr-only:not(.gx-skip-link:focus)'))
    .map(el => ({ name: el.getAttribute('aria-label') || el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
    .filter(box => box.width < 43.5 || box.height < 43.5));
  expect(small).toEqual([]);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations.map(v => v.id)).toEqual([]);
};
async function open(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#play/league?view=feed');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('region', { name: 'Community feed' })).toBeVisible();
}
async function boardPairs(page, name) {
  const output = path.resolve('design/prism-league-actions-native-2026-11-07'); fs.mkdirSync(output, { recursive: true });
  for (const theme of ['dark', 'light']) {
    await setNativeActionTheme(page, theme); await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(layoutProblems)).toEqual([]); await checks(page)();
    await assertNativeActionTheme(page, theme);
    await page.screenshot({ path: path.join(output, `${name}-${theme}-390.png`), fullPage: true });
  }
}

test('Virtual keeps locked and no-offer boards separate and preserves busy and uncertain native slips', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  let release;
  try {
    const games = world.state.games;
    await storeBookLines(world, { spread: Object.fromEntries(games.map(game => [game.id, -3.5])), total: Object.fromEntries(games.map(game => [game.id, 44.5])) });
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#bets/virtual'); await signIn(page, 'luke', { navigate: false });
    const place = page.locator('[data-bets="place"]'); await expect(place).toBeVisible();
    await expect(place.locator('[data-market="spread"]')).toContainText(['Lock in your Spread guess', 'Lock in your Spread guess']);
    await boardPairs(page, 'nfl-virtual-locked');
    await sendCommunityBallot(world, 'luke', 'guess_spread', Object.fromEntries(games.map(game => [game.id, -3])));
    await place.getByRole('button', { name: 'Refresh prices', exact: true }).click();
    await expect(place.locator('[data-market="spread"] .gx-chip').first()).toBeEnabled();
    await boardPairs(page, 'nfl-virtual');
    const readRoute = routeFor('bets/read');
    await page.route(readRoute, async route => {
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const data = await response.json();
      for (const game of Object.values(data.markets)) for (const market of Object.values(game)) market.offers = {};
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), json: data });
    });
    await place.getByRole('button', { name: 'Refresh prices', exact: true }).click();
    await expect(place.locator('[data-market="spread"] .gx-chip').first()).toBeDisabled();
    await boardPairs(page, 'nfl-virtual-no-offer');
    await page.unroute(readRoute); await place.getByRole('button', { name: 'Refresh prices', exact: true }).click();
    for (const game of games) await place.locator(`[data-game="${game.id}"] [data-market="spread"] .gx-chip`).nth(1).click();
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    const slip = page.getByRole('dialog', { name: 'Your slip' });
    await nativeActionPairs(page, 'nfl-virtual-slip', checks(page));
    const writes = [];
    await page.route(routeFor('bets/place'), async route => {
      writes.push(route.request().postDataJSON());
      if (writes.length === 1) { await new Promise(resolve => { release = resolve; }); return route.fulfill({ status: 503, json: { error: 'Fixture lost reply.' } }); }
      return route.fallback();
    });
    await slip.getByRole('button', { name: /^Place 2 bets/ }).click();
    await expect(slip.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(slip).toBeVisible();
    const body = slip.locator('.gx-sheet-body'); await body.focus(); await page.keyboard.press('End');
    await expect(body).toBeFocused();
    await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await nativeActionPairs(page, 'nfl-virtual-busy', checks(page));
    expect(writes).toHaveLength(1); release();
    await expect(slip).toContainText('could not confirm');
    await nativeActionPairs(page, 'nfl-virtual-uncertain', checks(page));
    await slip.getByRole('button', { name: 'Retry the same save', exact: true }).click(); await expect(slip).not.toBeVisible();
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
    expect((await world.db.query('select count(*)::int n from public.gtl_virtual_units_picks where user_id=$1', [ACCOUNTS.luke.id])).rows[0].n).toBe(2);
    expect(world.errors).toEqual([]);
  } finally { release?.(); await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('feed picks retain hidden values and show separate loading failed empty and uncertain share states', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  let release;
  try {
    await open(page);
    const digest = page.locator('.gx-feed-digest');
    if (await digest.count()) await digest.getByRole('button', { name: /Show each post/ }).click();
    const troy = page.locator('.gx-feed-post[data-kind="ballot_submitted"]').filter({ hasText: 'Troy Fixture' }).first();
    await troy.getByRole('button', { name: /Troy Fixture’s .* picks/ }).click();
    const sheet = page.getByRole('dialog', { name: /Troy Fixture’s .* picks/ });
    await expect(sheet).toContainText('Hidden until you lock in');
    await nativeActionPairs(page, 'nfl-feed-hidden', checks(page));
    await page.keyboard.press('Escape');
    let behavior = 'loading';
    const picksRoute = routeFor('community/picks');
    await page.route(picksRoute, async route => {
      if (behavior === 'loading') await new Promise(resolve => { release = resolve; });
      if (behavior === 'failed') return route.fulfill({ status: 503, json: { error: 'Fixture picks unavailable.' } });
      if (behavior === 'empty') return route.fulfill({ json: { season: 2026, week: 5, games: [] } });
      return route.fallback();
    });
    await troy.getByRole('button', { name: /Troy Fixture’s .* picks/ }).click();
    await expect(sheet).toContainText('Loading picks…');
    await nativeActionPairs(page, 'nfl-feed-picks-loading', checks(page));
    release(); await expect(sheet).toContainText('Hidden until you lock in');
    await page.keyboard.press('Escape');
    for (const state of ['failed', 'empty']) {
      behavior = state;
      await troy.getByRole('button', { name: /Troy Fixture’s .* picks/ }).click();
      await expect(sheet).toContainText(state === 'failed' ? 'Fixture picks unavailable.' : 'No games this week.');
      await nativeActionPairs(page, `nfl-feed-picks-${state}`, checks(page));
      await page.keyboard.press('Escape');
    }
    await page.unroute(picksRoute);
    await storeLines(world.db, world.state, { spread: { 'TB-DAL': -11.5, 'PHI-JAX': 13.5 }, total: { 'TB-DAL': 58.5, 'PHI-JAX': 31.5 } });
    await sendBallot(world, 'luke', 'guess_spread', { 'TB-DAL': -11.5, 'PHI-JAX': 12.5 });
    await page.reload();
    await page.locator('.gx-feed-post[data-kind="ballot_submitted"]').filter({ hasText: 'Luke Fixture' }).getByRole('button', { name: 'See your Spread picks' }).click();
    const own = page.getByRole('dialog', { name: 'Your Spread picks' });
    await expect(own).toContainText('10 pts');
    await nativeActionPairs(page, 'nfl-feed-picks', checks(page));
    let writes = 0;
    await page.route(routeFor('league/share-result'), route => { writes++; return route.fulfill({ status: 503, json: { error: 'Fixture lost reply.' } }); });
    await own.getByRole('button', { name: 'Share your Spread result for TB @ DAL' }).click();
    await expect(own).toContainText('could not confirm the share');
    await nativeActionPairs(page, 'nfl-feed-share-uncertain', checks(page));
    expect(writes).toBe(1);
    expect(world.errors).toEqual([]);
  } finally { release?.(); await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('reactors preserve native loading failed and empty read states', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  let release;
  try {
    await open(page);
    const post = page.locator('.gx-feed-post[data-kind="joined"]').first();
    const postId = await post.getAttribute('data-post');
    expect((await world.api('troy', 'league/react', { postId, reaction: 'fire' })).status).toBe(200);
    await page.reload(); await expect(post.getByRole('button', { name: /^Fire/ })).toBeVisible();
    let state = 'loading';
    const reactorsRoute = routeFor('league/reactors');
    await page.route(reactorsRoute, async route => {
      if (state === 'loading') await new Promise(resolve => { release = resolve; });
      return route.fulfill({ status: state === 'failed' ? 503 : 200, json: state === 'failed' ? { error: 'Fixture reactions unavailable.' } : { reactors: [] } });
    });
    for (const next of ['loading', 'failed', 'empty']) {
      state = next;
      await post.getByRole('button', { name: 'Add a reaction' }).click();
      await page.getByRole('dialog', { name: 'Choose a reaction' }).getByRole('button', { name: 'See who reacted' }).click();
      const sheet = page.getByRole('dialog', { name: /^Reactions/ });
      await expect(sheet).toContainText(next === 'loading' ? 'Loading reactions' : next === 'failed' ? 'Fixture reactions unavailable.' : 'No reactions yet.');
      await nativeActionPairs(page, `nfl-reactors-${next}`, checks(page));
      if (next === 'loading') { release(); await expect(sheet).toContainText('No reactions yet.'); }
      await page.keyboard.press('Escape');
    }
    await page.unroute(reactorsRoute);
    await post.getByRole('button', { name: 'Add a reaction' }).click();
    await page.getByRole('dialog', { name: 'Choose a reaction' }).getByRole('button', { name: 'See who reacted' }).click();
    await expect(page.getByRole('list', { name: 'Who reacted' })).toContainText('Troy Fixture');
    await nativeActionPairs(page, 'nfl-reactors', checks(page));
    expect(world.errors).toEqual([]);
  } finally { release?.(); await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});
