import { EPL_SECTIONS, EPL_TABS, eplHash, eplRoute } from './route.js';

// Only EPL route fields cross into browser history. Default sport modes are tab roots, so Back
// does not loop between /play and /play/pick or carry NFL filters into an EPL read.
function cleanPlace({ tab, view = {} }) {
  if (!EPL_TABS.includes(tab)) return null;
  const section = EPL_SECTIONS[tab]?.includes(view?.section) ? view.section : null;
  return { tab, view: section && section !== EPL_SECTIONS[tab]?.[0] ? { section } : {} };
}
export const EPL_ROUTER = Object.freeze({
  sport: 'epl',
  cleanPlace,
  fragmentFor: (tab, view) => eplHash({ tab, section: view?.section }),
  placeFromFragment: hash => {
    const route = eplRoute(hash);
    return route ? cleanPlace({ tab: route.tab, view: { section: route.section } }) : null;
  },
  isLegacyFragment: () => false,
});
