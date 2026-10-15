import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// The deployable League uses HOSTED migrations and real authenticated handlers on local PGlite.
// The fixtures never contact hosted data. These checks cover privacy, actual writes and mobile access.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60_000);
const section = (page, name) => page.getByRole('group', { name: 'League sections' }).getByRole('button', { name, exact: true });
const spreadPost = page => page.locator('.gx-league-post').filter({ hasText: 'submitted Week 5 Spread picks.' });
const region = page => page.locator('.gx-league');
const apiPath = name => url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${name}`;
async function open(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank');
  await page.goto('/#feed');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.getByRole('heading', { name: 'League', exact: true, level: 1 })).toBeVisible();
}
async function group(world, name) {
  const result = await world.api('luke', 'leagues', { name, format: 'group', practice: false, requestId: randomUUID() });
  expect(result.status).toBe(200); return result.body.leagueId;
}
async function choose(page, name) {
  await page.getByRole('button', { name: 'Your leagues', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your leagues' }).getByRole('list', { name: 'Leagues' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
async function phone(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const undersized = await region(page).evaluate(root => [...root.querySelectorAll('button,textarea,select,summary')].filter(el => el.getClientRects().length).map(el => ({ text: el.textContent.trim().slice(0, 25), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })).filter(size => size.width < 43.5 || size.height < 43.5));
  expect(undersized).toEqual([]);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('Community feed hides unrevealed guesses, saves likes and comments, and boards work at phone widths in both themes', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required.');
  const world = await communityWorld(page, baseURL, { groupScreens: true, optionalRpc: true });
  try {
    await open(page);
    await expect(spreadPost(page)).toContainText('2 games hidden');
    await expect(region(page)).not.toContainText('47.5');
    await expect(region(page)).not.toContainText('2.5');
    await spreadPost(page).getByRole('button', { name: /^Like/ }).click();
    await expect(spreadPost(page).getByRole('button', { name: /^Unlike/ })).toHaveAttribute('aria-pressed', 'true');
    await spreadPost(page).getByLabel('Comment', { exact: true }).fill('Good luck this week');
    await spreadPost(page).getByRole('button', { name: 'Post comment' }).click();
    await expect(spreadPost(page).getByRole('list', { name: 'Comments' })).toContainText('Luke Fixture Good luck this week');
    await expect(spreadPost(page).getByLabel('Comment', { exact: true })).toHaveValue('');
    expect((await world.db.query('select body from public.gtl_feed_comments')).rows).toEqual([{ body: 'Good luck this week' }]);
    await page.reload();
    await expect(spreadPost(page)).toContainText('Good luck this week');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await phone(page);
        await section(page, 'Boards').click();
        await page.getByRole('group', { name: 'Standings market' }).getByRole('button', { name: 'Spread', exact: true }).click();
        await expect(page.getByRole('list', { name: 'Spread season standings' })).toContainText('Troy Fixture');
        await expect(region(page).getByText('Not ranked', { exact: true })).toHaveCount(3);
        await page.getByRole('group', { name: 'Standings market' }).getByRole('button', { name: 'Total', exact: true }).click();
        await expect(page.getByRole('list', { name: 'Total season standings' })).toBeVisible();
        await phone(page);
        await section(page, 'Feed').click();
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('an uncertain comment keeps its text and request id across a reload; retry records only one comment', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required.');
  const world = await communityWorld(page, baseURL, { optionalRpc: true });
  try {
    await open(page);
    const ids = [];
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/community/comment')) ids.push(request.postDataJSON().requestId); });
    // The server accepts the first write but its reply is lost. The real idempotency contract must survive the retry.
    await page.route(apiPath('community/comment'), async route => {
      const saved = await world.api('luke', 'community/comment', route.request().postDataJSON());
      expect(saved.status).toBe(200);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Reply unavailable' }) });
    }, { times: 1 });
    await spreadPost(page).getByLabel('Comment', { exact: true }).fill('Keep this draft');
    await spreadPost(page).getByRole('button', { name: 'Post comment' }).click();
    await expect(spreadPost(page).getByRole('alert')).toContainText('could not confirm');
    await expect(spreadPost(page).getByLabel('Comment', { exact: true })).toHaveValue('Keep this draft');
    await page.reload();
    await expect(spreadPost(page).getByLabel('Comment', { exact: true })).toHaveValue('Keep this draft');
    await spreadPost(page).getByRole('button', { name: 'Post comment' }).click();
    await expect(spreadPost(page).getByLabel('Comment', { exact: true })).toHaveValue('');
    expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
    expect((await world.db.query('select body from public.gtl_feed_comments')).rows).toEqual([{ body: 'Keep this draft' }]);
    await spreadPost(page).getByLabel('Comment', { exact: true }).fill('Private unfinished comment');
    const keys = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.next.draft.v1.')));
    expect(keys).toHaveLength(1);
    await page.getByRole('button', { name: 'Your menu' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('Private unfinished comment');
    await signIn(page, 'troy', { navigate: false });
    await expect(spreadPost(page).getByLabel('Comment', { exact: true })).toHaveValue('');
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('history obeys each market reveal and refreshes when the browser comes back online', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required.');
  const world = await communityWorld(page, baseURL, { optionalRpc: true });
  try {
    await open(page);
    await section(page, 'History').click();
    await page.getByRole('combobox', { name: 'Player', exact: true }).selectOption(ACCOUNTS.troy.id);
    await expect(region(page)).not.toContainText('2.5');
    await expect(region(page)).not.toContainText('47.5');
    const { season, week } = world.state.league;
    expect((await world.api('luke', 'community/sit-out', { season, week, mode: 'guess_spread' })).status).toBe(200);
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/community/history'));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await refreshed;
    await expect(region(page)).toContainText('2.5');
    // Preserve historical evidence labels from the established history renderer. Only already-revealed picks
    // get these reference fixtures; the other market still comes back hidden from the real handler.
    const history = await world.api('luke', 'community/history', {});
    expect(history.status).toBe(200);
    const ballot = history.body.weeks.flatMap(week => week.entries).find(entry => entry.userId === ACCOUNTS.troy.id && entry.mode === 'guess_spread');
    ballot.picks[0].reference = { basis: 'saved', status: 'pending', value: null, savedAt: '2026-10-08T18:00:00Z' };
    ballot.picks[1].reference = { basis: 'line-at-guess', origin: 'imported-reference', value: 2.5, source: 'Fixture archive', observedAt: '2026-10-08T17:00:00Z', capturedAt: '2026-10-08T19:00:00Z', gapSeconds: 3600 };
    await page.route(apiPath('community/history'), route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(history.body) }), { times: 1 });
    const withEvidence = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/community/history'));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await withEvidence;
    await expect(region(page).locator('details')).toHaveCount(2);
    for (const detail of await region(page).locator('details').all()) await detail.locator('summary').click();
    await expect(region(page)).toContainText('Pending · the first line after submission');
    await expect(region(page)).toContainText('Provisional · page time as published by the source');
    await expect(region(page)).toContainText('1h 0m before the guess');
    await page.getByRole('group', { name: 'History market' }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(region(page)).not.toContainText('47.5');
    await expect(region(page)).toContainText(/hidden/i);
    await phone(page);
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('private standings stay membership-scoped on rapid switching and discard data after a 403', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required.');
  const world = await communityWorld(page, baseURL, { groupScreens: true, optionalRpc: true });
  let release;
  try {
    const alpha = await group(world, 'Fixture Alpha'), beta = await group(world, 'Fixture Beta');
    await open(page);
    const released = new Promise(resolve => { release = resolve; });
    let reached;
    const reaching = new Promise(resolve => { reached = resolve; });
    await page.route(url => apiPath('state')(url) && url.searchParams.get('league') === alpha, async route => { reached(); await released; await route.fallback(); }, { times: 1 });
    await choose(page, 'Fixture Alpha');
    await reaching;
    await choose(page, 'Fixture Beta');
    await expect(page.getByRole('list', { name: 'Private group members' })).toContainText('Luke Fixture');
    release();
    await expect(region(page)).toContainText('Fixture Beta');
    await expect(region(page)).not.toContainText('Fixture Alpha');
    await expect(region(page)).not.toContainText('Troy Fixture');
    await expect(region(page)).not.toContainText('Sean Fixture');
    await expect(region(page)).toContainText('Not scored yet');
    await expect(region(page).getByText('Not ranked', { exact: true })).toHaveCount(1);
    await phone(page);
    await page.route(url => apiPath('state')(url) && url.searchParams.get('league') === beta, route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'This group is no longer available.' }) }));
    await page.getByRole('button', { name: 'Refresh group' }).click();
    await expect(region(page).getByRole('alert')).toContainText('This group is no longer available.');
    await expect(page.getByRole('list', { name: 'Private group members' })).toHaveCount(0);
    await expect(region(page)).not.toContainText('Luke Fixture');
    expect(world.errors).toEqual([]);
  } finally { release?.(); await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('an older-feed refusal immediately removes loaded activity while the main refresh is pending', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required.');
  const world = await communityWorld(page, baseURL, { optionalRpc: true });
  let release;
  try {
    for (let n = 0; n < 65; n++) await world.db.query("insert into public.gtl_feed_posts(actor_id,kind,dedupe_key,created_at) values($1,'joined',$2,$3)", [ACCOUNTS.troy.id, `older-fixture-${n}`, new Date(Date.now() - n * 60_000).toISOString()]);
    await open(page);
    await expect(page.getByRole('button', { name: 'Older activity' })).toBeVisible();
    await page.getByRole('button', { name: 'Older activity' }).click();
    await expect(page.locator('.gx-league-post')).toHaveCount(60);
    const olderPost = page.locator('.gx-league-post').last();
    await olderPost.getByLabel('Comment', { exact: true }).fill('Still here on an older post');
    await olderPost.getByRole('button', { name: 'Post comment' }).click();
    await expect(olderPost.getByRole('list', { name: 'Comments' })).toContainText('Still here on an older post');
    await expect(page.locator('.gx-league-post')).toHaveCount(60);
    await olderPost.getByRole('button', { name: /^Like/ }).click();
    await expect(olderPost.getByRole('button', { name: /^Unlike/ })).toHaveAttribute('aria-pressed', 'true');
    const released = new Promise(resolve => { release = resolve; });
    await page.route(apiPath('community/read'), async route => {
      if (route.request().postDataJSON()?.before) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Community access was removed.' }) });
      await released; return route.fallback();
    });
    await page.getByRole('button', { name: 'Older activity' }).click();
    await expect(region(page).getByRole('alert')).toContainText('Community access was removed.');
    await expect(page.locator('.gx-league-post')).toHaveCount(0);
    release();
    await region(page).getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('.gx-league-post')).toHaveCount(30);
    expect(world.errors).toEqual([]);
  } finally { release?.(); await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});
