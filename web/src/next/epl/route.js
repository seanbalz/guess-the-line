// EPL mini-app addresses (#epl/<tab>[/<section>]) and the sport switch's options. Pure apart from one React context,
// so the shell's Frame can read EPL access without loading the cloud client.
import { createContext } from 'react';

export const EPL_TABS = Object.freeze(['home', 'play', 'bets', 'research']);
/** Each tab's sections, the first working one first (Play's Guess the Line and Leaderboard arrive in Plan 3). */
export const EPL_SECTIONS = Object.freeze({ play: Object.freeze(['pick', 'guess', 'leaderboard']), research: Object.freeze(['fantasy']) });

export function eplRoute(hash) {
  const match = /^#epl\/(home|play|bets|research)(?:\/(\w+))?\/?$/.exec(typeof hash === 'string' ? hash : '');
  if (!match) return null;
  const tab = match[1], sections = EPL_SECTIONS[tab];
  if (!sections) return { tab };
  return { tab, section: sections.includes(match[2]) ? match[2] : sections[0] };
}
export function eplHash(route) {
  const sections = EPL_SECTIONS[route.tab];
  if (!sections) return `#epl/${route.tab}`;
  return `#epl/${route.tab}/${sections.includes(route.section) ? route.section : sections[0]}`;
}
/** Any #epl… fragment belongs to the EPL section while it shows, including in-page anchors (#epl-main). */
export const eplFragment = hash => typeof hash === 'string' && hash.startsWith('#epl');

export const SPORT_HOME = Object.freeze({ nba: '#nba/games', epl: '#epl/home' });
/** NFL / NBA, plus EPL whenever the lobby says `epl: true` (every signed-in account once M-30 is applied; EPL open access). */
export function sportOptions(epl) {
  return [{ value: 'nfl', label: 'NFL' }, { value: 'nba', label: 'NBA' }, ...(epl ? [{ value: 'epl', label: 'EPL' }] : [])];
}

/** Whether this account sees EPL, provided by main.jsx's sport entry (false until a lobby reply says). */
export const EplAccessContext = createContext(false);

/**
 * What SportEntry does with an EPL address: `show` EplApp once access is true, `leave` for NFL when access is false, `wait` (render nothing EPL-specific) while
 * the lobby has not answered, and `other` for an NFL or NBA address. Since EPL open access (D-68 addendum) the lobby says
 * `epl: true` for every signed-in account once M-30 is applied, linked to a manager or not.
 */
export function eplGate(sport, access) {
  if (sport !== 'epl') return 'other';
  return access === true ? 'show' : access === false ? 'leave' : 'wait';
}

// EPL access is the `epl` field of the `/lobby` reply (cloud/lobby.mjs), which the app reads anyway: the check costs no
// request of its own. AppData.jsx notes each lobby reply here; SportEntry (above the NFL app) listens. A missing field reads
// as false. The server lets every account read EPL and refuses picks and queues to accounts not linked to a manager.
let lobbyAccess = null;
const listeners = new Set();
/** The lobby reply's EPL access: true only for `epl: true`. */
export const eplAccessFromLobby = data => data !== null && typeof data === 'object' && data.epl === true;
/** Records this account's EPL access from a lobby reply (or false when the lobby could not be read). */
export function noteLobbyEpl(userId, data) {
  const value = eplAccessFromLobby(data);
  if (lobbyAccess?.userId === userId && lobbyAccess.value === value) return;
  lobbyAccess = { userId, value };
  for (const listener of [...listeners]) listener();
}
/** The known answer for this account, or null until a lobby reply says. */
export const knownEplAccess = userId => (lobbyAccess?.userId === userId ? lobbyAccess.value : null);
export function subscribeEplAccess(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }

// A cold #epl link mounts no NFL app, so nothing has read the lobby: SportEntry reads it once (primeLobby), and the NFL
// app's first lobby read takes that same answer (takePrimedLobby) instead of asking again, while it is fresh.
const PRIMED_FRESH_MS = 60_000;
let primed = null;
export function primeLobby(userId, read, now = Date.now) {
  if (primed?.userId !== userId) {
    const entry = { userId, at: null };
    entry.promise = Promise.resolve().then(read).then(
      data => { entry.at = now(); noteLobbyEpl(userId, data); return data; },
      error => { primed = primed === entry ? null : primed; noteLobbyEpl(userId, null); throw error; });
    primed = entry;
  }
  return primed.promise;
}
/** The primed lobby read for this account (once, and only while it is on its way or fresh), else null. */
export function takePrimedLobby(userId, now = Date.now) {
  const entry = primed?.userId === userId ? primed : null;
  primed = null;
  if (!entry || (entry.at !== null && now() - entry.at > PRIMED_FRESH_MS)) return null;
  return entry.promise;
}
export function resetEplAccessCache() { lobbyAccess = null; primed = null; listeners.clear(); }
