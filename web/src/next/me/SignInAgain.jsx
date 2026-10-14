// "Sign in again" (redesign build plan stage 11, "a 401 prompt that keeps typed text"): gtl-api answered 401 because
// this account's sign-in ran out. The prompt signs the same account in again without leaving the screen, so whatever
// the member typed stays where it is: with the password here (the app stays open), or with Google, which leaves the
// page and comes back (typed text kept as a draft in this tab comes back with the same account; nextDrafts.js). It
// never signs out: that would clear the drafts (AuthGate). "Not now" closes it; the next 401 asks again.
import { useId, useState } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { Button, Dialog } from '../ui/index.js';

export const SIGN_IN_AGAIN_COPY = Object.freeze({
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

export function SignInAgain() {
  const app = useAppData();
  const { needed, email, methods } = app.signIn;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const passwordId = useId();

  function close() {
    if (busy) return;
    setPassword('');
    setError('');
    app.signIn.dismiss();
  }
  async function withPassword(event) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy('password');
    setError('');
    try {
      await app.signIn.withPassword(password);
      setPassword('');
    } catch (failure) {
      setError(failure?.message && !/invalid login/i.test(failure.message) ? failure.message : SIGN_IN_AGAIN_COPY.failed);
    } finally { setBusy(''); }
  }
  async function withGoogle() {
    if (busy) return;
    setBusy('google');
    setError('');
    try { await app.signIn.withGoogle(); }
    catch (failure) { setError(failure?.message || SIGN_IN_AGAIN_COPY.failed); setBusy(''); }
  }

  return (
    <Dialog open={needed} title={SIGN_IN_AGAIN_COPY.title} text={SIGN_IN_AGAIN_COPY.text} onClose={close} className="gx-reauth">
      {email ? <p className="gx-t-meta gx-truncate">{SIGN_IN_AGAIN_COPY.account(email)}</p> : null}
      {methods.password ? (
        <form className="gx-vstack gx-gap-8" onSubmit={withPassword}>
          <label className="gx-field" htmlFor={passwordId}>
            <span className="gx-t-label">{SIGN_IN_AGAIN_COPY.password}</span>
            <input id={passwordId} className="gx-input" type="password" autoComplete="current-password" value={password}
              onChange={event => setPassword(event.target.value)} aria-invalid={error ? true : undefined}/>
          </label>
          <Button type="submit" variant="primary" block aria-disabled={busy || !password || undefined}>
            {busy === 'password' ? SIGN_IN_AGAIN_COPY.signingIn : SIGN_IN_AGAIN_COPY.signIn}
          </Button>
        </form>
      ) : null}
      {methods.google ? (
        <Button variant={methods.password ? 'secondary' : 'primary'} block onClick={withGoogle} aria-disabled={busy || undefined}>
          {busy === 'google' ? SIGN_IN_AGAIN_COPY.opening : SIGN_IN_AGAIN_COPY.google}
        </Button>
      ) : null}
      <div role="alert">{error ? <p className="gx-t-body gx-solo-problem">{error}</p> : null}</div>
      <Button variant="ghost-2" onClick={close}>{SIGN_IN_AGAIN_COPY.later}</Button>
    </Dialog>
  );
}
