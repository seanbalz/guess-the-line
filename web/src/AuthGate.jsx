import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, LockKeyhole, LogIn, TriangleAlert } from 'lucide-react';
import { configurationError, passwordRecoveryRequested, publishableKey, supabase, supabaseUrl } from './auth';
import ThemeSelector from './Theme';
import Brand from './Brand';
import LegalLinks from './LegalLinks';
import { clearTabDrafts } from './predictionDraft';
import { clearSoloDrafts } from './soloDraft';
import { clearCommunityDrafts } from './communityDraft';
import { pendingInvitation } from './invitations';
import { oauthReturnError, startGoogleSignIn } from './oauth';

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const lastAccount = useRef(null);
  function accountChanged(nextSession) {
    const next = nextSession?.user?.id || null;
    if (lastAccount.current && lastAccount.current !== next) { clearTabDrafts(); clearSoloDrafts(); clearCommunityDrafts(); }
    lastAccount.current = next;
  }
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [forgotten, setForgotten] = useState(false);
  const [recovering, setRecovering] = useState(passwordRecoveryRequested);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState(oauthReturnError);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') { clearTabDrafts(); clearSoloDrafts(); clearCommunityDrafts(); }
      accountChanged(nextSession);
      if (active) { if (event === 'PASSWORD_RECOVERY') setRecovering(true); setSession(nextSession); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      accountChanged(data.session);
      setSession(data.session);
      if (sessionError) setError('Your saved sign-in could not be restored. Please sign in again.');
      setLoading(false);
    }).catch(() => {
      if (active) { setError('Sign-in is temporarily unavailable. Please try again.'); setLoading(false); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!resendCooldown) return;
    const timer = setTimeout(() => setResendCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function submit(event) {
    event.preventDefault();
    if (busy || !supabase) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (recovering) {
        if (password !== confirmPassword) throw new Error('The passwords do not match. Please enter them again.');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword(''); setConfirmPassword(''); setRecovering(false); return;
      }
      if (forgotten) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (resetError) throw resetError;
        setNotice('If this address has a game account, look for a password reset link in your email.');
        return;
      }
      const credentials = { email: email.trim(), password };
      const result = creating
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      setPassword('');
      if (creating && !result.data.session) {
        setNotice('Check your email for a confirmation link, then return here to sign in. You can create your own game or accept an invitation after confirming your account.');
        setResendCooldown(60);
        setCreating(false);
      }
    } catch (failure) {
      setError(failure.message || 'We could not complete your sign-in. Please try again.');
    } finally { setBusy(false); }
  }

  async function resendConfirmation() {
    if (busy || resendCooldown) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter your email address above first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: window.location.origin } });
      if (resendError) throw resendError;
      setResendCooldown(60); setNotice('If your account needs confirmation, look for a confirmation link in your email.');
    } catch (failure) { setError(failure.message || 'The confirmation request could not be completed.'); }
    finally { setBusy(false); }
  }

  // Full-page redirect to Google through Supabase Auth. The page stays busy until the browser leaves; the pending invitation
  // stays in this tab's sessionStorage and is offered again after the return.
  async function continueWithGoogle() {
    if (busy || !supabase) return;
    setBusy(true); setRedirecting(true); setError(''); setNotice('');
    try { await startGoogleSignIn(supabase, { url: supabaseUrl, key: publishableKey }); }
    catch (failure) { setError(failure.message); setBusy(false); setRedirecting(false); }
  }

  function changeScreen(signup) { setCreating(signup); setForgotten(false); setError(''); setNotice(''); setPassword(''); }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw new Error('We could not sign you out. Please try again.');
    clearTabDrafts(); clearSoloDrafts(); clearCommunityDrafts();
    setPassword(''); setError(''); setNotice('');
  }

  if (session && !configurationError && !recovering) return children({ session, onSignOut: signOut });
  return <main className="auth-page" id="main">
    <section className="panel auth-card" aria-labelledby="auth-title">
      <ThemeSelector/>
      <Brand />
      <span className="empty-icon"><LockKeyhole size={25}/></span>
      <h1 id="auth-title">{configurationError ? 'Online setup needs attention.' : recovering ? 'Choose a new password.' : forgotten ? 'Get back in the game.' : creating ? 'Start your next rivalry.' : 'Your games. Any device.'}</h1>
      {/* Persona audit #33: one line that says what the game is, on the sign-in and create-account screens only. */}
      {!configurationError && !recovering && !forgotten && <p className="auth-pitch">Guess every NFL game’s spread and total each week. Closest to the number scores. No real-money wagers.</p>}
      <p className="auth-intro">{configurationError ? 'Your games are unavailable until the app configuration is complete.' : recovering ? 'Save a new password for your game account.' : forgotten ? 'Request a password reset link for your game account.' : creating ? 'Create your own account. Start a game and invite your friends.' : 'Sign in to open your games, invitations and saved picks.'}</p>
      {configurationError ? <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{configurationError}</span></div>
        : loading ? <div className="auth-loading" role="status"><LoaderCircle className="spin" size={20}/>Checking your sign-in…</div>
        : <>
          {!!pendingInvitation() && <p className="auth-notice">Your invitation is saved in this tab. Use the Google account or email address that was invited, then accept after signing in.</p>}
          {!forgotten && !recovering && <div className="auth-tabs" aria-label="Account access"><button type="button" aria-pressed={!creating} onClick={() => changeScreen(false)} disabled={busy}>Sign in</button><button type="button" aria-pressed={creating} onClick={() => changeScreen(true)} disabled={busy}>Create account</button></div>}
          {error && <div className="error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          {!forgotten && !recovering && <div className="auth-oauth">
            <button type="button" className="secondary auth-google" onClick={continueWithGoogle} disabled={busy} aria-describedby="auth-oauth-help">{redirecting ? <><LoaderCircle className="spin" size={18} aria-hidden="true"/>Opening Google…</> : <><LogIn size={18} aria-hidden="true"/>Continue with Google</>}</button>
            <p className="auth-help" id="auth-oauth-help">{creating ? 'New players can create an account with Google in one step.' : 'Signs in to the same account as an email sign-in with the same verified address.'}</p>
            <p className="auth-divider"><span>or use email</span></p>
          </div>}
          <form className="auth-form" onSubmit={submit}>
            {!recovering && <label htmlFor="auth-email">Email<input id="auth-email" name="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy}/></label>}
            {!forgotten && <label htmlFor="auth-password">{recovering ? 'New password' : 'Password'}<input id="auth-password" name="password" type="password" autoComplete={creating || recovering ? 'new-password' : 'current-password'} required minLength={creating || recovering ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/></label>}
            {recovering && <label htmlFor="confirm-password">Confirm new password<input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy}/></label>}
            {creating && <p className="auth-help">Use at least 8 characters. Account creation may send a confirmation email. Invitations give access only to the game you accept.</p>}
            <button className="primary" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18}/>Please wait…</> : <>{recovering ? 'Save new password' : forgotten ? 'Send reset link' : creating ? 'Create account' : 'Sign in'}<ArrowRight size={18}/></>}</button>
          </form>
          {!recovering && (forgotten ? <button className="auth-switch" onClick={() => changeScreen(false)} disabled={busy}>Back to sign in</button> : <div className="auth-support"><button onClick={() => { setForgotten(true); setError(''); setNotice(''); setPassword(''); }} disabled={busy}>Forgot password?</button><button onClick={resendConfirmation} disabled={busy || resendCooldown > 0}>{resendCooldown ? `Resend available in ${resendCooldown}s` : 'Resend confirmation email'}</button></div>)}
          {recovering && <button className="auth-switch" disabled={busy} onClick={async () => { try { await signOut(); setRecovering(false); } catch (failure) { setError(failure.message); } }}>Cancel and sign out</button>}
          <p className="auth-help">Use the same game account on every device. Each player uses their own account.</p>
        </>}
      <LegalLinks className="auth-legal"/>
    </section>
  </main>;
}
