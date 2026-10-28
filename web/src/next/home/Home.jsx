// Home, round 3 (D-55) with the design lane's hierarchy pass: one primary card that names the next action in words ("Lock
// in 9 games" over "before Thu 5:15 PM PT"), the week meter (one segment per game, per market) and the Pick streak; the
// three stat tiles (the Spread and Total ranks, each with its season points counting up from what this device last saw
// and the rank's last move, and your active tickets); who's in for the league; the newest week's awards as chips; and
// this week's trends. Shared server rules govern every score and reveal; this screen only reads data, and every number
// on it comes from those reads.
import { Suspense, lazy, useEffect, useId, useMemo, useState } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { HOME_COPY, heroProgress, homeHero, homeTiles } from '../../../../shared/home-view.mjs';
import { HOME_LOADING } from '../copy.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { Avatar, Button, Card, Countdown, Meter, Move, Pill } from '../ui/index.js';
import { useHomeData } from './homeData.js';
import { useTicketSummary } from '../bets/useTicketSummary.js';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { nextGuess } from '../play/nextGuess.js';
import { HomeAwards } from '../features/HomeAwards.jsx';
import { HomeStreak } from '../features/HomeStreak.jsx';
import { peekMove, rankKey, readRank } from '../league/rankMoment.js';
import { CountUp } from './CountUp.jsx';
import { HERO_COPY, heroHeadline } from './homeModel.js';
import { useSavedTrends } from '../trends/builderData.js';
import './home.css';

// Loaded only when this device has saved trends, so Home never pulls in the week reads otherwise.
const SavedTrendsHomeRow = lazy(() => import('../trends/SavedTrendsSummary.jsx').then(m => ({ default: m.SavedTrendsHomeRow })));

const WHO = Object.freeze({ in: { word: 'In', tone: 'win' }, satOut: { word: 'Sat out', tone: 'neutral' }, out: { word: 'Not yet', tone: 'pending' } });

function useServerNow(serverNow) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(serverNow);
    if (serverNow === null || serverNow === undefined) return undefined;
    const start = performance.now();
    const timer = setInterval(() => setNow(serverNow + (performance.now() - start)), 1000);
    return () => clearInterval(timer);
  }, [serverNow]);
  return now;
}

/**
 * The hero card, Home's one primary card: the week (with "Due soon" and the Pick streak beside it), the next action in
 * words, the countdown, the week meter (each market's words with one segment per game) and the one lime action.
 */
function Hero({ app, hero, progress, headline, onPicks, onLines }) {
  const id = useId();
  const now = useServerNow(hero.now);
  // Before the week opens the countdown runs to the open, under its own words; "done" never says "locked" there.
  const countdownLabel = hero.state === 'not_open' ? HOME_COPY.notOpen : hero.perGame ? 'Next game kickoff' : HOME_COPY.picksDueIn;
  return (
    <Card as="section" variant="hero" className="gx-h-hero gx-focus-action" aria-labelledby={id} data-home="hero" data-state={hero.state}>
      <div className="gx-h-top">
        {hero.week !== null ? <p className="gx-t-label gx-c-2">{HOME_COPY.weekTitle(hero.week)}</p> : null}
        {hero.state === 'urgent' ? <Pill tone="pending">{HERO_COPY.dueSoon}</Pill> : null}
        <HomeStreak app={app}/>
      </div>
      <div className="gx-h-head">
        <h2 className="gx-t-display" id={id}>{headline.title}</h2>
        {headline.sub ? <p className="gx-t-strong" data-home="when">{headline.sub}</p> : null}
      </div>
      {hero.countdownTarget ? (
        <div className="gx-h-cd">
          {/* The timer carries these words in its name, so the visible line is not read twice. */}
          <p className="gx-t-label gx-c-2" aria-hidden="true">{countdownLabel}</p>
          <Countdown target={hero.countdownTarget} now={now ?? undefined} label={countdownLabel} doneLabel={countdownLabel}/>
        </div>
      ) : null}
      {hero.statusLines.length ? (
        <ul className="gx-h-status" data-home="status">
          {hero.statusLines.map((text, i) => {
            const bar = progress[i];
            return (
              <li key={text} className="gx-h-progress">
                <span className="gx-t-label">{text}</span>
                {/* The week meter: one segment per game, filled as far as the words say (they carry the count). */}
                {bar && bar.of > 0 ? <Meter value={bar.done} max={bar.of} className="gx-h-meter" data-market={bar.mode}/> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {hero.action.primary
        ? <Button variant="primary" block onClick={onPicks}>{hero.action.label}</Button>
        : <Button variant="primary" block iconEnd="chevronRight" onClick={onLines}>Explore games</Button>}
    </Card>
  );
}

/** The arrow a rank tile shows: the last move this device saw on the League board, read only (the board toasts it). */
function useTileMove(viewer, mode, rank) {
  return useMemo(() => peekMove(readRank(rankKey(viewer, 'community', mode)), { rank }), [viewer, mode, rank]);
}

function RankTile({ market, mode, label, tile, chase, viewer, onClick }) {
  const move = useTileMove(viewer, mode, tile.rank);
  const sub = tile.rank ? chase ?? `of ${tile.of}` : HOME_COPY.notScored;
  return (
    <button type="button" className="gx-h-stat" data-tile={market} onClick={onClick}>
      <span className="gx-t-meta gx-c-2">{label}</span>
      <span className="gx-h-stat-value">
        <span>{tile.rank ? `#${tile.label}` : tile.label}</span>
        {move ? <Move by={move} className="gx-h-move"/> : null}
      </span>
      {/* Season points count up from the last value this device saw; never shown for an unranked "—". */}
      {tile.rank && tile.points !== null ? <span className="gx-t-meta gx-h-pts" data-home="points"><CountUp value={tile.points} account={viewer} figure={`community.${mode}.season.${viewer}`}/> pts</span> : null}
      <span className="gx-t-meta gx-c-2">{sub}</span>
    </button>
  );
}

/**
 * Three tiles: the Spread and Total ranks (ranked apart, never summed) with their points and chase lines, and active
 * tickets. The ticket read starts here, so Home reads tickets only once it has a week to show.
 */
function StatTiles({ app, tiles, viewer, onScore, onBets }) {
  const tickets = useTicketSummary(app);
  return (
    <div className="gx-h-stats" data-home="tiles">
      <RankTile market="spread" mode="guess_spread" label={HOME_COPY.spreadRank} tile={tiles.spread} chase={tiles.chase} viewer={viewer} onClick={() => onScore('spread')}/>
      <RankTile market="total" mode="guess_total" label={HOME_COPY.totalRank} tile={tiles.total} chase={null} viewer={viewer} onClick={() => onScore('total')}/>
      <button type="button" className="gx-h-stat" data-tile="tickets" onClick={onBets}>
        <span className="gx-t-meta gx-c-2">My bets</span><span className="gx-h-stat-value">{tickets.loading || tickets.error ? '—' : tickets.active}</span><span className="gx-t-meta gx-c-2">{tickets.error ? 'Open to retry' : 'active tickets'}</span>
      </button>
    </div>
  );
}

/** Who's in for the league's Spread week (faces first), with Standings and Invite. */
function WhosIn({ who, league, onBoard, onInvite }) {
  const id = useId();
  return (
    <Card as="section" className="gx-h-who" aria-labelledby={id} data-home="whos-in">
      <div className="gx-h-who-head">
        <h2 className="gx-t-section gx-grow" id={id}>{league}</h2>
        <Pill tone="data">{who.label}</Pill>
      </div>
      <ul className="gx-h-people">
        {who.people.slice(0, 6).map(person => (
          <li key={person.id} className="gx-h-person">
            <Avatar id={person.id} name={person.name} size={32} you={person.you}/>
            <span className="gx-t-body gx-grow">{person.you ? `${person.name} · You` : person.name}</span>
            <Pill tone={WHO[person.status].tone}>{WHO[person.status].word}</Pill>
          </li>
        ))}
      </ul>
      {who.people.length > 6 ? <p className="gx-t-meta gx-c-2">and {who.people.length - 6} more</p> : null}
      <div className="gx-h-who-actions">
        <Button variant="secondary" onClick={onBoard}>Standings</Button>
        <Button variant="ghost" icon="userPlus" onClick={onInvite}>Invite</Button>
      </div>
    </Card>
  );
}

export function Home() {
  const shell = useShell();
  const { app, community } = useHomeData();
  const data = community.data ?? null;
  const viewer = app.accountId || null;
  const hero = useMemo(() => (data ? homeHero({ community: data }) : null), [data]);
  const progress = useMemo(() => (data ? heroProgress({ community: data }) : []), [data]);
  const headline = useMemo(() => (hero ? heroHeadline({ hero, community: data }) : null), [hero, data]);
  const tiles = useMemo(() => (data ? homeTiles({ community: data, viewer }) : null), [data, viewer]);
  const savedTrends = useSavedTrends();
  // The tab bar names this screen; the title stays for screen readers and the page outline.
  const head = <h1 className="gx-t-title gx-sr-only">{HOME_COPY.title}</h1>;
  if (!hero) {
    // A read that failed with no copy to show; a refusal (403) or a 401 is covered by the app gate before Home draws.
    const failed = community.status === 'error';
    return (
      <div className="gx-screen">
        {head}
        {failed ? (
          <section className="gx-empty" role="alert" aria-label={SHELL_COPY.tabFailed}>
            <p className="gx-t-strong">{SHELL_COPY.tabFailed}</p>
            <p className="gx-t-body gx-c-2">{SHELL_COPY.failHelp}</p>
            <Button variant="secondary" block onClick={() => app.refresh({ only: ['community'] })}>{SHELL_COPY.tryAgain}</Button>
            <Button variant="ghost" onClick={shell.toOldApp}>{APP_SWITCH_COPY.useOld}</Button>
          </section>
        ) : (
          <p className="gx-t-body gx-c-2" role="status">{HOME_LOADING}</p>
        )}
      </div>
    );
  }
  const week = { season: data.week?.season ?? null, week: data.week?.week ?? null };
  const toPicks = () => shell.go('play', { section: 'picks', market: nextGuess(data), ...week });
  const toLines = () => shell.go('research', { section: 'games', season: null, week: null });
  return (
    <div className="gx-screen" data-landing="home">
      {head}
      <Hero app={app} hero={hero} progress={progress} headline={headline} onPicks={toPicks} onLines={toLines}/>
      {community.status === 'error' && <p className="gx-t-body" role="status">This week could not refresh. Showing the last loaded update.</p>}
      <StatTiles app={app} tiles={tiles} viewer={viewer}
        onScore={market => shell.go('play', { section: 'score', ...week, market, team: '', matchup: '', scoreGame: null })}
        onBets={() => shell.go('bets', { view: 'active', season: null, week: null, period: null })}/>
      {hero.week !== null && tiles.whosIn.of ? (
        <WhosIn who={tiles.whosIn} league={shell.league?.name ?? app.league?.name ?? 'Community'}
          onBoard={() => shell.go('league', { view: 'board' })} onInvite={() => shell.openSheet('sh.switcher')}/>
      ) : null}
      <HomeAwards app={app}/>
      <FocusRows label="This week">
        <FocusRow icon="chart" title="This week’s trends" sub="Charts for every game" onClick={() => shell.go('research', { section: 'trends', season: null, week: null })}/>
        {savedTrends.items.length ? <Suspense key="saved-trends" fallback={<span className="gx-t-meta" role="status">Checking saved trends…</span>}><SavedTrendsHomeRow onOpen={() => shell.go('research', { section: 'trends', trendSection: 'build', season: null, week: null })}/></Suspense> : null}
      </FocusRows>
    </div>
  );
}
