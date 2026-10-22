// Home, round 3 (D-55): the glow hero with this week's one action, a progress bar per market, three stat tiles (the
// Spread and Total ranks and your active tickets), who's in for the league, and this week's trends. Shared server rules
// govern every score and reveal; this screen only reads data, and every number on it comes from those reads.
import { useEffect, useId, useMemo, useState } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { HOME_COPY, heroProgress, homeHero, homeTiles } from '../../../../shared/home-view.mjs';
import { HOME_LOADING } from '../copy.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { Avatar, Button, Card, Countdown, Pill } from '../ui/index.js';
import { useHomeData } from './homeData.js';
import { useTicketSummary } from '../bets/useTicketSummary.js';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { nextGuess } from '../play/nextGuess.js';
import './home.css';

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

/** The hero card: the week, the countdown (or the one line a closed or finished week shows), the status lines, one action. */
function Hero({ hero, progress, onPicks, onLines }) {
  const id = useId();
  const now = useServerNow(hero.now);
  // Before the week opens the countdown runs to the open, under its own words; "done" never says "locked" there.
  const countdownLabel = hero.state === 'not_open' ? HOME_COPY.notOpen : hero.perGame ? 'Next game kickoff' : HOME_COPY.picksDueIn;
  const line = hero.state === 'closed' ? HOME_COPY.closed : hero.state === 'done' ? HOME_COPY.done : null;
  return (
    <Card as="section" variant="hero" className="gx-h-hero gx-focus-action" aria-labelledby={id} data-home="hero" data-state={hero.state}>
      <p className="gx-t-label gx-c-2">{hero.week === null ? HOME_COPY.noWeek : HOME_COPY.weekTitle(hero.week)}</p><h2 className="gx-t-display" id={id}>{hero.action.primary && hero.week !== null ? `Lock in ${HOME_COPY.weekTitle(hero.week)}` : hero.state === "done" ? "You’re all caught up." : "Explore the week."}</h2>
      {hero.countdownTarget ? (
        <div className="gx-h-cd">
          {/* The timer carries these words in its name, so the visible line is not read twice. */}
          <p className="gx-t-label gx-c-2" aria-hidden="true">{countdownLabel}</p>
          <Countdown target={hero.countdownTarget} now={now ?? undefined} label={countdownLabel} doneLabel={countdownLabel}/>
        </div>
      ) : line ? <p className="gx-t-strong" data-home="line">{line}</p> : null}
      {hero.statusLines.length ? (
        <ul className="gx-h-status" data-home="status">
          {hero.statusLines.map((text, i) => {
            const bar = progress[i];
            return (
              <li key={text} className="gx-h-progress">
                <span className="gx-t-label">{text}</span>
                {bar && bar.of > 0 ? <span className="gx-h-bar" aria-hidden="true"><span className="gx-h-bar-fill" style={{ width: `${(100 * bar.done) / bar.of}%` }}></span></span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {hero.action.primary
        ? <Button variant="primary" block onClick={onPicks}>{hero.action.label}</Button>
        : <Button variant="primary" block iconEnd="chevronRight" onClick={onLines}>{hero.action.primary ? hero.action.label : "Explore games"}</Button>}
    </Card>
  );
}

/**
 * Three tiles: the Spread and Total ranks (ranked apart, never summed) with their chase lines, and active tickets.
 * The ticket read starts here, so Home reads tickets only once it has a week to show (as the old summary row did).
 */
function StatTiles({ app, tiles, onScore, onBets }) {
  const tickets = useTicketSummary(app);
  const rank = tile => (tile.rank ? `#${tile.label}` : tile.label);
  const sub = (tile, chase) => (tile.rank ? chase ?? `of ${tile.of}` : HOME_COPY.notScored);
  return (
    <div className="gx-h-stats" data-home="tiles">
      <button type="button" className="gx-h-stat" data-tile="spread" onClick={() => onScore('spread')}>
        <span className="gx-t-meta gx-c-2">{HOME_COPY.spreadRank}</span><span className="gx-h-stat-value">{rank(tiles.spread)}</span><span className="gx-t-meta gx-c-2">{sub(tiles.spread, tiles.chase)}</span>
      </button>
      <button type="button" className="gx-h-stat" data-tile="total" onClick={() => onScore('total')}>
        <span className="gx-t-meta gx-c-2">{HOME_COPY.totalRank}</span><span className="gx-h-stat-value">{rank(tiles.total)}</span><span className="gx-t-meta gx-c-2">{sub(tiles.total, null)}</span>
      </button>
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
  const hero = useMemo(() => (data ? homeHero({ community: data }) : null), [data]);
  const progress = useMemo(() => (data ? heroProgress({ community: data }) : []), [data]);
  const tiles = useMemo(() => (data ? homeTiles({ community: data, viewer: app.accountId || null }) : null), [data, app.accountId]);
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
      <Hero hero={hero} progress={progress} onPicks={toPicks} onLines={toLines}/>
      {community.status === 'error' && <p className="gx-t-body" role="status">This week could not refresh. Showing the last loaded update.</p>}
      <StatTiles app={app} tiles={tiles}
        onScore={market => shell.go('play', { section: 'score', ...week, market, team: '', matchup: '', scoreGame: null })}
        onBets={() => shell.go('bets', { view: 'active', season: null, week: null, period: null })}/>
      {hero.week !== null && tiles.whosIn.of ? (
        <WhosIn who={tiles.whosIn} league={shell.league?.name ?? app.league?.name ?? 'Community'}
          onBoard={() => shell.go('league', { view: 'board' })} onInvite={() => shell.openSheet('sh.switcher')}/>
      ) : null}
      <FocusRows label="This week">
        <FocusRow icon="chart" title="This week’s trends" sub="Charts for every game" onClick={() => shell.go('research', { section: 'trends', season: null, week: null })}/>
      </FocusRows>
    </div>
  );
}
