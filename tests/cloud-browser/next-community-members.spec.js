import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!pgliteAvailable, 'Install the local PGlite test runtime.');
test.setTimeout(120000);
const row = (page, name) => page.getByRole('region', { name: 'Members', exact: true }).locator('.gx-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
const endpoint = path => url => url.origin === SUPABASE && url.pathname.endsWith(`/${path}`);
async function open(page, account = 'sean') {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank'); await page.goto('/');
  await signIn(page, account, { navigate: false });
  await page.getByRole('button', { name: 'Your menu', exact: true }).click();
}
async function members(page) {
  await page.getByRole('button', { name: 'Community members', exact: true }).click();
  await expect(row(page, 'Troy Fixture')).toContainText('Community access active');
}
async function reviewTroy(page) {
  await row(page, 'Troy Fixture').getByRole('button').click();
  await expect(page.getByRole('dialog', { name: 'Remove Community access?', exact: true })).toBeVisible();
}
async function preserved(db) {
  const tables = ['gtl_weekly_ballots', 'gtl_weekly_selections', 'gtl_feed_posts', 'gtl_feed_comments', 'gtl_memberships'];
  const result = {};
  for (const table of tables) result[table] = (await db.query(`select to_jsonb(t) data from public.${table} t order by to_jsonb(t)::text`)).rows;
  return result;
}

test('commissioner reviews, cancels, removes and restores without changing player records', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL);
  try {
    const joined = (await world.db.query('select id from public.gtl_feed_posts where dedupe_key=$1', [`joined:${ACCOUNTS.luke.id}`])).rows[0].id;
    expect((await world.api('troy', 'community/comment', { requestId: randomUUID(), postId: joined, body: 'A retained comment' })).status).toBe(200);
    const before = await preserved(world.db);
    const chunks = [];
    page.on('request', request => { if (/\/assets\/CommunityMembers-[^/]+\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url()); });
    await open(page); expect(chunks).toHaveLength(0);
    await members(page); expect(chunks).toHaveLength(1);
    await expect(page.getByRole('button', { name: /access for Sean Fixture/ })).toHaveCount(0);
    await reviewTroy(page);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await world.db.query('select * from public.gtl_community_removals')).rows).toEqual([]);
    await reviewTroy(page);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`members-review-${theme}.png`) });
    }
    await page.getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(row(page, 'Troy Fixture')).toContainText('Community access removed · records kept');
    expect(await preserved(world.db)).toEqual(before);
    expect((await world.api('troy', 'community/read', {})).status).toBe(403);
    const feed = (await world.api('luke', 'community/read', {})).body;
    expect(feed.members.find(m => m.id === ACCOUNTS.troy.id).removed).toBe(true);
    expect(feed.standings.filter(s => s.userId === ACCOUNTS.troy.id)).toHaveLength(2);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`members-list-${theme}.png`) });
    }
    await row(page, 'Troy Fixture').getByRole('button').click();
    await page.getByRole('button', { name: 'Restore access', exact: true }).click();
    await expect(row(page, 'Troy Fixture')).toContainText('Community access active');
    expect(await preserved(world.db)).toEqual(before);
    expect((await world.api('troy', 'community/read', {})).status).toBe(200);
    expect((await world.db.query('select event from public.gtl_access_audit where actor_id=$1', [ACCOUNTS.sean.id])).rows.map(r => r.event)).toEqual([`community_remove:${ACCOUNTS.troy.id}`, `community_restore:${ACCOUNTS.troy.id}`]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('private-league hosts cannot manage Community members or remove themselves', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    expect((await world.api('troy', 'leagues', { name: 'Troy Friends', format: 'group', practice: false, requestId: randomUUID() })).status).toBe(200);
    await open(page, 'troy');
    await expect(page.getByRole('button', { name: 'Community members', exact: true })).toHaveCount(0);
    expect((await world.api('troy', 'community/member', { userId: ACCOUNTS.luke.id, member: false })).status).toBe(403);
    expect((await world.api('sean', 'community/member', { userId: ACCOUNTS.sean.id, member: false })).status).not.toBe(200);
    expect((await world.db.query('select * from public.gtl_community_removals')).rows).toEqual([]);
  } finally { await world.db.close(); }
});

test('a lost write reply and failed read survive reload without repeating the mutation', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await open(page); await members(page); await reviewTroy(page);
    let failRead = false, writes = 0;
    await page.route(endpoint('community/read'), route => failRead
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) }) : route.fallback());
    await page.route(endpoint('community/member'), async route => {
      writes++;
      expect((await world.api('sean', 'community/member', route.request().postDataJSON())).status).toBe(200);
      failRead = true; await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(page.getByText('An access change needs checking', { exact: true })).toBeVisible();
    await expect(page.getByText(/Community access could not be checked/)).toBeVisible();
    await page.getByRole('button', { name: 'Check saved access', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check saved access', exact: true })).toBeEnabled();
    expect(writes).toBe(1);
    failRead = false;
    await page.reload();
    await page.getByRole('button', { name: 'Your menu', exact: true }).click();
    await page.getByRole('button', { name: 'Community members', exact: true }).click();
    await expect(row(page, 'Troy Fixture')).toContainText('Community access removed · records kept');
    await expect(page.getByText('Troy Fixture: Community access removed and checked.', { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    expect((await world.db.query("select event from public.gtl_access_audit where event like 'community_remove:%'")).rows).toHaveLength(1);
    const drafts = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
    expect(drafts).not.toContain('community-member-check');
  } finally { await world.db.close(); }
});

test('failed preflight blocks a change and a concurrently changed member must be reviewed again', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await open(page); await members(page); await reviewTroy(page);
    let fail = true, writes = 0;
    await page.route(endpoint('community/read'), route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) }) : route.fallback());
    await page.route(endpoint('community/member'), route => { writes++; return route.fallback(); });
    await page.getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(page.getByText(/Community access could not be checked/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove access', exact: true })).toBeDisabled();
    expect(writes).toBe(0);
    fail = false;
    await page.getByRole('button', { name: 'Refresh members', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove access', exact: true })).toBeEnabled();
    expect((await world.api('sean', 'community/member', { userId: ACCOUNTS.troy.id, member: false })).status).toBe(200);
    await page.getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(page.getByText(/Membership changed since your review/)).toBeVisible();
    await expect(row(page, 'Troy Fixture')).toContainText('Community access removed');
    expect(writes).toBe(0);
  } finally { await world.db.close(); }
});

test('pending changes cannot be double-sent or closed, and an unsaved change requires a new review', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  try {
    await open(page); await members(page); await reviewTroy(page);
    let writes = 0;
    await page.route(endpoint('community/member'), async route => { writes++; await hold; await route.abort('failed'); });
    await page.getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check saved access', exact: true })).toBeDisabled();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Community members', exact: true })).toBeVisible();
    expect(writes).toBe(1); release();
    await expect(page.getByText(/Current access differs from the requested change/)).toBeVisible();
    await expect(row(page, 'Troy Fixture')).toContainText('Community access active');
    expect(writes).toBe(1);
    expect((await world.db.query('select * from public.gtl_community_removals')).rows).toEqual([]);
  } finally { release(); await world.db.close(); }
});

test('a fresh read without commissioner permission blocks an already-open review', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await open(page); await members(page); await reviewTroy(page);
    // The fixed founding roster cannot be edited. Simulate the refreshed permission response,
    // while retaining the real server denial for ordinary/private-host accounts in the test above.
    await page.route(endpoint('community/read'), async route => {
      const result = await world.api('sean', 'community/read', {});
      await route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify({ ...result.body, admin: false }) });
    });
    let writes = 0;
    await page.route(endpoint('community/member'), route => { writes++; return route.fallback(); });
    await page.getByRole('button', { name: 'Remove access', exact: true }).click();
    await expect(page.getByText('Only the Community commissioner can manage members.', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Members', exact: true })).toHaveCount(0);
    expect(writes).toBe(0);
    expect((await world.db.query('select * from public.gtl_community_removals')).rows).toEqual([]);
  } finally { await world.db.close(); }
});
