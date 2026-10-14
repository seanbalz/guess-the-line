import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Redesign build plan, stage 11: the data layer, the league switcher and the guards, at 390 x 844 (section 4.1). The real
// app (main.jsx, AuthGate, the lazy NextApp) on the real handler with every migration (ALL) on local PGlite: only the
// account's own leagues, kept across a reload; the access-pending screen; the Play counter; the name step; the saved invite
// link and the invites sent to the account, with Join; an expired invite; a sign-in that ran out (401) while typing; an
// account the commissioner removed from the Community; a second account in the same tab sees no drafts from the first.
// Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const READS = ['GET /functions/v1/gtl-api/lobby', 'POST /functions/v1/gtl-api/community/read'];
const tabBar = page => page.getByRole('navigation', { name: 'Main' });
const tab = (page, name) => tabBar(page).getByRole('button', { name, exact: true });
const title = (page, name) => page.getByRole('heading', { name, level: 1, exact: true });
const sheet = (page, name) => page.getByRole('dialog', { name, exact: true });
const pill = page => page.getByRole('button', { name: /^League: .*\. Switch league$/ });
const switcher = page => sheet(page, 'Your leagues');
const leagueRow = (page, name) => switcher(page).getByRole('list', { name: 'Leagues' }).getByRole('button', { name: new RegExp(`^${name}`) });
const nameStep = page => page.getByRole('heading', { name: 'First, what should we call you?', level: 1 });
const nameField = page => page.getByLabel('Your name', { exact: true });
const toast = (page, text) => page.locator('.gx-toast').filter({ hasText: text });
const signInAgain = page => page.getByRole('alertdialog', { name: 'Sign in again' });

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/** Phone rules for everything under `root` (section 4.1): no side scroll, 44px targets, no text under 12px, nothing clipped. */
async function phoneChecks(page, root = '.gx') {
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no side scroll').toBe(true);
  const report = await page.locator(root).first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open])'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || el.closest('.gx-sr-only') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 0.5 || r.left < -0.5) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report).toEqual({ targets: [], small: [], clipped: [] });
}

async function axe(page) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return result.violations.map(issue => `${issue.id}: ${issue.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

/** Every gtl-api call from now on, as "METHOD /path". */
function apiCalls(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/')) calls.push(`${request.method()} ${url.pathname}`);
  });
  return calls;
}
const writes = calls => calls.filter(call => !READS.includes(call));

/** This device chose the new app; `account` signs in (after `before`, for example a saved invite link). */
async function openNewApp(page, account = 'luke', { fragment = '' } = {}) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('about:blank');
  await page.goto(`/${fragment}`);
  await signIn(page, account, { navigate: false });
}

/** Creates a private group as `account` through the real /leagues route; returns its id. */
async function createGroup(world, account, name) {
  const created = await world.api(account, 'leagues', { name, format: 'group', practice: false, requestId: randomUUID() });
  expect(created.status).toBe(200);
  return created.body.leagueId;
}
/** Invites `email` to `league` as its host; returns the invite link's token. */
async function invite(world, account, league, email) {
  const made = await world.api(account, `invites?league=${league}`, { email, requestId: randomUUID() });
  expect(made.status).toBe(200);
  return new URL(made.body.inviteUrl).hash.replace('#invite=', '');
}
const forgetName = (world, account) => world.db.query('delete from public.gtl_profiles where user_id=$1', [ACCOUNTS[account].id]);
const draftKeys = page => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('gtl.next.draft.')));

test('only his leagues, the Community first; a choice is kept across a reload; a league he is not in shows as pending; the Play counter', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    const elsewhere = await createGroup(world, 'troy', 'Fixture Elsewhere');
    const calls = apiCalls(page);
    await openNewApp(page, 'luke');
    await expect(tabBar(page)).toBeVisible();
    await expect(pill(page)).toHaveAccessibleName('League: Community. Switch league');
    // The Play counter: both of this week's ballots are still due for Luke.
    await expect(tab(page, 'Play, 2 ballots due')).toBeVisible();
    await expect(tab(page, 'Play, 2 ballots due').locator('.gx-counter')).toHaveText('2');
    await expect(tab(page, 'Home')).toBeVisible();

    await pill(page).click();
    await expect(switcher(page)).toBeFocused();
    const rows = switcher(page).getByRole('list', { name: 'Leagues' }).getByRole('button');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Community');
    await expect(rows.nth(0)).toContainText('3 players');
    await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');
    await expect(rows.nth(1)).toContainText('Triple Threat');
    await expect(switcher(page)).not.toContainText('Fixture Elsewhere');
    await expect(switcher(page).getByText('Invitations')).toHaveCount(0);
    await phoneChecks(page);
    await leagueRow(page, 'Triple Threat').click();
    await expect(switcher(page)).toHaveCount(0);
    await expect(toast(page, 'Showing Triple Threat')).toBeVisible();
    await expect(pill(page)).toHaveAccessibleName('League: Triple Threat. Switch league');

    await page.reload();
    await expect(pill(page)).toHaveAccessibleName('League: Triple Threat. Switch league');
    expect(await page.evaluate(id => localStorage.getItem(`gtl.next.league.v1.${id}`), ACCOUNTS.luke.id)).toBe(JSON.stringify({ id: 'sean-troy-luke', name: 'Triple Threat' }));
    // Another account on this device has its own choice: Troy opens on the Community, with no ballot due.
    expect(await page.evaluate(id => localStorage.getItem(`gtl.next.league.v1.${id}`), ACCOUNTS.troy.id)).toBeNull();

    // A saved league this account is not in: the access-pending screen, with the way back.
    await page.evaluate(([id, league]) => localStorage.setItem(`gtl.next.league.v1.${id}`, JSON.stringify({ id: league, name: 'Fixture Elsewhere' })), [ACCOUNTS.luke.id, elsewhere]);
    await page.reload();
    await expect(title(page, 'Your spot is pending')).toBeVisible();
    await expect(page.getByText('Fixture Elsewhere isn’t open to this account yet.')).toBeVisible();
    await expect(pill(page)).toHaveAccessibleName('League: Fixture Elsewhere. Switch league');
    await tab(page, 'Lines').click();
    await expect(title(page, 'Your spot is pending')).toBeVisible();
    await phoneChecks(page);
    await page.getByRole('button', { name: 'Switch to Community' }).click();
    await expect(toast(page, 'Showing Community')).toBeVisible();
    await expect(title(page, 'Lines')).toBeVisible();
    await expect(pill(page)).toHaveAccessibleName('League: Community. Switch league');
    expect(await page.evaluate(id => localStorage.getItem(`gtl.next.league.v1.${id}`), ACCOUNTS.luke.id)).toBeNull();

    expect(writes(calls), 'browsing and switching leagues write nothing').toEqual([]);
    // One lobby read and one Community read per page load: shared by every screen that shows them.
    expect(calls.filter(call => call === READS[0])).toHaveLength(3);
    expect(calls.filter(call => call === READS[1])).toHaveLength(3);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the name step on an empty display name: typed text survives a reload; Continue saves it through /profile', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await forgetName(world, 'luke');
    const calls = apiCalls(page);
    await openNewApp(page, 'luke');
    await expect(nameStep(page)).toBeFocused();
    await expect(tabBar(page)).toHaveCount(0);
    expect(calls, 'the Community is not read before the account has a name').toEqual([READS[0]]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('.gx-solo [role=alert]')).toHaveText('Add a name first.');
    await nameField(page).fill('Luke Renamed');
    await expect(page.locator('.gx-solo-brand .gx-av')).toHaveText('LR');
    await phoneChecks(page);
    await page.reload();
    await expect(nameField(page)).toHaveValue('Luke Renamed');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(tabBar(page)).toBeVisible();
    await expect(toast(page, 'Your name is saved.')).toBeVisible();
    expect((await world.db.query('select display_name from public.gtl_profiles where user_id=$1', [ACCOUNTS.luke.id])).rows).toEqual([{ display_name: 'Luke Renamed' }]);
    expect(await draftKeys(page), 'the draft goes once the name is saved').toEqual([]);
    await page.getByRole('button', { name: 'Your menu' }).click();
    await expect(sheet(page, 'Menu')).toContainText('Signed in as luke@example.test');
    await expect(page.locator('.gx-topbar .gx-av')).toHaveText('LR');
    expect(writes(calls)).toEqual(['POST /functions/v1/gtl-api/profile']);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('invites: the saved link opens the switcher with Join and Dismiss; an expired link says so; an invite sent to his email joins', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    const friends = await createGroup(world, 'sean', 'Fixture Friends');
    const token = await invite(world, 'sean', friends, ACCOUNTS.luke.email);
    const rivals = await createGroup(world, 'troy', 'Fixture Rivals');
    await invite(world, 'troy', rivals, ACCOUNTS.luke.email);
    const calls = apiCalls(page);
    await openNewApp(page, 'luke', { fragment: `#invite=${token}` });
    await expect(switcher(page)).toBeVisible();
    expect(new URL(page.url()).hash, 'the link is not left in the address').not.toContain('invite');
    const invitations = switcher(page).getByRole('region', { name: 'Invitations' });
    await expect(invitations.getByText('You have an invite link')).toBeVisible();
    // The link's invite was also sent to his email, so it is listed too (the link alone does not say which league it is for).
    await expect(invitations.getByText('Sean Fixture invited you to Fixture Friends')).toBeVisible();
    await expect(invitations.getByText('Troy Fixture invited you to Fixture Rivals')).toBeVisible();
    await expect(invitations.getByText(/^Expires \w{3} \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M PT$/)).toHaveCount(2);
    await expect(switcher(page).locator('.gx-btn--primary')).toHaveCount(1);
    await phoneChecks(page);
    await switcher(page).getByRole('button', { name: 'Join with your invite link' }).click();
    await expect(switcher(page)).toHaveCount(0);
    await expect(toast(page, 'You’re in Fixture Friends')).toBeVisible();
    await expect(pill(page)).toHaveAccessibleName('League: Fixture Friends. Switch league');
    expect(await page.evaluate(() => sessionStorage.getItem('gtl.pendingInvitation'))).toBeNull();

    // The invite sent to his email, from the switcher.
    await pill(page).click();
    await expect(switcher(page).getByText('You have an invite link')).toHaveCount(0);
    await switcher(page).getByRole('button', { name: 'Join Fixture Rivals' }).click();
    await expect(toast(page, 'You’re in Fixture Rivals')).toBeVisible();
    await pill(page).click();
    await expect(switcher(page).getByRole('list', { name: 'Leagues' }).getByRole('button')).toHaveCount(4);
    await expect(switcher(page).getByRole('region', { name: 'Invitations' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect((await world.db.query('select league_id from public.gtl_memberships where user_id=$1 and active order by league_id', [ACCOUNTS.luke.id])).rows.map(r => r.league_id).sort())
      .toEqual([friends, rivals, 'sean-troy-luke'].sort());
    expect(writes(calls)).toEqual(['POST /functions/v1/gtl-api/invite/accept', 'POST /functions/v1/gtl-api/invite/accept']);

    // An expired link: the server's words in the card, and Dismiss forgets the link.
    const late = await createGroup(world, 'troy', 'Fixture Late');
    const stale = await invite(world, 'troy', late, ACCOUNTS.luke.email);
    await world.db.query("update public.gtl_invites set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where league_id=$1", [late]);
    await page.goto('about:blank');
    await page.goto(`/#invite=${stale}`);
    await expect(switcher(page)).toBeVisible();
    await switcher(page).getByRole('button', { name: 'Join with your invite link' }).click();
    await expect(switcher(page).getByRole('alert').filter({ hasText: 'This invitation is unavailable, expired, or belongs to another email address.' })).toBeVisible();
    await switcher(page).getByRole('button', { name: 'Dismiss your invite link' }).click();
    await expect(switcher(page).getByText('You have an invite link')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('gtl.pendingInvitation'))).toBeNull();
    await page.reload();
    await expect(tabBar(page)).toBeVisible();
    await expect(switcher(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a sign-in that ran out (401): "Sign in again" keeps the typed name, signs the same account in here, and the save then goes through', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await forgetName(world, 'luke');
    await openNewApp(page, 'luke');
    await nameField(page).fill('Luke Kept');
    // The server stops accepting this token (it ran out); the browser still holds it.
    const { access_token: token } = world.sessions[ACCOUNTS.luke.email];
    const user = world.users.get(token);
    world.users.delete(token);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(signInAgain(page)).toBeVisible();
    await expect(signInAgain(page)).toContainText('Signed in as luke@example.test');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
    await expect(page.locator('.gx-solo [role=alert]')).toHaveText('Sign in again to save your name. What you typed is still here.');
    await expect(nameField(page)).toHaveValue('Luke Kept');
    expect(await axe(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('next-data-sign-in-again-390-dark.png') });

    // Signing in again here (a fresh token): the screen never leaves, so the name is still there.
    world.users.set(token, user);
    await page.getByLabel('Password', { exact: true }).fill('test-password');
    await signInAgain(page).getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(signInAgain(page)).toBeHidden();
    await expect(nameField(page)).toHaveValue('Luke Kept');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(tabBar(page)).toBeVisible();

    // A read answered 401 asks too (back online reads again); "Not now" closes it and keeps the screen.
    world.users.delete(token);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(signInAgain(page)).toBeVisible();
    await signInAgain(page).getByRole('button', { name: 'Not now' }).click();
    await expect(signInAgain(page)).toBeHidden();
    await expect(tabBar(page)).toBeVisible();
    world.users.set(token, user);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('an account the commissioner removed from the Community sees why, keeps its groups, and the frame still works', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    expect((await world.api('sean', 'community/member', { userId: ACCOUNTS.troy.id, member: false })).body).toEqual({ userId: ACCOUNTS.troy.id, member: false });
    const calls = apiCalls(page);
    await openNewApp(page, 'troy');
    await expect(title(page, 'Not in the Community')).toBeVisible();
    await expect(page.getByText('Everything you entered is kept.', { exact: false })).toBeVisible();
    await expect(tab(page, 'Play')).toBeVisible();
    await tab(page, 'League').click();
    await expect(title(page, 'Not in the Community')).toBeVisible();
    await phoneChecks(page);
    await page.getByRole('button', { name: 'Your leagues' }).click();
    await leagueRow(page, 'Triple Threat').click();
    await expect(title(page, 'League')).toBeVisible();
    await expect(pill(page)).toHaveAccessibleName('League: Triple Threat. Switch league');
    expect(writes(calls)).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a second account in the same tab sees no drafts from the first', async ({ page, baseURL }) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await forgetName(world, 'luke');
    await forgetName(world, 'troy');
    await openNewApp(page, 'luke');
    await nameField(page).fill('Luke Draft');
    expect(await draftKeys(page)).toHaveLength(1);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Your games. Any device.' })).toBeVisible();
    expect(await draftKeys(page), 'signing out clears the new app\'s drafts').toEqual([]);
    await signIn(page, 'troy', { navigate: false });
    await expect(nameStep(page)).toBeVisible();
    await expect(nameField(page)).toHaveValue('');
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('Luke Draft');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('axe in dark and light at 390 and 320: the switcher with invites, the name step, the access-pending and removed screens; 390 screenshots', async ({ page, baseURL }, testInfo) => {
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    const friends = await createGroup(world, 'sean', 'Fixture Friends');
    await invite(world, 'sean', friends, ACCOUNTS.luke.email);
    await forgetName(world, 'troy');
    await openNewApp(page, 'luke');
    await expect(tabBar(page)).toBeVisible();
    const found = {};
    const shoot = async (name, theme, width) => {
      found[`${name} ${theme} ${width}`] = await axe(page);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath(`next-data-${name}-390-${theme}.png`) });
    };
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('about:blank');
        await page.goto('/#groups');
        await expect(switcher(page)).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await phoneChecks(page);
        await shoot('switcher', theme, width);
        await page.keyboard.press('Escape');
        await page.evaluate(id => localStorage.setItem(`gtl.next.league.v1.${id}`, JSON.stringify({ id: `g_${'c'.repeat(32)}`, name: 'Fixture Gone' })), ACCOUNTS.luke.id);
        await page.reload();
        await expect(title(page, 'Your spot is pending')).toBeVisible();
        await phoneChecks(page);
        await shoot('pending', theme, width);
        await page.evaluate(id => localStorage.removeItem(`gtl.next.league.v1.${id}`), ACCOUNTS.luke.id);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    // The name step and the removed screen, as Troy (no name yet, then removed from the Community).
    await page.getByRole('button', { name: 'Your menu' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, 'troy', { navigate: false });
    await expect(nameStep(page)).toBeVisible();
    await world.db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [ACCOUNTS.troy.id, 'Troy Fixture']);
    await world.api('sean', 'community/member', { userId: ACCOUNTS.troy.id, member: false });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await world.db.query('delete from public.gtl_community_removals where user_id=$1', [ACCOUNTS.troy.id]);
        await world.db.query('delete from public.gtl_profiles where user_id=$1', [ACCOUNTS.troy.id]);
        await page.reload();
        await expect(nameStep(page)).toBeVisible();
        await phoneChecks(page);
        await shoot('name-step', theme, width);
        await world.db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [ACCOUNTS.troy.id, 'Troy Fixture']);
        await world.api('sean', 'community/member', { userId: ACCOUNTS.troy.id, member: false });
        await page.reload();
        await expect(title(page, 'Not in the Community')).toBeVisible();
        await phoneChecks(page);
        await shoot('removed', theme, width);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    expect(found).toEqual(Object.fromEntries(Object.keys(found).map(key => [key, []])));
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
