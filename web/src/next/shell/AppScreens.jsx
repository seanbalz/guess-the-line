// The new app's app-wide states (redesign build plan stage 11; inventory row 80; prototype spec section 5 and the
// League and Home access states): what shows before the account is loaded, when it cannot load, and in place of a
// tab when the league showing is not open to this account. No spinners: a sentence says what is happening.
//
// - StartScreen and LoadFailed have no frame yet (the account decides which frame), like the name step.
// - RemovedScreen and AccessPending show inside the frame, in place of the tab: the league pill, the menu and the
//   tab bar still work, so the member can switch league or use the old app. Nothing the member entered is hidden by
//   them (D-23): the server already refuses these reads, and these screens say so in plain words.
import { useId } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { Button, FieldMark, Icon } from '../ui/index.js';

export const APP_SCREENS_COPY = Object.freeze({
  name: 'Guess The Line',
  loading: 'Loading your leagues…',
  failedTitle: 'Your account didn’t load',
  failedHelp: 'Check your connection, then try again. The old app works too.',
  tryAgain: 'Try again',
  trying: 'Trying again…',
  signOut: 'Sign out',
  removedTitle: 'Not in the Community',
  removedBody: 'The commissioner removed this account from the Community, so its boards, picks and posts don’t show here. Everything you entered is kept.',
  removedHelp: 'If that’s a mistake, ask the commissioner to add you back.',
  yourLeagues: 'Your leagues',
  pendingTitle: 'Your spot is pending',
  pendingBody: name => `${name} isn’t open to this account yet. Join from an invite sent to your email, or ask its host to invite you.`,
  toCommunity: 'Switch to Community',
});

/** The `.gx` root for a screen drawn without the frame (the frame draws its own). */
export function FrameRoot({ children }) {
  const [preferences] = useDashboardPreferences();
  return <div className="gx" data-motion={preferences.motion === 'reduced' ? 'reduce' : undefined}>{children}</div>;
}

/** While `/lobby` loads: the monogram and one sentence, announced. */
export function StartScreen() {
  return (
    <main className="gx-solo" id="main">
      <h1 className="gx-sr-only">{APP_SCREENS_COPY.name}</h1>
      <FieldMark size={80}/>
      <p className="gx-t-body gx-c-2" role="status">{APP_SCREENS_COPY.loading}</p>
    </main>
  );
}

/**
 * `/lobby` failed (not a 401, which asks to sign in again). A refusal shows the server's own words (for example
 * "Confirm your email address…"); anything else asks to check the connection.
 */
export function LoadFailed({ error, busy, onRetry, onOldApp, onSignOut }) {
  const id = useId();
  const refused = typeof error?.status === 'number' && error.status >= 400 && error.status < 500 && typeof error.message === 'string' && error.message;
  return (
    <main className="gx-solo" id="main">
      <FieldMark size={56}/>
      <section className="gx-fail gx-solo-card" role="alert" aria-labelledby={id}>
        <Icon icon="alert" size={20} className="gx-c-loss"/>
        <h1 className="gx-t-section" id={id}>{APP_SCREENS_COPY.failedTitle}</h1>
        <p className="gx-t-body gx-c-2">{refused ? error.message : APP_SCREENS_COPY.failedHelp}</p>
        <Button variant="primary" block onClick={onRetry} aria-disabled={busy || undefined}>{busy ? APP_SCREENS_COPY.trying : APP_SCREENS_COPY.tryAgain}</Button>
        <Button variant="secondary" block onClick={onOldApp}>{APP_SWITCH_COPY.useOld}</Button>
        <Button variant="ghost-2" onClick={onSignOut}>{APP_SCREENS_COPY.signOut}</Button>
      </section>
    </main>
  );
}

/** The Community refused this account (`/community/read` 403 after the name step): the commissioner removed it. */
export function RemovedScreen({ hasGroups, onLeagues, onOldApp }) {
  return (
    <div className="gx-screen">
      <h1 className="gx-t-title">{APP_SCREENS_COPY.removedTitle}</h1>
      <section className="gx-empty" aria-label={APP_SCREENS_COPY.removedTitle}>
        <p className="gx-t-body">{APP_SCREENS_COPY.removedBody}</p>
        <p className="gx-t-body gx-c-2">{APP_SCREENS_COPY.removedHelp}</p>
        {hasGroups ? <Button variant="secondary" block onClick={onLeagues}>{APP_SCREENS_COPY.yourLeagues}</Button> : null}
        <Button variant="ghost" onClick={onOldApp}>{APP_SWITCH_COPY.useOld}</Button>
      </section>
    </div>
  );
}

/** The saved league is one this account is not in (any more, or not yet). */
export function AccessPending({ name, onCommunity, onLeagues }) {
  return (
    <div className="gx-screen">
      <h1 className="gx-t-title">{APP_SCREENS_COPY.pendingTitle}</h1>
      <section className="gx-empty" aria-label={APP_SCREENS_COPY.pendingTitle}>
        <p className="gx-t-body">{APP_SCREENS_COPY.pendingBody(name)}</p>
        <Button variant="secondary" block onClick={onCommunity}>{APP_SCREENS_COPY.toCommunity}</Button>
        <Button variant="ghost" onClick={onLeagues}>{APP_SCREENS_COPY.yourLeagues}</Button>
      </section>
    </div>
  );
}
