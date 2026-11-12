import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, LockKeyhole, LogIn, MailCheck, TriangleAlert } from 'lucide-react';
import { configurationError, passwordRecoveryRequested, publishableKey, supabase, supabaseUrl } from './auth';
import ThemeSelector from './Theme';
import { PrismBrand } from './next/ui/PrismBrand.jsx';
import './next/styles/tokens.css';
import './next/me/accessPrism.css';
import LegalLinks from './LegalLinks';
import { clearTabDrafts } from './predictionDraft';
import { clearSoloDrafts } from './soloDraft';
import { clearCommunityDrafts } from './communityDraft';
import { clearNextDrafts } from './nextDrafts';
import { forgetMomentsDevice } from './next/moments/forget.js';
import { pendingInvitation } from './invitations';
import { oauthReturnError, startGoogleSignIn } from './oauth';
import { forgetSharedReads } from './sharedReads.js';
import { signInMayBePending } from './signInPending.js';
import { RESEND_WAIT_SECONDS, looksLikeEmail, resendSignupConfirmation, saveNewPassword, sendPasswordReset, signInWithEmail, signOutThisDevice } from './signInCalls.js';

// Redesign stage 76: the Supabase session and its account boundary. Every account change clears the account before's
// drafts and moments. The recovery link and a failed restore are handed to the screen through `events`, one object
// made once by useSignInForm, so the single subscription below can hold it.
function useAuthSession(events) {
  const [session, setSession] = useState(null);
  const lastAccount = useRef(null);
  function accountChanged(nextSession) {
    const next = nextSession?.user?.id || null;
    // Redesign stage 11: the new app's typed-text drafts go with the old app's, so another account never sees them.
    if (lastAccount.current && lastAccount.current !== next) { clearTabDrafts(); clearSoloDrafts(); clearCommunityDrafts(); clearNextDrafts(); }
    // D-69: the moments' seen record and count-up values go the same way, and the next screen is a launch again.
    if (lastAccount.current && lastAccount.current !== next) forgetMomentsDevice();
    // Answers screens share (sharedReads.js) are account-keyed; a new account starts with none kept.
    if (lastAccount.current !== next) forgetSharedReads();
    lastAccount.current = next;
  }
  // Waits for the session check only when one may exist; a signed-out visitor sees the form at once (signInPending.js).
  const [loading, setLoading] = useState(() => Boolean(supabase) && signInMayBePending());

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') { clearTabDrafts(); clearSoloDrafts(); clearCommunityDrafts(); forgetMomentsDevice(); }
      accountChanged(nextSession);
      if (active) { if (event === 'PASSWORD_RECOVERY') events.onPasswordRecovery(); setSession(nextSession); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      accountChanged(data.session);
      setSession(data.session);
      if (sessionError) events.onRestoreError('Your saved sign-in could not be restored. Please sign in again.');
      setLoading(false);
    }).catch(() => {
      if (active) { events.onRestoreError('Sign-in is temporarily unavailable. Please try again.'); setLoading(false); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function endSession() {
    await signOutThisDevice(supabase.auth);
    clearTabDrafts(); clearSoloDrafts(); clearCommunityDrafts();
  }
  return { session, loading, endSession };
}

// Redesign stage 76: what the sign-in screen holds (which screen, what was typed, the wait before another confirmation
// email) and what its buttons do. The Supabase calls themselves are signInCalls.js.
function useSignInForm() {
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
  // The session's events for this screen, made once from state setters (which never change).
  const [sessionEvents] = useState(() => ({
    onPasswordRecovery() { setConfirming(false); setRecovering(true); },
    onRestoreError: setError,
  }));

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
        await saveNewPassword(supabase.auth, { password, confirmPassword });
        setPassword(''); setConfirmPassword(''); setRecovering(false); return;
      }
      if (forgotten) {
        await sendPasswordReset(supabase.auth, { email, origin: window.location.origin });
        setNotice('If this address has a game account, look for a password reset link in your email.');
        return;
      }
      const { needsConfirmation } = await signInWithEmail(supabase.auth, { creating, email, password, origin: window.location.origin });
      setPassword('');
      if (needsConfirmation) {
        setNotice('Check your email for a confirmation link, then return here to sign in. You can create your own game or accept an invitation after confirming your account.');
        setResendCooldown(RESEND_WAIT_SECONDS);
        setConfirming(true);
        setCreating(false);
      }
    } catch (failure) {
      setError(failure.message || 'We could not complete your sign-in. Please try again.');
    } finally { setBusy(false); }
  }

  async function resendConfirmation() {
    if (busy || resendCooldown) return;
    if (!looksLikeEmail(email.trim())) { setError('Enter your email address above first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await resendSignupConfirmation(supabase.auth, { email, origin: window.location.origin });
      setResendCooldown(RESEND_WAIT_SECONDS); setNotice('If your account needs confirmation, look for a confirmation link in your email.');
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

  function changeScreen(signup) { setConfirming(false); setCreating(signup); setForgotten(false); setError(''); setNotice(''); setPassword(''); }
  function showForgotPassword() { setForgotten(true); setError(''); setNotice(''); setPassword(''); }
  function clearAfterSignOut() { setPassword(''); setError(''); setNotice(''); }
  async function cancelRecovery(signOut) { try { await signOut(); setRecovering(false); } catch (failure) { setError(failure.message); } }

  return {
    creating, confirming, forgotten, recovering, confirmPassword, resendCooldown, email, password, busy, redirecting, error, notice,
    setEmail, setPassword, setConfirmPassword, sessionEvents,
    submit, resendConfirmation, continueWithGoogle, changeScreen, showForgotPassword, clearAfterSignOut, cancelRecovery,
  };
}

export default function AuthGate({ children }) {
  const {
    creating, confirming, forgotten, recovering, confirmPassword, resendCooldown, email, password, busy, redirecting, error, notice,
    setEmail, setPassword, setConfirmPassword, sessionEvents,
    submit, resendConfirmation, continueWithGoogle, changeScreen, showForgotPassword, clearAfterSignOut, cancelRecovery,
  } = useSignInForm();
  const { session, loading, endSession } = useAuthSession(sessionEvents);

  async function signOut() {
    await endSession();
    clearAfterSignOut();
  }

  if (session && !configurationError && !recovering) return children({ session, onSignOut: signOut });
  return <main className="gx auth-page gx-access-prism" id="main">
    <div className="gx-access-brand"><PrismBrand/><strong>Guess the Line</strong><span>YOUR GAME. EVERY WEEK.</span></div>
    <section className="panel auth-card gx-auth-card" aria-labelledby="auth-title">
      <span className="empty-icon gx-auth-empty-icon"><LockKeyhole size={25}/></span>
      <h1 id="auth-title">{configurationError ? 'Online setup needs attention.' : confirming ? 'Check your email.' : recovering ? 'Choose a new password.' : forgotten ? 'Get back in the game.' : creating ? 'Start your next rivalry.' : 'Your games. Any device.'}</h1>
      {/* Persona audit #33: one line that says what the game is, on the sign-in and create-account screens only. */}
      {!configurationError && !confirming && !recovering && !forgotten && <p className="auth-pitch gx-auth-pitch">Guess every National Football League game’s spread and total each week. Closest to the number scores. No real-money wagers.</p>}
      <p className="auth-intro gx-auth-intro">{configurationError ? 'Your games are unavailable until the app configuration is complete.' : confirming ? 'Confirm your account, then return to sign in.' : recovering ? 'Save a new password for your game account.' : forgotten ? 'Request a password reset link for your game account.' : creating ? 'Create your own account. Start a game and invite your friends.' : 'Sign in to open your games, invitations and saved picks.'}</p>
      {configurationError ? <div className="error-banner gx-auth-error-banner" role="alert"><TriangleAlert size={18}/><span>{configurationError}</span></div>
        : loading ? <div className="auth-loading gx-auth-loading" role="status"><LoaderCircle className="spin" size={20}/>Checking your sign-in…</div>
        : <>
          {!!pendingInvitation() && <p className="auth-notice gx-auth-notice">Your invitation is saved in this tab. Use the Google account or email address that was invited, then accept after signing in.</p>}
          {!confirming && !forgotten && !recovering && <div className="auth-tabs gx-auth-tabs" aria-label="Account access"><button type="button" aria-pressed={!creating} onClick={() => changeScreen(false)} disabled={busy}>Sign in</button><button type="button" aria-pressed={creating} onClick={() => changeScreen(true)} disabled={busy}>Create account</button></div>}
          {error && <div className="error-banner gx-auth-error-banner" role="alert"><TriangleAlert size={18}/><span>{error}</span></div>}
          {notice && (confirming ? <div className="auth-mail-card gx-auth-mail-card" role="status"><MailCheck size={32} aria-hidden="true"/><strong>{email}</strong><p>{notice}</p></div> : <p className="auth-notice gx-auth-notice" role="status">{notice}</p>)}
          {confirming && <><button type="button" className="primary gx-auth-primary" onClick={() => changeScreen(false)} disabled={busy}>Return to sign in</button><button type="button" className="auth-switch gx-auth-switch" onClick={resendConfirmation} disabled={busy || resendCooldown > 0}>{resendCooldown ? `Resend available in ${resendCooldown}s` : 'Resend confirmation email'}</button></>}
          {!confirming && !forgotten && !recovering && <div className="auth-oauth gx-auth-oauth">
            <button type="button" className="secondary auth-google gx-auth-google" onClick={continueWithGoogle} disabled={busy} aria-describedby="auth-oauth-help">{redirecting ? <><LoaderCircle className="spin" size={18} aria-hidden="true"/>Opening Google…</> : <><LogIn size={18} aria-hidden="true"/>Continue with Google</>}</button>
            <p className="auth-help gx-auth-help" id="auth-oauth-help">{creating ? 'New players can create an account with Google in one step.' : 'Signs in to the same account as an email sign-in with the same verified address.'}</p>
            <p className="auth-divider gx-auth-divider"><span>or use email</span></p>
          </div>}
          {!confirming && <form className="auth-form gx-auth-form" onSubmit={submit}>
            {!recovering && <label htmlFor="auth-email">Email<input id="auth-email" name="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy}/></label>}
            {!forgotten && <label htmlFor="auth-password">{recovering ? 'New password' : 'Password'}<input id="auth-password" name="password" type="password" autoComplete={creating || recovering ? 'new-password' : 'current-password'} required minLength={creating || recovering ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/></label>}
            {recovering && <label htmlFor="confirm-password">Confirm new password<input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy}/></label>}
            {creating && <p className="auth-help gx-auth-help">Use at least 8 characters. Account creation may send a confirmation email. Invitations give access only to the game you accept.</p>}
            <button className="primary gx-auth-primary" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={18}/>Please wait…</> : <>{recovering ? 'Save new password' : forgotten ? 'Send reset link' : creating ? 'Create account' : 'Sign in'}<ArrowRight size={18}/></>}</button>
          </form>}
          {!confirming && !recovering && (forgotten ? <button className="auth-switch gx-auth-switch" onClick={() => changeScreen(false)} disabled={busy}>Back to sign in</button> : <div className="auth-support gx-auth-support"><button onClick={showForgotPassword} disabled={busy}>Forgot password?</button><button onClick={resendConfirmation} disabled={busy || resendCooldown > 0}>{resendCooldown ? `Resend available in ${resendCooldown}s` : 'Resend confirmation email'}</button></div>)}
          {recovering && <button className="auth-switch gx-auth-switch" disabled={busy} onClick={() => cancelRecovery(signOut)}>Cancel and sign out</button>}
          <p className="auth-help gx-auth-help">Use the same game account on every device. Each player uses their own account.</p>
        </>}
      <LegalLinks className="auth-legal gx-auth-legal"/>
      <ThemeSelector/>
    </section>
  </main>;
}
