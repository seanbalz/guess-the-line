// EPL sport views (#epl/...) use the same top bar, sport row and four-tab layout as NFL. Home and Play > Pick a Team are Plan 1 (Task 8);
// Research > Fantasy is Plan 2 (web/src/next/epl/fantasy/); Play > Guess the Line and Leaderboard (Plan 3) show a
// "Coming next" card. Bets has nothing for the Premier League.
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../shell/shell.css';
import './epl.css';
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { noteSportRoute } from '../../sportNavigation.js';
import { Avatar, Button, Card, Icon, Segmented, Sheet } from '../ui/index.js';
import { TopBar } from '../shell/Frame.jsx';
import { useFixedBarsPinned } from '../shell/viewportPin.js';
import { cx } from '../ui/cx.js';
import { addNextFontLinks } from '../styles/fonts.js';
import { confirmSportLeave } from '../nba/route.js';
import { EPL_TABS, eplHash, eplRoute, sportOptions } from './route.js';
import { eplApi } from './api.js';
import { EplHome } from './EplHome.jsx';
import { PickATeam } from './PickATeam.jsx';
import { EplFantasy } from './fantasy/EplFantasy.jsx';

const Appearance = lazy(() => import('../me/Appearance.jsx').then(module => ({ default: module.Appearance })));

export const EPL_COPY = Object.freeze({
  nav: 'EPL',
  skip: 'Skip to main content',
  tabs: { home: 'Home', play: 'Play', bets: 'Bets', research: 'Research' },
  sections: { pick: 'Pick a Team', guess: 'Guess the Line', leaderboard: 'Leaderboard', fantasy: 'Fantasy' },
  comingNext: 'Coming next',
  soon: {
    guess: 'Guess which club is favored in each match and its price. Each match locks at kickoff.',
    leaderboard: 'Ranked by the lowest average distance per match guessed.',
  },
  noBets: "Bets aren't available for the Premier League.",
});
const TAB_ICONS = { home: 'house', play: 'target', bets: 'ticket', research: 'chart' };

export default function EplApp({ session, onSignOut, onSportChange, api = eplApi }) {
  useFixedBarsPinned();
  const [route, setRoute] = useState(() => eplRoute(window.location.hash) || { tab: 'home' });
  const current = useRef(route); current.current = route;
  const [preferences] = useDashboardPreferences();
  useEffect(() => { addNextFontLinks(); }, []);
  useEffect(() => {
    const changed = () => { const next = eplRoute(window.location.hash); if (next && eplHash(next) !== eplHash(current.current)) setRoute(next); };
    window.addEventListener('popstate', changed); window.addEventListener('hashchange', changed);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener('hashchange', changed); };
  }, []);
  function go(next) {
    // Tab clicks omit the section. Store the same canonical route as the URL so Play opens Pick a Team,
    // and clicking that section cannot be discarded as a no-op while an incomplete route is rendered.
    const hash = eplHash(next), normalized = eplRoute(hash);
    if (hash === eplHash(current.current)) { window.scrollTo(0, 0); return; }
    if (!confirmSportLeave()) return;
    setRoute(normalized); window.history.pushState(null, '', hash); noteSportRoute(); window.scrollTo(0, 0);
  }
  return <EplView route={route} onRoute={go} onSportChange={onSportChange} api={api} motion={preferences.motion} session={session} onSignOut={onSignOut}/>;
}

/** The frame and the tab showing, drawn from `route` alone (no window reads), so tests render it directly. */
export function EplView({ route, onRoute, onSportChange, api = eplApi, motion, session, onSignOut }) {
  const [panel, setPanel] = useState(null);
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const user = session?.user ?? {};
  const you = { id: user.id ?? '', name: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || 'Your account' };
  async function signOut() {
    if (signingOut || !confirmSportLeave()) return;
    setSigningOut(true);
    try { await onSignOut?.(); } catch (error) { setSignOutError(error.message); setSigningOut(false); }
  }
  const mainRef = useRef(null);
  // The skip link moves focus without touching the address: an #epl-main fragment would read as a route.
  function skipToMain(event) { event.preventDefault(); mainRef.current?.focus(); }
  return <div className="gx gx-epl" data-motion={motion === 'reduced' ? 'reduce' : undefined}>
    <a className="gx-sr-only gx-epl-skip" href="#epl-main" onClick={skipToMain}>{EPL_COPY.skip}</a>
    <div className="gx-app">
      <TopBar leagueName="Premier League" leagueActionLabel="League: Premier League" you={you} onHome={() => onRoute({ tab: 'home' })} onLeague={() => setPanel('league')} onMenu={() => setPanel('menu')}/>
      <div className="gx-sport-controls"><Segmented label="Sport" value="epl" options={sportOptions(true)} onChange={value => onSportChange?.(value)}/></div>
      <main className="gx-main" id="epl-main" tabIndex={-1} ref={mainRef}>
        {route.tab === 'play' ? <EplPlay route={route} onRoute={onRoute} api={api}/>
          : route.tab === 'bets' ? <EplBets/>
          : route.tab === 'research' ? <EplResearch api={api}/>
          : <EplHome api={api} onOpenPick={() => onRoute({ tab: 'play', section: 'pick' })}/>}
      </main>
      <nav className="gx-tabbar" aria-label={EPL_COPY.nav}><div className="gx-tabbar-inner">
        {EPL_TABS.map(tab => {
          const on = tab === route.tab;
          return <button key={tab} type="button" className={cx('gx-tab', on && 'gx-tab--on')} data-tab={tab} aria-current={on ? 'page' : undefined} onClick={() => onRoute({ tab })}>
            <span className="gx-tab-icon"><Icon icon={TAB_ICONS[tab]}/></span>
            <span className="gx-tab-label">{EPL_COPY.tabs[tab]}</span>
          </button>;
        })}
      </div></nav>
      {panel ? <Sheet title={panel === 'league' ? 'Premier League' : panel === 'appearance' ? 'Appearance' : 'Menu'} onClose={() => setPanel(null)} back={panel === 'appearance' ? { label: 'Menu', onBack: () => setPanel('menu') } : undefined}>
        {panel === 'appearance' ? <Suspense fallback={<p role="status">Loading appearance…</p>}><Appearance/></Suspense> : panel === 'league' ? <>
          <p className="gx-t-body">Premier League competitions and FEPL Fantasy share this sport’s Home, Play and Research tabs.</p>
          <Button onClick={() => { setPanel(null); onRoute({ tab: 'play', section: 'pick' }); }}>Pick a Team</Button>
        </> : <>
          <Card className="gx-menu-account"><Avatar id={you.id} name={you.name} size={56}/><div><p className="gx-t-strong">{you.name}</p><p className="gx-t-meta gx-c-2">Signed in as {user.email}</p></div></Card>
          <Button variant="secondary" onClick={() => setPanel('appearance')}>Appearance</Button>
          {onSignOut ? <Button variant="ghost-2" onClick={signOut} aria-disabled={signingOut || undefined}>{signingOut ? 'Signing out…' : 'Sign out'}</Button> : null}
          {signOutError ? <p role="alert">{signOutError}</p> : null}
        </>}
      </Sheet> : null}
    </div>
  </div>;
}

function EplPlay({ route, onRoute, api }) {
  const section = route.section;
  const options = ['guess', 'pick', 'leaderboard'].map(value => ({ value, label: EPL_COPY.sections[value] }));
  return <div className="gx-screen" data-epl-section={section}>
    <h1 className="gx-t-title">{EPL_COPY.tabs.play}</h1>
    <Segmented label={EPL_COPY.tabs.play} value={section} options={options} onChange={value => onRoute({ tab: 'play', section: value })}/>
    {section === 'pick' ? <PickATeam api={api}/> : <ComingNextCard section={section}/>}
  </div>;
}

function EplResearch({ api }) {
  return <div className="gx-screen" data-epl-section="fantasy">
    <h1 className="gx-t-title">{EPL_COPY.tabs.research}</h1>
    <EplFantasy api={api}/>
  </div>;
}

function EplBets() {
  return <div className="gx-screen">
    <h1 className="gx-t-title">{EPL_COPY.tabs.bets}</h1>
    <section className="gx-empty"><p className="gx-t-body">{EPL_COPY.noBets}</p></section>
  </div>;
}

function ComingNextCard({ section, title }) {
  const id = useId();
  return <section className="gx-empty" aria-labelledby={id}>
    <h2 className="gx-t-section" id={id}>{title ? `${title}: ${EPL_COPY.comingNext}` : EPL_COPY.comingNext}</h2>
    <p className="gx-t-body gx-c-2">{EPL_COPY.soon[section]}</p>
  </section>;
}
