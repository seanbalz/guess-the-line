// Native session copy, isolated without account or authentication controllers.
export const SIGN_IN_AGAIN_COPY=Object.freeze({
  title: 'Sign in again',
  text: 'Your sign-in ran out, so nothing was saved just now. Sign in again to keep going. Nothing you typed is lost.',
  account: email => `Signed in as ${email}`,
  password: 'Password',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  google: 'Continue with Google',
  opening: 'Opening Google…',
  later: 'Not now',
  failed: 'That didn’t work. Check your password and try again.',
});
