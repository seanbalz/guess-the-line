import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Fictional accounts and the real existing /profile handler on local SQL; no hosted writes.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const profile = page => page.getByRole('dialog', { name: 'Profile', exact: true });
const field = page => profile(page).getByLabel('Display name', { exact: true });
const stored = async world => (await world.db.query('select display_name from public.gtl_profiles where user_id=$1', [ACCOUNTS.luke.id])).rows[0].display_name;
async function openProfile(page) {
  await expect(page.getByRole('button', { name: 'Your menu', exact: true })).toBeVisible();
  if (await profile(page).isVisible()) return;
  if (!(await page.getByRole('dialog', { name: 'Menu', exact: true }).isVisible())) await page.getByRole('button', { name: 'Your menu', exact: true }).click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(profile(page)).toBeVisible();
}
async function open(page) {
  await signIn(page, 'luke');
  await page.getByRole('button', { name: 'Try the new app', exact: true }).click();
  await openProfile(page);
}

test('Profile keeps drafts through reload, checks concurrent changes and only writes on an intentional save', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED });
  const writes = [];
  page.on('request', request => { if (request.url().endsWith('/profile')) writes.push(request.postDataJSON()); });
  try {
    await open(page);
    await expect(field(page)).toHaveValue('Luke Fixture');
    await expect(field(page)).toHaveAttribute('maxlength', '60');
    await field(page).fill('');
    await profile(page).getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(profile(page).getByRole('alert')).toContainText('between 1 and 60');
    expect(writes).toEqual([]);
    await field(page).fill('Luke Draft');
    page.once('dialog', dialog => dialog.accept());
    await page.reload();
    // Sheet subviews are session navigation; opening it again restores its account-scoped draft.
    await openProfile(page);
    await expect(field(page)).toHaveValue('Luke Draft');
    expect(await stored(world)).toBe('Luke Fixture');
    expect(writes).toEqual([]);

    // A different device changed the saved name. The first Save only reports the conflict.
    await world.db.query('update public.gtl_profiles set display_name=$1 where user_id=$2', ['Luke Elsewhere', ACCOUNTS.luke.id]);
    await profile(page).getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(profile(page).getByRole('alert')).toContainText('Your saved name changed to “Luke Elsewhere”');
    await expect(field(page)).toHaveValue('Luke Draft');
    expect(writes).toEqual([]);
    await profile(page).getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(profile(page).getByRole('status')).toHaveText('Your name is saved.');
    expect(await stored(world)).toBe('Luke Draft');
    expect(writes).toEqual([{ displayName: 'Luke Draft' }]);

    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`profile-${theme}-320.png`) });
    }
    // A new unsaved draft is erased by explicit sign-out and cannot leak into Troy's account.
    await field(page).fill('Private unfinished name');
    page.once('dialog', dialog => dialog.accept());
    await profile(page).getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('form.auth-form').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.next.draft.')))).toEqual([]);
    await signIn(page, 'troy', { navigate: false });
    await openProfile(page);
    await expect(field(page)).toHaveValue('Troy Fixture');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Profile preserves an expired-session draft and checks a lost save reply after reload without another write', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED });
  const writes = [];
  let failure = 'auth';
  await page.route(`${SUPABASE}/functions/v1/gtl-api/profile`, async route => {
    const request = route.request();
    writes.push(request.postDataJSON());
    if (failure === 'auth') {
      failure = null;
      return route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in to continue.' }) });
    }
    if (failure === 'reply') {
      failure = null;
      const response = await world.handler(new Request(request.url(), { method: 'POST', headers: request.headers(), body: request.postData() }));
      expect(response.status).toBe(200);
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{lost reply' });
    }
    return route.fallback();
  });
  try {
    await open(page);
    await field(page).fill('Luke Retained');
    await profile(page).getByRole('button', { name: 'Save name', exact: true }).click();
    const signInAgain = page.getByRole('alertdialog', { name: 'Sign in again', exact: true });
    await expect(signInAgain).toBeVisible();
    await signInAgain.getByLabel('Password', { exact: true }).fill('test-password');
    await signInAgain.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(signInAgain).not.toBeVisible();
    await expect(field(page)).toHaveValue('Luke Retained');
    failure = 'reply';
    await profile(page).getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(profile(page).getByRole('button', { name: 'Check if it saved', exact: true })).toBeVisible();
    expect(await stored(world)).toBe('Luke Retained');
    expect(writes).toHaveLength(2);
    page.once('dialog', dialog => dialog.accept());
    await page.reload();
    await openProfile(page);
    await expect(field(page)).toHaveValue('Luke Retained');
    await expect(field(page)).toHaveAttribute('readonly', '');
    await expect(profile(page).getByRole('button', { name: 'Save name', exact: true })).toHaveCount(0);
    await profile(page).getByRole('button', { name: 'Check if it saved', exact: true }).click();
    await expect(profile(page).getByRole('status')).toHaveText('Your name is saved.');
    expect(writes).toHaveLength(2);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Profile stops a pending account check after external sign-out and never restores the purged draft', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED });
  const writes = [];
  page.on('request', request => { if (request.url().endsWith('/profile')) writes.push(request.postDataJSON()); });
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { reached = resolve; });
  try {
    await open(page);
    await field(page).fill('Luke pending account check');
    await page.route(`${SUPABASE}/functions/v1/gtl-api/lobby`, async route => {
      reached();
      await gate;
      // The mounted data store aborts this fetch when the external sign-out unmounts it.
      await route.abort().catch(() => {});
    }, { times: 1 });
    await profile(page).getByRole('button', { name: 'Save name', exact: true }).click();
    await waiting;
    // This is the same browser auth broadcast used when another tab signs out. Unlike a page
    // reload, it leaves the original async continuation alive and exercises the unmount race.
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(key => /^sb-.*-auth-token$/.test(key));
      if (!key) throw new Error('Missing fixture auth session');
      localStorage.removeItem(key);
      const channel = new BroadcastChannel(key);
      channel.postMessage({ event: 'SIGNED_OUT', session: null });
      channel.close();
    });
    await expect(page.locator('form.auth-form').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    release();
    await signIn(page, 'troy', { navigate: false });
    await openProfile(page);
    await expect(field(page)).toHaveValue('Troy Fixture');
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.next.draft.')))).toEqual([]);
    expect(writes).toEqual([]);
    expect(await stored(world)).toBe('Luke Fixture');
    expect((await world.db.query('select display_name from public.gtl_profiles where user_id=$1', [ACCOUNTS.troy.id])).rows[0].display_name).toBe('Troy Fixture');
    expect(world.errors).toEqual([]);
  } finally { release(); await world.db.close(); }
});
