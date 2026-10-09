import React from 'react';
import SportsbookSources from './SportsbookSources';
import { date, fmt, signed } from './api';
import { availableScoringReference, finite, referenceTime, submissionTimeScoring } from './scoringReferences';
import './scoringReferences.css';
export function ReferenceValue({ reference, total, current = false }) {
  const present = current ? finite(reference?.value) : availableScoringReference(reference);
  const observed = reference?.observedAt || reference?.quotedAt;
  return <div className={`reference-value ${current ? 'consensus-value' : 'saved-scoring-value'}`}>
    <strong className="mono">{present ? total ? fmt(reference.value) : signed(reference.value) : '—'}</strong>
    <small>{current ? reference?.status === 'stale' ? 'Stale saved consensus' : present ? 'Latest recorded consensus' : 'No current consensus' : present ? 'Scoring reference' : 'Unscored · no eligible reference'}</small>
    {reference?.source && <small>{reference.source}</small>}
    {!current && referenceTime(reference) && <small>Saved with guess {date(referenceTime(reference))} PT</small>}
    {observed && <small>Observed {date(observed)} PT</small>}
    {reference?.capturedAt && <small>Collected {date(reference.capturedAt)} PT</small>}
    {!present && <small>{reference?.status === 'stale' ? 'Consensus was stale when this guess was saved.' : reference?.reason || 'A timestamped reference was not recorded for this guess.'}</small>}
  </div>;
}
export function CurrentConsensus({ data, game }) {
  if (!data.revealed || !submissionTimeScoring(data)) return null;
  if (game.sportsbookSources) return <SportsbookSources data={data} game={game}/>;
  return <section className="current-consensus-box" aria-label={`Current consensus ${game.awayCode} at ${game.homeCode}`}><h3>Current consensus</h3><ReferenceValue reference={game.currentConsensus} total={data.mode === 'guess_total'} current/><p>Latest saved market data. Later movement does not change your score.</p></section>;
}
export function ScoringPolicyNote({ data }) {
  if (!data.revealed || !submissionTimeScoring(data)) return null;
  return <div className="source-note"><div><strong>Scoring reference saved with each guess</strong><p>Points use the consensus captured when you submit. Saving a changed guess before the deadline captures a new reference for that guess; unchanged guesses keep theirs. New submissions and edits require fresh source evidence. Older guesses without a saved reference remain unscored. Current consensus is shown separately.</p></div></div>;
}
