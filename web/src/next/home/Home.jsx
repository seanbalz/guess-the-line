// Approved Home landing; the existing Who’s in layer and per-game privacy/focus rules stay shared.
import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { HOME_COPY, homeHero, homeTiles } from '../../../../shared/home-view.mjs';
import { LINES_COPY } from '../../../../shared/lines-view.mjs';
import { HOME_LOADING } from '../copy.js';
import { SEP, plural } from '../format.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { Avatar, Button, Icon, MetaLine, Nest, Pill, Skeleton, TeamMark, cx } from '../ui/index.js';
import { openPlay } from '../play/PlayLayer.jsx';
import { STATE_ICONS } from '../play/WeekProgress.jsx';
import { nextGuess } from '../play/nextGuess.js';
import { useWeekLocked } from '../play/useWeekLocked.js';
import { useHomeData } from './homeData.js';
import { focusLayerHeading, gameTileId, tileFocusAfterWindow } from './focusRules.js';
import { useServerNow } from './useServerNow.js';
import { hasNavigated } from '../moments/launch.js';
import { HOME_LAYERS, heroHeadline, lastKickoff, weekGames } from './homeModel.js';
import '../ui/focusLanding.css';
import './home.css';
import { ApprovedHome } from './ApprovedHome.jsx';
import { teamName } from '../ui/Matchup.jsx';
import { PriorWeekCard } from '../lines/PriorWeek.jsx';
import { RecapLayer } from './MondayRecap.jsx';

const WHO = Object.freeze({ in: { word: 'In', tone: 'win' }, satOut: { word: 'Sat out', tone: 'neutral' }, out: { word: 'Not yet', tone: 'pending' } });

/** One game: its marks, the matchup, kickoff and your own Spread word with its icon (never color alone). */
function GameTile({ game, onOpen }) {
  return (
    <button type="button" id={gameTileId(game.id)} className="gx-nest-tile gx-tile gx-h-game" aria-label={game.ariaLabel} onClick={onOpen}>
      <span className="gx-h-game-marks" aria-hidden="true"><TeamMark code={game.away} size={32} decorative/><TeamMark code={game.home} size={32} decorative/></span>
      <span className="gx-t-strong gx-h-game-match">{teamName(game.away).split(' ').at(-1)} @ {teamName(game.home).split(' ').at(-1)}</span>
      <span className="gx-t-meta gx-c-2">{game.when}</span>
      <span className={cx('gx-t-meta', 'gx-h-game-state', `gx-h-game-state--${game.state}`)}><Icon icon={STATE_ICONS[game.state]} size={16}/>{game.word}</span>
    </button>
  );
}

/** A game tile opens that game's Spread picks card; "All N games" opens Research › Games. */
export const openGameTile = (shell, game) => openPlay(shell, 'picks', game.open);
export const openAllGames = shell => shell.go('research', { section: 'games', season: null, week: null });

/**
 * This week (H1A): the viewer's own /personal week as two compact game rows, each opening that game's picks card, then
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
  const idsKey = view ? view.games.slice(0, 2).map(game => game.id).join('|') : '';
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
        <button type="button" className="gx-home-text-button" onClick={() => openAllGames(shell)} aria-label={`All ${plural(view.count,'game')}`}>{view.week === null ? plural(view.count, 'game') : `Week ${view.week}${SEP}${plural(view.count, 'game')}`}</button>
      </div>
      <ul className="gx-tiles" aria-label="This week’s next games" onFocus={event => { if (event.target.id?.startsWith('gx-h-game-')) focused.current = event.target.id; }} onBlur={event => { if (event.relatedTarget) focused.current = null; }}>
        {view.games.slice(0,2).map(game => <li key={game.id} data-game-tile={game.id}><GameTile game={game} onOpen={() => openGameTile(shell, game)}/></li>)}
      </ul>
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
  const headline = useMemo(() => (hero ? heroHeadline({ hero, community: data }) : null), [hero, data]);
  const tiles = useMemo(() => (data ? homeTiles({ community: data, viewer }) : null), [data, viewer]);
  // The tab bar names this screen; the title stays for screen readers and the page outline.
  const head = <h1 className="gx-t-title gx-sr-only">{HOME_COPY.title}</h1>;
  // The layer replaces the landing: the next-move card is unmounted, so Home's moment scope is closed behind it.
  if (shell.state?.views?.home?.layer === HOME_LAYERS.recap) return <RecapLayer head={head} app={app}/>;
  if (shell.state?.views?.home?.layer === HOME_LAYERS.who) return <WhosInLayer head={head} app={app} shell={shell} community={community} hero={hero} tiles={tiles}/>;
  if (!hero) {
    // A read that failed with no copy to show; a refusal (403) or a 401 is covered by the app gate before Home draws.
    const failed = community.status === 'error';
    return (
      <div className="gx-home-approved gx-screen">
        <header className="gx-home-heading"><p>Loading your week…</p><h1 aria-label="Home">Your week.</h1></header>
        {failed ? (
          <section className="gx-empty" role="alert" aria-label={SHELL_COPY.tabFailed}>
            <p className="gx-t-strong">{SHELL_COPY.tabFailed}</p>
            <p className="gx-t-body gx-c-2">{SHELL_COPY.failHelp}</p>
            <Button variant="secondary" block onClick={() => app.refresh({ only: ['community'] })}>{SHELL_COPY.tryAgain}</Button>
            <Button variant="ghost" onClick={shell.reload}>{APP_RELOAD_COPY.reload}</Button>
          </section>
        ) : (
          <Skeleton label={HOME_LOADING} shape="landing" hero="meter" count={4}/>
        )}
      </div>
    );
  }
  const week = { season: data.week?.season ?? null, week: data.week?.week ?? null };
  const toPicks = () => shell.go('play', { section: 'picks', market: nextGuess(data), ...week });
  const toLines = () => shell.go('research', { section: 'games', season: null, week: null });
  return <ApprovedHome app={app} shell={shell} community={data} hero={hero} headline={headline} toPicks={toPicks} toLines={toLines} weekContent={<><PriorWeekCard app={app} personal={personal} recap/><ThisWeek app={app} shell={shell} personal={personal} community={data}/></>}/>;
}
