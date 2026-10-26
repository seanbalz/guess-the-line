// Contract: the sign-in screen waits for Supabase only when a saved session may exist or the address is a sign-in
// return; a first-time or signed-out visitor gets the form at once, so the card does not jump (layout shift).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signInMayBePending } from '../web/src/signInPending.js';

const storage = keys => ({ length: keys.length, key: index => keys[index] ?? null });
const at = (search = '', hash = '') => ({ search, hash });

test('a signed-out visitor with no saved session gets the form at once', () => {
  assert.equal(signInMayBePending({ storage: storage([]), location: at() }), false);
  assert.equal(signInMayBePending({ storage: storage(['gtl-theme', 'gtl:invite']), location: at('', '#home') }), false);
});

test('a saved Supabase session makes it wait for the session check', () => {
  assert.equal(signInMayBePending({ storage: storage(['gtl-theme', 'sb-onmrgvcehkflfaizvedl-auth-token']), location: at() }), true);
  assert.equal(signInMayBePending({ storage: storage(['sb-onmrgvcehkflfaizvedl-auth-token-code-verifier']), location: at() }), false, 'a leftover PKCE verifier alone is not a session');
});

test('a sign-in return in the address makes it wait', () => {
  assert.equal(signInMayBePending({ storage: storage([]), location: at('?code=abc') }), true, 'OAuth PKCE return');
  assert.equal(signInMayBePending({ storage: storage([]), location: at('?error=access_denied') }), true);
  assert.equal(signInMayBePending({ storage: storage([]), location: at('', '#access_token=x&refresh_token=y') }), true);
  assert.equal(signInMayBePending({ storage: storage([]), location: at('', '#type=recovery&access_token=x') }), true, 'password recovery link');
});

test('unreadable storage waits, as before', () => {
  const blocked = { get length() { throw new Error('SecurityError'); }, key: () => null };
  assert.equal(signInMayBePending({ storage: blocked, location: at() }), true);
});
