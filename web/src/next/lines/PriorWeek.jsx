// Still playing from last week (November 9, 2026). Week N+1 opens Monday 12:00 AM PT while Week N's Monday night game
// (or a late or postponed game) is still to be played. Entry stays on the newest week; this card shows the prior week's
// games that are not done yet (shared/prior-week.mjs) beside it on Home, Play and Research › Games: the matchup, the
// kickoff, live or final status, the viewer's own locked guesses, the line at each guess and the points once graded.
// It reads only the existing gated `/lines/read` for the prior week (the viewer's own rows; a market's line opens only
// as the server allows), so locks and reveal rules are the server's, unchanged. Opening a game goes to that week's own
// picks cards, where the week's guesses stay read-only after kickoff as before.
import { useEffect, useId, useMemo, useRef } from 'react';
import { priorWeekOf, priorWeekStillPlaying } from '../../../../shared/prior-week.mjs';
import { useShell } from '../shell/context.js';
import { Button, Card, Pill, TeamMark } from '../ui/index.js';
import { fmtNum, fmtSpreadPick, fmtWhen, SEP } from '../format.js';
import { useBoardLines } from './useGameLines.js';
import { RecapEntry, openRecap } from '../home/MondayRecap.jsx';
import './priorWeek.css';

/** While a prior-week game is live, its final is looked for again this often (one `/lines/read`, no odds collection). */
const LIVE_REFRESH_MS = 5 * 60 * 1000;

/**
 * The prior week's still-playing view for the signed-in viewer, or null (normal behavior). `app` and `personal` are the
 * screen's own shared reads (useAppData, useSharedRead('personal')), passed in so this file adds no data source.
 */
export function usePriorWeek({ app: appRead, personal: personalRead }) {
  const app = appRead ?? {}, personal = personalRead ?? {};
  const current = personal.data && Number.isInteger(personal.data.season) && Number.isInteger(personal.data.week)
    ? { season: personal.data.season, week: personal.data.week } : null;
  const prior = useMemo(() => priorWeekOf(personal.data), [personal.data]);
  const lines = useBoardLines({ app, personal, shown: prior }, Boolean(prior));
  // Worked out on every render from the server clock; useBoardLines re-renders each minute, enough for the grace period.
  // A reload clears the reply while it reads again; the last view for the same weeks stays on screen meanwhile (a failed
  // read keeps nothing, so a stale "live" is never held).
  const scope = `${app.accountId}:${current?.season}:${current?.week}:${prior?.season}:${prior?.week}`;
  const kept = useRef({ scope: '', view: null });
  if (lines.status === 'ready') kept.current = { scope, view: priorWeekStillPlaying({ current, lines: lines.data, now: lines.now }) };
  else if (lines.status === 'error' || kept.current.scope !== scope) kept.current = { scope, view: null };
  const view = kept.current.view;
  const live = view?.games.some(game => game.state === 'live' || game.state === 'grading') === true;
  const { reload } = lines;
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(reload, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, reload]);
  return view;
}

const STATUS = {
  upcoming: null,
  live: { tone: 'live', word: 'LIVE' },
  grading: { tone: 'pending', word: 'FINAL · GRADING' },
  final: { tone: 'neutral', word: 'FINAL' },
};

/** One market of the viewer's own guess: "Spread MIA −3 · Line at guess MIA −2.5 · 7.5 pts". */
export function guessLine(game, market) {
  const mine = game[market], name = market === 'spread' ? 'Spread' : 'Total';
  if (mine.guess === null) return `${name}${SEP}No guess`;
  const text = value => (market === 'spread' ? fmtSpreadPick(game.away, game.home, value) : fmtNum(value));
  const parts = [`${name} ${text(mine.guess)}`, mine.lockedIn ? 'Locked' : 'Not locked in'];
  const line = game.lineAtGuess[market];
  if (line !== null) parts.push(`Line at guess ${text(line)}`);
  if (mine.points !== null) parts.push(`${fmtNum(mine.points)} pts`);
  return parts.join(SEP);
}

/** The card itself, from a priorWeekStillPlaying view. `onOpen(gameId | null)` opens that week's picks. */
export function PriorWeekView({ view, onOpen }) {
  const id = useId();
  if (!view) return null;
  const title = `Still playing from Week ${view.week}`;
  return (
    <Card as="section" variant="wait" className="gx-pw" aria-labelledby={id} data-prior-week={`${view.season}-${view.week}`}>
      <div className="gx-pw-head">
        <h2 className="gx-t-section" id={id}>{title}</h2>
        <Button variant="ghost" onClick={() => onOpen(null)} aria-label={`Open Week ${view.week} picks`}>Week {view.week} picks</Button>
      </div>
      <ul className="gx-pw-games">
        {view.games.map(game => {
          const status = STATUS[game.state];
          return (
            <li key={game.id} className="gx-pw-game" data-prior-game={game.id} data-state={game.state}>
              <div className="gx-pw-matchup">
                <TeamMark code={game.away} name={game.away} size={32} decorative/>
                <strong className="gx-t-strong">{game.away} at {game.home}</strong>
                <TeamMark code={game.home} name={game.home} size={32} decorative/>
                {status ? <Pill tone={status.tone}>{status.word}</Pill> : null}
              </div>
              <p className="gx-t-meta gx-c-2">{game.final ? `Final${SEP}${game.away} ${game.final.away}–${game.home} ${game.final.home}`
                : game.state === 'live' ? `Kicked off ${fmtWhen(game.kickoff)}${SEP}Final score when recorded` : `Kicks off ${fmtWhen(game.kickoff)}`}</p>
              <p className="gx-t-body" data-prior-market="spread">{guessLine(game, 'spread')}</p>
              <p className="gx-t-body" data-prior-market="total">{guessLine(game, 'total')}</p>
              <Button variant="secondary" onClick={() => onOpen(game.id)} aria-label={`Open your Week ${view.week} guesses for ${game.away} at ${game.home}`}>Your guesses</Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * The card wherever the week's games show (Home, Play, Research › Games). Nothing when the prior week is over. With
 * `recap` (Home), the compact "Week N recap" entry (home/MondayRecap.jsx) comes first, from this same view: one read.
 */
export function PriorWeekCard({ app, personal, recap = false }) {
  const shell = useShell();
  const view = usePriorWeek({ app, personal });
  if (!view) return null;
  const onOpen = gameId => shell.go('play', { section: 'picks', market: 'spread', season: view.season, week: view.week,
    pickGame: gameId ?? undefined, scoreGame: undefined, layer: undefined, item: undefined });
  const card = <PriorWeekView view={view} onOpen={onOpen}/>;
  return recap ? <><RecapEntry view={view} onOpen={() => openRecap(shell, view)}/>{card}</> : card;
}
