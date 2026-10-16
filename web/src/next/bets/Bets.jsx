import { lazy, useCallback, useEffect } from 'react';
import { Coins, ListFilter, NotebookPen, Users } from 'lucide-react';
import DeferredScreen from '../../DeferredScreen.jsx';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import './bets.css';
import '../../liveBets.css';

const SocialBetTracker = lazy(() => import('../../SocialBetTracker.jsx'));
const VirtualUnits = lazy(() => import('../../VirtualUnits.jsx'));

// Recommendations follow the published account week. The existing All games Virtual Units editor keeps its league scope.
export function Bets() {
  const app = useAppData(), shell = useShell();
  const view = ['virtual', 'recommended'].includes(shell.state.views.bets.view) ? shell.state.views.bets.view : 'tracked';
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
      <Button icon={NotebookPen} aria-pressed={view === 'tracked'} onClick={() => choose('tracked')}>Tracked bets</Button>
      <Button icon={ListFilter} aria-pressed={view === 'recommended'} onClick={() => choose('recommended')}>Recommended</Button>
      <Button icon={Coins} aria-pressed={view === 'virtual'} onClick={() => choose('virtual')}>Virtual Units</Button>
    </div>
    {view === 'tracked' ? <>
      <p className="gx-bets-context gx-t-meta gx-c-2"><Icon icon={Users} size={18}/><span>Tracked bets are shared with all signed-in players, including when you select a private league. Results are player reported.</span></p>
      <DeferredScreen label="tracked bets"><SocialBetTracker key={app.accountId} player={app.accountId} embedded onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : view === 'recommended' ? <>
      <p className="gx-bets-context gx-t-meta gx-c-2"><Icon icon={Coins} size={18}/><span>Research from your current week’s submitted guesses, not validated model-based wagers. Add a suggestion to review its Virtual Units stake before placing it.</span></p>
      <DeferredScreen resetKey={`${app.accountId}:recommended`} label="recommended bets"><VirtualUnits key={`${app.accountId}:recommended`} accountId={app.accountId} embedded initialView="recommended" accountRecommendations showViewTabs={false} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : privateLeague ? <>
      <p className="gx-bets-context gx-t-meta gx-c-2"><Icon icon={Users} size={18}/><span>Showing {league.name}. Your account’s Virtual Units picks are reused across your leagues.</span></p>
      <DeferredScreen resetKey={league.id} label="Virtual Units"><VirtualUnits key={`${app.accountId}:${league.id}`} accountId={app.accountId} leagueId={league.id} embedded showViewTabs={false} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : <section className="gx-bets-choose"><span className="gx-bets-choose-icon"><Icon icon={Coins} size={28}/></span><h2 className="gx-t-section">Your league’s virtual picks</h2><p className="gx-t-body gx-c-2">Choose one of your private leagues to place Virtual Units picks.</p><Button icon={Users} onClick={() => shell.openSheet('sh.switcher')}>Choose league</Button></section>}
  </section>;
}
