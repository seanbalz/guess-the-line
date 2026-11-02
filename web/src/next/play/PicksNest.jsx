// D-69 Play › Your guesses as nesting cards (docs/superpowers/specs/2026-11-02-play-picks-nesting-cards-design.md).
// The week is one tile per game: a state tag, the matchup as marks and your own guess as one big number. The line,
// points and other players' guesses never sit on a tile; they stay on the game's card, behind your lock (D-31, D-36).
import { show, team } from '../../communityFormat.js';
import { Icon, TeamMark, cx, teamCode } from '../ui/index.js';
import { STATE_ICONS } from './WeekProgress.jsx';
import { number } from './scoring.js';
import './picksNest.css';

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' });
const WORDS = Object.freeze({ locked: 'Locked', draft: 'Draft', kicked: 'Closed', skipped: 'Skipped', notopen: 'Not open' });

/** A tile's tag: Next for the next game to lock, the kickoff day (Pacific) for another open game, else its state word. */
export function gameTag(row, nextId) {
  if (row.id === nextId) return 'Next';
  if (row.state !== 'open') return WORDS[row.state];
  const kickoff = Date.parse(row.game.kickoff);
  return Number.isFinite(kickoff) ? DAY.format(kickoff) : 'Open';
}

/** Your guess as one number, `{ lead, num }`: a Spread leads with its favored team ("CAR" "−3"). */
export function tileGuess(mode, game, value) {
  const v = number(value);
  if (v === null) return { lead: null, num: '—' };
  if (mode === 'guess_total') return { lead: null, num: show(v) };
  if (v === 0) return { lead: null, num: 'Even' };
  return { lead: teamCode(v < 0 ? game.homeCode : game.awayCode), num: `−${show(Math.abs(v))}` };
}

/** `progress` is weekProgress(); `guessOf(id)` is your guess for that game (the server's value once it is locked). */
export function WeekTiles({ progress, mode, guessOf, onOpen, label }) {
  const nextId = progress.next?.id ?? null;
  return <ul className="gx-nest-grid gx-nest-grid--3 gx-picks-grid" aria-label={label}>
    {progress.games.map(row => {
      const { game } = row, tag = gameTag(row, nextId), guess = tileGuess(mode, game, guessOf(row.id));
      const said = guess.num === '—' ? 'no guess' : [guess.lead, guess.num].filter(Boolean).join(' ');
      return <li key={row.id}>
        <button type="button" className={cx('gx-nest-tile', 'gx-picks-tile', row.id === nextId && 'gx-picks-tile--next')} data-tile={row.id} data-state={row.state}
          aria-label={`${team(game.awayCode)} at ${team(game.homeCode)}, ${tag}, ${said}`} onClick={() => onOpen(row.id)}>
          <span className="gx-nest-tile-top">
            <span className={cx('gx-t-micro', 'gx-picks-tag', `gx-picks-tag--${row.id === nextId ? 'next' : row.state}`)}>{tag}</span>
            <Icon icon={STATE_ICONS[row.state]} size={16}/>
          </span>
          <span className="gx-nest-marks"><TeamMark code={game.awayCode} size={24} decorative/><TeamMark code={game.homeCode} size={24} decorative/></span>
          <span className="gx-picks-guess">
            {guess.lead ? <span className="gx-t-label gx-picks-lead">{guess.lead}</span> : null}
            <span className={cx('gx-n-m', 'gx-nest-num', guess.num === '—' && 'gx-c-3')}>{guess.num}</span>
          </span>
        </button>
      </li>;
    })}
  </ul>;
}

/** The next game still to lock after `id` in kickoff order, wrapping to the start; null when none is left. */
export function nextAfter(progress, id) {
  const at = progress.games.findIndex(row => row.id === id);
  const order = [...progress.games.slice(at + 1), ...progress.games.slice(0, Math.max(at, 0))];
  return order.find(row => row.state === 'draft' || row.state === 'open') ?? null;
}
