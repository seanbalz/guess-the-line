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
import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { MODE_LABEL } from '../../../../shared/guess-board.mjs';
import { HOME_COPY, homeHero, homeTiles } from '../../../../shared/home-view.mjs';
import { LINES_COPY } from '../../../../shared/lines-view.mjs';
import { HOME_LOADING } from '../copy.js';
import { SEP, plural } from '../format.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { Avatar, AvatarStack, Button, Card, Countdown, DESTINATION_ICONS, Icon, Meter, MetaLine, Nest, Pill, Skeleton, TeamMark, Tile, cx } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { useTicketSummary } from '../bets/useTicketSummary.js';
import { HomeStreak } from '../features/HomeStreak.jsx';
import { featuresView } from '../features/layers.js';
import { useFeatures } from '../features/useFeatures.js';
import { peekMove, rankKey, readRank } from '../league/rankMoment.js';
import { useRankMoment } from '../league/useRankMoment.js';
import { SCOPES, scoreScope } from '../moments/catalog.js';
import { useMomentScope, useNewCount, useNewMoments, usePopped } from '../moments/MomentsProvider.jsx';
import { openPlay } from '../play/PlayLayer.jsx';
import { STATE_ICONS } from '../play/WeekProgress.jsx';
import { weekLockedId } from '../play/moments.js';
import { nextGuess } from '../play/nextGuess.js';
import { useWeekLocked } from '../play/useWeekLocked.js';
import { useSavedTrends } from '../trends/builderData.js';
import { useHomeData } from './homeData.js';
import { focusLayerHeading, gameTileId, tileFocusAfterWindow } from './focusRules.js';
import { useServerNow } from './useServerNow.js';
import { hasNavigated } from '../moments/launch.js';
import { HERO_COPY, HOME_LAYERS, HOME_TILE_ICONS, awardsTile, betsTile, heroHeadline, heroMeters, lastKickoff, rankTileView, trendsTile, weekGames, whoTile } from './homeModel.js';
import '../ui/focusLanding.css';
import './home.css';

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
function Hero({ app, hero, headline, meters, season, at, onPicks, onLines }) {
  useMomentScope(SCOPES.home);
  const id = useId();
  // `at`: when the Community read landed, so a return to Home on an older read counts down from the server's time now.
  const now = useServerNow(hero.now, at);
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
function RankTile({ mode, tileKey, label, tile, viewer, read, fresh, onOpen }) {
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
  return <Tile id={`gx-h-tile-${tileKey}`} label={label} icon={HOME_TILE_ICONS[mode]} big={view.big} sub={sub} tone={view.tone} isNew={isNew} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

function WhoTile({ who, week, onOpen }) {
  const view = whoTile({ whosIn: who, week });
  const faces = view.people.length ? <AvatarStack people={view.people} max={4} size={24}/> : null;
  return <Tile id="gx-h-tile-who" label={HOME_COPY.whosIn} icon={HOME_TILE_ICONS.who} picture={faces} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

/** Awards: reads the shared features read (M-25) like every reader, and shows NEW while a badge or award waits. */
function AwardsTile({ app, shell }) {
  const features = useFeatures(app, shell);
  const waiting = useNewMoments(SCOPES.features);
  const view = awardsTile({ model: features.model, off: features.off, waiting, league: features.leagueId, season: features.data?.season });
  return <Tile id="gx-h-tile-awards" label="Awards" icon={HOME_TILE_ICONS.awards} big={view.big} sub={view.sub} tone={view.tone} isNew={view.isNew} ariaLabel={view.ariaLabel} onClick={() => shell.go('play', featuresView())}/>;
}

/** My bets: the ticket read starts here, so Home reads tickets only once it has a week to show. */
function BetsTile({ app, onOpen }) {
  const view = betsTile(useTicketSummary(app));
  return <Tile id="gx-h-tile-bets" label="My bets" icon={DESTINATION_ICONS.activeTickets} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

function TrendsTile({ onOpen }) {
  const view = trendsTile(useSavedTrends().items);
  return <Tile id="gx-h-tile-trends" label="Trends" icon={DESTINATION_ICONS.trends} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={() => onOpen(view.open)}/>;
}

/** The six tiles (H1A), in the order Sean's board shows them. */
function HomeTiles({ app, shell, community, tiles, hero, week, viewer }) {
  const read = community.data;
  // A rank moment comes only from a fresh read of this account's Community reply (spec 4.2 rule 1).
  const fresh = community.status === 'ready' && !community.error && (typeof read?.viewer !== 'string' || !viewer || read.viewer.toLowerCase() === viewer.toLowerCase());
  const toScore = market => shell.go('play', { section: 'score', ...week, market, team: '', matchup: '', scoreGame: null });
  return (
    <ul className="gx-tiles gx-h-tiles" aria-label="Home sections" data-home="tiles">
      <li data-tile="spread"><RankTile mode="guess_spread" tileKey="spread" label={HOME_COPY.spreadRank} tile={tiles.spread} viewer={viewer} read={read} fresh={fresh} onOpen={() => toScore('spread')}/></li>
      <li data-tile="total"><RankTile mode="guess_total" tileKey="total" label={HOME_COPY.totalRank} tile={tiles.total} viewer={viewer} read={read} fresh={fresh} onOpen={() => toScore('total')}/></li>
      <li data-tile="who"><WhoTile who={tiles.whosIn} week={hero.week} onOpen={() => shell.setView('home', { layer: HOME_LAYERS.who })}/></li>
      <li data-tile="awards"><AwardsTile app={app} shell={shell}/></li>
      <li data-tile="tickets"><BetsTile app={app} onOpen={() => shell.go('bets', { view: 'active', season: null, week: null, period: null })}/></li>
      <li data-tile="trends"><TrendsTile onOpen={open => shell.go('research', open)}/></li>
    </ul>
  );
}

const WHO = Object.freeze({ in: { word: 'In', tone: 'win' }, satOut: { word: 'Sat out', tone: 'neutral' }, out: { word: 'Not yet', tone: 'pending' } });

/** One game: its marks, the matchup, kickoff and your own Spread word with its icon (never color alone). */
function GameTile({ game, onOpen }) {
  return (
    <button type="button" id={gameTileId(game.id)} className="gx-nest-tile gx-tile gx-h-game" aria-label={game.ariaLabel} onClick={onOpen}>
      <span className="gx-h-game-marks" aria-hidden="true"><TeamMark code={game.away} size={24} decorative/><TeamMark code={game.home} size={24} decorative/></span>
      <span className="gx-t-strong gx-h-game-match">{game.matchup}</span>
      <span className="gx-t-meta gx-c-2">{game.when}</span>
      <span className={cx('gx-t-meta', 'gx-h-game-state', `gx-h-game-state--${game.state}`)}><Icon icon={STATE_ICONS[game.state]} size={16}/>{game.word}</span>
    </button>
  );
}

/** A game tile opens that game's Spread picks card; "All N games" opens Research › Games. */
export const openGameTile = (shell, game) => openPlay(shell, 'picks', game.open);
export const openAllGames = shell => shell.go('research', { section: 'games', season: null, week: null });

/**
 * This week (H1A): the viewer's own /personal week as up to four game tiles, each opening that game's picks card, then
 * "All N games". The clock is the server's `now` advanced by this device's elapsed time since the read landed (never
 * the device's own date), so a game that kicks off while Home stays open, or while the read sat in the store, flips to
 * its kickoff word and leaves the window. The clock stops at the week's last kickoff: nothing changes after it. It
 * draws nothing for a week with no slate (404), placeholders while it loads, and one sentence with Try again when it
 * fails.
 */
function ThisWeek({ app, shell, personal, community }) {
  const id = useId();
  const data = personal?.data ?? null;
  const base = Date.parse(data?.now ?? '');
  const until = useMemo(() => lastKickoff(data), [data]);
  const now = useServerNow(Number.isFinite(base) ? base : null, personal?.at, { until });
  const view = useMemo(() => {
    if (!data) return null;
    return weekGames(Number.isFinite(base) && Number.isFinite(now) ? { ...data, now: new Date(now).toISOString() } : data, community);
  }, [data, community, base, now]);
  const heading = useRef(null), focused = useRef(null);
  const idsKey = view ? view.games.map(game => game.id).join('|') : '';
  // A tile that had focus and left the window at kickoff is unmounted; focus then drops to the page, so it goes to the
  // first tile that remains (or the heading) instead.
  useLayoutEffect(() => {
    const active = document.activeElement;
    const move = tileFocusAfterWindow({ focusedId: focused.current, ids: idsKey ? idsKey.split('|') : [], lost: !active || active === document.body || active === document.documentElement });
    if (!move) return;
    focused.current = move.kind === 'tile' ? move.id : null;
    (move.kind === 'tile' ? document.getElementById(move.id) : heading.current)?.focus({ preventScroll: true });
  }, [idsKey]);
  if (!personal) return null;
  if (!data) {
    if (personal.status !== 'error') return <Skeleton label={LINES_COPY.loading} shape="tiles" count={4}/>;
    if (personal.error?.status === 404) return null;
    return (
      <section className="gx-h-week" aria-labelledby={id} data-home="week">
        <h2 className="gx-t-section" id={id}>This week</h2>
        <p className="gx-t-body" role="status">{LINES_COPY.failed}</p>
        <Button variant="secondary" onClick={() => app.refresh({ only: ['personal'] })}>{SHELL_COPY.tryAgain}</Button>
      </section>
    );
  }
  if (!view) return null;
  return (
    <section className="gx-h-week" aria-labelledby={id} data-home="week">
      <div className="gx-h-week-head">
        <h2 className="gx-t-section" id={id} ref={heading} tabIndex={-1}>This week</h2>
        <p className="gx-t-meta gx-c-2">{view.week === null ? plural(view.count, 'game') : `Week ${view.week}${SEP}${plural(view.count, 'game')}`}</p>
      </div>
      <ul className="gx-tiles" aria-label="This week’s next games" onFocus={event => { if (event.target.id?.startsWith('gx-h-game-')) focused.current = event.target.id; }} onBlur={event => { if (event.relatedTarget) focused.current = null; }}>
        {view.games.map(game => <li key={game.id} data-game-tile={game.id}><GameTile game={game} onOpen={() => openGameTile(shell, game)}/></li>)}
      </ul>
      <Button variant="secondary" block iconEnd="chevronRight" onClick={() => openAllGames(shell)}>{`All ${plural(view.count, 'game')}`}</Button>
    </section>
  );
}

/**
 * Who's in (`#home?layer=who`): a nesting card under a "Home" lip with every member's Spread ballot state, faces first,
 * then Standings and Invite. It has its own loading and failure, so a reload at its address never shows Home's card.
 * While it is open the next-move card is not mounted, so Home's moment scope is closed.
 */
function WhosInLayer({ head, app, shell, community, hero, tiles }) {
  const league = shell.league?.name ?? app.league?.name ?? 'Community';
  const lips = [{ key: 'home', label: HOME_COPY.title, onOpen: () => shell.setView('home', { layer: undefined }) }];
  const who = tiles?.whosIn ?? null;
  let body;
  if (!hero) {
    body = community.status === 'error'
      ? <><p className="gx-t-body" role="status">{SHELL_COPY.tabFailed}</p><Button variant="secondary" onClick={() => app.refresh({ only: ['community'] })}>{SHELL_COPY.tryAgain}</Button></>
      : <Skeleton label={HOME_LOADING} shape="rows" count={4}/>;
  } else if (hero.week === null || !(who?.of > 0)) {
    body = <p className="gx-t-body">{HOME_COPY.noWeek}.</p>;
  } else {
    body = (
      <>
        <MetaLine parts={[league, HOME_COPY.weekTitle(hero.week), `Spread ballots ${who.in} of ${who.of} in`]}/>
        <ul className="gx-h-people">
          {who.people.map(person => (
            <li key={person.id} className="gx-h-person">
              <Avatar id={person.id} name={person.name} size={32} you={person.you}/>
              <span className="gx-t-body gx-grow">{person.you ? `${person.name} · You` : person.name}</span>
              <Pill tone={WHO[person.status].tone}>{WHO[person.status].word}</Pill>
            </li>
          ))}
        </ul>
      </>
    );
  }
  const root = useRef(null);
  // Nest focuses its heading only when its layer changes, so on mount (the tile that opened it is gone) it is ours to do.
  useLayoutEffect(() => { focusLayerHeading(root.current, hasNavigated()); }, []);
  return (
    <div className="gx-screen gx-h" data-home="who-layer" ref={root}>
      {head}
      <Nest label={HOME_COPY.whosIn} lips={lips} layer={HOME_LAYERS.who} title={HOME_COPY.whosIn}>
        {body}
        <div className="gx-h-who-actions">
          <Button variant="secondary" onClick={() => shell.go('league', { view: 'board' })}>Standings</Button>
          <Button variant="ghost" icon="userPlus" onClick={() => shell.openSheet('sh.switcher')}>Invite</Button>
        </div>
      </Nest>
    </div>
  );
}

export function Home() {
  const shell = useShell();
  const { app, community, personal } = useHomeData();
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
  // The layer replaces the landing: the next-move card is unmounted, so Home's moment scope is closed behind it.
  if (shell.state?.views?.home?.layer === HOME_LAYERS.who) return <WhosInLayer head={head} app={app} shell={shell} community={community} hero={hero} tiles={tiles}/>;
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
      <Hero app={app} hero={hero} headline={headline} meters={meters} season={week.season} at={community.at} onPicks={toPicks} onLines={toLines}/>
      {community.status === 'error' && <p className="gx-t-body" role="status">This week could not refresh. Showing the last loaded update.</p>}
      <HomeTiles app={app} shell={shell} community={community} tiles={tiles} hero={hero} week={week} viewer={viewer}/>
      <ThisWeek app={app} shell={shell} personal={personal} community={data}/>
    </div>
  );
}
