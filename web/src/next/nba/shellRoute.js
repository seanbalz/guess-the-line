import { NBA_TABS, nbaHash, nbaRoute, nbaView } from './route.js';

// Only NBA route fields cross into browser history (the EPL_ROUTER pattern). Bets' Open/History pane, its filters and
// Research's date are view values on tab roots, so changing them rewrites the current entry instead of adding one:
// Back never loops between panes, and NFL filters never reach an NBA read.
function cleanPlace({ tab, view = {} }) {
  if (!NBA_TABS.includes(tab)) return null;
  return { tab, view: nbaView(tab, view) };
}
export const NBA_ROUTER = Object.freeze({
  sport: 'nba',
  cleanPlace,
  fragmentFor: (tab, view) => nbaHash({ tab, view }),
  placeFromFragment: hash => {
    const route = nbaRoute(hash);
    return route ? cleanPlace(route) : null;
  },
  // v1 addresses and unknown #nba/... fragments land on their new place with replaceState (router.js startPlace and
  // popstate), so Back returns to wherever the member came from, never to the old address.
  isLegacyFragment: hash => nbaRoute(hash)?.legacy === true,
});
