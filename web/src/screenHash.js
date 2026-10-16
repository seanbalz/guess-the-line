// Persona audit #3: one history entry per Community screen (#feed, #picks, #history, #fantasy, #groups), so the phone's Back button moves
// between screens instead of leaving the site and a reload lands on the same tab. The Picks screen's entry also carries the market
// that is open (#picks-spread, #picks-total), so a reload or a Forward reopens that market, not whichever is due first; a bare #picks
// lets the screen choose. Any other fragment (the #main and #picks-due skip-link targets, Supabase's #type=recovery, a removed
// #invite) leaves the screen alone; an empty fragment is the feed. #history (the Community history view) is a bare screen.
import { useSyncExternalStore } from 'react';

export const SCREENS = ['feed', 'picks', 'history', 'fantasy', 'groups'];
export const DEFAULT_SCREEN = 'feed';
export const MARKET_SLUGS = { guess_spread: 'spread', guess_total: 'total' };
const MARKET_OF_SLUG = Object.fromEntries(Object.entries(MARKET_SLUGS).map(([mode, slug]) => [slug, mode]));
const HOME = { screen: DEFAULT_SCREEN, market: null };
/** The screen and, on Picks, the market a fragment names; null when the fragment is not a screen. */
export function placeFromHash(fragment) {
  const name = String(fragment || '').replace(/^#/, '');
  if (name === '') return HOME;
  if (SCREENS.includes(name)) return { screen: name, market: null };
  const [, slug] = name.match(/^picks-([a-z]+)$/) || [];
  return slug && MARKET_OF_SLUG[slug] ? { screen: 'picks', market: MARKET_OF_SLUG[slug] } : null;
}
export const screenFromHash = fragment => placeFromHash(fragment)?.screen ?? null;
export const marketFromHash = fragment => placeFromHash(fragment)?.market ?? null;
export const fragmentOf = ({ screen, market }) => `#${screen}${screen === 'picks' && market ? `-${MARKET_SLUGS[market]}` : ''}`;

const hash = () => { try { return window.location.hash; } catch { return ''; } };
let current = placeFromHash(hash()) || HOME;
const listeners = new Set();
const notify = () => { for (const listener of listeners) listener(); };
const same = (a, b) => a.screen === b.screen && a.market === b.market;
function sync() { const next = placeFromHash(hash()); if (next && !same(next, current)) { current = next; notify(); } }
if (typeof window !== 'undefined') { window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync); }

function move(next, replace) {
  if (same(next, current)) return false;
  try { window.history[replace ? 'replaceState' : 'pushState'](null, '', fragmentOf(next)); } catch { /* The screen still changes in memory. */ }
  current = next; notify();
  return true;
}
export const currentScreen = () => current.screen;
/** The market the Picks entry names, or null when it is bare (or another screen is open). */
export const currentMarket = () => current.market;
/** Moves to a screen: a new history entry, or `replace` for a move the player did not ask for (the community fallback). */
export function goScreen(name, { replace = false } = {}) {
  if (!SCREENS.includes(name) || name === current.screen) return false;
  return move({ screen: name, market: null }, replace);
}
/** Writes the market open on the Picks screen into its own history entry (never a new one), so a reload or Forward lands on it. */
export function setMarket(mode) {
  if (current.screen !== 'picks' || !MARKET_SLUGS[mode]) return false;
  return move({ screen: 'picks', market: mode }, true);
}
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const useScreen = () => useSyncExternalStore(subscribe, currentScreen, currentScreen);
