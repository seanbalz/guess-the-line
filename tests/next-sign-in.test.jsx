import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RESEND_WAIT_SECONDS, looksLikeEmail, resendSignupConfirmation, saveNewPassword, sendPasswordReset, signInWithEmail, signOutThisDevice,
} from '../web/src/signInCalls.js';

// Redesign stage 76 (sign-in skin, code only): the Supabase Auth calls the sign-in screen makes. AuthGate's logic is
// split into useAuthSession() and useSignInForm(); each form call goes through web/src/signInCalls.js, pinned here with
// a recording stand-in for `supabase.auth`. tests/cloud-browser/next-auth.spec.js pins the same flows as HTTP requests.
const ORIGIN = 'https://guess-the-line.example.test';

function fakeAuth(results = {}) {
  const calls = [];
  const method = name => async (...args) => { calls.push([name, ...args]); return results[name] ?? { data: {}, error: null }; };
  const auth = Object.fromEntries(['signInWithPassword', 'signUp', 'resend', 'resetPasswordForEmail', 'updateUser', 'signOut'].map(name => [name, method(name)]));
  return { auth, calls };
}

describe('email sign-in and account creation', () => {
  it('signs in with one password call: the trimmed address and the password exactly as typed', async () => {
    const { auth, calls } = fakeAuth({ signInWithPassword: { data: { session: { access_token: 't' } }, error: null } });
    expect(await signInWithEmail(auth, { creating: false, email: '  player@example.test ', password: ' spaced pass ', origin: ORIGIN }))
      .toEqual({ needsConfirmation: false });
    expect(calls).toEqual([['signInWithPassword', { email: 'player@example.test', password: ' spaced pass ' }]]);
  });

  it('creates an account with one sign-up call that returns to this app; no session means the email must be confirmed', async () => {
    const { auth, calls } = fakeAuth({ signUp: { data: { user: { id: 'u' }, session: null }, error: null } });
    expect(await signInWithEmail(auth, { creating: true, email: ' new@example.test', password: 'new-password', origin: ORIGIN }))
      .toEqual({ needsConfirmation: true });
    expect(calls).toEqual([['signUp', { email: 'new@example.test', password: 'new-password', options: { emailRedirectTo: ORIGIN } }]]);
  });

  it('a sign-up that returns a session signs straight in', async () => {
    const { auth } = fakeAuth({ signUp: { data: { user: { id: 'u' }, session: { access_token: 't' } }, error: null } });
    expect(await signInWithEmail(auth, { creating: true, email: 'new@example.test', password: 'new-password', origin: ORIGIN }))
      .toEqual({ needsConfirmation: false });
  });

  it('a refused sign-in or sign-up throws Supabase\'s own error, so its message is what the screen shows', async () => {
    const refused = { message: 'Invalid login credentials', status: 400 };
    for (const [creating, name] of [[false, 'signInWithPassword'], [true, 'signUp']]) {
      const { auth } = fakeAuth({ [name]: { data: { user: null, session: null }, error: refused } });
      await expect(signInWithEmail(auth, { creating, email: 'player@example.test', password: 'x', origin: ORIGIN })).rejects.toBe(refused);
    }
  });
});

describe('confirmation email, password reset and recovery', () => {
  it('resends the sign-up confirmation once, for the trimmed address, returning to this app', async () => {
    const { auth, calls } = fakeAuth();
    await resendSignupConfirmation(auth, { email: ' player@example.test ', origin: ORIGIN });
    expect(calls).toEqual([['resend', { type: 'signup', email: 'player@example.test', options: { emailRedirectTo: ORIGIN } }]]);
    expect(RESEND_WAIT_SECONDS).toBe(60);
  });

  it('asks for a reset link once, for the trimmed address, returning to this app', async () => {
    const { auth, calls } = fakeAuth();
    await sendPasswordReset(auth, { email: ' player@example.test ', origin: ORIGIN });
    expect(calls).toEqual([['resetPasswordForEmail', 'player@example.test', { redirectTo: ORIGIN }]]);
  });

  it('a new password that does not match its confirmation sends nothing', async () => {
    const { auth, calls } = fakeAuth();
    await expect(saveNewPassword(auth, { password: 'new-password', confirmPassword: 'other-password' }))
      .rejects.toThrow('The passwords do not match. Please enter them again.');
    expect(calls).toEqual([]);
  });

  it('a matching new password is one update call with the password only', async () => {
    const { auth, calls } = fakeAuth();
    await saveNewPassword(auth, { password: 'new-password', confirmPassword: 'new-password' });
    expect(calls).toEqual([['updateUser', { password: 'new-password' }]]);
  });

  it('a refused resend, reset or update throws Supabase\'s own error', async () => {
    const refused = { message: 'Email rate limit exceeded' };
    await expect(resendSignupConfirmation(fakeAuth({ resend: { data: {}, error: refused } }).auth, { email: 'a@b.co', origin: ORIGIN })).rejects.toBe(refused);
    await expect(sendPasswordReset(fakeAuth({ resetPasswordForEmail: { data: {}, error: refused } }).auth, { email: 'a@b.co', origin: ORIGIN })).rejects.toBe(refused);
    await expect(saveNewPassword(fakeAuth({ updateUser: { data: {}, error: refused } }).auth, { password: 'p', confirmPassword: 'p' })).rejects.toBe(refused);
  });

  it('the resend address check: something@something.something with no spaces', () => {
    for (const text of ['player@example.test', 'a@b.co']) expect(looksLikeEmail(text), text).toBe(true);
    for (const text of ['', 'player', 'player@example', '@example.test', 'pla yer@example.test', 'player@exa mple.test']) expect(looksLikeEmail(text), text).toBe(false);
  });
});

describe('sign-out', () => {
  it('signs out this device only', async () => {
    const { auth, calls } = fakeAuth();
    await signOutThisDevice(auth);
    expect(calls).toEqual([['signOut', { scope: 'local' }]]);
  });

  it('a failed sign-out shows the app\'s own words, never the Supabase message', async () => {
    const { auth } = fakeAuth({ signOut: { error: { message: 'AuthSessionMissingError internal detail' } } });
    await expect(signOutThisDevice(auth)).rejects.toThrow(/^We could not sign you out\. Please try again\.$/);
  });
});

describe('AuthGate routes every sign-in screen call through signInCalls.js', () => {
  const source = readFileSync(new URL('../web/src/AuthGate.jsx', import.meta.url), 'utf8');

  it('has the two stage 76 hooks and makes no form call to supabase.auth directly', () => {
    expect(source).toMatch(/^function useAuthSession\(events\) \{$/m);
    expect(source).toMatch(/^function useSignInForm\(\) \{$/m);
    expect(source).not.toMatch(/supabase\.auth\.(signInWithPassword|signUp|resend|resetPasswordForEmail|updateUser|signOut)\b/);
    for (const name of ['saveNewPassword', 'sendPasswordReset', 'signInWithEmail', 'resendSignupConfirmation', 'signOutThisDevice']) {
      expect(source, name).toMatch(new RegExp(`await ${name}\\(supabase\\.auth[,)]`));
    }
  });

  it('keeps the session itself in useAuthSession: one subscription and one restore', () => {
    const session = source.slice(source.indexOf('function useAuthSession('), source.indexOf('function useSignInForm('));
    expect(session.match(/supabase\.auth\.onAuthStateChange\(/g)).toHaveLength(1);
    expect(session.match(/supabase\.auth\.getSession\(\)/g)).toHaveLength(1);
    expect(source.match(/supabase\.auth\.(onAuthStateChange|getSession)\(/g)).toHaveLength(2);
  });
});
