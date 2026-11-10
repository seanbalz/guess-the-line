// Approved overview composition, populated only from the owner's existing personal read.
import { shortName, pickText } from '../../communityFormat.js';
import { Button, Meter, TeamMark } from '../ui/index.js';
import { lockedAt, modeOf, number, perGameReady } from './scoring.js';

export function PlayOverviewPicks({ data, market, onMarket, onGame, onPoints, pointsRef, pointsButton }) {
  const mode = modeOf(market), label = mode === 'guess_total' ? 'Total' : 'Spread';
  const ballot = data.ballots?.[mode], games = data.games ?? [];
  const locks = games.filter(game => lockedAt(ballot, game.id)).length;
  const all = games.length > 0 && locks === games.length;
  const closed = games.length > 0 && games.every(game => !(Date.parse(data.now) < Date.parse(game.kickoff)));
  const hasDraft = games.some(game => !lockedAt(ballot, game.id) && number(ballot?.picks?.[game.id]) !== null);
  const satOut = data.optOuts?.includes(mode) === true || data.scoring?.[mode]?.satOut === true;
  const upcoming = games.filter(game => Date.parse(game.kickoff) > Date.parse(data.now));
  const shown = ['guess_spread', 'guess_total'].map(mode => {
    const ballot = data.ballots?.[mode];
    const game = upcoming.find(game => !lockedAt(ballot, game.id)) ?? upcoming[0] ?? games[0];
    return game ? { mode, game } : null;
  }).filter(Boolean);
  const active = perGameReady(data.rules);
  return <div className="gx-play-overview-picks">
    <div className="gx-play-score-heading"><h2 className="gx-t-section">Your picks</h2><span className="gx-pill">{!active ? 'View only' : satOut ? 'Sat out' : all ? 'Locked' : closed ? 'Closed' : hasDraft ? 'Drafts' : 'Open'}</span></div>
    <div className="gx-play-overview-count gx-t-meta gx-c-2"><span>{label}</span><span>{locks} of {games.length} locked</span></div>
    {games.length ? <Meter value={locks} max={games.length} label={`${label}: ${locks} of ${games.length} locked`}/> : null}
    <div className="gx-play-overview-markets" role="group" aria-label="Guess market">
      {[['spread', 'Spread'], ['total', 'Total']].map(([value, name]) => <Button key={value} aria-pressed={modeOf(value) === mode} onClick={() => onMarket(value)}>{name}</Button>)}
      {pointsButton ?? <Button ref={pointsRef} onClick={onPoints}>Points</Button>}
    </div>
    <div className="gx-play-overview-games">{shown.map(({ game, mode }) => {
      const label = mode === 'guess_total' ? 'Total' : 'Spread', ballot = data.ballots?.[mode];
      const lock = lockedAt(ballot, game.id), guess = number(ballot?.picks?.[game.id]);
      const closed = !(Date.parse(data.now) < Date.parse(game.kickoff));
      const satOut = data.optOuts?.includes(mode) === true || data.scoring?.[mode]?.satOut === true;
      const state = lock ? 'Locked in' : satOut ? 'Sat out' : closed ? 'Closed' : guess !== null ? 'Your draft' : 'To pick';
      return <button className="gx-card gx-play-overview-game" type="button" key={mode} data-overview-game={game.id} data-overview-market={mode} onClick={() => onGame(mode, game.id)} aria-label={`${shortName(game.awayCode)} at ${shortName(game.homeCode)}, ${label}, ${state}${guess === null ? '' : `, ${pickText(mode, game.awayCode, game.homeCode, guess)}`}`}>
        <span className="gx-t-meta gx-c-2">{label}{!active ? ' · view only' : ''}</span>
        <span className="gx-play-overview-matchup"><span><TeamMark code={game.awayCode} size={32} decorative/><strong>{shortName(game.awayCode)}</strong></span><small>at</small><span><TeamMark code={game.homeCode} size={32} decorative/><strong>{shortName(game.homeCode)}</strong></span></span>
        <span className="gx-t-section">{state}</span>
      </button>;
    })}</div>
    {!games.length ? <p className="gx-t-body gx-c-2">No published games in this week.</p> : null}
  </div>;
}
