// Bets (D-69 step 4, built for Sean's review): the landing (BetsLanding.jsx: the next move and five tiles) and five
// sections, each a screen with its own address, its one-word title and its ⓘ, opened from its tile; the top bar's Back
// returns to the landing, with focus on that tile. My bets is #bets/tracked, active, settled or add (the November 1
// Roomy cards, D-72); Your picks #bets/virtual (D-67); Everyone #bets/everyone; Recommended #bets/research (its own
// screen, research/Assessments.jsx); Your gap #bets/recommended. Recommendations and Virtual Units placement follow the
// published account week.
import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Deferred } from '../ui/Deferred.jsx';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { InfoButton } from '../ui/InfoButton.jsx';
import { MetaLine } from '../ui/index.js';
import { INFO } from '../info.js';
import { NetUnits } from './NetUnits.jsx';
import { TrackedOverview } from './TrackedOverview.jsx';
import { EveryoneBets } from './EveryoneBets.jsx';
import { PlaceBets } from './PlaceBets.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { TrackedBetRow } from './TrackedBetRow.jsx';
import { BetsLanding } from './BetsLanding.jsx';
import { useBetWins } from './useBetWins.js';
import { BETS_NAMES, LIST_WORDS, SECTION_OF, openSection } from './betsNav.js';
import { draftParts, savedTicketToast } from './recommendationReview.js';
import { recommendationMarket } from '../../../../shared/recommended-bets.mjs';
import './bets.css';
import '../../liveBets.css';

const SocialBetTracker = lazy(() => import('../../SocialBetTracker.jsx'));
// Each section's fine print, behind the title's ⓘ (D-55).
const TOPIC = Object.freeze({ mybets: 'trackedBets', picks: 'virtual', everyone: 'everyone', gap: 'recommended' });
const VirtualUnits = lazy(() => import('../../VirtualUnits.jsx'));
const ResearchAssessments = lazy(() => import('../research/Assessments.jsx'));
const RECOMMENDED_MARKETS = [{ value: 'all', label: 'All' }, { value: 'spread', label: 'Spreads' }, { value: 'total', label: 'Totals' }];

export function Bets() { const view = useShell().state.views.bets.view; return Object.hasOwn(SECTION_OF, view ?? '') ? <BetsSection destination={view}/> : <BetsLanding/>; }

function BetsSection({ destination }) {
  const app = useAppData(), shell = useShell();
  const section = SECTION_OF[destination];
  const route = shell.state.views.bets;
  const trackerState = { ...route.trackers?.[destination], ...(route.trackedPane?{trackedPane:route.trackedPane}:{}), ...(route.period === 'all' ? { allHistory: true }
    : route.season && route.week ? { selectedWeek: { season: route.season, week: route.week }, allHistory: false } : {}) };
  const rememberTracker = useCallback(value => shell.setView('bets', {
    trackers: { ...shell.state.views.bets.trackers, [destination]: value },
    trackedPane: value.trackedPane,
    season: value.allHistory ? null : value.selectedWeek?.season ?? null,
    week: value.allHistory ? null : value.selectedWeek?.week ?? null,
    period: value.allHistory ? 'all' : null,
  }), [shell.setView, shell.state.views.bets.trackers, destination]);
  // BETS-NEXT-01: Recommended's All / Spreads / Totals choice is a Bets view preference. It survives reviewing a
  // recommended bet and returning within Bets; it is not part of the address and changes nothing that is saved. The
  // embedded Recommended list filters by it; the new app's own segmented control is drawn here and handed to that list.
  const recommendedMarket = recommendationMarket(route.recommendedMarket);
  const chooseRecommendedMarket = useCallback(value => shell.setView('bets', { recommendedMarket: value }), [shell.setView]);
  const marketControl = <Segmented label="Recommendation market" value={recommendedMarket} onChange={chooseRecommendedMarket} options={RECOMMENDED_MARKETS}/>;
  const { setDirty } = shell;
  const [ticketRequest, setTicketRequest] = useState(null);
  const drafts = useMemo(() => draftParts(setDirty), [setDirty]);
  const clearDirty = drafts.clear;
  const dirty = useCallback(value => drafts.mark('view', value), [drafts]);
  const reviewDirty = useCallback(value => drafts.mark('review', value), [drafts]);
  useEffect(() => clearDirty, [clearDirty]);
  const saved = () => app.refresh({ only: ['community', 'personal'] });
  // Player feedback (October 28, 2026): reviewing a recommended bet opens the tracker's editor over Recommended, so the
  // list, its market, scroll and open card stay put for the next one. A saved ticket says so with a way to My bets.
  function trackRecommendation(ticket) {
    if (ticketRequest) return;
    setTicketRequest({ id: crypto.randomUUID(), accountId: app.accountId, ticket });
  }
  function reviewDone({ saved: wasSaved }) {
    const ticket = ticketRequest?.ticket;
    setTicketRequest(null);
    reviewDirty(false);
    if (!wasSaved || !ticket) return;
    shell.toast(...savedTicketToast(ticket, shell.go));
  }
  const review = ticketRequest?.accountId === app.accountId ? <Deferred resetKey={ticketRequest.id} label="bet review"><SocialBetTracker key={ticketRequest.id} player={app.accountId} reviewOnly initialView="mybets" ticketRequest={ticketRequest} onReviewDone={reviewDone} onDirty={reviewDirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred> : null;
  if (section === 'recommended') return <><Deferred resetKey={`${app.accountId}:research`} label="research recommendations"><ResearchAssessments key={app.accountId} onDirty={dirty} onTrack={trackRecommendation}/></Deferred>{review}</>;
  const topic = INFO[TOPIC[section]];
  return <section className="gx-screen gx-bets gx-live-workflow" aria-labelledby="gx-bets-title" data-bets-section={section}>
    <header className="gx-bets-heading">
      <div className="gx-bets-titlebar"><h1 id="gx-bets-title" className="gx-t-title gx-grow">{BETS_NAMES[section]}</h1><InfoButton title={topic.title} body={topic.body}/></div>
      {LIST_WORDS[destination] ? <MetaLine parts={[LIST_WORDS[destination]]}/> : null}
    </header>
    {section === 'mybets' ? <MyBets destination={destination} trackerState={trackerState} rememberTracker={rememberTracker} onDirty={dirty} onSaved={saved}/>
      : section === 'picks' ? <PlaceBets key={app.accountId} onDirty={dirty}/>
      : section === 'everyone' ? <EveryoneBets onPlace={() => openSection(shell, 'picks')}/>
      // Your gap: the old app's screen until Task 7 rebuilds it (gap/YourGap.jsx draws its own screen then).
      : <><Deferred resetKey={`${app.accountId}:recommended`} label="recommended bets"><VirtualUnits key={`${app.accountId}:recommended`} accountId={app.accountId} embedded initialView="recommended" accountRecommendations showViewTabs={false} recommendedMarket={recommendedMarket} onRecommendedMarket={chooseRecommendedMarket} marketControl={marketControl} onTrackTicket={trackRecommendation} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred>{review}</>}
  </section>;
}

/** My bets: the tracker with its November 1 Roomy cards (D-72), unchanged, on the list its address names. */
function MyBets({ destination, trackerState, rememberTracker, onDirty, onSaved }) {
  const app = useAppData(), shell = useShell(), route = shell.state.views.bets;
  // D-69 step 4: the ticket summary read (shared with the landing and Home) reports your tracked wins, so a win that
  // arrives while you watch plays on its own card (TrackedBetRow).
  useBetWins(app);
  return <Deferred label="tracked bets"><SocialBetTracker key={`${app.accountId}:${destination}:${shell.state.nav}`} player={app.accountId}
    initialOutcome={destination === 'active' ? 'pending' : destination === 'settled' ? 'settled' : ''} initialAllHistory={destination === 'active' || destination === 'settled'}
    autoCreate={destination === 'add'} navigationState={trackerState} onNavigationState={rememberTracker} initialView="mybets" embedded compactTickets
    TicketRow={TrackedBetRow} MetricsView={NetUnits} OverviewView={TrackedOverview} initialTrackedPane={route.trackedPane ?? 'tickets'}
    onDirty={onDirty} onSaved={onSaved} onSignInAgain={app.requestSignIn}/></Deferred>;
}
