// One thing first Home: a next action and compact personal score, ticket and league shortcuts.
// Shared server rules govern every score and reveal; this screen only reads data.
import { useEffect, useId, useMemo, useState } from 'react';
import { APP_SWITCH_COPY } from '../../appView.js';
import { HOME_COPY, homeHero } from '../../../../shared/home-view.mjs';
import { HOME_LOADING } from '../copy.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { Button, Card, Countdown } from '../ui/index.js';
import { useHomeData } from './homeData.js';
import { ScoreSummaryRow, BetsSummaryRow } from './HomeSummaries.jsx';
import { FocusRows, FocusRow } from '../ui/FocusLanding.jsx';
import { nextGuess } from '../play/nextGuess.js';
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

/** The hero card: the week, the countdown (or the one line a closed or finished week shows), the status lines, one action. */
function Hero({ hero, onPicks, onLines }) {
  const id = useId();
  const now = useServerNow(hero.now);
  // Before the week opens the countdown runs to the open, under its own words; "done" never says "locked" there.
  const countdownLabel = hero.state === 'not_open' ? HOME_COPY.notOpen : hero.perGame ? 'Next game kickoff' : HOME_COPY.picksDueIn;
  const line = hero.state === 'closed' ? HOME_COPY.closed : hero.state === 'done' ? HOME_COPY.done : null;
  return (
    <Card as="section" variant="hero" className="gx-h-hero gx-focus-action" aria-labelledby={id} data-home="hero" data-state={hero.state}>
      <p className="gx-t-label gx-c-2">{hero.week === null ? HOME_COPY.noWeek : HOME_COPY.weekTitle(hero.week)}</p><h2 className="gx-t-display" id={id}>{hero.action.primary ? "Finish your weekly guesses." : hero.state === "done" ? "You’re all caught up." : "Explore the week."}</h2>
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
        : <Button variant="primary" block iconEnd="chevronRight" onClick={onLines}>{hero.action.primary ? hero.action.label : "Explore games"}</Button>}
    </Card>
  );
}

export function Home() {
  const shell = useShell();
  const { app, community } = useHomeData();
  const data = community.data ?? null;
  const hero = useMemo(() => (data ? homeHero({ community: data }) : null), [data]);
  const head = <h1 className="gx-t-title">{HOME_COPY.title}</h1>;
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
      <Hero hero={hero} onPicks={toPicks} onLines={toLines}/>
      {community.status === 'error' && <p className="gx-t-body" role="status">This week could not refresh. Showing the last loaded update.</p>}
      <FocusRows label="Your shortcuts">
        <ScoreSummaryRow app={app} onClick={() => shell.go('play', { section: 'score', ...week, team: '', matchup: '', scoreGame: null })}/>
        <BetsSummaryRow app={app} onClick={() => shell.go('bets', { view: 'active', season: null, week: null, period: null })}/>
        <FocusRow icon="trophy" title="My league" sub={shell.league?.name ?? app.league?.name ?? 'Community'} onClick={() => shell.go('league', { view: 'board' })}/>
      </FocusRows>
    </div>
  );
}
