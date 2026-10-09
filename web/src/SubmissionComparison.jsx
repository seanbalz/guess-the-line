import React from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { fmt, signed } from './api';
import { TeamMatchup } from './TeamIdentity';
import { ReferenceValue, CurrentConsensus, ScoringPolicyNote } from './ScoringReference';
import { playerReference, finite } from './scoringReferences';
import PlayerComparison from './PlayerComparison.jsx';
import DecisionAnalysis from './DecisionAnalysis.jsx';
export default function SubmissionComparison({ data, go, refresh, busy }) {
  const total = data.mode === 'guess_total', number = total ? fmt : signed;
  const players = [...data.league.roster].sort((a, b) => a.id === data.playerId ? -1 : b.id === data.playerId ? 1 : 0);
  const status = player => data.standings.find(row => row.id === player.id);
  const pick = (game, player) => !status(player)?.submitted ? null : player.id === data.playerId ? game.prediction : game.opponents?.find(row => row.id === player.id)?.value;
  const detail = (game, player) => <><strong className="mono">{number(pick(game, player))}</strong>{status(player)?.submitted ? <ReferenceValue reference={playerReference(data, game, player.id)} total={total}/> : <small>Not submitted · guesses hidden</small>}</>;
  return <>
    <section className="panel comparison-intro"><div><h2>{total ? 'Total' : 'Spread'} picks · Week {data.league.week}</h2><p>Compare players in <strong>{data.league.name}</strong>. Each guess is scored against its own saved consensus. Drafts stay hidden.</p></div><button className="secondary" disabled={busy} onClick={refresh}><RefreshCw size={16}/>{busy ? 'Refreshing…' : 'Refresh picks'}</button></section>
    <div className="comparison-players" aria-label="Player submission status">{players.map(player => <div className="panel" key={player.id}><strong>{player.name}{player.id === data.playerId ? ' · You' : ''}</strong><span className="badge">{status(player)?.submitted ? 'Submitted' : 'Not submitted'}</span><strong className="mono">{fmt(status(player)?.points)} / {data.maxPoints} pts</strong><small>{finite(status(player)?.points) ? 'Saved scoring references' : 'Unscored · references incomplete'}</small></div>)}</div>
    <section className="panel comparison-panel submission-comparison"><div className="panel-heading"><div><h2>Side-by-side guesses</h2><p>{total ? 'Combined points for both teams.' : 'Signed spreads use the home team’s perspective.'} Scoring references can differ by player. <span className="comparison-table-hint">Scroll across to see every player and current consensus.</span></p></div></div>
      <div className="table-scroll comparison-table" role="region" aria-label={`${total ? 'Total' : 'Spread'} pick comparison`} tabIndex={0}><table><caption className="sr-only">Submitted guesses, each player’s scoring reference, and separate current consensus</caption><thead><tr><th scope="col">MATCHUP</th>{players.map(player => <th scope="col" key={player.id}>{player.name}<small>GUESS / SCORING REFERENCE</small></th>)}<th scope="col">CURRENT CONSENSUS</th></tr></thead><tbody>{data.games.map(game => <tr key={game.id}><th scope="row"><TeamMatchup game={game} compact/></th>{players.map(player => <td className={`comparison-reference-cell ${player.id === data.playerId ? 'comparison-own' : ''}`} key={player.id}>{detail(game, player)}</td>)}<td className="comparison-reference-cell"><CurrentConsensus data={data} game={game}/></td></tr>)}</tbody></table></div>
      <div className="comparison-mobile">{data.games.map(game => <article key={game.id} aria-label={`${game.awayCode} at ${game.homeCode} predictions`}><TeamMatchup game={game}/><dl>{players.map(player => <div key={player.id} className={player.id === data.playerId ? 'comparison-own' : ''}><dt>{player.name}{player.id === data.playerId ? ' · You' : ''}</dt><dd className="mono">{number(pick(game, player))}</dd>{status(player)?.submitted ? <ReferenceValue reference={playerReference(data, game, player.id)} total={total}/> : <small>Not submitted · guesses hidden</small>}</div>)}</dl><CurrentConsensus data={data} game={game}/></article>)}</div>
    </section>
    <section className="panel submission-decision-analysis"><DecisionAnalysis data={data}/></section>
    <ScoringPolicyNote data={data}/><PlayerComparison data={data}/>
    <section className="comparison-next"><button className="secondary" onClick={() => go('picks')}>Review your guesses <ArrowRight size={16}/></button><button className="secondary" onClick={() => go('history')}>View market movement <ArrowRight size={16}/></button></section>
  </>;
}
