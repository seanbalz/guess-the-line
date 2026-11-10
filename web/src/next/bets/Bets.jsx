import { GapRecord } from './GapRecord.jsx';
import { lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Deferred } from '../ui/Deferred.jsx';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button } from '../ui/Button.jsx';
import { InfoButton } from '../ui/InfoButton.jsx';
import { INFO } from '../info.js';
import { NetUnits } from './NetUnits.jsx';
import { TrackedOverview } from './TrackedOverview.jsx';
import { EveryoneBets } from './EveryoneBets.jsx';
import { PlaceBets } from './PlaceBets.jsx';
import { Segmented } from '../ui/Segmented.jsx';
import { TrackedBetRow } from './TrackedBetRow.jsx';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { Card } from '../ui/Card.jsx';
import { TicketPreviews, RecommendationTeaser } from './BetsLandingCards.jsx';
import { BetsSummary } from './BetsSummary.jsx';
import { DESTINATION_ICONS as ICON } from '../ui/destinations.js';
import { useTicketSummary } from './useTicketSummary.js';
import { draftParts, savedTicketToast } from './recommendationReview.js';
import { recommendationMarket } from '../../../../shared/recommended-bets.mjs';
import { PROPS_GAP_MARKET, playerPropsEnabled, withPlayerProps } from '../props/flag.js';
import { forgetSharedReads } from '../../sharedReads.js';
import './bets.css';
import '../../liveBets.css';
import './prism-bets.css';
import { Matchup } from '../ui/Matchup.jsx';
import { TeamMark } from '../ui/TeamMark.jsx';

const BET_EDITOR_IDENTITY = { Matchup, TeamMark };

const SocialBetTracker = lazy(() => import('../../SocialBetTracker.jsx'));
// Each view's fine print, behind the title's ⓘ (D-55).
const TOPIC = Object.freeze({ tracked: 'trackedBets', recommended: 'recommended', virtual: 'virtual', everyone: 'everyone' });
const VirtualUnits = lazy(() => import('../../VirtualUnits.jsx'));
const ResearchAssessments = lazy(() => import('../research/Assessments.jsx'));
const RECOMMENDED_MARKETS = [{ value: 'all', label: 'All' }, { value: 'spread', label: 'Spreads' }, { value: 'total', label: 'Totals' }];
// M-10: inside Virtual Units, your own card or everyone's picks this week (read only).
const VIRTUAL_VIEWS = [{ value: 'virtual', label: 'Your picks' }, { value: 'everyone', label: 'Everyone' }];

// Recommendations and Virtual Units placement follow the published account week.
export function Bets() {
  const shell = useShell();
  return ['active', 'settled', 'tracked', 'add', 'virtual', 'everyone', 'recommended', 'research'].includes(shell.state.views.bets.view) ? <BetsDetail/> : <BetsLanding/>;
}

function BetsLanding() {
  const app = useAppData(), shell = useShell(), read = useTicketSummary(app);
  const open = view => shell.go('bets', { view:view==='overview'?'tracked':view, trackedPane:view==='overview'?'overview':'tickets', selectedTicket: null, season: null, week: null, period: view==='overview'?'all':null, matchup: null, assessment: null });
  const openTicket = entry => shell.go('bets', { view: entry.outcome === 'pending' ? 'active' : 'settled', trackedPane: 'tickets', period: 'all', season: null, week: null, selectedTicket: entry.id, trackers: {} });
  return <section className="gx-screen gx-bets" data-landing="bets">
    <h1 className="gx-t-title">Bets</h1>
    <BetsSummary read={read}/>
    <Card as="section" className="gx-bets-landing-tickets" aria-labelledby="gx-tickets-heading">
      <div className="gx-bets-card-heading"><h2 id="gx-tickets-heading">Tickets</h2><span className="gx-t-meta gx-c-2">{read.model ? `${read.model.entries.length} tracked` : '—'}</span></div>
      <TicketPreviews read={read} onOpen={openTicket}/>
      <details className="gx-bets-ticket-views"><summary>All ticket views</summary><div><Button variant="ghost" onClick={() => open('active')}>Active tickets</Button><Button variant="ghost" onClick={() => open('settled')}>Settled tickets</Button></div></details>
      <div className="gx-bets-landing-actions"><Button variant="secondary" aria-label="Add a bet" onClick={() => open('add')}>Track a bet +</Button><Button variant="ghost" onClick={() => open('overview')}>Overview</Button></div>
    </Card>
    <RecommendationTeaser onOpen={(matchup, assessment) => shell.go('bets', { view: 'research', matchup: matchup ?? null, assessment: assessment ?? null })}/>
    <FocusRows label="More Bets tools">
      <FocusRow icon={ICON.guessGap} title="Your guess vs. market" sub="Compare your locked guesses with current lines" onClick={() => open('recommended')}/>
      <FocusRow icon={ICON.virtualUnits} title="Virtual Units" sub="Your separate play-money picks" onClick={() => open('virtual')}/>
      <FocusRow icon={ICON.everyone} title="Everyone’s picks" sub="Friends’ Virtual Units picks this week" onClick={() => open('everyone')}/>
    </FocusRows>
  </section>;
}

function BetsDetail() {
  const app = useAppData(), shell = useShell();
  const destination = shell.state.views.bets.view;
  const view = destination === 'everyone' ? 'virtual' : ['virtual', 'recommended', 'research'].includes(destination) ? destination : 'tracked';
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
  // D-82: Player Props joins All / Spreads / Totals only while its flag is on; the recommendation list keeps its own
  // normalized market ('props' reads as 'all' there), and choosing Player Props shows the prop record instead.
  const propsOn = playerPropsEnabled(), propsSelected = propsOn && route.recommendedMarket === PROPS_GAP_MARKET;
  const marketControl = <Segmented label="Recommendation market" value={propsSelected ? PROPS_GAP_MARKET : recommendedMarket} onChange={chooseRecommendedMarket} options={withPlayerProps(RECOMMENDED_MARKETS, PROPS_GAP_MARKET, propsOn)}/>;
  const { setDirty } = shell;
  const [ticketRequest, setTicketRequest] = useState(null);
  const drafts = useMemo(() => draftParts(setDirty), [setDirty]);
  const clearDirty = drafts.clear;
  const dirty = useCallback(value => drafts.mark('view', value), [drafts]);
  const reviewDirty = useCallback(value => drafts.mark('review', value), [drafts]);
  useEffect(() => clearDirty, [clearDirty]);
  const saved = () => {
    forgetSharedReads(`${app.accountId}:ticket-summary`);
    app.refresh({ only: ['community', 'personal'] });
  };
  function choose(next) {
    if (next === view || !shell.confirmLeave()) return;
    clearDirty();
    setTicketRequest(null);
    shell.setView('bets', { view: next, season: null, week: null, period: null, matchup: null, assessment: null });
  }
  function chooseVirtual(next) {
    if (next === destination || !shell.confirmLeave()) return;
    clearDirty();
    shell.setView('bets', { view: next, season: null, week: null, period: null });
  }
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
  const introduction = {
    tracked: 'Tickets you placed elsewhere, with results and history.',
    recommended: 'Review gaps between your locked guesses and current lines.',
    virtual: 'Place play-money picks on this week’s games.',
    everyone: 'Everyone’s play-money picks this week.',
  };
  const topic = destination === 'everyone' ? 'everyone' : TOPIC[view];
  if (view === 'research') return <>
    <Deferred resetKey={`${app.accountId}:research`} label="research recommendations"><ResearchAssessments key={app.accountId} onDirty={dirty} onTrack={trackRecommendation}/></Deferred>
    {ticketRequest?.accountId === app.accountId && <div className="gx-bets gx-live-workflow"><Deferred resetKey={ticketRequest.id} label="bet review"><SocialBetTracker editorIdentity={BET_EDITOR_IDENTITY} key={ticketRequest.id} player={app.accountId} reviewOnly initialView="mybets" ticketRequest={ticketRequest} onReviewDone={reviewDone} onDirty={reviewDirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred></div>}
  </>;
  return <section className="gx-screen gx-bets gx-live-workflow" aria-labelledby="gx-bets-title">
    <header className="gx-bets-heading">
      <div className="gx-bets-titlebar"><h1 id="gx-bets-title" className="gx-t-title gx-grow">{({ active: "Active tickets", settled: "Settled tickets", add: "Add a bet", recommended: "Your guess vs. market", virtual: "Virtual Units", everyone: "Everyone’s picks" })[destination] ?? "My bets"}</h1><InfoButton {...INFO[topic]}/></div>
      {view!=='tracked'&&<p className="gx-t-body gx-c-2">{introduction[destination === 'everyone' ? 'everyone' : view]}</p>}
    </header>
    {view === 'recommended' ? <Button variant="secondary" onClick={() => choose('research')}>Research recommendations</Button> : null}
    {/* D-55: short visible labels, full accessible names, one row at every phone width. */}
    <div className="gx-bets-views" role="group" aria-label="Bets view">
      <Button aria-label="Tracked bets" aria-pressed={view === 'tracked'} onClick={() => choose('tracked')}>Tracked</Button>
      <Button aria-label="Your guess vs. market" aria-pressed={view === 'recommended'} onClick={() => choose('recommended')}>Your gap</Button>
      <Button aria-label="Virtual Units" aria-pressed={view === 'virtual'} onClick={() => choose('virtual')}>Virtual</Button>
    </div>
    {view === 'tracked' ? <>
      <Deferred label="tracked bets"><SocialBetTracker editorIdentity={BET_EDITOR_IDENTITY} key={`${app.accountId}:${destination}:${shell.state.nav}`} player={app.accountId} initialExpandedTicket={route.selectedTicket} initialOutcome={destination === 'active' ? 'pending' : destination === 'settled' ? 'settled' : ''} initialAllHistory={destination === 'active' || destination === 'settled'} autoCreate={destination === 'add'} navigationState={trackerState} onNavigationState={rememberTracker} initialView="mybets" embedded compactTickets TicketRow={TrackedBetRow} MetricsView={NetUnits} OverviewView={TrackedOverview} initialTrackedPane={route.trackedPane??'tickets'} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred>
    </> : view === 'recommended' && propsSelected ? <>
      {marketControl}
      <GapRecord market={PROPS_GAP_MARKET} accountId={app.accountId} season={app.community?.data?.week?.season} week={app.community?.data?.week?.week} onSignInAgain={app.requestSignIn}/>
    </> : view === 'recommended' ? <>
      <Deferred resetKey={`${app.accountId}:recommended`} label="recommended bets"><VirtualUnits GapRecordView={GapRecord} key={`${app.accountId}:recommended`} accountId={app.accountId} embedded initialView="recommended" accountRecommendations showViewTabs={false} recommendedMarket={recommendedMarket} onRecommendedMarket={chooseRecommendedMarket} marketControl={marketControl} onTrackTicket={trackRecommendation} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred>
      {ticketRequest?.accountId === app.accountId && <Deferred resetKey={ticketRequest.id} label="bet review"><SocialBetTracker editorIdentity={BET_EDITOR_IDENTITY} key={ticketRequest.id} player={app.accountId} reviewOnly initialView="mybets" ticketRequest={ticketRequest} onReviewDone={reviewDone} onDirty={reviewDirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred>}
    </> : <>
      <Segmented label="Virtual Units view" value={destination === 'everyone' ? 'everyone' : 'virtual'} onChange={chooseVirtual} options={VIRTUAL_VIEWS}/>
      {/* Stages 43 and 44 (Sean, October 28, 2026): Your picks is the account-level placing screen for every league. */}
      {destination === 'everyone' ? <EveryoneBets onPlace={() => chooseVirtual('virtual')}/> : <PlaceBets key={app.accountId} onDirty={dirty}/>}
    </>}
  </section>;
}
