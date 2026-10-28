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
/** NFL / NBA, plus EPL for accounts linked to an FEPL manager (and the commissioner). */
export function sportOptions(epl) {
  return [{ value: 'nfl', label: 'NFL' }, { value: 'nba', label: 'NBA' }, ...(epl ? [{ value: 'epl', label: 'EPL' }] : [])];
}

/** Whether this account sees EPL, provided by main.jsx's sport entry (false until the access read answers). */
export const EplAccessContext = createContext(false);

/**
 * One `draft/read`: a refusal (401, 403, or the feature not switched on) hides EPL; an answer, or any other failure
 * (no week stored yet, an outage), keeps it. The server still refuses every EPL read and write to non-members.
 */
export async function readEplAccess(api, options = {}) {
  try { await api('draft/read', {}, options); return true; }
  catch (error) { return !(error?.status === 401 || error?.status === 403 || error?.code === 'GTL_EPL_OFF'); }
}
