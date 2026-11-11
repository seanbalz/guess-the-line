// D-70 Play › Your guesses as nesting cards (docs/superpowers/specs/2026-11-02-play-picks-nesting-cards-design.md).
// The week is one tile per game: a state tag, the matchup as marks and your own guess as one big number. The line,
// points and other players' guesses never sit on a tile; they stay on the game's card, behind your lock (D-31, D-36).
// D-82 adds Player Props beside Spread and Total, dark unless the app flag is on (../props/flag.js): with it off the
// market control lists only Spread and Total and no prop code loads.
import { lazy } from 'react';
import { show, team } from '../../communityFormat.js';
import { Icon, TeamMark, cx, teamCode } from '../ui/index.js';
import { Deferred } from '../ui/Deferred.jsx';
import { PROPS_MARKET, playerPropsEnabled, withPlayerProps } from '../props/flag.js';
import { STATE_ICONS } from './WeekProgress.jsx';
import { number } from './scoring.js';
import './picksNest.css';

const PlayerPropsEntry = lazy(() => import('../props/PlayerPropsEntry.jsx'));
export { PROPS_MARKET };

/** Your guesses' market choices: Spread and Total, plus Player Props only when the D-82 flag is on. */
export const playMarkets = (base, enabled = playerPropsEnabled()) => withPlayerProps(base, PROPS_MARKET, enabled);

/**
 * D-82 Player Props inside Your guesses: optional, any number of props, no weekly obligation, and separate from the
 * week's Spread/Total tiles and their locks. Renders nothing while the flag is off.
 */
export function PropsNest({ season, week, onSignInAgain, onStatus, enabled = playerPropsEnabled() }) {
  if (!enabled) return null;
  return <Deferred resetKey={`props:${season}:${week}`} label="Player Props"><PlayerPropsEntry season={season} week={week} onSignInAgain={onSignInAgain} onStatus={onStatus}/></Deferred>;
}
/** The line under Your guesses until the props screen reports its state (sheet 01; 02 and 05 replace it). */
export const PROPS_ENTRY_LINE = 'Optional · choose as many props as you want';

const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' });
const WORDS = Object.freeze({ locked: 'Locked', draft: 'Draft', kicked: 'Closed', skipped: 'Skipped', notopen: 'Not open' });

/**
 * A tile's tag says its state: an open game shows Next when it is the next to lock, else its kickoff day (Pacific);
 * every other game shows its state word (a draft that is next stays Draft; its ring and name say next).
 */
export function gameTag(row, nextId) {
  if (row.state !== 'open') return WORDS[row.state];
  if (row.id === nextId) return 'Next';
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
      const { game } = row, tag = gameTag(row, nextId), guess = tileGuess(mode, game, guessOf(row.id)), next = row.id === nextId;
      const said = guess.num === '—' ? 'no guess' : [guess.lead, guess.num].filter(Boolean).join(' ');
      return <li key={row.id}>
        <button type="button" className={cx('gx-nest-tile', 'gx-picks-tile', next && 'gx-picks-tile--next')} data-tile={row.id} data-state={row.state}
          aria-label={`${team(game.awayCode)} at ${team(game.homeCode)}, ${tag}${next && tag !== 'Next' ? ', next to lock' : ''}, ${said}`} onClick={() => onOpen(row.id)}>
          <span className="gx-nest-tile-top">
            <span className={cx('gx-t-micro', 'gx-picks-tag', `gx-picks-tag--${tag === 'Next' ? 'next' : row.state}`)}>{tag}</span>
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
