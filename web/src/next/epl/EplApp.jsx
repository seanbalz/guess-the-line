// The EPL mini-app (#epl/...): the new app's four tabs for the FEPL league. Home and Play > Pick a Team are Plan 1 (Task 8);
// Play > Guess the Line and Leaderboard (Plan 3) and Research > Fantasy (Plan 2) show a "Coming next" card. Bets has
// nothing for the Premier League.
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../shell/shell.css';
import './epl.css';
import { useEffect, useId, useRef, useState } from 'react';
import { useDashboardPreferences } from '../../dashboardPreferences.js';
import { noteSportRoute } from '../../sportNavigation.js';
import { FieldMark, Icon, Segmented } from '../ui/index.js';
import { cx } from '../ui/cx.js';
import { addNextFontLinks } from '../styles/fonts.js';
import { confirmSportLeave } from '../nba/route.js';
import { EPL_TABS, eplHash, eplRoute, sportOptions } from './route.js';
import { eplApi } from './api.js';
import { EplHome } from './EplHome.jsx';
import { PickATeam } from './PickATeam.jsx';

export const EPL_COPY = Object.freeze({
  nav: 'EPL',
  skip: 'Skip to main content',
  tabs: { home: 'Home', play: 'Play', bets: 'Bets', research: 'Research' },
  sections: { pick: 'Pick a Team', guess: 'Guess the Line', leaderboard: 'Leaderboard', fantasy: 'Fantasy' },
  comingNext: 'Coming next',
  soon: {
    guess: 'Guess which club is favored in each match and its price. Each match locks at kickoff.',
    leaderboard: 'Ranked by the lowest average distance per match guessed.',
    fantasy: 'Your FEPL matchup, standings, rosters and insights.',
  },
  noBets: "Bets aren't available for the Premier League.",
});
const TAB_ICONS = { home: 'house', play: 'target', bets: 'ticket', research: 'chart' };

export default function EplApp({ onSportChange, api = eplApi }) {
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
    if (eplHash(next) === eplHash(current.current)) { window.scrollTo(0, 0); return; }
    if (!confirmSportLeave()) return;
    setRoute(next); window.history.pushState(null, '', eplHash(next)); noteSportRoute(); window.scrollTo(0, 0);
  }
  return <EplView route={route} onRoute={go} onSportChange={onSportChange} api={api} motion={preferences.motion}/>;
}

/** The frame and the tab showing, drawn from `route` alone (no window reads), so tests render it directly. */
export function EplView({ route, onRoute, onSportChange, api = eplApi, motion }) {
  const mainRef = useRef(null);
  // The skip link moves focus without touching the address: an #epl-main fragment would read as a route.
  function skipToMain(event) { event.preventDefault(); mainRef.current?.focus(); }
  return <div className="gx gx-epl" data-motion={motion === 'reduced' ? 'reduce' : undefined}>
    <a className="gx-sr-only gx-epl-skip" href="#epl-main" onClick={skipToMain}>{EPL_COPY.skip}</a>
    <div className="gx-app">
      <header className="gx-topbar"><div className="gx-topbar-inner gx-epl-top">
        <FieldMark size={32}/>
        <Segmented label="Sport" value="epl" options={sportOptions(true)} onChange={value => onSportChange?.(value)}/>
      </div></header>
      <main className="gx-main" id="epl-main" tabIndex={-1} ref={mainRef}>
        {route.tab === 'play' ? <EplPlay route={route} onRoute={onRoute} api={api}/>
          : route.tab === 'bets' ? <EplBets/>
          : route.tab === 'research' ? <EplResearch/>
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

function EplResearch() {
  return <div className="gx-screen" data-epl-section="fantasy">
    <h1 className="gx-t-title">{EPL_COPY.tabs.research}</h1>
    <ComingNextCard section="fantasy" title={EPL_COPY.sections.fantasy}/>
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
