// Sport changes preserve the current primary destination. Only a shared subsection crosses sports;
// NFL filters, matchup IDs and league IDs never become EPL route arguments (or the reverse).
import { createContext } from 'react';
import { eplHash, eplRoute, SPORT_HOME } from './epl/route.js';
import { nbaHash, nbaRoute } from './nba/route.js';
import { placeFromFragment } from './shell/router.js';

export const SportNavigationContext = createContext({ sport: 'nfl', change: null });
export function sportSwitchHash(sport, hash) {
  const epl = eplRoute(hash), nba = epl ? null : nbaRoute(hash), nfl = epl || nba ? null : placeFromFragment(hash);
  const tab = epl?.tab ?? nba?.tab ?? nfl?.tab ?? 'home';
  const fantasy = epl?.section === 'fantasy' || nfl?.view?.section === 'fantasy';
  if (sport === 'epl') return eplHash({ tab, ...(fantasy ? { section: 'fantasy' } : {}) });
  if (sport === 'nfl') return `#${tab}${tab === 'research' && fantasy ? '/fantasy' : ''}`;
  // NBA keeps the tab only; no NFL or EPL value becomes an NBA route value (Research opens NBA's games board).
  if (sport === 'nba') return nbaHash({ tab });
  return SPORT_HOME[sport] ?? '#home';
}
