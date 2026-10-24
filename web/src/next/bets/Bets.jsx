import { lazy, useCallback, useEffect, useState } from 'react';
import { Coins, ListFilter, NotebookPen, Users } from 'lucide-react';
import DeferredScreen from '../../DeferredScreen.jsx';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { InfoButton } from '../ui/InfoButton.jsx';
import { INFO } from '../info.js';
import { NetUnits } from './NetUnits.jsx';
import { EveryoneBets } from './EveryoneBets.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { TrackedBetRow } from './TrackedBetRow.jsx';
import { FocusAction, FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { useTicketSummary } from './useTicketSummary.js';
import { recommendationMarket } from '../../../../shared/recommended-bets.mjs';
import './bets.css';
import '../../liveBets.css';

const SocialBetTracker = lazy(() => import('../../SocialBetTracker.jsx'));
// Each view's fine print, behind the title's ⓘ (D-55).
const TOPIC = Object.freeze({ tracked: 'trackedBets', recommended: 'recommended', virtual: 'virtual', everyone: 'everyone' });
const VirtualUnits = lazy(() => import('../../VirtualUnits.jsx'));
const RECOMMENDED_MARKETS = [{ value: 'all', label: 'All' }, { value: 'spread', label: 'Spreads' }, { value: 'total', label: 'Totals' }];
// M-10: inside Virtual Units, your own card or everyone's picks this week (read only).
const VIRTUAL_VIEWS = [{ value: 'virtual', label: 'Your picks' }, { value: 'everyone', label: 'Everyone' }];

// Recommendations follow the published account week. The existing All games Virtual Units editor keeps its league scope.
export function Bets() {
  const shell = useShell();
  return ['active', 'settled', 'tracked', 'add', 'virtual', 'everyone', 'recommended'].includes(shell.state.views.bets.view) ? <BetsDetail/> : <BetsLanding/>;
}

function BetsLanding() {
  const app = useAppData(), shell = useShell(), read = useTicketSummary(app);
  const open = view => shell.go('bets', { view, season: null, week: null, period: null });
  const count = key => read.loading ? 'Loading your tickets…' : read.error ? 'Unavailable · open to retry' : `${read[key]} ${read[key] === 1 ? 'ticket' : 'tickets'} · all weeks`;
  return <section className="gx-screen gx-bets" data-landing="bets">
    <h1 className="gx-t-title">Bets</h1>
    <FocusAction title="Your tickets. All together." description="Keep a record of the bets you placed elsewhere." action="Add a bet" onAction={() => open('add')}/>
    <FocusRows label="Your bets">
      <FocusRow icon="ticket" title="Active tickets" sub={count('active')} onClick={() => open('active')}/>
      <FocusRow icon="check" title="Settled tickets" sub={count('settled')} onClick={() => open('settled')}/>
      <FocusRow icon="chart" title="Recommended" sub="Research from your submitted guesses" onClick={() => open('recommended')}/>
      <FocusRow icon={Coins} title="Virtual Units" sub="Your separate play-money picks" onClick={() => open('virtual')}/>
      <FocusRow icon={Users} title="Everyone’s picks" sub="Friends’ Virtual Units picks this week" onClick={() => open('everyone')}/>
    </FocusRows>
  </section>;
}

function BetsDetail() {
  const app = useAppData(), shell = useShell();
  const destination = shell.state.views.bets.view;
  const view = destination === 'everyone' ? 'virtual' : ['virtual', 'recommended'].includes(destination) ? destination : 'tracked';
  const route = shell.state.views.bets;
  const trackerState = { ...route.trackers?.[destination], ...(route.period === 'all' ? { allHistory: true }
    : route.season && route.week ? { selectedWeek: { season: route.season, week: route.week }, allHistory: false } : {}) };
  const rememberTracker = useCallback(value => shell.setView('bets', {
    trackers: { ...shell.state.views.bets.trackers, [destination]: value },
    season: value.allHistory ? null : value.selectedWeek?.season ?? null,
    week: value.allHistory ? null : value.selectedWeek?.week ?? null,
    period: value.allHistory ? 'all' : null,
  }), [shell.setView, shell.state.views.bets.trackers, destination]);
  // BETS-NEXT-01: Recommended's All / Spreads / Totals choice is a Bets view preference. It survives Track this bet
  // and returning within Bets; it is not part of the address and changes nothing that is saved. The embedded
  // Recommended list filters by it; the new app's own segmented control is drawn here and handed to that list.
  const recommendedMarket = recommendationMarket(route.recommendedMarket);
  const chooseRecommendedMarket = useCallback(value => shell.setView('bets', { recommendedMarket: value }), [shell.setView]);
  const marketControl = <Segmented label="Recommendation market" value={recommendedMarket} onChange={chooseRecommendedMarket} options={RECOMMENDED_MARKETS}/>;
  const { setDirty } = shell;
  const [ticketRequest, setTicketRequest] = useState(null);
  const ticketConsumed = useCallback(() => setTicketRequest(null), []);
  const dirty = useCallback(value => setDirty('bets', value), [setDirty]);
  useEffect(() => () => setDirty('bets', false), [setDirty]);
  const saved = () => app.refresh({ only: ['community', 'personal'] });
  const league = app.league;
  const privateLeague = !league.community && !league.pending && app.leagues.some(item => item.id === league.id && !item.community);
  function choose(next) {
    if (next === view || !shell.confirmLeave()) return;
    setDirty('bets', false);
    shell.setView('bets', { view: next, season: null, week: null, period: null });
  }
  function chooseVirtual(next) {
    if (next === destination || !shell.confirmLeave()) return;
    setDirty('bets', false);
    shell.setView('bets', { view: next, season: null, week: null, period: null });
  }
  function trackRecommendation(ticket) {
    if (!shell.confirmLeave()) return;
    setTicketRequest({ id: crypto.randomUUID(), accountId: app.accountId, ticket });
    setDirty('bets', false);
    shell.setView('bets', { view: 'tracked', season: ticket.season, week: ticket.week, period: null });
  }
  const introduction = {
    tracked: 'Tickets you placed elsewhere, with results and history.',
    recommended: 'Review gaps between your locked guesses and current lines.',
    virtual: 'Choose a league and place play-money picks.',
    everyone: 'Everyone’s play-money picks this week.',
  };
  const topic = destination === 'everyone' ? 'everyone' : TOPIC[view];
  return <section className="gx-screen gx-bets gx-live-workflow" aria-labelledby="gx-bets-title">
    <header className="gx-bets-heading">
      <div className="gx-bets-titlebar"><h1 id="gx-bets-title" className="gx-t-title gx-grow">{({ active: "Active tickets", settled: "Settled tickets", add: "Add a bet", recommended: "Recommended", virtual: "Virtual Units", everyone: "Everyone’s picks" })[destination] ?? "Tracked bets"}</h1><InfoButton title={INFO[topic].title} body={INFO[topic].body}/></div>
      <p className="gx-t-body gx-c-2">{introduction[destination === 'everyone' ? 'everyone' : view]}</p>
    </header>
    {/* D-55: short visible labels, full accessible names, one row at every phone width. */}
    <div className="gx-bets-views" role="group" aria-label="Bets view">
      <Button aria-label="Tracked bets" aria-pressed={view === 'tracked'} onClick={() => choose('tracked')}>Tracked</Button>
      <Button aria-label="Recommended" aria-pressed={view === 'recommended'} onClick={() => choose('recommended')}>Recommended</Button>
      <Button aria-label="Virtual Units" aria-pressed={view === 'virtual'} onClick={() => choose('virtual')}>Virtual</Button>
    </div>
    {view === 'tracked' ? <>
      <DeferredScreen label="tracked bets"><SocialBetTracker key={`${app.accountId}:${destination}:${shell.state.nav}`} player={app.accountId} initialOutcome={destination === 'active' ? 'pending' : destination === 'settled' ? 'settled' : ''} initialAllHistory={destination === 'active' || destination === 'settled'} autoCreate={destination === 'add'} navigationState={trackerState} onNavigationState={rememberTracker} initialView="mybets" embedded compactTickets TicketRow={TrackedBetRow} MetricsView={NetUnits} ticketRequest={ticketRequest?.accountId === app.accountId ? ticketRequest : null} onTicketConsumed={ticketConsumed} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : view === 'recommended' ? <>
      <DeferredScreen resetKey={`${app.accountId}:recommended`} label="recommended bets"><VirtualUnits key={`${app.accountId}:recommended`} accountId={app.accountId} embedded initialView="recommended" accountRecommendations showViewTabs={false} recommendedMarket={recommendedMarket} onRecommendedMarket={chooseRecommendedMarket} marketControl={marketControl} onTrackTicket={trackRecommendation} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : <>
      <Segmented label="Virtual Units view" value={destination === 'everyone' ? 'everyone' : 'virtual'} onChange={chooseVirtual} options={VIRTUAL_VIEWS}/>
      {destination === 'everyone' ? <EveryoneBets onPlace={() => chooseVirtual('virtual')}/> : privateLeague ? <>
      <p className="gx-bets-context gx-t-meta gx-c-2"><Icon icon={Users} size={18}/><span>Showing {league.name}</span></p>
      <DeferredScreen resetKey={league.id} label="Virtual Units"><VirtualUnits key={`${app.accountId}:${league.id}`} accountId={app.accountId} leagueId={league.id} embedded showViewTabs={false} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></DeferredScreen>
    </> : <section className="gx-bets-choose"><span className="gx-bets-choose-icon"><Icon icon={Coins} size={28}/></span><h2 className="gx-t-section">Your league’s virtual picks</h2><p className="gx-t-body gx-c-2">Choose one of your private leagues to place Virtual Units picks.</p><Button icon={Users} onClick={() => shell.openSheet('sh.switcher')}>Choose league</Button></section>}
    </>}
  </section>;
}
