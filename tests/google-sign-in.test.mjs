import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window ||= { location: { origin: 'https://guess-the-line.pages.dev', hash: '', search: '', pathname: '/' }, history: { replaceState() {} } };
const { oauthMessage, startGoogleSignIn, PROVIDER_DISABLED, OAUTH_CANCELLED, OAUTH_FAILED } = await import('../web/src/oauth.js');

const client = (error = null) => {
  const calls = [];
  return { calls, auth: { signInWithOAuth: async options => { calls.push(options); return { data: {}, error }; } } };
};
const settings = google => async () => ({ ok: true, json: async () => ({ external: { email: true, google } }) });

test('Google sign-in calls Supabase with the google provider and this origin as the redirect', async () => {
  const supabase = client();
  await startGoogleSignIn(supabase, { url: 'https://example.supabase.co', key: 'sb_publishable_test', fetcher: settings(true) });
  assert.deepEqual(supabase.calls, [{ provider: 'google', options: { redirectTo: 'https://guess-the-line.pages.dev' } }]);
});

test('a disabled provider is reported in plain words before any redirect', async () => {
  const supabase = client();
  await assert.rejects(startGoogleSignIn(supabase, { url: 'https://example.supabase.co', key: 'sb_publishable_test', fetcher: settings(false) }), { message: PROVIDER_DISABLED });
  assert.equal(supabase.calls.length, 0);
});

test('an unreachable settings check still proceeds to the redirect', async () => {
  const supabase = client();
  await startGoogleSignIn(supabase, { url: 'https://example.supabase.co', key: 'sb_publishable_test', fetcher: async () => { throw new TypeError('offline'); } });
  assert.equal(supabase.calls.length, 1);
});

test('provider errors are mapped to plain words and raw provider text is never shown', async () => {
  await assert.rejects(startGoogleSignIn(client({ message: 'Unsupported provider: provider is not enabled' })), { message: PROVIDER_DISABLED });
  assert.equal(oauthMessage('access_denied The user denied the request'), OAUTH_CANCELLED);
  assert.equal(oauthMessage('server_error Something internal'), OAUTH_FAILED);
  assert.equal(PROVIDER_DISABLED, 'Google sign-in isn’t switched on yet. Use email for now.');
});

test('the production CSP does not block the OAuth redirect or the session check after it', () => {
  const headers = fs.readFileSync('web/public/_headers', 'utf8');
  const csp = headers.match(/Content-Security-Policy:\s*(.+)/)[1];
  // Top-level navigation to Supabase Auth and Google is not governed by connect-src or form-action, and navigate-to is not set.
  assert.doesNotMatch(csp, /navigate-to/);
  assert.match(csp, /form-action 'self'/);
  // After the return, supabase-js reads the session from the fragment and checks it against the project's Auth API.
  assert.match(csp, /connect-src 'self' https:\/\/onmrgvcehkflfaizvedl\.supabase\.co/);
  // Google Fonts (PR #54) may appear in style-src and font-src; the sign-in flow itself needs no Google origin anywhere.
  assert.doesNotMatch(csp, /accounts\.google\.com|googleusercontent\.com/i);
  for (const directive of ['connect-src', 'form-action', 'script-src', 'frame-src', 'default-src']) {
    const value = csp.split(';').map(part => part.trim()).find(part => part.startsWith(directive)) || '';
    assert.doesNotMatch(value, /google/i, `${directive} must not need a Google origin for sign-in`);
  }
  const server = fs.readFileSync('server/index.mjs', 'utf8');
  assert.doesNotMatch(server, /navigate-to/);
});
