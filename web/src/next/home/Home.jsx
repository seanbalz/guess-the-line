// D-53 weekly Home: guidance, next action, personal scores, research readiness and exploration.
// Shared server rules govern every score and reveal; the only write is an explicit guidance preference.
import { Suspense, useEffect, useId, useMemo, useState } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { HOME_COPY, homeHero, homeTiles } from '../../../../shared/home-view.mjs';
import { HOME_LOADING, pointsLine } from '../copy.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { AvatarStack, Button, Card, Countdown, Rank } from '../ui/index.js';
import { homeTiles as betsTiles } from '../bets/index.js';
import { homeTiles as leagueTiles } from '../league/index.js';
import { homeTiles as linesTiles } from '../lines/index.js';
import { homeTiles as playTiles } from '../play/index.js';
import { useHomeData } from './homeData.js';
import { HomeGuide } from './HomeGuide.jsx';
import { ResearchPreview } from './ResearchPreview.jsx';
import { FantasyHomeTile } from '../fantasy/FantasyHomeTile.jsx';
import './home.css';

// The other tabs' Home tiles, in their own order (section 3.1: Home reads other tabs only through their slot files).
const SLOT_TILES = [...playTiles, ...betsTiles, ...linesTiles, ...leagueTiles].sort((a, b) => a.order - b.order);

/** The server's clock carried forward by the time elapsed on this device (a monotonic clock, not the device's date),
 *  so the countdown ticks every second without trusting the device's date; null when the reply carries no clock. */
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

/** The hero card: the week, the countdown (or the one line a closed or finished week shows), the status lines, one action. */
function Hero({ hero, onPicks, onLines }) {
  const id = useId();
  const now = useServerNow(hero.now);
  // Before the week opens the countdown runs to the open, under its own words; "done" never says "locked" there.
  const countdownLabel = hero.state === 'not_open' ? HOME_COPY.notOpen : hero.perGame ? 'Next game kickoff' : HOME_COPY.picksDueIn;
  const line = hero.state === 'closed' ? HOME_COPY.closed : hero.state === 'done' ? HOME_COPY.done : null;
  return (
    <Card as="section" variant="hero" className="gx-h-hero" aria-labelledby={id} data-home="hero" data-state={hero.state}>
      <h2 className="gx-t-display" id={id}>{hero.week === null ? HOME_COPY.noWeek : HOME_COPY.weekTitle(hero.week)}</h2>
      {hero.countdownTarget ? (
        <div className="gx-h-cd">
          {/* The timer carries these words in its name, so the visible line is not read twice. */}
          <p className="gx-t-label gx-c-2" aria-hidden="true">{countdownLabel}</p>
          <Countdown target={hero.countdownTarget} now={now ?? undefined} label={countdownLabel} doneLabel={countdownLabel}/>
        </div>
      ) : line ? <p className="gx-t-strong" data-home="line">{line}</p> : null}
      {hero.statusLines.length ? (
        <ul className="gx-h-status" data-home="status">
          {hero.statusLines.map(text => <li key={text} className="gx-t-body gx-c-2">{text}</li>)}
        </ul>
      ) : null}
      {hero.action.primary
        ? <Button variant="primary" block onClick={onPicks}>{hero.action.label}</Button>
        : <Button variant="secondary" block iconEnd="chevronRight" onClick={onLines}>{hero.action.label}</Button>}
    </Card>
  );
}

/** Who's in: the faces of everyone done with the week (in or sat out), the viewer first, and "6 of 7 in". */
function WhosIn({ who }) {
  const id = useId();
  const done = who.people.filter(person => person.status !== 'out');
  return (
    <Card as="section" className="gx-h-who" aria-labelledby={id} data-home="whos-in">
      <div className="gx-vstack gx-gap-2">
        <h2 className="gx-t-section" id={id}>{HOME_COPY.whosIn}</h2>
        <p className="gx-t-body gx-c-2">{who.label}</p>
      </div>
      <AvatarStack people={done} max={4} size={32}/>
    </Card>
  );
}

/** One market's rank tile: its rank and scored points, or why it is not ranked yet, and the chase line. */
function RankTile({ title, tile, chase, market }) {
  const id = useId();
  // M-01 keeps points null without a submitted ballot; an unscored submission has 0 points but no rank yet.
  const unranked = tile.points === null ? HOME_COPY.noBallot : HOME_COPY.notScored;
  return (
    <Card as="section" className="gx-h-tile" aria-labelledby={id} data-tile={market}>
      <h2 className="gx-t-micro gx-c-2" id={id}>{title}</h2>
      <Rank rank={tile.label} tied={tile.tied}/>
      <p className="gx-t-meta">{tile.rank === null ? unranked : pointsLine(tile.points)}</p>
      {chase ? <p className="gx-t-meta" data-home="chase">{chase}</p> : null}
    </Card>
  );
}

export function Home() {
  const shell = useShell();
  const { app, community, viewer, preferences } = useHomeData();
  const data = community.data ?? null;
  const hero = useMemo(() => (data ? homeHero({ community: data }) : null), [data]);
  const tiles = useMemo(() => (data ? homeTiles({ community: data, viewer }) : null), [data, viewer]);
  const head = <h1 className="gx-t-title">{HOME_COPY.title}</h1>;
  if (!hero || !tiles) {
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
  const toPicks = () => shell.go('play', { section: 'picks', season: data.week?.season ?? null, week: data.week?.week ?? null });
  const toLines = () => shell.tab('lines');
  return (
    <div className="gx-screen">
      {head}
      <HomeGuide key={app.accountId} preferences={preferences} perGame={data.rules?.perGameScoring === true}/>
      <Hero hero={hero} onPicks={toPicks} onLines={toLines}/>
      {SLOT_TILES.filter(tile => tile.id === 'play.weekly-score').map(({ id,Tile }) => <Suspense key={id} fallback={null}><Tile/></Suspense>)}
      <ResearchPreview shell={shell} preferences={preferences}/>
      <FantasyHomeTile/>
      <Card as="section" className="gx-vstack gx-gap-12"><h2 className="gx-t-section">Explore the week</h2><p className="gx-t-body">Lines opens matchup details, quote sources and trends. History shows prior weeks and saved guesses.</p><Button onClick={toLines}>Game details and trends</Button><Button onClick={() => shell.tab('trends')}>Weekly and player trends</Button><Button onClick={() => shell.go('league',{ view: 'history' })}>Week history</Button></Card>
      <WhosIn who={tiles.whosIn}/>
      <div className="gx-h-tiles">
        <RankTile title={HOME_COPY.spreadRank} tile={tiles.spread} chase={tiles.chase} market="spread"/>
        <RankTile title={HOME_COPY.totalRank} tile={tiles.total} chase={null} market="total"/>
      </div>
      {SLOT_TILES.filter(tile => tile.id !== 'play.weekly-score').map(({ id, Tile }) => <Suspense key={id} fallback={null}><Tile/></Suspense>)}
    </div>
  );
}
