import { test as base, expect } from '@playwright/test';
import { isWebfont } from '../fixtures/webfonts.mjs';

// Redesign stage 76 (sign-in skin, code only): the Supabase Auth requests the sign-in screen sends, at 390 x 844.
// AuthGate's logic moved into useAuthSession() and useSignInForm(); this spec pins each request's method, path, query
// and body, and what the screen shows after it, so the split cannot change what reaches Supabase. Supabase Auth is
// mocked locally: no request leaves the machine and no real account is used. "Continue with Google" is pinned by
// google-sign-in.spec.js.
const SUPABASE = 'https://gtl-frontend-check.supabase.co';
const EMAIL = 'player@example.test';

const test = base.extend({
  auth: async ({ page, baseURL }, use) => {
    const auth = { calls: [], errors: [], signupSession: false };
    const user = {
      id: '33333333-3333-4333-8333-333333333333', aud: 'authenticated', role: 'authenticated', email: EMAIL,
      email_confirmed_at: '2026-11-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] },
      identities: [{ provider: 'email' }], user_metadata: {}, created_at: '2026-11-01T00:00:00Z',
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    auth.token = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: user.id, aud: user.aud, role: user.role, email: user.email, exp: expires })).toString('base64url'),
      'test-signature',
    ].join('.');
    const session = { access_token: auth.token, refresh_token: 'local_test_refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
    page.on('pageerror', error => auth.errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === new URL(baseURL).origin) return route.continue();
      if (isWebfont(request.url())) return route.abort();
      if (url.origin !== SUPABASE) { auth.errors.push(`Unexpected external request: ${url.origin}`); return route.abort(); }
      const reply = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (url.pathname.startsWith('/auth/v1/')) {
        expect(request.headers().apikey).toBe('sb_publishable_frontend_test_only');
        const body = request.postData() ? request.postDataJSON() : null;
        auth.calls.push({ method: request.method(), path: url.pathname, query: Object.fromEntries(url.searchParams), body });
        if (url.pathname === '/auth/v1/token') {
          return body?.password === 'wrong-password'
            ? reply(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
            : reply(200, session);
        }
        if (url.pathname === '/auth/v1/signup') return reply(200, auth.signupSession ? session : { user: { ...user, email_confirmed_at: null }, session: null });
        if (['/auth/v1/resend', '/auth/v1/recover', '/auth/v1/logout'].includes(url.pathname)) return reply(200, {});
        if (url.pathname === '/auth/v1/user') {
          if (request.headers().authorization !== `Bearer ${auth.token}`) return reply(401, { message: 'Invalid token.' });
          return reply(200, user);
        }
        auth.errors.push(`Unexpected auth endpoint: ${url.pathname}`);
        return reply(404, { error: 'Unexpected test endpoint' });
      }
      if (url.pathname === '/functions/v1/gtl-api/lobby') return reply(200, { profile: { id: user.id, displayName: 'Test Player' }, leagues: [], pendingInvites: [] });
      // The new app's other reads answer as not deployed; anything outside gtl-api fails the test.
      if (url.pathname.startsWith('/functions/v1/gtl-api/')) return reply(404, { error: 'Not found.' });
      auth.errors.push(`Unexpected mocked endpoint: ${url.pathname}`);
      return reply(404, { error: 'Unexpected test endpoint' });
    });
    await use(auth);
    expect(auth.errors).toEqual([]);
  },
});

test.use({ viewport: { width: 390, height: 844 } });

const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const formButton = (page, name) => page.locator('form.auth-form').getByRole('button', { name, exact: true });
const origin = baseURL => new URL(baseURL).origin;

test('email sign-in: a refused password keeps what was typed; the next try is one password grant, then the app', async ({ page, auth }) => {
  await page.goto('/');
  await expect(heading(page, 'Your games. Any device.')).toBeVisible();
  await field(page, 'Email').fill(EMAIL);
  await field(page, 'Password').fill('wrong-password');
  await formButton(page, 'Sign in').click();
  await expect(page.getByRole('alert')).toHaveText('Invalid login credentials');
  await expect(field(page, 'Email')).toHaveValue(EMAIL);
  await expect(field(page, 'Password')).toHaveValue('wrong-password');
  await field(page, 'Password').fill('local-test-password');
  await formButton(page, 'Sign in').click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(auth.calls).toEqual([
    { method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, body: { email: EMAIL, password: 'wrong-password', gotrue_meta_security: {} } },
    { method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, body: { email: EMAIL, password: 'local-test-password', gotrue_meta_security: {} } },
  ]);
});

test('create account without a session: one signup that returns to this origin, then the confirmation card and a resend wait', async ({ page, auth, baseURL }) => {
  await page.goto('/');
  await page.locator('.auth-tabs').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(heading(page, 'Start your next rivalry.')).toBeVisible();
  await expect(field(page, 'Password')).toHaveAttribute('minlength', '8');
  await field(page, 'Email').fill(EMAIL);
  await field(page, 'Password').fill('new-local-password');
  await formButton(page, 'Create account').click();
  await expect(heading(page, 'Check your email.')).toBeVisible();
  const card = page.locator('.auth-mail-card');
  await expect(card.locator('strong')).toHaveText(EMAIL);
  await expect(card).toContainText('Check your email for a confirmation link, then return here to sign in.');
  await expect(page.getByRole('button', { name: /^Resend available in \d+s$/ })).toBeDisabled();
  expect(auth.calls).toEqual([
    { method: 'POST', path: '/auth/v1/signup', query: { redirect_to: origin(baseURL) }, body: { email: EMAIL, password: 'new-local-password', data: {}, gotrue_meta_security: {}, code_challenge: null, code_challenge_method: null } },
  ]);
  // Return to sign in keeps the address, clears the password and still waits before another resend.
  await page.getByRole('button', { name: 'Return to sign in', exact: true }).click();
  await expect(heading(page, 'Your games. Any device.')).toBeVisible();
  await expect(field(page, 'Email')).toHaveValue(EMAIL);
  await expect(field(page, 'Password')).toHaveValue('');
  await expect(page.locator('.auth-support').getByRole('button', { name: /^Resend available in \d+s$/ })).toBeDisabled();
  expect(auth.calls).toHaveLength(1);
});

test('create account that returns a session signs straight in, with no confirmation card', async ({ page, auth, baseURL }) => {
  auth.signupSession = true;
  await page.goto('/');
  await page.locator('.auth-tabs').getByRole('button', { name: 'Create account', exact: true }).click();
  await field(page, 'Email').fill(EMAIL);
  await field(page, 'Password').fill('new-local-password');
  await formButton(page, 'Create account').click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(auth.calls.map(call => [call.method, call.path, call.query])).toEqual([['POST', '/auth/v1/signup', { redirect_to: origin(baseURL) }]]);
});

test('resend confirmation: no request until an address is typed, then one signup resend that returns to this origin', async ({ page, auth, baseURL }) => {
  await page.goto('/');
  const resend = page.locator('.auth-support').getByRole('button', { name: 'Resend confirmation email', exact: true });
  await resend.click();
  await expect(page.getByRole('alert')).toHaveText('Enter your email address above first.');
  expect(auth.calls).toEqual([]);
  await field(page, 'Email').fill(EMAIL);
  await resend.click();
  await expect(page.getByRole('status')).toHaveText('If your account needs confirmation, look for a confirmation link in your email.');
  await expect(page.locator('.auth-support').getByRole('button', { name: /^Resend available in \d+s$/ })).toBeDisabled();
  expect(auth.calls).toEqual([
    { method: 'POST', path: '/auth/v1/resend', query: { redirect_to: origin(baseURL) }, body: { email: EMAIL, type: 'signup', gotrue_meta_security: {}, code_challenge: null, code_challenge_method: null } },
  ]);
});

test('forgot password: one recover request that returns to this origin; the notice never says whether the account exists', async ({ page, auth, baseURL }) => {
  await page.goto('/');
  await field(page, 'Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await expect(heading(page, 'Get back in the game.')).toBeVisible();
  await expect(field(page, 'Password')).toHaveCount(0);
  await formButton(page, 'Send reset link').click();
  await expect(page.getByRole('status')).toHaveText('If this address has a game account, look for a password reset link in your email.');
  expect(auth.calls).toEqual([
    { method: 'POST', path: '/auth/v1/recover', query: { redirect_to: origin(baseURL) }, body: { email: EMAIL, gotrue_meta_security: {}, code_challenge: null, code_challenge_method: null } },
  ]);
  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await expect(heading(page, 'Your games. Any device.')).toBeVisible();
  await expect(field(page, 'Email')).toHaveValue(EMAIL);
});

const recoveryLink = auth => `/#type=recovery&access_token=${auth.token}&refresh_token=local_test_refresh&expires_in=3600&token_type=bearer`;

test('password recovery link: a mismatch sends nothing; a match is one password update, then the app', async ({ page, auth }) => {
  await page.goto(recoveryLink(auth));
  await expect(heading(page, 'Choose a new password.')).toBeVisible();
  await expect(field(page, 'Email')).toHaveCount(0);
  const before = auth.calls.length;
  await field(page, 'New password').fill('new-local-password');
  await field(page, 'Confirm new password').fill('different-password');
  await formButton(page, 'Save new password').click();
  await expect(page.getByRole('alert')).toHaveText('The passwords do not match. Please enter them again.');
  expect(auth.calls.slice(before)).toEqual([]);
  await field(page, 'Confirm new password').fill('new-local-password');
  await formButton(page, 'Save new password').click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(auth.calls.slice(before)).toEqual([
    { method: 'PUT', path: '/auth/v1/user', query: {}, body: { password: 'new-local-password', code_challenge: null, code_challenge_method: null } },
  ]);
});

test('password recovery link: Cancel and sign out signs out this device only and returns to sign in', async ({ page, auth }) => {
  await page.goto(recoveryLink(auth));
  await expect(heading(page, 'Choose a new password.')).toBeVisible();
  const before = auth.calls.length;
  await page.getByRole('button', { name: 'Cancel and sign out', exact: true }).click();
  await expect(heading(page, 'Your games. Any device.')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  expect(auth.calls.slice(before)).toEqual([{ method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, body: null }]);
});
