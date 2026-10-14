import { expect } from '@playwright/test';
import { test, signIn } from '../fixtures/cloud-ui.mjs';

// Optional screens ship as their own chunks; the pick route must never wait on them.
const loaded = (fixture, name) => fixture.chunks.filter(url => url.match(new RegExp(`/assets/${name}-[^/]+\\.js$`)));
const optional = ['BrandLab', 'PersonalWorkspace', 'SocialBetTracker'];
async function navigate(page, name) {
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name, exact: true }).click();
}
const noWrites = fixture => expect(fixture.apiRequests.filter(request => request.method !== 'GET' && !request.pathname.endsWith('/social/read'))).toHaveLength(0);

test('sign-in, lobby, league and optional screens load only the code they use', async ({ page, fixture }) => {
  await page.goto('/');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  for (const name of ['App', 'GameHub', 'NextApp', ...optional]) expect(loaded(fixture, name)).toHaveLength(0);
  expect(fixture.apiRequests).toHaveLength(0);
  await signIn(page);
  expect(loaded(fixture, 'GameHub')).toHaveLength(1);
  // Redesign stage 9: the old app never downloads the new app's chunk.
  for (const name of ['App', 'NextApp', ...optional]) expect(loaded(fixture, name)).toHaveLength(0);
  expect(fixture.apiRequests.every(request => request.pathname.endsWith('/lobby'))).toBe(true);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.', exact: true })).toBeVisible();
  expect(loaded(fixture, 'App')).toHaveLength(1);
  for (const name of optional) expect(loaded(fixture, name)).toHaveLength(0);
  await navigate(page, 'My picks');
  await expect(page.locator('.chip-picker')).toHaveCount(15);
  // Decision 4 (October 12): a player never sees the commissioner-only Design lab, so its chunk is never fetched.
  // The commissioner path (and the chunk loading on demand) is covered by tests/browser/dashboard.spec.js.
  await expect(page.getByRole('button', { name: /Design lab/ })).toHaveCount(0);
  expect(loaded(fixture, 'BrandLab')).toHaveLength(0);
  await navigate(page, 'Bet Tracker');
  await expect(page.getByRole('heading', { name: 'The bet feed', exact: true })).toBeVisible();
  expect(loaded(fixture, 'SocialBetTracker')).toHaveLength(1);
  expect(loaded(fixture, 'PersonalWorkspace')).toHaveLength(0);
  expect(loaded(fixture, 'NextApp')).toHaveLength(0);
  noWrites(fixture);
});

// Redesign stage 9 (D-38, D-39): a device that chose the new app loads only its chunk, never the old app's screens.
test('a device that chose the new app loads NextApp and none of the old app\'s screens', async ({ page, fixture }) => {
  await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* Private mode: the old app opens. */ } });
  await page.goto('/');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  for (const name of ['App', 'GameHub', 'NextApp', ...optional]) expect(loaded(fixture, name)).toHaveLength(0);
  await page.getByLabel('Email', { exact: true }).fill('player@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home', level: 1, exact: true })).toBeVisible();
  expect(loaded(fixture, 'NextApp')).toHaveLength(1);
  for (const name of ['App', 'GameHub', ...optional]) expect(loaded(fixture, name)).toHaveLength(0);
  // Stage 11: the data layer reads the account (this fixture answers the Community read as undeployed); no writes.
  expect(fixture.apiRequests).toEqual([{ pathname: '/functions/v1/gtl-api/lobby', method: 'GET' }]);
});

test('a delayed optional chunk shows a status and leaves the pick route usable', async ({ page, fixture }) => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/SocialBetTracker-*.js', async route => { await waiting; await route.continue(); });
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await navigate(page, 'Bet Tracker');
  await expect(page.getByRole('status').filter({ hasText: 'Loading bet tracker' })).toBeVisible();
  await navigate(page, 'My picks');
  await expect(page.locator('.chip-picker')).toHaveCount(15);
  release();
  await navigate(page, 'Bet Tracker');
  await expect(page.getByRole('heading', { name: 'The bet feed', exact: true })).toBeVisible();
  noWrites(fixture);
});

test('a failed optional chunk stays contained and recovers only after explicit reload', async ({ page, fixture }) => {
  const blocked = '**/assets/SocialBetTracker-*.js';
  await page.route(blocked, route => route.abort('failed'));
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await navigate(page, 'Bet Tracker');
  await expect(page.getByRole('alert')).toContainText('This screen couldn’t load');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await navigate(page, 'My picks');
  await expect(page.locator('.chip-picker')).toHaveCount(15);
  await navigate(page, 'Bet Tracker');
  await expect(page.getByRole('alert')).toContainText('This screen couldn’t load');
  await page.unroute(blocked);
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.', exact: true })).toBeVisible();
  await navigate(page, 'Bet Tracker');
  await expect(page.getByRole('heading', { name: 'The bet feed', exact: true })).toBeVisible();
  noWrites(fixture);
});
