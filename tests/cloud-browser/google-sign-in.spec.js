import { test as base, expect } from '@playwright/test';
import { isWebfont } from '../fixtures/webfonts.mjs';

// "Continue with Google" with Supabase Auth mocked locally. No request reaches Google or a real Supabase project: the
// authorize navigation is answered with the redirect Supabase would send after a successful Google consent.
const SUPABASE = 'https://gtl-frontend-check.supabase.co';
const INVITE = 'invite_token_for_google_round_trip_0123';

const test = base.extend({
  auth: async ({ page, baseURL }, use) => {
    const auth = { googleEnabled: true, authorize: [], settings: 0, passwordSignIns: 0, lobbyCalls: 0, errors: [] };
    const user = {
      id: '22222222-2222-4222-8222-222222222222', aud: 'authenticated', role: 'authenticated', email: 'player@example.test',
      email_confirmed_at: '2026-10-12T00:00:00Z',
      app_metadata: { provider: 'google', providers: ['email', 'google'] },
      identities: [{ provider: 'email' }, { provider: 'google' }],
      user_metadata: { full_name: 'Local Test Player' }, created_at: '2026-10-08T00:00:00Z',
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: user.id, aud: user.aud, role: user.role, email: user.email, exp: expires })).toString('base64url'),
      'test-signature',
    ].join('.');
    auth.token = token;
    page.on('pageerror', error => auth.errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(request.url())) return route.abort(); // Google Fonts (#54) only; every other external origin still fails the test.
      if (url.origin !== SUPABASE) { auth.errors.push(`Unexpected external request: ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/settings') {
        auth.settings++;
        expect(request.headers().apikey).toBe('sb_publishable_frontend_test_only');
        return reply(200, { external: { email: true, google: auth.googleEnabled }, disable_signup: false });
      }
      if (url.pathname === '/auth/v1/authorize') {
        auth.authorize.push(Object.fromEntries(url.searchParams));
        const fragment = new URLSearchParams({ access_token: token, expires_at: String(expires), expires_in: '3600', refresh_token: 'local_test_refresh', token_type: 'bearer', provider_token: 'local_provider_token' });
        return route.fulfill({ status: 302, headers: { location: `${url.searchParams.get('redirect_to')}#${fragment}` } });
      }
      if (url.pathname === '/auth/v1/user') return reply(200, user);
      if (url.pathname === '/auth/v1/token') {
        auth.passwordSignIns++;
        return reply(200, { access_token: token, refresh_token: 'local_test_refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user: { ...user, app_metadata: { provider: 'email', providers: ['email', 'google'] } } });
      }
      if (url.pathname === '/auth/v1/logout') return reply(200, {});
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      if (url.pathname === '/functions/v1/gtl-api/lobby') {
        auth.lobbyCalls++;
        expect(request.headers().authorization).toBe(`Bearer ${token}`);
        return reply(200, { profile: { id: user.id, displayName: 'Test Player' }, leagues: [], pendingInvites: [] });
      }
      // The new app's other reads (preferences, Community, week) answer as not deployed; anything outside gtl-api fails the test.
      if (url.pathname.startsWith('/functions/v1/gtl-api/')) return reply(404, { error: 'Not found.' });
      auth.errors.push(`Unexpected mocked endpoint: ${url.pathname}`);
      return reply(404, { error: 'Unexpected test endpoint' });
    });
    await use(auth);
    expect(auth.errors).toEqual([]);
  },
});

const googleButton = page => page.getByRole('button', { name: 'Continue with Google', exact: true });

for (const theme of ['light', 'dark']) for (const width of [320, 390, 1440]) {
  test(`the Google button renders at ${width}px in ${theme} with a 44px target, 16px text and tokens only`, async ({ page, auth }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByLabel('Color theme').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const screen of ['Sign in', 'Create account']) {
      await page.locator('.auth-tabs').getByRole('button', { name: screen, exact: true }).click();
      const button = googleButton(page);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
      const box = await button.boundingBox(), email = await page.getByLabel('Email', { exact: true }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y + box.height).toBeLessThan(email.y);
      // Sample settled colors, not a mid-transition blend after the theme switch.
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      const style = await button.evaluate(element => {
        const css = getComputedStyle(element), root = getComputedStyle(document.documentElement), probe = document.createElement('span');
        document.body.append(probe);
        const resolve = name => { probe.style.color = root.getPropertyValue(name).trim(); return getComputedStyle(probe).color; };
        const result = { fontSize: css.fontSize, color: css.color, background: css.backgroundColor, border: css.borderTopColor, text: resolve('--text'), surface: resolve('--surface'), line: resolve('--border') };
        probe.remove(); return result;
      });
      expect(style.fontSize).toBe('16px');
      expect(style.color).toBe(style.text);
      expect(style.background).toBe(style.surface);
      expect(style.border).toBe(style.line);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`google-sign-in-${theme}-${width}.png`), fullPage: true });
    expect(auth.settings).toBe(0);
    expect(auth.authorize).toHaveLength(0);
  });
}

test('the Google button asks Supabase for the google provider and returns to this origin, then lands in the account', async ({ page, auth, baseURL }) => {
  await page.goto('/');
  await googleButton(page).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(auth.settings).toBe(1);
  expect(auth.authorize).toHaveLength(1);
  expect(auth.authorize[0].provider).toBe('google');
  expect(auth.authorize[0].redirect_to).toBe(new URL(baseURL).origin);
  expect(auth.passwordSignIns).toBe(0);
  expect(new URL(page.url()).hash).not.toContain('access_token');
});

test('a pending invitation survives the Google round trip and is offered after sign-in', async ({ page, auth }) => {
  await page.goto(`/#invite=${INVITE}`);
  await expect(page.getByText('Use the Google account or email address that was invited')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.locator('.auth-tabs').getByRole('button', { name: 'Create account', exact: true }).click();
  await googleButton(page).click();
  // The new app opens Your leagues with the saved invite link first.
  await expect(page.getByRole('dialog', { name: 'Your leagues' }).getByText('You have an invite link', { exact: true })).toBeVisible();
  expect(auth.authorize).toHaveLength(1);
  expect(auth.authorize[0].redirect_to).not.toContain(INVITE);
  expect(await page.evaluate(() => sessionStorage.getItem('gtl.pendingInvitation'))).toBe(INVITE);
  await expect(page.getByRole('dialog', { name: 'Your leagues' }).getByRole('button', { name: 'Join with your invite link', exact: true })).toBeEnabled();
});

test('a provider that is not switched on yet shows the plain message and keeps email sign-in available', async ({ page, auth }) => {
  auth.googleEnabled = false;
  await page.goto('/');
  await googleButton(page).click();
  await expect(page.getByRole('alert')).toHaveText('Google sign-in isn’t switched on yet. Use email for now.');
  expect(auth.authorize).toHaveLength(0);
  await expect(googleButton(page)).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill('player@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(auth.passwordSignIns).toBe(1);
});

test('an error returned from the Google redirect is shown in plain words and removed from the address bar', async ({ page }) => {
  await page.goto('/#error=access_denied&error_code=access_denied&error_description=The+user+denied+the+request');
  await expect(page.getByRole('alert')).toHaveText('Google sign-in was cancelled. Try again, or use email.');
  await expect(page.getByText('denied the request')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  await page.goto('/?error=server_error&error_description=Unsupported+provider%3A+provider+is+not+enabled');
  await expect(page.getByRole('alert')).toHaveText('Google sign-in isn’t switched on yet. Use email for now.');
  // Only the error parameters go.
  expect([...new URL(page.url()).searchParams.keys()]).toEqual([]);
});

test('email sign-in is unchanged and never contacts the Google path', async ({ page, auth }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('player@example.test');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(auth.passwordSignIns).toBe(1);
  expect(auth.settings).toBe(0);
  expect(auth.authorize).toHaveLength(0);
});
