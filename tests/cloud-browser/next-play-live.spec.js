import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';
import { openPicksWeek, chooseMarket, openGame } from './play-nest.mjs';

// D-69 step 1 retires the old whole-market editor (CommunityHome.jsx WeekPicks) from the new app. Under the historical
// D-16 rules (before M-02) Play shows the same per-game cards read-only: every saved guess shows, nothing offers to
// write, and nothing is written. The per-game writer's own contracts (lock-in, a lost reply, sit-out) are in
// next-per-game-scoring.spec.js and next-play-nest.spec.js; the in-place sign-in one is the last test here.
const D16_MIGRATIONS = HOSTED.filter(file => file < '20261015030000_gtl_sent_picks_final.sql');
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const writer = /^(Save draft|Lock in|Submit|Save changes|Sit out|Next to lock)/;
async function fixture(page, baseURL, options = {}) {
  const world = await communityWorld(page, baseURL, { migrations: D16_MIGRATIONS, optionalRpc: true, ...options });
  const lines = values => Object.fromEntries(world.state.games.map((g, i) => [g.id, values[i]]));
  await storeBookLines(world, { spread: lines([-2.5, 6.5]), total: lines([41.5, 47.5]) });
  expect((await world.api('luke', 'personal')).body.rules.sentFinal).toBe(false);
  return world;
}
async function saveDraft(world, mode, picks) {
  const { season, week } = world.state.league, workspace = (await world.api('luke', 'personal')).body;
  const saved = await world.api('luke', 'personal/ballot', { season, week, mode, picks, submit: false, revision: workspace.revision, weeklyRevision: workspace.weeklyRevision, requestId: randomUUID() });
  expect(saved.status).toBe(200);
}
const watchWrites = page => { const writes = []; page.on('request', r => { if (/\/(personal\/ballot|community\/sit-out)$/.test(r.url())) writes.push(r.url()); }); return writes; };

test('historical D-16 rules: the landing and the per-game cards show every saved guess read-only, and nothing is written', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  const [first, second] = world.state.games;
  await sendBallot(world, 'luke', 'guess_spread', { [first.id]: -3, [second.id]: 7 });
  await saveDraft(world, 'guess_total', { [first.id]: 44 });
  const writes = watchWrites(page);
  try {
    await signIn(page, 'luke');
    await tab(page, 'Play').click();
    const hero = page.locator('[data-landing="play"] [data-play="hero"]');
    await expect(hero).toContainText('Guess the Total');
    await expect(hero).toContainText('1 of 2 picked');
    await expect(page.locator('[data-play-tile="ballot"]')).toContainText('Submitted');
    await hero.getByRole('button', { name: 'Make picks', exact: true }).click();
    await expect(page).toHaveURL(/#play\/picks\?market=total/);
    const week = page.locator('.gx-per-game');
    await expect(week.locator('[data-play="read-only"]')).toHaveText('View only for now. Your saved guesses are shown and kept.');
    await expect(week.locator(`[data-tile="${first.id}"]`)).toHaveAttribute('data-state', 'draft');
    await expect(week.locator(`[data-tile="${first.id}"]`)).toContainText('44');
    await expect(page.getByRole('button', { name: writer })).toHaveCount(0);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}`).toBe(true);
        const small = await page.evaluate(() => [...document.querySelectorAll('.gx-per-game button')].filter(el => el.getClientRects().length && !el.closest('dialog:not([open])'))
          .filter(el => el.offsetWidth < 44 || el.offsetHeight < 44).map(el => el.textContent.trim()));
        expect(small, `${theme} ${width}`).toEqual([]);
        // The header Your score button sits outside the cards and is a target too.
        const header = await page.getByRole('button', { name: 'Your score', exact: true }).evaluate(el => [el.offsetWidth, el.offsetHeight]);
        expect(Math.min(...header), `Your score ${theme} ${width}`).toBeGreaterThanOrEqual(44);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${theme} ${width}`).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const draft = await openGame(page, first.id);
    await expect(draft.locator('[data-play="saved-guess"]')).toHaveText('Your guess · 44');
    await expect(draft.locator('[role="radio"]')).toHaveCount(0);
    await chooseMarket(page, 'Spread');
    await expect(page.locator(`.gx-per-game [data-tile="${first.id}"]`)).toHaveAttribute('data-state', 'locked');
    const sent = await openGame(page, first.id);
    const receipt = sent.getByRole('region', { name: /Spread receipt/ });
    await expect(receipt).toBeVisible();
    // The owner's saved line (the stored 3-book median, -2.5 for the first game) is the D-16 reference the server kept.
    await expect(receipt.locator('.gx-receipt-chip', { hasText: 'Line' })).toContainText('2.5');
    await expect(receipt.locator('.gx-receipt-chip--you')).toContainText('3');
    await expect(page.getByRole('button', { name: writer })).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('after the historical Thursday deadline the landing offers results, the cards stay read-only, and nothing is written', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { deadline: new Date(Date.now() - 60 * 60_000).toISOString() });
  const writes = watchWrites(page);
  try {
    await signIn(page, 'luke');
    await tab(page, 'Play').click();
    const hero = page.locator('[data-landing="play"] [data-play="hero"]');
    await expect(hero).toHaveAttribute('data-hero', 'results');
    await expect(hero.getByRole('button', { name: 'View your results', exact: true })).toBeVisible();
    await page.locator('[data-play-tile="ballot"]').getByRole('button').click();
    await expect(page.locator('.gx-per-game [data-play="read-only"]')).toBeVisible();
    await expect(page.getByRole('button', { name: writer })).toHaveCount(0);
    expect(writes).toEqual([]);
    expect((await world.db.query('select mode from public.gtl_weekly_ballots where user_id=$1', [ACCOUNTS.luke.id])).rows).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('per-game rules: a 401 on lock-in keeps the typed guess through in-place sign-in, and the retry reuses the request id', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED, optionalRpc: true });
  const writes = [];
  let refuse = true;
  await page.route(`${SUPABASE}/functions/v1/gtl-api/personal/ballot`, async route => {
    writes.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    refuse = false;
    return route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in to continue.' }) });
  });
  try {
    await signIn(page, 'luke');
    await tab(page, 'Play').click();
    await openPicksWeek(page);
    const [first] = world.state.games;
    const card = await openGame(page, first.id);
    await card.locator('[data-side="home"]').click();
    await card.locator('.gx-guess-num[data-value="3"]').click();
    await card.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Lock in Spread?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(page.locator('.gx-per-game')).toContainText('Sign in again, then check saved picks. Your draft is kept.');
    const dialog = page.getByRole('alertdialog', { name: 'Sign in again', exact: true });
    await dialog.getByLabel('Password', { exact: true }).fill('test-password');
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    // The typed guess survives the sign-in on the card itself.
    await expect(card.locator('[data-side="home"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator('.gx-guess-num[data-value="3"]')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Check saved picks', exact: true }).click();
    await page.getByRole('button', { name: 'Retry same save', exact: true }).click();
    await expect(card.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1].requestId).toBe(writes[0].requestId);
    expect(Math.abs(writes[0].picks[first.id])).toBe(3);
    expect(writes[1].picks).toEqual(writes[0].picks); // the guess typed before the 401 is the one retried
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
