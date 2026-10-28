// Bets › Everyone (M-10, redesign stage 40; D-36): everyone's Virtual Units picks for the published week, from
// POST /bets/read for the league showing (the Community, or a private league's roster). Read only: placing stays in
// Your picks. everyone.js decides nothing the server has not: a friend's line, price and book show only where the
// reply opens that game's market for this viewer; elsewhere the row shows side and units and a lock sentence.
import { betsApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { Avatar, AvatarStack, Button, Card, GateBanner, LockLine, Matchup, Pill, cx } from '../ui/index.js';
import { fmtWhen } from '../format.js';
import { EVERYONE_COPY, everyoneBoard } from './everyone.js';
import './everyone.css';

export function EveryoneBets({ onPlace }) {
  const app = useAppData(), shell = useShell();
  const leagueId = app.league?.community === false && !app.league.pending ? app.league.id : null;
  const key = `${app.accountId}:everyone:${leagueId ?? 'community'}`;
  const read = useLeagueRead(key, signal => betsApi('read', leagueId ? { leagueId } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); });
  if (read.loading) return <p className="gx-t-body" role="status">Loading everyone’s picks…</p>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  return <EveryoneBoard data={read.data} viewer={app.accountId} scopeName={leagueId ? app.league.name : 'Community'}
    onLockIn={() => shell.go('play', { section: 'picks' })} onPlace={onPlace} onRefresh={read.retry}/>;
}

export function EveryoneBoard({ data, viewer, scopeName, onLockIn, onPlace, onRefresh }) {
  const board = everyoneBoard(data, viewer);
  if (!board.published) return <p className="gx-t-body" role="status">{EVERYONE_COPY.unpublished}</p>;
  return <div className="gx-ev gx-vstack gx-gap-24" data-bets="everyone">
    <p className="gx-t-meta gx-c-2">{scopeName} · Week {board.week}</p>
    {board.closed.length ? <GateBanner gate={{ locked: true, sentence: EVERYONE_COPY.banner, ctaLabel: 'Lock in a guess' }} onCta={onLockIn}/> : null}
    {board.empty ? <Card className="gx-vstack gx-gap-12">
      <p className="gx-t-body">{EVERYONE_COPY.empty}</p>
      {onPlace ? <Button onClick={onPlace}>Place a pick</Button> : null}
    </Card> : <>
      <section className="gx-vstack gx-gap-12" aria-labelledby="gx-ev-week">
        <h2 id="gx-ev-week" className="gx-t-section">This week</h2>
        <ul className="gx-ev-people">
          {board.qualification.map(row => <li key={row.id} className={cx('gx-ev-person', row.you && 'gx-ev-you')}>
            <Avatar id={row.id} name={row.display} you={row.you}/>
            <span className="gx-grow gx-vstack">
              <span className="gx-t-strong">{row.name}</span>
              <span className="gx-t-meta gx-c-2">{row.picks} {row.picks === 1 ? 'pick' : 'picks'} · {row.units}</span>
            </span>
            {row.qualified ? <Pill tone="data">Qualified</Pill> : null}
          </li>)}
        </ul>
      </section>
      {board.games.map(game => <EveryoneGame key={game.id} game={game}/>)}
    </>}
    {onRefresh ? <Button variant="ghost" onClick={onRefresh}>Refresh</Button> : null}
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
      <AvatarStack people={game.faces.map(face => ({ id: face.id, name: face.display, you: face.you }))} label={`${game.faces.map(face => face.name).join(', ')} picked this game`}/>
    </header>
    <ul className="gx-ev-picks">
      {game.picks.map(pick => <li key={pick.key} className={cx('gx-ev-pick', pick.you && 'gx-ev-you')} data-pick={pick.key} data-open={pick.open ? 'true' : 'false'}>
        <Avatar id={pick.userId} name={pick.display} you={pick.you}/>
        <span className="gx-grow gx-vstack gx-gap-2">
          <span className="gx-ev-pick-head"><span className="gx-t-strong">{pick.name}</span><span className="gx-t-meta gx-c-2">{pick.marketName}</span></span>
          <span className="gx-ev-pick-value"><span className="gx-n-xs">{pick.open ? pick.terms.pick : pick.side}</span><span className="gx-n-xs gx-c-2">{pick.units}</span></span>
          {pick.open ? <span className="gx-t-meta gx-c-2">{pick.terms.odds} · {pick.terms.book}</span> : <LockLine as="span" className="gx-t-meta">{pick.locked}</LockLine>}
        </span>
        {pick.result ? <Pill tone={pick.result.tone}>{pick.result.net ? `${pick.result.label} ${pick.result.net}` : pick.result.label}</Pill> : null}
      </li>)}
    </ul>
  </Card>;
}
