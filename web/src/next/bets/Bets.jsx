import { lazy, useCallback, useEffect } from 'react';
import DeferredScreen from '../../DeferredScreen.jsx';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button } from '../ui/Button.jsx';
import './bets.css';

const SocialBetTracker = lazy(() => import('../../SocialBetTracker.jsx'));
const VirtualUnits = lazy(() => import('../../VirtualUnits.jsx'));

// Reuse the hosted workflows. The shared tracker has no league scope; Virtual Units requires an active private league.
export function Bets() {
  const app = useAppData(), shell = useShell();
  const view = shell.state.views.bets.view === 'virtual' ? 'virtual' : 'tracked';
  const { setDirty } = shell;
  const dirty = useCallback(value => setDirty('bets', value), [setDirty]);
  useEffect(() => () => setDirty('bets', false), [setDirty]);
  const saved = () => app.refresh({ only: ['community', 'personal'] });
  const league = app.league;
  const privateLeague = !league.community && !league.pending && app.leagues.some(item => item.id === league.id && !item.community);
  function choose(next) {
    if (next === view || !shell.confirmLeave()) return;
    setDirty('bets', false);
    shell.setView('bets', { view: next });
  }
  return <section className="gx-screen gx-bets gx-live-workflow" aria-labelledby="gx-bets-title">
    <header className="gx-bets-heading"><h1 id="gx-bets-title" className="gx-t-title">Bets</h1><p className="gx-t-body gx-c-2">Track tickets you placed elsewhere, or play with Virtual Units.</p></header>
    <div className="gx-bets-views" role="group" aria-label="Bets view">
      <Button aria-pressed={view === 'tracked'} onClick={() => choose('tracked')}>Tracked bets</Button>
      <Button aria-pressed={view === 'virtual'} onClick={() => choose('virtual')}>Virtual Units</Button>
    </div>
    {view === 'tracked' ? <>
      <p className="gx-t-meta gx-c-2">Tracked bets are shared with all signed-in players, including when you select a private league. Results are player reported.</p>
      <DeferredScreen label="tracked bets"><SocialBetTracker key={app.accountId} player={app.accountId} embedded onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : privateLeague ? <>
      <p className="gx-t-meta gx-c-2">Showing {league.name}. Your account’s Virtual Units picks are reused across your leagues.</p>
      <DeferredScreen resetKey={league.id} label="Virtual Units"><VirtualUnits key={`${app.accountId}:${league.id}`} leagueId={league.id} embedded onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : <section className="gx-bets-choose"><p className="gx-t-body">Choose one of your private leagues to place Virtual Units picks.</p><Button onClick={() => shell.openSheet('sh.switcher')}>Choose league</Button></section>}
  </section>;
}
