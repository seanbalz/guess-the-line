import React, { useId, useState } from 'react';
import { date, fmt, signed } from './api';
const finite = value => typeof value === 'number' && Number.isFinite(value);
export default function DecisionAnalysis({ data }) {
  const id = useId(), [gameId, setGameId] = useState('');
  const market = data.mode === 'guess_total' ? 'total' : 'spread';
  if (!data.revealed || !['guess_spread','guess_total'].includes(data.mode) || data.marketAccess?.[market] !== true) return null;
  const games = data.games.filter(game => game.decisionAnalysis?.market === market);
  const game = games.find(game => game.id === gameId) || games[0]; if (!game) return null;
  const value = game.decisionAnalysis, number = item => finite(item) ? market === 'total' ? fmt(item) : signed(item) : 'Unavailable';
  const reference = value.reference && finite(value.reference.value) ? value.reference : null;
  const personal = value.personalForecast?.kind === 'personal_outcome_forecast' && finite(value.personalForecast.value) ? value.personalForecast : null;
  const model = value.model?.kind === 'independent_outcome_forecast' && finite(value.model.value) ? value.model : null;
  return <section className="decision-analysis" aria-labelledby={`${id}-title`}><h3 id={`${id}-title`}>Your forecast and the recorded market</h3><label htmlFor={`${id}-game`}>Matchup<select id={`${id}-game`} value={game.id} onChange={event => setGameId(event.target.value)}>{games.map(item => <option value={item.id} key={item.id}>{item.awayCode} at {item.homeCode}</option>)}</select></label><p>{market === 'total' ? 'Combined points for both teams.' : 'Home-team spread: negative favors home; positive favors away.'} Your personal outcome forecast is separate from the saved sportsbook-number guess and competition scoring.</p>
    <dl><div><dt>Your saved sportsbook guess</dt><dd>{number(value.savedGuess)}</dd></div><div><dt>{reference?.status === 'stale' ? 'Stale saved market reference' : 'Recorded market reference'}</dt><dd>{number(reference?.value)}{reference && <small>{reference.source || 'Source unavailable'}<br/>Observed {date(reference.observedAt)} PT<br/>Collected {date(reference.collectedAt)} PT</small>}</dd></div><div><dt>Guess-to-market difference</dt><dd>{reference && finite(value.guessDiscrepancy) ? `${fmt(value.guessDiscrepancy)} points` : 'Unavailable'}</dd></div><div><dt>Your personal outcome forecast</dt><dd>{personal ? number(personal.value) : 'Not recorded'}{personal && <small>Saved {date(personal.savedAt)} PT · Revision {personal.revision}</small>}</dd></div><div><dt>Independent outcome forecast</dt><dd>{model ? number(model.value) : 'Unavailable'}{model && <small>{model.source} · {model.version}<br/>Generated {date(model.generatedAt)} PT</small>}</dd></div></dl><p>{value.explanation}</p><p className="muted">A discrepancy is not a recommendation, a cover probability, or positive expected value. No automated selection is made.</p>
  </section>;
}
