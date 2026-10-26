import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { communityWorld, pgliteAvailable, signIn, SUPABASE } from './community-world.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.skip(!pgliteAvailable, 'Install the local PGlite test runtime.');
test.setTimeout(120000);

async function open(page, account = 'sean') {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank');
  await page.goto('/');
  await signIn(page, account, { navigate: false });
  await page.getByRole('button', { name: /^League: .*\. Switch league$/ }).click();
}
async function setup(page, baseURL) {
  const world = await communityWorld(page, baseURL);
  const result = await world.api('sean', 'leagues', { name: 'Sunday Friends', format: 'group', practice: false, requestId: randomUUID() });
  expect(result.status).toBe(200);
  return { world, league: result.body.leagueId };
}
async function manage(page) {
  await page.getByRole('button', { name: 'Invite to Sunday Friends', exact: true }).click();
  await expect(page.getByText('No invitations created yet.', { exact: true })).toBeVisible();
}
const sent = page => page.getByRole('region', { name: 'Sent invitations' });

test('host creates and revokes a recipient-bound invitation in the new app', async ({ page, baseURL }, testInfo) => {
  const { world, league } = await setup(page, baseURL);
  try {
    const chunks = [];
    page.on('request', request => { if (/\/assets\/InvitePlayers-[^/]+\.js$/.test(new URL(request.url()).pathname)) chunks.push(request.url()); });
    await open(page);
    expect(chunks).toHaveLength(0);
    await expect(page.getByRole('button', { name: /Invite to Triple Threat/ })).toHaveCount(0);
    await manage(page);
    expect(chunks).toHaveLength(1);
    await page.getByLabel('Their email address').fill('troy@example.test');
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    const field = page.getByLabel('Invitation link', { exact: true });
    await expect(field).toBeVisible();
    const token = new URL(await field.inputValue()).hash.replace('#invite=', '');
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedInvitation = value; } } }); });
    await page.getByRole('button', { name: 'Copy invitation link', exact: true }).click();
    expect(await page.evaluate(() => window.copiedInvitation)).toBe(await field.inputValue());
    const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(stored).not.toContain(token);
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); }; });
    await page.getByRole('button', { name: 'Copy invitation link', exact: true }).click();
    await expect(field).toBeFocused();
    expect(await field.evaluate(input => input.selectionEnd - input.selectionStart)).toBe((await field.inputValue()).length);
    expect((await world.api('luke', 'invite/accept', { token })).status).not.toBe(200);
    expect((await world.api('luke', `invites?league=${league}`)).status).toBe(403);
    expect((await world.api('luke', `invites?league=${league}`, { email: 'other@example.test', requestId: randomUUID() })).status).toBe(403);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`invitation-${theme}.png`) });
    }
    await page.getByRole('button', { name: 'Revoke invitation to troy@example.test' }).click();
    await expect(sent(page).getByText(/revoked ·/)).toBeVisible();
    await expect(field).toHaveCount(0);
    expect((await world.api('troy', 'invite/accept', { token })).status).not.toBe(200);
    await page.getByLabel('Their email address').fill('troy@example.test');
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    await expect(field).toBeVisible();
    const replacement = new URL(await field.inputValue()).hash.replace('#invite=', '');
    expect((await world.api('troy', 'invite/accept', { token: replacement })).status).toBe(200);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a committed create with a lost reply is checked without duplicate creation', async ({ page, baseURL }) => {
  const { world, league } = await setup(page, baseURL);
  try {
    await open(page); await manage(page);
    let creates = 0;
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/invites'), async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      creates++;
      const result = await world.api('sean', `invites?league=${league}`, route.request().postDataJSON());
      expect(result.status).toBe(200);
      await route.abort('failed');
    });
    await page.getByLabel('Their email address').fill('troy@example.test');
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    await expect(page.getByText(/We could not confirm creation/)).toBeVisible();
    await expect(sent(page).getByText('troy@example.test', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create invitation link', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh invitations', exact: true })).toBeEnabled();
    expect(creates).toBe(1);
    await page.getByRole('button', { name: 'Revoke invitation to troy@example.test' }).click();
    await expect(sent(page).getByText(/revoked ·/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create invitation link', exact: true })).toBeEnabled();
  } finally { await world.db.close(); }
});

test('list failures preserve a newly created link and never claim an empty list', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  try {
    await open(page); await manage(page);
    let failRead = true;
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/invites'), route => {
      if (failRead && route.request().method() === 'GET') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) });
      return route.fallback();
    });
    await page.getByLabel('Their email address').fill('luke@example.test');
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    const field = page.getByLabel('Invitation link', { exact: true });
    await expect(field).toBeVisible();
    const link = await field.inputValue();
    await expect(page.getByText(/Invitations could not be checked/)).toBeVisible();
    await expect(page.getByText('No invitations created yet.', { exact: true })).toHaveCount(0);
    failRead = false;
    await page.getByRole('button', { name: 'Refresh invitations', exact: true }).click();
    await expect(sent(page).getByText('luke@example.test', { exact: true })).toBeVisible();
    await expect(field).toHaveValue(link);
  } finally { await world.db.close(); }
});


test('a pending write is sent once and a cancelled draft keeps the invitation screen', async ({ page, baseURL }) => {
  const { world } = await setup(page, baseURL);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  try {
    await open(page); await manage(page);
    await page.getByLabel('Their email address').fill('troy@example.test');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByLabel('Their email address')).toHaveValue('troy@example.test');
    let creates = 0;
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/invites'), async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      creates++; await held; await route.fallback();
    });
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Working…', exact: true })).toBeDisabled();
    await page.getByLabel('Their email address').press('Enter');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Invite to Sunday Friends' })).toBeVisible();
    expect(creates).toBe(1); release();
    await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible();
    expect(creates).toBe(1);
  } finally { release(); await world.db.close(); }
});

test('members cannot manage host invitations', async ({ page, baseURL }) => {
  const { world, league } = await setup(page, baseURL);
  try {
    const invitation = await world.api('sean', `invites?league=${league}`, { email: 'troy@example.test', requestId: randomUUID() });
    expect((await world.api('troy', 'invite/accept', { inviteId: invitation.body.inviteId })).status).toBe(200);
    await open(page, 'troy');
    await expect(page.getByRole('list', { name: 'Leagues' }).getByText('Sunday Friends', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite to Sunday Friends', exact: true })).toHaveCount(0);

  } finally { await world.db.close(); }
});
