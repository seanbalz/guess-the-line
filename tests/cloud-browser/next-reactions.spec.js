// Redesign build plan stage 65: feed reactions and result sharing, at 390 x 844 on local PGlite fixtures (never hosted
// data). Contracts: a reaction from the picker shows at once, is saved as one per person (a new one replaces it, tapping
// it takes it back), and survives a reload; who reacted lists it; the old heart counts it; sharing your own scored guess
// posts a result that shows in the feed; the picker and the sheets fit a phone and pass axe in Dark and Light at 390 and 320.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { sendBallot, storeLines } from '../helpers/guess-week.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120_000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const LINES = { spread: { 'TB-DAL': -11.5, 'PHI-JAX': 13.5 }, total: { 'TB-DAL': 58.5, 'PHI-JAX': 31.5 } };
const feed = page => page.getByRole('region', { name: 'Community feed' });

async function open(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#feed');
  await signIn(page, 'luke', { navigate: false });
  await expect(feed(page)).toBeVisible();
}
async function checks(page, label, testInfo) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(layoutProblems), `${label} ${theme} ${width}`).toEqual([]);
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${label} ${theme} ${width}`).toEqual([]);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath(`${label}-${theme}.png`), fullPage: false });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('a reaction changes, stays one per person, survives a reload, lists in who reacted and counts as the old heart', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  try {
    await open(page);
    // Troy's two ballot posts fold into a digest until someone reacts; react to a joined post.
    const post = page.locator('.gx-feed-post[data-kind="joined"]').first();
    const postId = await post.getAttribute('data-post');
    await post.getByRole('button', { name: 'Add a reaction' }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a reaction' });
    await expect(picker.getByRole('button')).toHaveCount(6);
    await checks(page, 'reactions-picker', testInfo);
    await picker.getByRole('button', { name: 'Fire' }).click();
    await expect(post.getByRole('button', { name: 'Fire, 1 reaction, you reacted' })).toHaveAttribute('aria-pressed', 'true');
    // A new one replaces it: one reaction per person.
    await post.getByRole('button', { name: 'Add a reaction' }).click();
    await page.getByRole('dialog', { name: 'Choose a reaction' }).getByRole('button', { name: 'Laughing' }).click();
    await expect(post.getByRole('button', { name: 'Laughing, 1 reaction, you reacted' })).toBeVisible();
    await expect(post.getByRole('button', { name: /^Fire/ })).toHaveCount(0);
    await expect.poll(async () => (await world.db.query('select reaction from public.gtl_feed_reaction_events where post_id=$1 order by seq', [postId])).rows.map(r => r.reaction)).toEqual(['fire', 'laughing']);
    // Troy's thumbs up through the old heart, then a reload: both stay.
    expect((await world.api('troy', 'community/like', { postId, like: true })).body).toEqual({ likes: 2, likedByMe: true });
    await page.reload();
    await expect(feed(page)).toBeVisible();
    const again = page.locator(`.gx-feed-post[data-post="${postId}"]`);
    await expect(again.getByRole('button', { name: 'Laughing, 1 reaction, you reacted' })).toBeVisible();
    await expect(again.getByRole('button', { name: 'Thumbs up, 1 reaction' })).toHaveAttribute('aria-pressed', 'false');
    // Who reacted.
    await again.getByRole('button', { name: 'Add a reaction' }).click();
    await page.getByRole('dialog', { name: 'Choose a reaction' }).getByRole('button', { name: 'See who reacted' }).click();
    const reactors = page.getByRole('dialog', { name: 'Reactions · 2' });
    await expect(reactors.getByRole('list', { name: 'Who reacted' })).toContainText('Luke Fixture (you), Laughing');
    await expect(reactors.getByRole('list', { name: 'Who reacted' })).toContainText('Troy Fixture, Thumbs up');
    await checks(page, 'reactors', testInfo);
    await page.keyboard.press('Escape');
    // Tapping yours takes it back; the old heart counts what is left.
    await again.getByRole('button', { name: 'Laughing, 1 reaction, you reacted' }).click();
    await expect(again.getByRole('button', { name: /^Laughing/ })).toHaveCount(0);
    await expect.poll(async () => (await world.api('luke', 'community/read', {})).body.posts.find(p => p.id === postId)?.likes).toBe(1);
    expect((await world.db.query('select count(*)::int n from public.gtl_feed_reaction_events where post_id=$1', [postId])).rows[0].n).toBe(4);
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('Luke shares his own scored guess from his picks; the result shows in the feed with its guess and points', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    await storeLines(world.db, world.state, LINES);
    await sendBallot(world, 'luke', 'guess_spread', { 'TB-DAL': -11.5, 'PHI-JAX': 12.5 });
    await open(page);
    const own = page.locator('.gx-feed-post[data-kind="ballot_submitted"]').filter({ hasText: 'Luke Fixture' });
    await own.getByRole('button', { name: 'See your Spread picks' }).click();
    const sheet = page.getByRole('dialog', { name: 'Your Spread picks' });
    await expect(sheet).toContainText('DAL −11.5');
    await expect(sheet).toContainText('10 pts');
    await checks(page, 'own-picks', testInfo);
    await sheet.getByRole('button', { name: 'Share your Spread result for TB @ DAL' }).click();
    await expect(page.getByText('Shared to Community')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Share your Spread result for TB @ DAL' })).toHaveText('Shared');
    await page.keyboard.press('Escape');
    const result = page.locator('.gx-feed-post[data-kind="result_shared"]');
    await expect(result).toContainText('Luke Fixture (you) hit a Bullseye');
    await expect(result).toContainText('DAL −11.5 · 10 PTS');
    expect((await world.db.query("select count(*)::int n from public.gtl_feed_posts where kind='result_shared' and actor_id=$1", [ACCOUNTS.luke.id])).rows[0].n).toBe(1);
    // Troy has not locked in: the same post hides the guess and the points from him.
    const troy = (await world.api('troy', 'league/feed', {})).body.posts.find(p => p.kind === 'result_shared');
    expect(troy.embed).toEqual({ gameId: 'TB-DAL', visible: false });
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('your reaction pops only after the server confirms it: not on the change that shows at once, not on a refusal, never under reduced motion', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  const react = url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/league/react');
  let release;
  try {
    // Record every time a chip gains data-moment, from before the page loads.
    await page.addInitScript(() => {
      window.__pops = [];
      new MutationObserver(list => list.forEach(m => { if (m.target.getAttribute?.('data-moment') === 'pop' && m.target.classList.contains('gx-feed-chip')) window.__pops.push(m.target.getAttribute('aria-label')); }))
        .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-moment'] });
    });
    await open(page);
    const post = page.locator('.gx-feed-post[data-kind="joined"]').first();
    const postId = await post.getAttribute('data-post');
    expect((await world.api('troy', 'league/react', { postId, reaction: 'thumbs_up' })).status).toBe(200);
    await page.reload();
    await expect(feed(page)).toBeVisible();
    const chip = page.locator(`.gx-feed-post[data-post="${postId}"]`).getByRole('button', { name: /^Thumbs up/ });
    const pops = () => page.evaluate(() => window.__pops.length);
    // 1. A refusal: the change shows, then the old state comes back; no pop.
    await page.route(react, route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Reactions are closed.' }) }), { times: 1 });
    await chip.click();
    await expect(page.getByText('Reactions are closed.')).toBeVisible();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(await pops()).toBe(0);
    // 2. A held answer: the optimistic change shows and nothing pops until the server answers.
    const held = new Promise(resolve => { release = resolve; });
    await page.route(react, async route => { await held; await route.fallback(); }, { times: 1 });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
    expect(await pops()).toBe(0);
    release();
    await expect.poll(pops).toBe(1);
    // 3. Reduced motion (the app setting): a confirmed write never leaves data-moment on the chip.
    await chip.click(); // takes it back (no pop)
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await page.locator('.gx').first().evaluate(root => root.setAttribute('data-motion', 'reduce'));
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(500);
    expect(await pops()).toBe(1);
    expect(await chip.getAttribute('data-moment')).toBeNull();
  } finally { release?.(); await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});
