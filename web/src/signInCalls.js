// Redesign stage 76: every Supabase Auth call the sign-in screen makes, as plain functions of what the player typed.
// useSignInForm and useAuthSession (AuthGate.jsx) turn each result into what the screen shows. `auth` is the client's
// `supabase.auth`. tests/next-sign-in.test.jsx pins each call; tests/cloud-browser/next-auth.spec.js pins the requests.

/** Seconds before another confirmation email can be requested. */
export const RESEND_WAIT_SECONDS = 60;

/** The address check made before a confirmation email is resent. */
export const looksLikeEmail = text => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);

/** The recovery link's new password. Both entries must match before anything is sent. */
export async function saveNewPassword(auth, { password, confirmPassword }) {
  if (password !== confirmPassword) throw new Error('The passwords do not match. Please enter them again.');
  const { error } = await auth.updateUser({ password });
  if (error) throw error;
}

/** A password reset link for the typed address that returns to this app. */
export async function sendPasswordReset(auth, { email, origin }) {
  const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: origin });
  if (error) throw error;
}

/** Email sign-in, or account creation when `creating`. needsConfirmation: the new account must be confirmed by email first. */
export async function signInWithEmail(auth, { creating, email, password, origin }) {
  const credentials = { email: email.trim(), password };
  const result = creating
    ? await auth.signUp({ ...credentials, options: { emailRedirectTo: origin } })
    : await auth.signInWithPassword(credentials);
  if (result.error) throw result.error;
  return { needsConfirmation: creating && !result.data.session };
}

/** Another account-confirmation email for the typed address, returning to this app. */
export async function resendSignupConfirmation(auth, { email, origin }) {
  const { error } = await auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: origin } });
  if (error) throw error;
}

/** Signs out this device only; other devices keep their sign-in. */
export async function signOutThisDevice(auth) {
  const { error } = await auth.signOut({ scope: 'local' });
  if (error) throw new Error('We could not sign you out. Please try again.');
}
