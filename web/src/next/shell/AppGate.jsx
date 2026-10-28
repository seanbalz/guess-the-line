// What the new app shows for the account (redesign build plan stage 11): the start screen while `/lobby` loads, its
// failure card, the name step until the account has a display name, then the frame. Inside the frame the league
// showing decides what replaces the tabs: the removed-account screen when the Community refuses this account (its
// `/community/read` answers 403), the access-pending screen for a saved league this account is not in. A 401 from
// any read or write opens "Sign in again" over whatever shows, so nothing typed is lost.
import { useMemo, useState } from 'react';
import { reloadApp } from '../../appView.js';
import { useAppData } from '../data/AppData.jsx';
import { COMMUNITY } from '../data/league.js';
import { NameStep } from '../me/NameStep.jsx';
import { SignInAgain } from '../me/SignInAgain.jsx';
import { AccessPending, FrameRoot, LoadFailed, RemovedScreen, StartScreen } from './AppScreens.jsx';
import { useShell } from './context.js';
import { Shell } from './Shell.jsx';

const reload = () => reloadApp();

/** The cover for the league showing, drawn inside the frame (it uses the frame's switcher and toasts). */
function LeagueCover({ app }) {
  const shell = useShell();
  if (app.league.pending) {
    return (
      <AccessPending
        name={app.league.name}
        onCommunity={() => { app.chooseLeague(COMMUNITY); shell.toast(`Showing ${COMMUNITY.name}`); }}
        onLeagues={() => shell.openSheet('sh.switcher')}
      />
    );
  }
  return <RemovedScreen hasGroups={app.leagues.length > 1} onLeagues={() => shell.openSheet('sh.switcher')} onReload={shell.reload}/>;
}

/**
 * True when the Community refuses this account: its read answered 403 (the commissioner removed it, D-23 keeps its
 * data). It stays true while that read runs again (a refresh), so the screen and the focus in it stay put.
 */
export const removedFromCommunity = community => community.status === 'error' && community.error?.status === 403;

export function AppGate({ session, onSignOut }) {
  const app = useAppData();
  const [notice, setNotice] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const you = useMemo(() => ({ id: app.accountId, email: app.email, name: app.name || app.email }), [app.accountId, app.email, app.name]);
  const lobby = app.lobby;

  // Sign out from a screen without the frame (its menu is not there yet). On failure the screen stays as it is.
  const signOut = () => Promise.resolve(onSignOut?.()).catch(() => {});
  if (lobby.status !== 'ready') {
    // A 401 asks to sign in again first; once that prompt is closed, the card offers Try again. The card stays while
    // any read of `/lobby` runs again (Try again, focus, back online), saying so, so the focus on it is kept.
    const failed = lobby.status === 'error' && !(lobby.error?.status === 401 && app.signIn.needed);
    const retry = async () => {
      if (retrying) return;
      setRetrying(true);
      await app.refresh({ only: ['lobby'] });
      setRetrying(false);
    };
    return (
      <FrameRoot>
        {failed ? <LoadFailed error={lobby.error} busy={retrying || lobby.loading} onRetry={retry} onReload={reload} onSignOut={signOut}/> : <StartScreen/>}
        <SignInAgain/>
      </FrameRoot>
    );
  }
  if (!app.name) {
    return (
      <FrameRoot>
        <NameStep onSaved={text => setNotice({ key: Date.now(), text })} onSignOut={signOut}/>
        <SignInAgain/>
      </FrameRoot>
    );
  }
  const covered = app.league.pending || (app.league.id === COMMUNITY.id && removedFromCommunity(app.community));
  return (
    <Shell
      session={session}
      onSignOut={onSignOut}
      league={app.league}
      you={you}
      data={app.counters}
      cover={covered ? <LeagueCover app={app}/> : null}
      initialLayer={app.savedInvite ? 'sh.switcher' : null}
      notice={notice}
    >
      <SignInAgain/>
    </Shell>
  );
}
