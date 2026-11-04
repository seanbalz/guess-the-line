// Play (D-69 step 1). The landing is Sean's P1B (November 3, 2026): one glow card with the ballot to do next, then six
// tiles in two columns, each opening its own section on its first layer (openPlay). Picks are the per-game cards
// (PerGamePlay.jsx).
import { useCallback, useId, useMemo, useRef } from 'react';
import { WeekPicks } from '../../CommunityHome.jsx'; // 7b
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { COMMUNITY } from '../data/league.js'; // 7b
import { useShell } from '../shell/context.js';
import { Button, Card, Meter } from '../ui/index.js';
import '../ui/focusLanding.css';
import { HomeGuide } from '../home/HomeGuide.jsx';
import { useAccountPreferences } from '../me/AccountPreferences.jsx';
import { LeagueScreen } from '../league/LeagueScreen.jsx';
import { LeagueTile } from '../league/LeagueTile.jsx';
import { playPresentation } from './PlayPresentation.jsx'; // 7b
import './play.css';
import './landing.css';
import { cloudApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PerGameEditor } from './PerGamePlay.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { ScoreComparison } from './ScoreComparison.jsx';
import { WeeklyScore } from './WeeklyScore.jsx';
import { perGameReady } from './scoring.js'; // 7b
import { ScoreTile } from './ScoreTile.jsx';
import { CompareTile } from './CompareTile.jsx';
import { PlayTile } from './PlayTile.jsx';
import { openPlay } from './PlayLayer.jsx';
import { ballotTile, otherMarket, playHero } from './landing.js';
import { weekLockedId } from './moments.js';
import { useWeekLocked } from './useWeekLocked.js';
import { PointsBallot } from './points/PointsBallot.jsx';
import { PointsTile } from './points/PointsTile.jsx';
import { FeaturesScreen } from '../features/FeaturesScreen.jsx';
import { BadgesTile } from '../features/BadgesTile.jsx';
import { ReminderPrompt } from '../me/PickReminders.jsx';
import { SCOPES } from '../moments/catalog.js';
import { useMomentScope, useNewMoments, usePopped } from '../moments/MomentsProvider.jsx';

const modeOf = value => value === 'total' || value === 'guess_total' ? 'guess_total'
  : value === 'spread' || value === 'guess_spread' ? 'guess_spread' : null;
const marketKey = accountId => `gtl.play-market.${accountId}`;
function rememberedMarket(accountId) {
  try { return modeOf(sessionStorage.getItem(marketKey(accountId))); } catch { return null; }
}

export function Play() {
  const shell = useShell(), app = useAppData();
  // D-69: Whole week locked reads the shared Community read wherever Play is open (the landing or the picks card).
  useWeekLocked(app);
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
  useMomentScope(SCOPES.play);
  const heroButton = useRef(null), pointsTile = useRef(null), eyebrowId = useId();
  const hero = data ? playHero(data) : null, week = data?.week ?? null;
  const other = otherMarket(hero?.market ?? 'spread'), tile = ballotTile(data, other);
  const lockedId = mode => (week && Number.isInteger(week.season) ? weekLockedId(week.season, week.week, mode) : '');
  // NEW on the ballot tile only when the Whole week locked moment waiting for the picks card is this tile's market; the
  // hero's market keeps its own on the card (the picks scope holds either market's moment).
  const tileLocked = lockedId(modeOf(other)), waitingIds = useNewMoments(SCOPES.picks), waiting = tileLocked !== '' && waitingIds.some(m => m.id === tileLocked);
  const heroPop = usePopped(hero?.progress ? lockedId(hero.progress.mode) : '');
  const tilePop = usePopped(tileLocked);
  const openPicks = market => openPlay(shell, 'picks', { market, season: week?.season ?? null, week: week?.week ?? null });
  const go = target => (target.section === 'picks' ? openPicks(target.market) : openPlay(shell, target.section));
  // The reminder prompt sits under the first card until it is answered; when it leaves, focus returns to that card's
  // button (or, with no week loaded, to the Points tile).
  const onPromptGone = () => (heroButton.current ?? pointsTile.current)?.focus();
  return <div className="gx-screen gx-play-landing" data-landing="play">
    <div className="gx-focus-heading"><h1 className="gx-t-title">Play</h1>{hero?.week != null && <p className="gx-t-meta">Week {hero.week}</p>}</div>
    {hero ? <Card as="section" variant="hero" className="gx-play-hero" aria-labelledby={eyebrowId} data-play="hero" data-hero={hero.kind}>
      <p className="gx-t-micro gx-play-hero-eyebrow" id={eyebrowId}>{hero.eyebrow}</p>
      <h2 className="gx-t-title">{hero.title}</h2>
      {hero.progress ? <Meter value={hero.progress.done} max={hero.progress.of} className="gx-play-hero-meter"/> : null}
      <p className="gx-t-meta" data-play="hero-line" data-moment={heroPop ? 'pop' : undefined}>{hero.line}</p>
      <Button ref={heroButton} variant="primary" block onClick={() => go(hero.target)}>{hero.action}</Button>
    </Card>
      : app.community.status === 'error' ? <PlayFailure what="Your picks" error={app.community.error} onRetry={() => app.refresh({ only: ['community'] })}/>
      : <PlayLoading>Loading your picks…</PlayLoading>}
    {/* A failed refresh keeps the last good copy with its error noted (data/store.js): say so under the card. */}
    {data && (app.community.status === 'error' || app.community.error) ? <p className="gx-play-state-line gx-t-body" role="status">This week could not refresh. Showing the last loaded update. <Button variant="ghost" onClick={() => app.refresh({ only: ['community'] })}>Refresh week</Button></p> : null}
    <ReminderPrompt key={app.accountId} onGone={onPromptGone}/>
    <ul className="gx-nest-grid gx-play-tiles" aria-label="Play sections" data-play="tiles">
      <li data-play-tile="ballot" data-moment={tilePop ? 'pop' : undefined}><PlayTile icon="target" label={tile.label} big={tile.big} sub={tile.sub} tone={tile.tone} ariaLabel={waiting ? `${tile.ariaLabel}, new` : tile.ariaLabel} isNew={waiting} onClick={() => openPicks(other)}/></li>
      <li data-play-tile="points"><PointsTile ref={pointsTile} onOpen={() => openPlay(shell, 'points')}/></li>
      <li data-play-tile="score"><ScoreTile onOpen={patch => openPlay(shell, 'score', patch)}/></li>
      <li data-play-tile="league"><LeagueTile onOpen={() => openPlay(shell, 'league')}/></li>
      <li data-play-tile="badges"><BadgesTile onOpen={() => openPlay(shell, 'features')}/></li>
      <li data-play-tile="compare"><CompareTile onOpen={view => openPlay(shell, 'compare', view)}/></li>
    </ul>
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

  if (shell.state.views.play.section === 'compare') return <ScoreComparison/>;
  if (score) return <WeeklyScore/>;
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
  // D-70: the week and its games are nesting cards on one address key (`pickGame`); the editor and its drafts stay
  // mounted between them, so moving there never asks to leave unsaved guesses.
  const { setView } = shell, { market: viewMarket, season: viewSeason, week: viewWeek } = view;
  const keeps = useCallback(next => next.tab === 'play' && next.views.play.section === 'picks'
    && next.views.play.market === viewMarket && next.views.play.season === viewSeason && next.views.play.week === viewWeek, [viewMarket, viewSeason, viewWeek]);
  const nest = useMemo(() => ({ game: view.pickGame, keeps, onOpen: id => setView('play', { pickGame: id }), onWeek: () => setView('play', { pickGame: undefined }) }), [view.pickGame, keeps, setView]);
  if (read.loading) return <PlayLoading>Loading your picks…</PlayLoading>;
  if (read.error) return <PlayFailure what="Your picks" error={read.error} onRetry={read.retry}/>;
  if (!perGameReady(read.data?.rules)) return <PlayEmpty role="alert" action="Check again" onAction={read.retry}>Scoring rules changed. Refresh the app before making a pick.</PlayEmpty>;
  // The reveal names other players from the shared Community read, and only when it is this account's read.
  const community = app.community.data, members = community?.viewer?.toLowerCase() === app.accountId.toLowerCase() ? community.members ?? [] : [];
  return <PerGameEditor key={`${app.accountId}:${season}:${week}:${mode}`} accountId={app.accountId} initialData={read.data} mode={mode} nest={nest} optOuts={app.community.data?.optOuts || []} reveal={{ members }}
    onMode={onMode} setDirty={shell.setDirty} onSignInAgain={app.requestSignIn} onSaved={() => app.refresh({ only: ['community', 'personal'] })}
    onScore={patch => shell.setView('play', { ...patch, section: 'score' })}/>;
}
