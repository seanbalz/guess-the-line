import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!pgliteAvailable, 'Install the local PGlite test runtime.');
test.setTimeout(120000);
async function open(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank'); await page.goto('/');
  await signIn(page, 'luke', { navigate: false });
  await page.getByRole('button', { name: /^League: .*\. Switch league$/ }).click();
  await page.getByRole('button', { name: 'Create a league', exact: true }).click();
  await expect(page.getByLabel('League name', { exact: true })).toBeVisible();
}

test('a member creates a private league and reaches invitations without leaving the new app', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL);
  try {
    await open(page);
    await expect(page.getByText(/practice game/i)).toHaveCount(0);
    await page.getByLabel('League name', { exact: true }).fill('Weekend League');
    await page.getByRole('button', { name: 'Group', exact: true }).click();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`create-${theme}.png`) });
    }
    await page.getByRole('button', { name: 'Create league', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Invite to Weekend League', exact: true })).toBeVisible();
    const lobby = await world.api('luke', 'lobby');
    const leagues = lobby.body.leagues.filter(row => row.name === 'Weekend League');
    expect(leagues).toHaveLength(1);
    expect(leagues[0]).toMatchObject({ role: 'commissioner', memberCount: 1, maxMembers: 20, format: 'group', practice: false });
    const other = await world.api('troy', 'lobby');
    expect(other.body.leagues.some(row => row.id === leagues[0].id)).toBe(false);
    await page.getByLabel('Their email address').fill('troy@example.test');
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('uncertain league creation survives reload and an explicit retry returns the original league', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await open(page);
    const requests = [];
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/leagues'), async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      if (requests.length > 1) return route.fallback();
      expect((await world.api('luke', 'leagues', body)).status).toBe(200);
      await route.abort('failed');
    });
    await page.getByLabel('League name', { exact: true }).fill('A private duel');
    await page.getByRole('button', { name: 'Create league', exact: true }).click();
    await expect(page.getByText(/We could not confirm creation/)).toBeVisible();
    await expect(page.getByLabel('League name', { exact: true })).toHaveAttribute('readonly', '');
    page.once('dialog', dialog => dialog.accept());
    await page.reload();
    await page.getByRole('button', { name: /^League: .*\. Switch league$/ }).click();
    await page.getByRole('button', { name: 'Create a league', exact: true }).click();
    await expect(page.getByLabel('League name', { exact: true })).toHaveValue('A private duel');
    expect(requests).toHaveLength(1);
    await page.getByRole('button', { name: 'Retry same creation', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Invite to A private duel', exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const lobby = await world.api('luke', 'lobby');
    expect(lobby.body.leagues.filter(row => row.name === 'A private duel')).toHaveLength(1);
    expect(lobby.body.leagues.find(row => row.name === 'A private duel')).toMatchObject({ maxMembers: 2, practice: false });
  } finally { await world.db.close(); }
});

test('a failed post-create list refresh retries only the read', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL);
  try {
    await open(page);
    let creates = 0, failLobby = true;
    page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/leagues') && request.method() === 'POST') creates++; });
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/lobby'), route => failLobby
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) }) : route.fallback());
    await page.getByLabel('League name', { exact: true }).fill('Saved League');
    await page.getByRole('button', { name: 'Create league', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show created league', exact: true })).toBeVisible();
    failLobby = false;
    await page.getByRole('button', { name: 'Show created league', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Invite to Saved League', exact: true })).toBeVisible();
    expect(creates).toBe(1);
  } finally { await world.db.close(); }
});
