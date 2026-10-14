// The new app's data layer (redesign build plan stage 11, sections 3.1 and 3.3). It loads `/lobby` and, once the
// account has a name, `/community/read` once and shares them with every screen (store.js), keeps them fresh (on focus,
// back online and every 5 minutes) and cancels any read still on its way when the app unmounts. It also holds what
// the frame needs around those reads: the league showing (kept per account on this device), the saved invite link,
// the writes this stage makes (the name step's `/profile`, Join's `/invite/accept`) and the "sign in again" prompt
// after a 401. Both apps call the same routes under the same server rules; nothing here decides a rule.
//
// Writes are sent once (createWriter): a lost answer is a SaveUncertainError, never retried by itself; the screen
// keeps what the member typed and says to check first. Reads refresh after every write.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { cloudApi, communityApi } from '../../api.js';
import { publishableKey, supabase, supabaseUrl } from '../../auth.js';
import { clearInvitation, pendingInvitation } from '../../invitations.js';
import { startGoogleSignIn } from '../../oauth.js';
import { connectRefresh, createDataStore, createWriter } from './store.js';
import { profileName, signInMethods } from './account.js';
import { COMMUNITY, currentLeague, leagueRows, pendingInvites, readLeagueChoice, saveLeagueChoice } from './league.js';

const AppDataContext = createContext(null);

/** The two shared reads. `/community/read` is the same call the old app's Community home makes. */
export const apiSources = () => ({
  lobby: signal => cloudApi('lobby', undefined, { signal }),
  community: signal => communityApi('read', {}, signal),
});

export function AppDataProvider({ session, sources, children }) {
  const user = session?.user ?? {};
  const accountId = typeof user.id === 'string' ? user.id : '';
  const [store] = useState(() => createDataStore(sources ?? apiSources()));
  const [write] = useState(() => createWriter(store));
  useSyncExternalStore(store.subscribe, store.version, store.version);

  // The first read, the refresh triggers, and the abort on unmount (StrictMode mounts twice; the store survives).
  useEffect(() => {
    const disconnect = connectRefresh(window, store);
    store.load('lobby');
    return () => { disconnect(); store.abortAll(); };
  }, [store]);

  const lobby = store.get('lobby');
  const community = store.get('community');
  const name = profileName(lobby.data);
  // `/community/read` refuses an account with no name; it is read once the name step is done.
  useEffect(() => { if (name) store.load('community'); }, [name, store]);

  // A fresh session (signed in again in place) clears the prompt and reads again what the 401 stopped.
  const token = session?.access_token;
  useEffect(() => {
    if (!store.signInNeeded) return;
    store.signedInAgain();
  }, [token, store]);

  const [choice, setChoice] = useState(() => readLeagueChoice(accountId));
  const league = currentLeague(choice, lobby.data);
  const chooseLeague = useCallback(next => {
    saveLeagueChoice(accountId, next);
    setChoice(next?.id === COMMUNITY.id ? null : { id: next.id, name: next.name });
  }, [accountId]);

  const [savedInvite, setSavedInvite] = useState(pendingInvitation);
  const dismissSavedInvite = useCallback(() => { clearInvitation(); setSavedInvite(''); }, []);

  const saveName = useCallback(displayName => write('profile', () => cloudApi('profile', { displayName }, { save: true }), { refresh: ['lobby'] }), [write]);

  /** Joins a league from the saved link (`{ token }`) or an invite sent to this email (`{ inviteId }`). */
  const join = useCallback(async body => {
    const result = await write('join', () => cloudApi('invite/accept', body, { save: true }), { refresh: ['lobby'] });
    if (result.ok && body.token) { clearInvitation(); setSavedInvite(''); }
    if (result.ok) {
      const joined = leagueRows({ lobby: store.get('lobby').data }).find(row => row.id === result.data?.leagueId);
      if (joined) chooseLeague(joined);
      return { ...result, league: joined ?? null };
    }
    return result;
  }, [write, store, chooseLeague]);

  const signIn = useMemo(() => ({
    needed: store.signInNeeded,
    email: typeof user.email === 'string' ? user.email : '',
    methods: signInMethods(user),
    /** Signs this same account in again here; the app stays open, so nothing typed is lost. */
    async withPassword(password) {
      if (!supabase) throw new Error('Sign-in is not available here.');
      const { data, error } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (error) throw error;
      if (data?.user?.id !== accountId) throw new Error('That is a different account. Sign out first to switch accounts.');
      store.signedInAgain();
    },
    /** Google leaves the page and comes back to it; typed text kept as a draft comes back with this account. */
    withGoogle: () => startGoogleSignIn(supabase, { url: supabaseUrl, key: publishableKey }),
    dismiss: () => store.clearSignInNeeded(),
  }), [store, store.signInNeeded, user, accountId]);

  const value = {
    accountId,
    email: typeof user.email === 'string' ? user.email : '',
    name,
    lobby,
    community,
    /** What the tab bar's counters read (each tab's slot file). */
    counters: { lobby: lobby.data, community: community.data },
    league,
    leagues: leagueRows({ lobby: lobby.data, community: community.data, current: league }),
    invites: pendingInvites(lobby.data),
    savedInvite,
    dismissSavedInvite,
    chooseLeague,
    saveName,
    join,
    refresh: options => store.refresh(options),
    signIn,
  };
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

/** `const app = useAppData()`: the shared reads, the league showing and the stage 11 writes (AppDataProvider). */
export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData() is only for screens inside the new app’s AppDataProvider.');
  return value;
}
