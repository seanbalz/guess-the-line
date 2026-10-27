// The account-wide Play surface follows live server capabilities. M-07 opens per-game entry and receipts;
// until all capabilities are reported, the existing whole-market editor retains the hosted rules.
import { useCallback, useMemo } from 'react';
import { WeekPicks } from '../../CommunityHome.jsx';
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { COMMUNITY } from '../data/league.js';
import { useShell } from '../shell/context.js';
import { Button, InfoButton } from '../ui/index.js';
import { INFO } from '../info.js';
import { FocusAction, FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { HomeGuide } from '../home/HomeGuide.jsx';
import { useAccountPreferences } from '../me/AccountPreferences.jsx';
import { homeHero } from '../../../../shared/home-view.mjs';
import { nextGuess } from './nextGuess.js';
import { LeagueScreen } from '../league/LeagueScreen.jsx';
import { playPresentation } from './PlayPresentation.jsx';
import './play.css';
import { cloudApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PerGameEditor } from './PerGamePlay.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { ScoreComparison } from './ScoreComparison.jsx';
import { WeeklyScore } from './WeeklyScore.jsx';
import { perGameReady } from './scoring.js';
// Guess the Points (D-56): the third Play game, its own ballot and read; "coming soon" until P-01 is applied.
import { PointsBallot, PointsLandingCard, usePointsRead } from './points/PointsBallot.jsx';
// Badges, streaks and awards (redesign stage 71): their own screen and one row in More in Play; nothing shows until M-25 answers.
import { FeaturesScreen } from '../features/FeaturesScreen.jsx';
import { PlayFeaturesRow } from '../features/FeatureRows.jsx';

const modeOf = value => value === 'total' || value === 'guess_total' ? 'guess_total'
  : value === 'spread' || value === 'guess_spread' ? 'guess_spread' : null;
const marketKey = accountId => `gtl.play-market.${accountId}`;
function rememberedMarket(accountId) {
  try { return modeOf(sessionStorage.getItem(marketKey(accountId))); } catch { return null; }
}

export function Play() {
  const shell = useShell();
  const section = shell.state.views.play.section;
  if (section === 'league') return <LeagueScreen/>;
  if (section === 'points') return <PointsBallot/>;
  if (section === 'features') return <FeaturesScreen/>;
  if (!['picks', 'score', 'compare'].includes(section)) return <PlayLanding/>;
  return <PlayDetail/>;
}

function PlayLanding() {
  const app = useAppData(), shell = useShell(), data = app.community.data;
  const preferences = useAccountPreferences(app);
  const points = usePointsRead(app);
  // Decision 1C (D-56 addendum, Oct 23): Points is a glow card under the plain Spread and Total rows.
  const pointsCard = <PointsLandingCard read={points} onOpen={() => shell.go('play', { section: 'points' })}/>;
  const hero = data ? homeHero({ community: data }) : null;
  const market = nextGuess(data), other = market === 'spread' ? 'total' : 'spread';
  const name = value => value === 'spread' ? 'Guess the Spread' : 'Guess the Total';
  const open = value => shell.go('play', { section: 'picks', market: value, season: data?.week?.season ?? null, week: data?.week?.week ?? null });
  const status = value => {
    const row = data?.due?.find(item => item.mode === `guess_${value}`);
    if (!row) return 'Open your saved guesses';
    if (row.satOut) return 'Sitting out this week';
    if (Number.isInteger(row.locked)) return `${row.locked} locked · ${row.openGames ?? 0} still open`;
    return row.submitted ? 'Submitted' : `${row.filled ?? 0} of ${row.games ?? data?.week?.games?.length ?? 0} picked`;
  };
  return <div className="gx-screen" data-landing="play">
    <div className="gx-focus-heading"><h1 className="gx-t-title">Play</h1>{hero?.week != null && <p className="gx-t-meta">Week {hero.week}</p>}</div>
    {!hero ? app.community.status === 'error' ? <PlayFailure what="Your picks" error={app.community.error} onRetry={() => app.refresh({ only: ['community'] })}/> : <PlayLoading>Loading your picks…</PlayLoading>
      : <><FocusAction title={hero.action.primary ? name(market) : 'Your week, at a glance.'} eyebrow={hero.action.primary ? 'Your next move' : 'Your results'} description={hero.action.primary ? status(market) : hero.state === 'none' ? 'No week is open yet. Your past results are still here.' : 'Review your guesses and their saved scoring lines.'} action={hero.action.primary ? 'Continue guessing' : 'View your results'} onAction={() => hero.action.primary ? open(market) : shell.go('play', { section: 'score' })}/>
      {app.community.status === 'error' && <p className="gx-play-state-line gx-t-body" role="status">This week could not refresh. Showing the last loaded update. <Button variant="ghost" onClick={() => app.refresh({ only: ['community'] })}>Refresh week</Button></p>}
      <FocusRows label="Spread and Total">
        {(!hero.action.primary ? [market, other] : [other]).map(value => <FocusRow key={value} icon="target" title={name(value)} sub={status(value)} onClick={() => open(value)}/>)}
      </FocusRows>
      {pointsCard}
      <FocusRows label="More in Play">
        <FocusRow icon="trophy" title="My league" sub={app.league.name} onClick={() => shell.go('league', { view: 'board' })}/>
        {hero.action.primary && <FocusRow icon="chart" title="Your results" sub="Scores, comparisons and history" onClick={() => shell.go('play', { section: 'score' })}/>}
        <PlayFeaturesRow app={app}/>
      </FocusRows></>}
    {!hero && pointsCard}
    {!hero && <FocusRows label="More in Play"><FocusRow icon="trophy" title="My league" sub={app.league.name} onClick={() => shell.go('league', { view: 'board' })}/><PlayFeaturesRow app={app}/></FocusRows>}
    <details className="gx-focus-help"><summary className="gx-t-strong">How to play</summary><HomeGuide key={app.accountId} preferences={preferences} perGame={data?.rules?.perGameScoring === true}/></details>
  </div>;
}

function PlayDetail() {
  const app = useAppData();
  const shell = useShell();
  const { accountId, refresh, requestSignIn } = app;
  const feed = app.community.data;
  const personal = useSharedRead('personal');
  const score = shell.state.views.play.section === 'score';
  const market = modeOf(shell.state.views.play.market);
  const refreshBallot = useCallback(() => refresh({ only: ['community', 'personal'] }), [refresh]);
  const marketNavigation = useMemo(() => ({
    read: () => market ?? rememberedMarket(accountId),
    write: mode => {
      shell.setView('play', { market: mode === 'guess_total' ? 'total' : 'spread' });
      try { sessionStorage.setItem(marketKey(accountId), mode); } catch { /* In-memory navigation still works. */ }
    },
  }), [accountId, market, shell.setView]);
  const reveal = mode => {
    app.chooseLeague(COMMUNITY);
    shell.go('league', { view: 'feed', market: mode });
  };

  if (shell.state.views.play.section === 'compare') return <div className="gx-screen gx-vstack gx-gap-16"><h1 className="gx-t-title">Compare players</h1><Button variant="ghost" onClick={() => shell.setView('play', { section: 'score' })}>Your weekly score</Button><ScoreComparison/></div>;
  if (score) return <div className="gx-screen gx-vstack gx-gap-16"><div className="gx-play-titlebar"><h1 className="gx-t-title gx-grow">Your weekly score</h1><InfoButton title={INFO.scores.title} body={INFO.scores.body}/></div><WeeklyScore/></div>;
  const head = <><h1 className="gx-t-title">Your guesses</h1><Button variant="ghost" onClick={() => shell.setView('play', { section: 'score' })}>Your weekly score</Button></>;
  if (perGameReady(personal.data?.rules)) return <div className="gx-screen gx-live-play gx-live-workflow gx-vstack gx-gap-16">{head}<SelectedPlay app={app} shell={shell} current={personal.data} mode={market || 'guess_spread'} onMode={marketNavigation.write}/></div>;
  // Until the first /personal answer arrives nothing can tell which editor the server's rules call for, so neither
  // mounts early (the whole-market editor used to start, then give way to the per-game one).
  if (!personal.data) return <div className="gx-screen gx-live-play gx-live-workflow gx-vstack gx-gap-16">{head}{personal.status !== 'error' ? <PlayLoading>Loading your picks…</PlayLoading>
    : personal.error?.status === 404 ? <PlayEmpty>No week is open yet. Weeks open Monday 12:00 AM PT once the schedule is published.</PlayEmpty>
    : <PlayFailure what="Your picks" error={personal.error} onRetry={refreshBallot}/>}</div>;
  return (
    <div className="gx-screen gx-live-workflow gx-live-play">
      {head}
      <p className="gx-t-body gx-c-2">Guess the line. Submit a complete Spread or Total ballot when you’re ready.</p>
      {!feed ? (
        app.community.status === 'error' ? <PlayFailure what="Your picks" error={app.community.error} onRetry={() => refresh({ only: ['community'] })}/> : <PlayLoading>Loading your picks…</PlayLoading>
      ) : (
        <WeekPicks
          key={accountId}
          accountId={accountId}
          feed={feed}
          posts={feed.posts ?? []}
          optOuts={feed.optOuts ?? []}
          initialMode={feed.picksDue?.modes?.[0]?.mode}
          marketNavigation={marketNavigation}
          presentation={playPresentation}
          onSaved={refreshBallot}
          onSatOut={refreshBallot}
          onSignInAgain={requestSignIn}
          onReveal={reveal}
        />
      )}
    </div>
  );
}

function SelectedPlay({ app, shell, current, mode, onMode }) {
  const view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : current.season;
  const week = Number.isInteger(view.week) ? view.week : current.week;
  const read = useLeagueRead(`${app.accountId}:play:${season}:${week}:${mode}`, signal => cloudApi('personal/read', { season, week }, { signal }), error => { if (error.status === 401) app.requestSignIn(); });
  if (read.loading) return <PlayLoading>Loading your picks…</PlayLoading>;
  if (read.error) return <PlayFailure what="Your picks" error={read.error} onRetry={read.retry}/>;
  if (!perGameReady(read.data?.rules)) return <PlayEmpty role="alert" action="Check again" onAction={read.retry}>Scoring rules changed. Refresh the app before making a pick.</PlayEmpty>;
  // The reveal names other players from the shared Community read, and only when it is this account's read.
  const community = app.community.data, members = community?.viewer?.toLowerCase() === app.accountId.toLowerCase() ? community.members ?? [] : [];
  return <PerGameEditor key={`${app.accountId}:${season}:${week}:${mode}`} accountId={app.accountId} initialData={read.data} mode={mode} focusGame={view.pickGame} optOuts={app.community.data?.optOuts || []} reveal={{ members }}
    onMode={onMode} setDirty={shell.setDirty} onSignInAgain={app.requestSignIn} onSaved={() => app.refresh({ only: ['community', 'personal'] })}
    onScore={patch => shell.setView('play', { ...patch, section: 'score' })}/>;
}
