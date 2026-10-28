import { expect } from '@playwright/test';
import { test } from '../fixtures/cloud-ui.mjs';

// Optional screens ship as their own chunks; the pick route must never wait on them.
const loaded = (fixture, name) => fixture.chunks.filter(url => url.match(new RegExp(`/assets/${name}-[^/]+\\.js$`)));
const optional = ['BrandLab', 'PersonalWorkspace', 'SocialBetTracker'];

// The new app is the only app (D-60 step 2): it loads only its chunk; the local-only App and the optional screens stay unloaded.
test('the new app loads NextApp and none of the optional or local-only screens', async ({ page, fixture }) => {
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
  // Home reads the account and preferences; this fixture answers Community reads as undeployed. No writes.
  expect(fixture.apiRequests).toEqual([{ pathname: '/functions/v1/gtl-api/lobby', method: 'GET' }, { pathname: '/functions/v1/gtl-api/me/preferences', method: 'POST' }]);
});
