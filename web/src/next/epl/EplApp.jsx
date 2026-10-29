// EPL supplies sport-specific content to the same account, frame, menu and history machinery as NFL.
import './epl.css';
import { useId } from 'react';
import { useShell } from '../shell/context.js';
import { Segmented } from '../ui/index.js';
import { eplApi } from './api.js';
import { EPL_SECTIONS } from './route.js';
import { EplHome } from './EplHome.jsx';
import { PickATeam } from './PickATeam.jsx';
import { EplFantasy } from './fantasy/EplFantasy.jsx';

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

export function EplScreen() {
  const shell = useShell(), tab = shell.state.tab;
  const route = { tab, section: shell.state.views[tab]?.section ?? EPL_SECTIONS[tab]?.[0] };
  const onRoute = next => shell.go(next.tab, { section: next.section === EPL_SECTIONS[next.tab]?.[0] ? undefined : next.section });
  return <EplView route={route} onRoute={onRoute}/>;
}
/** Sport content only; header, profile, menus, offline state and tab bar are all Shell's. */
export function EplView({ route, onRoute, api = eplApi }) {
  return route.tab === 'play' ? <EplPlay route={route} onRoute={onRoute} api={api}/>
    : route.tab === 'bets' ? <EplBets/>
    : route.tab === 'research' ? <EplResearch api={api}/>
    : <EplHome api={api} onOpenPick={() => onRoute({ tab: 'play', section: 'pick' })}/>;
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
