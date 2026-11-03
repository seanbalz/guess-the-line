// Sport changes preserve the current primary destination. Only a shared subsection crosses sports;
// NFL filters, matchup IDs and league IDs never become EPL route arguments (or the reverse).
import { createContext } from 'react';
import { eplHash, eplRoute, SPORT_HOME } from './epl/route.js';
import { placeFromFragment } from './shell/router.js';

export const SportNavigationContext = createContext({ sport: 'nfl', change: null });
export function sportSwitchHash(sport, hash) {
  const epl = eplRoute(hash), nfl = epl ? null : placeFromFragment(hash);
  const tab = epl?.tab ?? nfl?.tab ?? 'home';
  const fantasy = epl?.section === 'fantasy' || nfl?.view?.section === 'fantasy';
  if (sport === 'epl') return eplHash({ tab, ...(fantasy ? { section: 'fantasy' } : {}) });
  if (sport === 'nfl') return `#${tab}${tab === 'research' && fantasy ? '/fantasy' : ''}`;
  return SPORT_HOME[sport] ?? '#home';
}
