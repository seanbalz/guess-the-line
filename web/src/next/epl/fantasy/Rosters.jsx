// Research › Fantasy › Rosters: every manager's current starters, then bench, each with a position tag and club crest.
import { useId } from 'react';
import { Card } from '../../ui/index.js';
import { ClubMark } from './Matchup.jsx';
import { DASH, FANTASY_COPY } from './fantasyModel.js';

function Players({ players }) {
  return <ul className="gx-epl-fx-players">
    {players.map(p => <li key={p.playerId} className="gx-epl-fx-player">
      <span className="gx-epl-fx-pos">{p.pos ?? DASH}</span>
      <ClubMark club={p.club} clubText={p.clubText}/>
      <span className="gx-epl-fx-player-name">{p.name ?? FANTASY_COPY.unknownPlayer}</span>
    </li>)}
  </ul>;
}

function RosterCard({ roster, me }) {
  const id = useId();
  return <Card as="section" aria-labelledby={id} className={me ? 'gx-epl-fx-roster gx-epl-fx-roster--me' : 'gx-epl-fx-roster'}>
    <h2 className="gx-t-section" id={id}>{roster.name}</h2>
    <h3 className="gx-t-micro gx-c-2">{FANTASY_COPY.starter}</h3>
    <Players players={roster.starters}/>
    {roster.bench.length ? <><h3 className="gx-t-micro gx-c-2">{FANTASY_COPY.bench}</h3><Players players={roster.bench}/></> : null}
  </Card>;
}

export function RostersPanel({ view }) {
  return <div className="gx-epl-fx-stack">
    {(view.rosters ?? []).map(r => <RosterCard key={r.ownerId} roster={r} me={r.ownerId === view.viewer}/>)}
  </div>;
}
