// Home (D-69 step 2, layout H1A, built for Sean's review with the design audit's C9). One next-move card, then six tiles
// in two columns, each opening its own card:
// - the card (spec section 5): "Your next move" (or "Week N" when nothing is due) with the Pick streak beside it, the
//   action in words ("Lock in 9 games" over "before Thu 5:15 PM PT"), the countdown (the card's one picture), the Spread
//   and Total meters (side by side once the card is 332 px wide, C9) and the screen's one lime button;
// - the tiles: the Spread and Total ranks (Play › Your score), Who's in (its Home layer), Awards (Play › Badges and
//   awards), My bets (Bets › My bets) and Trends (Research › Trends).
// Home plays only Whole week locked and the Pick streak, in place on the card. Every other result from while you were
// away shows NEW on its tile and plays when that tile's card opens, never on launch. Every number comes from the shared
// reads; this screen writes nothing.
import { useEffect, useId, useMemo, useState } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { MODE_LABEL } from '../../../../shared/guess-board.mjs';
import { HOME_COPY, homeHero, homeTiles } from '../../../../shared/home-view.mjs';
import { HOME_LOADING } from '../copy.js';
import { SEP } from '../format.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { AvatarStack, Button, Card, Countdown, DESTINATION_ICONS, Meter, Pill, Skeleton, Tile } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { useTicketSummary } from '../bets/useTicketSummary.js';
import { HomeStreak } from '../features/HomeStreak.jsx';
import { featuresView } from '../features/layers.js';
import { useFeatures } from '../features/useFeatures.js';
import { peekMove, rankKey, readRank } from '../league/rankMoment.js';
import { useRankMoment } from '../league/useRankMoment.js';
import { SCOPES, scoreScope } from '../moments/catalog.js';
import { useMomentScope, useNewCount, useNewMoments, usePopped } from '../moments/MomentsProvider.jsx';
import { weekLockedId } from '../play/moments.js';
import { nextGuess } from '../play/nextGuess.js';
import { useWeekLocked } from '../play/useWeekLocked.js';
import { useSavedTrends } from '../trends/builderData.js';
import { useHomeData } from './homeData.js';
import { HERO_COPY, HOME_LAYERS, HOME_TILE_ICONS, awardsTile, betsTile, heroHeadline, heroMeters, rankTileView, trendsTile, whoTile } from './homeModel.js';
import '../ui/focusLanding.css';
import './home.css';

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

/** One market's half of the card's status row (C9): its words and its meter; it pops when that market's week locks here. */
function MeterColumn({ meter, season, week }) {
  const pop = usePopped(Number.isInteger(season) && Number.isInteger(week) ? weekLockedId(season, week, meter.mode) : '');
  return (
    <li className="gx-h-meter" data-market={meter.mode} data-moment={pop ? 'pop' : undefined}>
      <span className="gx-t-label">{meter.words}</span>
      {meter.of > 0 ? <Meter value={meter.done} max={meter.of} className="gx-h-meter-bar" data-market={meter.mode}/> : null}
    </li>
  );
}

/**
 * The next-move card, Home's one primary card. It holds Home's moments (SCOPES.home) while it is on screen, so nothing
 * waiting is spent while Home loads or shows a layer.
 */
function Hero({ app, hero, headline, meters, season, onPicks, onLines }) {
  useMomentScope(SCOPES.home);
  const id = useId();
  const now = useServerNow(hero.now);
  // Before the week opens the countdown runs to the open, under its own words; "done" never says "locked" there.
  const countdownLabel = hero.state === 'not_open' ? HOME_COPY.notOpen : hero.perGame ? 'Next game kickoff' : HOME_COPY.picksDueIn;
  return (
    <Card as="section" variant="hero" className="gx-h-hero gx-focus-action" aria-labelledby={id} data-home="hero" data-state={hero.state}>
      <div className="gx-h-top">
        {headline.eyebrow ? <p className="gx-t-micro gx-h-eyebrow" data-home="eyebrow">{headline.eyebrow}</p> : null}
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
      {meters.length ? (
        <ul className="gx-h-meters" data-home="status">
          {meters.map(meter => <MeterColumn key={meter.mode} meter={meter} season={season} week={hero.week}/>)}
        </ul>
      ) : null}
      {hero.action.primary
        ? <Button variant="primary" block onClick={onPicks}>{hero.action.label}</Button>
        : <Button variant="primary" block iconEnd="chevronRight" onClick={onLines}>Explore games</Button>}
    </Card>
  );
}

/**
 * A rank tile: the Community board rank for one market (ranked apart, never summed), the move this device last saw and
 * the season points counting up from what it last showed. It reports that board's rank moment from each fresh Community
 * read (League does the same; one id, one play), and shows NEW while the move waits for its Your score card.
 */
function RankTile({ mode, label, tile, viewer, read, fresh, onOpen }) {
  const moment = useRankMoment({ account: viewer, league: 'community', mode, rank: tile.rank, tied: tile.tied, market: MODE_LABEL[mode], read, fresh });
  // The arrow this device last saw, read without spending it; the report above moves the record on.
  const move = useMemo(() => peekMove(readRank(rankKey(viewer, 'community', mode)), { rank: tile.rank }), [viewer, mode, tile.rank, moment.id]);
  const isNew = useNewCount(scoreScope(mode)) > 0;
  const view = rankTileView({ label, tile, move });
  const sub = !view.ranked ? HOME_COPY.notScored : (
    <>
      {view.arrow ? `${view.arrow}${SEP}` : null}
      {view.points !== null ? <span data-home="points"><CountUp value={view.points} account={viewer} figure={`community.${mode}.season.${viewer}`}/> pts</span> : null}
    </>
  );
  return <Tile label={label} icon={HOME_TILE_ICONS[mode]} big={view.big} sub={sub} tone={view.tone} isNew={isNew} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

function WhoTile({ who, week, onOpen }) {
  const view = whoTile({ whosIn: who, week });
  const faces = view.people.length ? <AvatarStack people={view.people} max={4} size={24}/> : null;
  return <Tile label={HOME_COPY.whosIn} icon={HOME_TILE_ICONS.who} picture={faces} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

/** Awards: reads the shared features read (M-25) like every reader, and shows NEW while a badge or award waits. */
function AwardsTile({ app, shell }) {
  const features = useFeatures(app, shell);
  const waiting = useNewMoments(SCOPES.features);
  const view = awardsTile({ model: features.model, off: features.off, waiting });
  return <Tile label="Awards" icon={HOME_TILE_ICONS.awards} big={view.big} sub={view.sub} tone={view.tone} isNew={view.isNew} ariaLabel={view.ariaLabel} onClick={() => shell.go('play', featuresView())}/>;
}

/** My bets: the ticket read starts here, so Home reads tickets only once it has a week to show. */
function BetsTile({ app, onOpen }) {
  const view = betsTile(useTicketSummary(app));
  return <Tile label="My bets" icon={DESTINATION_ICONS.activeTickets} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

function TrendsTile({ onOpen }) {
  const view = trendsTile(useSavedTrends().items);
  return <Tile label="Trends" icon={DESTINATION_ICONS.trends} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={() => onOpen(view.open)}/>;
}

/** The six tiles (H1A), in the order Sean's board shows them. */
function HomeTiles({ app, shell, community, tiles, hero, week, viewer }) {
  const read = community.data;
  // A rank moment comes only from a fresh read of this account's Community reply (spec 4.2 rule 1).
  const fresh = community.status === 'ready' && !community.error && (typeof read?.viewer !== 'string' || !viewer || read.viewer.toLowerCase() === viewer.toLowerCase());
  const toScore = market => shell.go('play', { section: 'score', ...week, market, team: '', matchup: '', scoreGame: null });
  return (
    <ul className="gx-tiles gx-h-tiles" aria-label="Home sections" data-home="tiles">
      <li data-tile="spread"><RankTile mode="guess_spread" label={HOME_COPY.spreadRank} tile={tiles.spread} viewer={viewer} read={read} fresh={fresh} onOpen={() => toScore('spread')}/></li>
      <li data-tile="total"><RankTile mode="guess_total" label={HOME_COPY.totalRank} tile={tiles.total} viewer={viewer} read={read} fresh={fresh} onOpen={() => toScore('total')}/></li>
      <li data-tile="who"><WhoTile who={tiles.whosIn} week={hero.week} onOpen={() => shell.setView('home', { layer: HOME_LAYERS.who })}/></li>
      <li data-tile="awards"><AwardsTile app={app} shell={shell}/></li>
      <li data-tile="tickets"><BetsTile app={app} onOpen={() => shell.go('bets', { view: 'active', season: null, week: null, period: null })}/></li>
      <li data-tile="trends"><TrendsTile onOpen={open => shell.go('research', open)}/></li>
    </ul>
  );
}

export function Home() {
  const shell = useShell();
  const { app, community } = useHomeData();
  // D-69: Whole week locked reads the shared Community read here too, and plays on Home's card (SCOPES.home).
  useWeekLocked(app);
  const data = community.data ?? null;
  const viewer = app.accountId || null;
  const hero = useMemo(() => (data ? homeHero({ community: data }) : null), [data]);
  const meters = useMemo(() => (data ? heroMeters(data) : []), [data]);
  const headline = useMemo(() => (hero ? heroHeadline({ hero, community: data }) : null), [hero, data]);
  const tiles = useMemo(() => (data ? homeTiles({ community: data, viewer }) : null), [data, viewer]);
  // The tab bar names this screen; the title stays for screen readers and the page outline.
  const head = <h1 className="gx-t-title gx-sr-only">{HOME_COPY.title}</h1>;
  if (!hero) {
    // A read that failed with no copy to show; a refusal (403) or a 401 is covered by the app gate before Home draws.
    const failed = community.status === 'error';
    return (
      <div className="gx-screen gx-h">
        {head}
        {failed ? (
          <section className="gx-empty" role="alert" aria-label={SHELL_COPY.tabFailed}>
            <p className="gx-t-strong">{SHELL_COPY.tabFailed}</p>
            <p className="gx-t-body gx-c-2">{SHELL_COPY.failHelp}</p>
            <Button variant="secondary" block onClick={() => app.refresh({ only: ['community'] })}>{SHELL_COPY.tryAgain}</Button>
            <Button variant="ghost" onClick={shell.reload}>{APP_RELOAD_COPY.reload}</Button>
          </section>
        ) : (
          <Skeleton label={HOME_LOADING} shape="landing" count={6}/>
        )}
      </div>
    );
  }
  const week = { season: data.week?.season ?? null, week: data.week?.week ?? null };
  const toPicks = () => shell.go('play', { section: 'picks', market: nextGuess(data), ...week });
  const toLines = () => shell.go('research', { section: 'games', season: null, week: null });
  return (
    <div className="gx-screen gx-h" data-landing="home">
      {head}
      <Hero app={app} hero={hero} headline={headline} meters={meters} season={week.season} onPicks={toPicks} onLines={toLines}/>
      {community.status === 'error' && <p className="gx-t-body" role="status">This week could not refresh. Showing the last loaded update.</p>}
      <HomeTiles app={app} shell={shell} community={community} tiles={tiles} hero={hero} week={week} viewer={viewer}/>
    </div>
  );
}
