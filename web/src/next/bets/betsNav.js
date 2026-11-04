// Bets' names, addresses and focus handles in one place (D-69 step 4): the landing's five sections, each with its own
// address (the addresses keep their earlier names, so saved links, Home's My bets tile and Research's buttons still
// work: #bets/research is Recommended, #bets/recommended is Your gap), one gap as a layer, and the stable ids the shell
// returns focus to on Back (a spoken name can change; an id does not).
import { BETS_LAYERS } from '../shell/state.js';
import { gameName } from '../research/researchNav.js';

export const BETS_SECTIONS = Object.freeze(['mybets', 'picks', 'everyone', 'recommended', 'gap']);
export const BETS_NAMES = Object.freeze({ title: 'Bets', mybets: 'My bets', picks: 'Your picks', everyone: 'Everyone', recommended: 'Recommended', gap: 'Your gap' });
/** Each section's address, its `view`: My bets opens Active tickets, as Home's My bets tile does. */
export const SECTION_VIEW = Object.freeze({ mybets: 'active', picks: 'virtual', everyone: 'everyone', recommended: 'research', gap: 'recommended' });
/** Each address's section: My bets has four (its three lists and Add a bet). */
export const SECTION_OF = Object.freeze({ tracked: 'mybets', active: 'mybets', settled: 'mybets', add: 'mybets', virtual: 'picks', everyone: 'everyone', research: 'recommended', recommended: 'gap' });
/** My bets' one meta line: the list its address opened. */
export const LIST_WORDS = Object.freeze({ active: 'Active tickets · all weeks', settled: 'Settled tickets · all weeks', add: 'Add a bet' });
/** A fresh section: no week, period, matchup or assessment carried in; My bets on its tickets. */
export const BETS_FRESH = Object.freeze({ season: null, week: null, period: null, matchup: null, assessment: null, trackedPane: 'tickets' });
export const tileId = key => `gx-b-tile-${key}`;
/** The landing's one lime button, whatever its words (Place picks, Add a bet). */
export const HERO_ACTION_ID = 'gx-b-hero-action';
export const gapItem = (gameId, market) => `${gameId}:${market}`;
export const gapRowId = item => `gx-b-gap-${String(item).replace(':', '-')}`;
/** "Seahawks @ Broncos · Total" from a gap's item: the layer's heading, the same while its read loads. */
export function gapTitle(item) {
  const [id = '', market] = String(item).split(':'), [away, home] = id.split('-');
  return `${away && home ? gameName(away, home) : id} · ${market === 'spread' ? 'Spread' : 'Total'}`;
}
export function openView(shell, view) { shell.go('bets', { view, ...BETS_FRESH }); }
export function openSection(shell, key) { openView(shell, SECTION_VIEW[key]); }
export function openGap(shell, item) { shell.setView('bets', { layer: BETS_LAYERS.recommended.layer, item }); }
export function closeGap(shell) { shell.setView('bets', { layer: undefined, item: undefined }); }
/**
 * Your gap's unsaved selections stay on screen at every Your gap address (its list, or one gap over the list, which
 * stays mounted under it), so opening or closing a gap never asks to leave them (the shell's `setDirty` keeps).
 */
export const keepsYourGap = next => next?.tab === 'bets' && next.views?.bets?.view === SECTION_VIEW.gap;
