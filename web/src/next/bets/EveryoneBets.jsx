import '../nfl-actions.css';
// Bets › Everyone (M-10, redesign stage 40; D-36): everyone's Virtual Units picks for the published week, from
// POST /bets/read for the league showing (the Community, or a private league's roster). Read only: placing stays in
// Your picks. everyone.js decides nothing the server has not: a friend's line, price and book show only where the
// reply opens that game's market for this viewer; elsewhere the row shows side and units and a lock sentence.
import { useRef } from 'react';
import { betsApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { Avatar, Button, Card, GateBanner, LockLine, Matchup, PictureRow, cx, Skeleton, useEntrance } from '../ui/index.js';
import { SEP, fmtWhen } from '../format.js';
import { EVERYONE_COPY, everyoneBoard } from './everyone.js';
import './everyone.css';

/**
 * What Everyone shows for a read: the answer, or the last good answer of this same league while a refresh reads (the
 * board stays on screen, so its rows rise in once per visit), or nothing on a first load (the skeleton).
 */
export function everyoneView(read, last, key) {
  if (read.data) return { data: read.data, refreshing: false };
  if (read.loading && last.key === key && last.data) return { data: last.data, refreshing: true };
  return { data: null, refreshing: false };
}

export function EveryoneBets({ onPlace }) {
  const app = useAppData(), shell = useShell();
  const leagueId = app.league?.community === false && !app.league.pending ? app.league.id : null;
  const key = `${app.accountId}:everyone:${leagueId ?? 'community'}`;
  const read = useLeagueRead(key, signal => betsApi('read', leagueId ? { leagueId } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); });
  const last = useRef({ key: null, data: null });
  const view = everyoneView(read, last.current, key);
  if (!read.loading && read.data) last.current = { key, data: read.data };
  if (read.loading && !view.data) return <Skeleton label="Loading everyone’s picks…" shape="rows" count={4} className="gx-ev-skel"/>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  return <EveryoneBoard data={view.data} refreshing={view.refreshing} viewer={app.accountId} scopeName={leagueId ? app.league.name : 'Community'}
    onLockIn={() => shell.go('play', { section: 'picks' })} onOpenPlay={() => shell.go('play')} onPlace={onPlace} onRefresh={read.retry}/>;
}

export function EveryoneBoard({ data, viewer, scopeName, onLockIn, onOpenPlay, onPlace, onRefresh, refreshing = false }) {
  const board = everyoneBoard(data, viewer), enter = useEntrance();
  // Rule 5: an empty state is one sentence and one action (design audit A17).
  if (!board.published) return <div className="gx-vstack gx-gap-12" data-bets="unpublished">
    <p className="gx-t-body" role="status">{EVERYONE_COPY.unpublished}</p>{onOpenPlay ? <Button onClick={onOpenPlay}>Open Play</Button> : null}
  </div>;
  return <div className="gx-nfl-action-content gx-ev gx-vstack gx-gap-24" data-bets="everyone">
    <p className="gx-t-meta gx-c-2">{scopeName} · Week {board.week}</p>
    {board.closed.length ? <GateBanner gate={{ locked: true, sentence: EVERYONE_COPY.banner, ctaLabel: 'Lock in a guess' }} onCta={onLockIn}/> : null}
    {board.empty ? <Card className="gx-vstack gx-gap-12">
      <p className="gx-t-body">{EVERYONE_COPY.empty}</p>
      {onPlace ? <Button onClick={onPlace}>Place a pick</Button> : null}
    </Card> : <>
      <section className="gx-vstack gx-gap-12" aria-labelledby="gx-ev-week">
        <h2 id="gx-ev-week" className="gx-t-section">This week</h2>
        <ol className="gx-prows gx-stagger" data-enter={enter} aria-label="This week’s players">
          {board.qualification.map(row => <li key={row.id}><PictureRow data-person={row.id} className={cx(row.you && 'gx-ev-you')}
            picture={<Avatar id={row.id} name={row.display} you={row.you}/>} title={row.name} meta={`${row.picks} ${row.picks === 1 ? 'pick' : 'picks'}${SEP}${row.units}`}
            word={row.qualified ? 'Qualified' : null} tone={row.qualified ? 'good' : 'plain'}/></li>)}
        </ol>
      </section>
      <ol className="gx-vstack gx-gap-24 gx-ev-games" aria-label="Picks by game">
        {board.games.map(game => <li key={game.id}><EveryoneGame game={game}/></li>)}
      </ol>
    </>}
    {onRefresh ? <Button variant="ghost" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</Button> : null}
  </div>;
}

/** Shared game rows keep Research and Bets on the same visibility projection. */
export function EveryoneGame({ game }) {
  return <Card as="section" className="gx-ev-game gx-vstack gx-gap-12" aria-labelledby={`gx-ev-${game.id}`} data-game={game.id}>
    <header className="gx-ev-game-head">
      <span className="gx-grow gx-vstack gx-gap-4">
        {/* D-62: away mark, "@", home mark; the heading reads as one sentence ("Seattle Seahawks at Denver Broncos"). */}
        <h3 id={`gx-ev-${game.id}`} className="gx-t-strong"><Matchup away={game.awayCode} home={game.homeCode} size={32}/></h3>
        {game.kickoff ? <span className="gx-t-meta gx-c-2">{fmtWhen(game.kickoff)}</span> : null}
      </span>
      {/* No face stack here: each pick row below already leads with its face and name (design audit A12). */}
    </header>
    <ol className="gx-prows" aria-label="Picks on this game">
      {game.picks.map(pick => <li key={pick.key}><PictureRow data-pick={pick.key} data-open={pick.open ? 'true' : 'false'} className={cx(pick.you && 'gx-ev-you')}
        picture={<Avatar id={pick.userId} name={pick.display} you={pick.you}/>} title={pick.name}
        meta={pick.open ? `${pick.marketName}${SEP}${pick.terms.pick}${SEP}${pick.terms.odds} · ${pick.terms.book}`
          : <>{`${pick.marketName}${SEP}${pick.side}`} <LockLine as="span">{pick.locked}</LockLine></>}
        value={pick.units} word={pick.result ? (pick.result.net ? `${pick.result.label} ${pick.result.net}` : pick.result.label) : null}
        tone={pick.result?.tone === 'win' ? 'good' : 'plain'}/></li>)}
    </ol>
  </Card>;
}
