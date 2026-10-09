import { expect } from '@playwright/test';
import { test, signIn } from '../fixtures/cloud-ui.mjs';

const loaded = (fixture, name) => fixture.chunks.filter(url => url.match(new RegExp(`/assets/${name}-[^/]+\\.js$`)));

test('sign-in, lobby, league and optional screens load only the code they use', async ({ page, fixture }) => {
  await page.goto('/');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  for (const name of ['App', 'GameHub', 'BrandLab', 'PersonalWorkspace', 'SocialBetTracker']) expect(loaded(fixture, name)).toHaveLength(0);
  expect(fixture.apiRequests).toHaveLength(0);
  await signIn(page);
  expect(loaded(fixture, 'GameHub')).toHaveLength(1);
  for (const name of ['App', 'BrandLab', 'PersonalWorkspace', 'SocialBetTracker']) expect(loaded(fixture, name)).toHaveLength(0);
  expect(fixture.apiRequests.every(request => request.pathname.endsWith('/lobby'))).toBe(true);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.', exact: true })).toBeVisible();
  expect(loaded(fixture, 'App')).toHaveLength(1);
  for (const name of ['BrandLab', 'PersonalWorkspace', 'SocialBetTracker']) expect(loaded(fixture, name)).toHaveLength(0);
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.locator('.prediction-input input')).toHaveCount(15);
  await page.getByRole('button', { name: 'Design lab', exact: false }).click();
  await expect(page.getByRole('heading', { name: '01 / Primary logo', exact: true })).toBeVisible();
  expect(loaded(fixture, 'BrandLab')).toHaveLength(1);
  await page.getByRole('button', { name: 'Bet Tracker', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The bet feed', exact: true })).toBeVisible();
  expect(loaded(fixture, 'SocialBetTracker')).toHaveLength(1);
});

test('a delayed optional chunk shows a status and leaves the pick route usable', async ({ page, fixture }) => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/BrandLab-*.js', async route => { await waiting; await route.continue(); });
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Design lab', exact: false }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Loading design lab' })).toBeVisible();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.locator('.prediction-input input')).toHaveCount(15);
  release();
  await page.getByRole('button', { name: 'Design lab', exact: false }).click();
  await expect(page.getByRole('heading', { name: '01 / Primary logo', exact: true })).toBeVisible();
  expect(fixture.apiRequests.filter(request => request.method !== 'GET' && !request.pathname.endsWith('/social/read'))).toHaveLength(0);
});

test('a failed optional chunk stays contained and recovers only after explicit reload', async ({ page, fixture }) => {
  const blocked = '**/assets/BrandLab-*.js';
  await page.route(blocked, route => route.abort('failed'));
  await page.goto('/'); await signIn(page);
  await page.getByRole('button', { name: 'Open game', exact: true }).click();
  await page.getByRole('button', { name: 'Design lab', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('This screen couldn’t load');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My picks', exact: true }).click();
  await expect(page.locator('.prediction-input input')).toHaveCount(15);
  await page.getByRole('button', { name: 'Design lab', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('This screen couldn’t load');
  await page.unroute(blocked);
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The weekly huddle.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Design lab', exact: false }).click();
  await expect(page.getByRole('heading', { name: '01 / Primary logo', exact: true })).toBeVisible();
  expect(fixture.apiRequests.filter(request => request.method !== 'GET' && !request.pathname.endsWith('/social/read'))).toHaveLength(0);
});
