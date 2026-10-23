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
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { PerGameEditor } from './PerGamePlay.jsx';
import { ScoreComparison } from './ScoreComparison.jsx';
import { WeeklyScore } from './WeeklyScore.jsx';
import { perGameReady } from './scoring.js';
// Guess the Points (D-56): the third Play game, its own ballot and read; "coming soon" until P-01 is applied.
import { PointsBallot, usePointsRead } from './points/PointsBallot.jsx';
import { landingStatus } from './points/pointsModel.js';

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
  if (!['picks', 'score', 'compare'].includes(section)) return <PlayLanding/>;
  return <PlayDetail/>;
}

function PlayLanding() {
  const app = useAppData(), shell = useShell(), data = app.community.data;
  const preferences = useAccountPreferences(app);
  const points = usePointsRead(app);
  const pointsRow = <FocusRow key="points" icon="target" title="Guess the Points" sub={landingStatus(points.data, points.error)} onClick={() => shell.go('play', { section: 'points' })}/>;
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
    {!hero ? <section className="gx-empty" role={app.community.status === 'error' ? 'alert' : 'status'}><p className="gx-t-body">{app.community.status === 'error' ? 'Your picks could not be loaded.' : 'Loading your picks…'}</p>{app.community.status === 'error' && <Button onClick={() => app.refresh({ only: ['community'] })}>Try again</Button>}</section>
      : <><FocusAction title={hero.action.primary ? name(market) : 'Your week, at a glance.'} eyebrow={hero.action.primary ? 'Your next move' : 'Your results'} description={hero.action.primary ? status(market) : hero.state === 'none' ? 'No week is open yet. Your past results are still here.' : 'Review your guesses and their saved scoring lines.'} action={hero.action.primary ? 'Continue guessing' : 'View your results'} onAction={() => hero.action.primary ? open(market) : shell.go('play', { section: 'score' })}/>
      {app.community.status === 'error' && <p className="gx-t-body" role="status">This week could not refresh. Showing the last loaded update. <Button variant="ghost" onClick={() => app.refresh({ only: ['community'] })}>Refresh week</Button></p>}
      <FocusRows label="More in Play">
        {(!hero.action.primary ? [market, other] : [other]).map(value => <FocusRow key={value} icon="target" title={name(value)} sub={status(value)} onClick={() => open(value)}/>)}
        {pointsRow}
        <FocusRow icon="trophy" title="My league" sub={app.league.name} onClick={() => shell.go('league', { view: 'board' })}/>
        {hero.action.primary && <FocusRow icon="chart" title="Your results" sub="Scores, comparisons and history" onClick={() => shell.go('play', { section: 'score' })}/>}
      </FocusRows></>}
    {!hero && <FocusRows label="More in Play">{pointsRow}<FocusRow icon="trophy" title="My league" sub={app.league.name} onClick={() => shell.go('league', { view: 'board' })}/></FocusRows>}
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
  if (perGameReady(personal.data?.rules)) return <div className="gx-screen gx-live-play gx-live-workflow gx-vstack gx-gap-16"><h1 className="gx-t-title">Your guesses</h1><Button variant="ghost" onClick={() => shell.setView('play', { section: 'score' })}>Your weekly score</Button><SelectedPlay app={app} shell={shell} current={personal.data} mode={market || 'guess_spread'} onMode={marketNavigation.write}/></div>;
  return (
    <div className="gx-screen gx-live-workflow gx-live-play">
      <h1 className="gx-t-title">Your guesses</h1>
      <Button variant="ghost" onClick={() => shell.setView('play', { section: 'score' })}>Your weekly score</Button>
      <p className="gx-t-body gx-c-2">Guess the line. Submit a complete Spread or Total ballot when you’re ready.</p>
      {!feed ? (
        <section className="gx-empty" role={app.community.status === 'error' ? 'alert' : 'status'}>
          <p className="gx-t-body">{app.community.status === 'error' ? 'Your picks could not be loaded.' : 'Loading your picks…'}</p>
          {app.community.status === 'error' ? <Button onClick={() => refresh({ only: ['community'] })}>Try again</Button> : null}
        </section>
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
  if (read.loading) return <p className="gx-t-body" role="status">Loading your picks…</p>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  if (!perGameReady(read.data?.rules)) return <p className="gx-t-body" role="alert">Scoring rules changed. Refresh the app before making a pick.</p>;
  return <PerGameEditor key={`${app.accountId}:${season}:${week}:${mode}`} accountId={app.accountId} initialData={read.data} mode={mode} optOuts={app.community.data?.optOuts || []}
    onMode={onMode} setDirty={shell.setDirty} onSignInAgain={app.requestSignIn} onSaved={() => app.refresh({ only: ['community', 'personal'] })}
    onScore={patch => shell.setView('play', { ...patch, section: 'score' })}/>;
}
