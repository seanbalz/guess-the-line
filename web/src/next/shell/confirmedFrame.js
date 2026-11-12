// Presentation only. Callers prove the actual production router/component identities;
// no private read, stored preference or error condition selects a frame here.
import { PROPS_PLAY_SECTION } from '../props/flag.js';

export function nflFrameContext(state, { screen = false, history = false, cover = false, unknownCover = false, draft = false, points = false } = {}) {
  if (unknownCover) return null;
  if (cover) return 'league-cover';
  if (state.page) return history && state.page.id === 'page.history'
    && [undefined, 'guess', 'bets', 'older'].includes(state.page.view) ? 'history' : null;
  if (!screen) return null;
  const view = state.views[state.tab] ?? {};
  if (state.tab === 'home') return !view.layer ? 'home' : null;
  if (state.tab === 'play') {
    if (!view.section || view.section === PROPS_PLAY_SECTION) return 'play';
    if (view.section === 'score') return 'play-score';
    if (view.section === 'league') return [undefined, 'board', 'feed'].includes(state.views.league?.view ?? view.view) ? 'play-league' : null;
    if (view.section === 'points' && points) return 'play-points';
    return view.section === 'picks' && ['spread', 'total', 'guess_spread', 'guess_total'].includes(view.market)
      && typeof view.pickGame === 'string' && view.pickGame.length > 0 && draft ? 'play-draft' : null;
  }
  if (state.tab === 'research') return ['games', 'trends', 'teams', 'fantasy'].includes(view.section) ? `research-${view.section}` : null;
  if (state.tab !== 'bets') return null;
  if (!view.view) return 'bets';
  if (['recommended', 'virtual'].includes(view.view)) return `bets-${view.view}`;
  if (view.view === 'tracked' && view.trackedPane === 'overview') return 'bets-overview';
  return ['active', 'settled'].includes(view.view) && typeof view.selectedTicket === 'string'
    && view.selectedTicket.length > 0 ? 'bets-receipt' : null;
}

/** NBA (milestone N1): every actual NBA tab uses the compact Prism frame of mockups 01 to 09; pages stay native. */
export function nbaFrameContext(state) {
  if (state.page) return null;
  return ['home', 'play', 'bets', 'research'].includes(state.tab) ? `nba-${state.tab}` : null;
}

export function eplFrameContext(state) {
  if (state.page) return null;
  const section = state.views[state.tab]?.section;
  if (state.tab === 'home' && !section) return 'epl-home';
  return state.tab === 'play' && [undefined, 'pick', 'guess', 'leaderboard'].includes(section) ? 'epl-play' : null;
}
