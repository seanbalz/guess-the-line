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
import { noteLobbyEpl, takePrimedLobby } from '../epl/route.js';
import { COMMUNITY, currentLeague, leagueRows, pendingInvites, readLeagueChoice, saveLeagueChoice } from './league.js';

const AppDataContext = createContext(null);

// This device has seen the account with a name, so its Community read can start with /lobby (a hint only, never a
// rule: the server still refuses an account with no name). Nothing else is stored.
const NAMED = 'gtl.next.named.v1.';
function rememberedName(accountId) {
  try { return Boolean(accountId) && localStorage.getItem(NAMED + accountId) === '1'; } catch { return false; }
}
function rememberName(accountId) {
  try { if (accountId) localStorage.setItem(NAMED + accountId, '1'); } catch { /* A private window keeps the old order. */ }
}

/**
 * The shared reads. `/community/read` is the same call the old app's Community home makes. `/personal` (stage 13, the
 * Lines tab) is the viewer's own week, the same call the old app's Community Picks makes: it is read only once a screen
 * asks for it (useSharedRead), then shared and kept fresh with the others.
 */
export const apiSources = (accountId = '') => ({
  // A cold #epl link's one lobby read (SportEntry) is reused here instead of asking again (epl/route.js).
  lobby: signal => takePrimedLobby(accountId) ?? cloudApi('lobby', undefined, { signal }),
  community: signal => communityApi('read', {}, signal),
  personal: signal => cloudApi('personal', undefined, { signal }),
});

export function AppDataProvider({ session, sources, sport = 'nfl', children }) {
  const user = session?.user ?? {};
  const accountId = typeof user.id === 'string' ? user.id : '';
  const [store] = useState(() => createDataStore(sources ?? apiSources(accountId)));
  const [write] = useState(() => createWriter(store));
  useSyncExternalStore(store.subscribe, store.version, store.version);

  // The first read, the refresh triggers, and the abort on unmount (StrictMode mounts twice; the store survives). An
  // account this device has seen with a name reads the Community alongside /lobby instead of after it.
  useEffect(() => {
    const disconnect = connectRefresh(window, store, { only: sport === 'epl' ? ['lobby'] : undefined });
    store.load('lobby');
    if (sport === 'nfl' && rememberedName(accountId)) store.load('community');
    return () => { disconnect(); store.abortAll(); };
  }, [store, sport]);

  const lobby = store.get('lobby');
  const community = store.get('community');
  const name = profileName(lobby.data);
  // Each lobby reply says whether this account sees EPL (its `epl` field); SportEntry, above this app, reads it from there.
  useEffect(() => { if (lobby.data) noteLobbyEpl(accountId, lobby.data); }, [lobby.data, accountId]);
  // `/community/read` refuses an account with no name; it is read once the name step is done.
  useEffect(() => { if (name && sport === 'nfl') { rememberName(accountId); store.load('community'); } }, [name, store, accountId, sport]);

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

  /** Starts a shared read a screen needs (once; later calls share it), and what it holds now. */
  const loadRead = useCallback(name => store.load(name), [store]);
  const readOf = useCallback(name => store.get(name), [store]);
  const refresh = useCallback(options => store.refresh({ ...options, afterPending: true }), [store]);
  const requestSignIn = useCallback(() => store.noteSignInNeeded(), [store]);

  // Existing Community writes, shared by the League screen. The request id belongs to the caller's draft;
  // a lost reply is never replayed by the store, and the shared feed is checked again after it settles.
  const mutateCommunity = useCallback((action, body) => {
    if (!['like', 'comment'].includes(action)) throw new TypeError('Unsupported community action.');
    const key = `community:${action}:${body?.postId ?? ''}:${body?.requestId ?? ''}`;
    return write(key, () => cloudApi(`community/${action}`, body, { save: true }), { refresh: ['community'] });
  }, [write]);

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
    refresh,
    requestSignIn,
    mutateCommunity,
    loadRead,
    readOf,
    signIn,
  };
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

/**
 * `const personal = useSharedRead('personal')`: a read only some screens need, asked for when the screen mounts. One
 * request for every screen that shows it; refreshed with the others (focus, every 5 minutes, back online).
 */
export function useSharedRead(name) {
  const app = useAppData();
  const { loadRead } = app;
  useEffect(() => { loadRead(name); }, [loadRead, name]);
  return app.readOf(name);
}

/** `const app = useAppData()`: the shared reads, the league showing and the stage 11 writes (AppDataProvider). */
export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData() is only for screens inside the new app’s AppDataProvider.');
  return value;
}
