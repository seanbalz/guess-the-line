// Play (D-69 step 1). The landing is Sean's P1B (November 3, 2026): one glow card with the ballot to do next, then six
// tiles in two columns, each opening its own section on its first layer (openPlay). Picks are the per-game cards
// (PerGamePlay.jsx). When the server's rules are not per-game, the same cards show the saved ballot read-only, so the old
// whole-market editor is retired from the new app (spec test 13).
import { useCallback, useMemo, useRef } from 'react';
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, Meter, NextMoveCard, StaleLine } from '../ui/index.js';
import '../ui/focusLanding.css';
import { HomeGuide } from '../home/HomeGuide.jsx';
import { useAccountPreferences } from '../me/AccountPreferences.jsx';
import { LeagueScreen } from '../league/LeagueScreen.jsx';
import { LeagueTile } from '../league/LeagueTile.jsx';
import './play.css';
import './landing.css';
import { cloudApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PerGameEditor } from './PerGamePlay.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { ScoreComparison } from './ScoreComparison.jsx';
import { WeeklyScore } from './WeeklyScore.jsx';
import { ScoreTile } from './ScoreTile.jsx';
import { CompareTile } from './CompareTile.jsx';
import { PlayTile } from './PlayTile.jsx';
import { PlayOverviewPicks } from './PlayOverviewPicks.jsx';
import { PriorWeekCard } from '../lines/PriorWeek.jsx';
import { CLOSED_LAYER, PLAY_ROOT, openPlay } from './PlayLayer.jsx';
import { ballotTile, otherMarket, playHero } from './landing.js';
import { weekLockedId } from './moments.js';
import { useWeekLocked } from './useWeekLocked.js';
import { PointsBallot } from './points/PointsBallot.jsx';
import { PointsTile } from './points/PointsTile.jsx';
import { FeaturesScreen } from '../features/FeaturesScreen.jsx';
import { BadgesTile } from '../features/BadgesTile.jsx';
import { ReminderPrompt } from '../me/PickReminders.jsx';
import { SCOPES, picksScope } from '../moments/catalog.js';
import { useMomentScope, useNewMoments, usePopped } from '../moments/MomentsProvider.jsx';

const modeOf = value => value === 'total' || value === 'guess_total' ? 'guess_total'
  : value === 'spread' || value === 'guess_spread' ? 'guess_spread' : null;

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
  const personal = useSharedRead('personal');
  const preferences = useAccountPreferences(app);
  useMomentScope(SCOPES.play);
  const heroButton = useRef(null), pointsTile = useRef(null);
  const hero = data ? playHero(data) : null, week = data?.week ?? null;
  const overview = personal.data?.rules?.perGameScoring === true && week && personal.data.season === week.season && personal.data.week === week.week ? personal.data : null;
  const other = otherMarket(hero?.market ?? 'spread'), tile = ballotTile(data, other);
  const lockedId = mode => (week && Number.isInteger(week.season) ? weekLockedId(week.season, week.week, mode) : '');
  // NEW on the ballot tile only when this week's Whole week locked moment waits for this tile's market's picks card (each
  // market has its own picks scope, M4); the hero's market keeps its own on its card.
  const tileLocked = lockedId(modeOf(other)), waitingIds = useNewMoments(picksScope(modeOf(other))), waiting = tileLocked !== '' && waitingIds.some(m => m.id === tileLocked);
  const heroPop = usePopped(hero?.progress ? lockedId(hero.progress.mode) : '');
  const tilePop = usePopped(tileLocked);
  const openPicks = market => openPlay(shell, 'picks', { market, season: week?.season ?? null, week: week?.week ?? null });
  const go = target => (target.section === 'picks' ? openPicks(target.market) : openPlay(shell, target.section));
  // The reminder prompt sits under the first card until it is answered; when it leaves, focus returns to that card's
  // button (or, with no week loaded, to the Points tile).
  const onPromptGone = () => (heroButton.current ?? pointsTile.current)?.focus();
  return <div className="gx-screen gx-play-landing" data-landing="play">
    <div className="gx-focus-heading"><h1 className="gx-t-title">Play</h1>{hero?.week != null && <p className="gx-t-meta">Week {hero.week}</p>}</div>
    <Card as="section" className="gx-play-picks-card" aria-label="Your picks">
    {overview ? <PlayOverviewPicks data={overview} market={hero?.market} onMarket={openPicks}
      onGame={(market, pickGame) => openPlay(shell, 'picks', { market: market === 'guess_total' ? 'total' : 'spread', season: week.season, week: week.week, pickGame })}
      pointsButton={<PointsTile compact ref={pointsTile} onOpen={() => openPlay(shell, 'points')}/>}/>
      : hero ? <NextMoveCard className="gx-play-hero" data-play="hero" data-hero={hero.kind} eyebrow={hero.eyebrow} title={hero.title}
      picture={hero.progress ? <Meter value={hero.progress.done} max={hero.progress.of} className="gx-play-hero-meter"/> : null}
      line={hero.line} lineProps={{ 'data-play': 'hero-line', 'data-moment': heroPop ? 'pop' : undefined }}
      action={{ ref: heroButton, label: hero.action, onClick: () => go(hero.target) }}/>
      : app.community.status === 'error' ? <PlayFailure what="Your picks" error={app.community.error} onRetry={() => app.refresh({ only: ['community'] })}/>
      : <PlayLoading>Loading your picks…</PlayLoading>}
    {/* A failed refresh keeps the last good copy with its error noted (data/store.js): say so under the card. */}
    {data && (app.community.status === 'error' || app.community.error) ? <StaleLine className="gx-play-state-line" onRefresh={() => app.refresh({ only: ['community'] })}/> : null}
    {overview && personal.error ? <p className="gx-t-meta gx-c-2" role="status">Your picks could not refresh. Showing the last loaded copy.</p> : null}
    <ReminderPrompt key={app.accountId} onGone={onPromptGone}/>
    {!overview ? <ul className="gx-tiles gx-play-tiles" aria-label="Play sections" data-play="tiles">
      <li data-play-tile="ballot" data-moment={tilePop ? 'pop' : undefined}><PlayTile icon="target" label={tile.label} big={tile.big} sub={tile.sub} tone={tile.tone} ariaLabel={waiting ? `${tile.ariaLabel}, new` : tile.ariaLabel} isNew={waiting} onClick={() => openPicks(other)}/></li>
      <li data-play-tile="points"><PointsTile ref={pointsTile} onOpen={() => openPlay(shell, 'points')}/></li>
    </ul> : null}
    </Card>
    {/* A prior week's late game (Monday night, postponed) stays shown beside the newest week's picks until it is done. */}
    <PriorWeekCard app={app} personal={personal}/>
    <div data-play-tile="score"><ScoreTile expanded onOpen={patch => openPlay(shell, 'score', patch)}/></div>
    <ul className="gx-tiles gx-play-support-tiles" aria-label="More Play sections">
      <li data-play-tile="league"><LeagueTile graphical onOpen={() => openPlay(shell, 'league')}/></li>
      <li data-play-tile="badges"><BadgesTile onOpen={() => openPlay(shell, 'features')}/></li>
      {!overview ? <li data-play-tile="compare"><CompareTile onOpen={view => openPlay(shell, 'compare', view)}/></li> : null}
    </ul>
    <details className="gx-focus-help"><summary className="gx-t-strong">How to play</summary><HomeGuide key={app.accountId} preferences={preferences} perGame={data?.rules?.perGameScoring === true}/></details>
  </div>;
}

function PlayDetail() {
  const app = useAppData();
  const shell = useShell();
  const { refresh } = app;
  const personal = useSharedRead('personal');
  const score = shell.state.views.play.section === 'score';
  const market = modeOf(shell.state.views.play.market);
  const refreshBallot = useCallback(() => refresh({ only: ['community', 'personal'] }), [refresh]);
  if (shell.state.views.play.section === 'compare') return <ScoreComparison/>;
  if (score) return <WeeklyScore/>;
  const onMode = mode => shell.setView('play', { market: mode === 'guess_total' ? 'total' : 'spread' });
  return <div className="gx-screen gx-live-play gx-live-workflow gx-vstack gx-gap-16">
    <h1 className="gx-t-title">Your guesses</h1><Button variant="ghost" onClick={() => openPlay(shell, 'score')}>Your score</Button>
    {/* Until the first /personal answer arrives nothing says which week to read, so the cards wait for it. */}
    {personal.data ? <SelectedPlay app={app} shell={shell} current={personal.data} mode={market || 'guess_spread'} onMode={onMode}/>
      : personal.status !== 'error' ? <PlayLoading>Loading your picks…</PlayLoading>
      : personal.error?.status === 404 ? <PlayEmpty>No week is open yet. Weeks open Monday 12:00 AM PT once the schedule is published.</PlayEmpty>
      : <PlayFailure what="Your picks" error={personal.error} onRetry={refreshBallot}/>}
  </div>;
}

/**
 * The picks card holds its market's Whole week locked (D-69): the read that reaches N of N while it is open pops its
 * count line. It renders only beside the cards that can show that line, so a waiting moment is never used up while the
 * picks still load (or fail) with nothing mounted to pop, and it opens only the shown market's scope, so the other
 * market's moment keeps waiting as NEW (M4).
 */
function PicksScope({ mode }) {
  useMomentScope(picksScope(mode));
  return null;
}

function SelectedPlay({ app, shell, current, mode, onMode }) {
  const view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : current.season;
  const week = Number.isInteger(view.week) ? view.week : current.week;
  const read = useLeagueRead(`${app.accountId}:play:${season}:${week}:${mode}`, signal => cloudApi('personal/read', { season, week }, { signal }), error => { if (error.status === 401) app.requestSignIn(); });
  // D-70: the week and its games are nesting cards on one address key (`pickGame`); the editor and its drafts stay
  // mounted between them, so moving there never asks to leave unsaved guesses.
  const { setView, go } = shell, { market: viewMarket, season: viewSeason, week: viewWeek } = view;
  const keeps = useCallback(next => next.tab === 'play' && next.views.play.section === 'picks'
    && next.views.play.market === viewMarket && next.views.play.season === viewSeason && next.views.play.week === viewWeek, [viewMarket, viewSeason, viewWeek]);
  const nest = useMemo(() => ({ game: view.pickGame, keeps, onOpen: id => setView('play', { pickGame: id }), onWeek: () => setView('play', { pickGame: undefined }),
    root: { key: PLAY_ROOT.key, label: PLAY_ROOT.label, onOpen: () => go('play', { section: undefined, ...CLOSED_LAYER }) } }), [view.pickGame, keeps, setView, go]);
  if (read.loading) return <PlayLoading>Loading your picks…</PlayLoading>;
  if (read.error) return <PlayFailure what="Your picks" error={read.error} onRetry={read.retry}/>;
  // Rules that are not per-game (a server without M-07) draw these same cards read-only (PerGameEditor's `active`):
  // every saved guess shows and nothing can be written (D-23). The reveal names other players from the shared
  // Community read, and only when it is this account's read.
  const community = app.community.data, members = community?.viewer?.toLowerCase() === app.accountId.toLowerCase() ? community.members ?? [] : [];
  return <><PerGameEditor key={`${app.accountId}:${season}:${week}:${mode}`} accountId={app.accountId} initialData={read.data} mode={mode} nest={nest} optOuts={app.community.data?.optOuts || []} reveal={{ members }}
    onMode={onMode} setDirty={shell.setDirty} onSignInAgain={app.requestSignIn} onSaved={() => app.refresh({ only: ['community', 'personal'] })}
    onScore={patch => shell.setView('play', { ...patch, section: 'score' })}/><PicksScope mode={mode}/></>;
}
