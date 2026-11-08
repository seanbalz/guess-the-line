import { COMMUNITY } from '../data/league.js';
import { AccessPending, RemovedScreen } from './AppScreens.jsx';
import { useShell } from './context.js';

// Exactly the two named access covers. Keeping a real component identity lets
// Shell distinguish these supplied compositions from arbitrary custom covers.
export function LeagueCover({ app }) {
  const shell = useShell();
  if (app.league.pending) return <AccessPending name={app.league.name}
    onCommunity={() => { app.chooseLeague(COMMUNITY); shell.toast(`Showing ${COMMUNITY.name}`); }}
    onLeagues={() => shell.openSheet('sh.switcher')}/>;
  return <RemovedScreen hasGroups={app.leagues.length > 1} onLeagues={() => shell.openSheet('sh.switcher')} onReload={shell.reload}/>;
}
