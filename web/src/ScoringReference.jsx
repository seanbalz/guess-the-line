import React from 'react';
import SportsbookSources from './SportsbookSources';
import { date, fmt, signed } from './api';
import { availableScoringReference, finite, lineLabel, pendingScoringReference, referenceAgeText, referenceTime, submissionTimeScoring } from './scoringReferences';
import './scoringReferences.css';
// "Line at your guess: −3.5 at 2:11 PM" with its age. A pending guess waits for the first line after it.
// Only references stored before October 12, 2026 can still read 'stale' or 'unavailable'; they stay unscored.
export function ReferenceValue({ reference, total, current = false }) {
  const present = current ? finite(reference?.value) : availableScoringReference(reference);
  const pending = !current && pendingScoringReference(reference);
  const observed = reference?.observedAt || reference?.quotedAt;
  const age = !current && present ? referenceAgeText(reference) : null;
  return <div className={`reference-value ${current ? 'consensus-value' : 'saved-scoring-value'}`}>
    <strong className="mono">{present ? total ? fmt(reference.value) : signed(reference.value) : '—'}</strong>
    <small>{current ? reference?.status === 'stale' ? 'Stale saved consensus' : present ? 'Latest recorded consensus' : 'No current consensus'
      : present ? `${lineLabel(reference)}: ${total ? fmt(reference.value) : signed(reference.value)}${observed ? ` at ${date(observed, { month: undefined, day: undefined })} PT` : ''}`
      : pending ? 'Pending · first line after submission' : 'Unscored · no eligible reference'}</small>
    {age && <small>{age}</small>}
    {reference?.source && <small>{reference.source}</small>}
    {!current && referenceTime(reference) && <small>Saved with guess {date(referenceTime(reference))} PT</small>}
    {observed && <small>Observed {date(observed)} PT</small>}
    {reference?.capturedAt && <small>Collected {date(reference.capturedAt)} PT</small>}
    {pending && <small>Points appear once the next line is collected. That line becomes this guess’s reference.</small>}
    {!present && !pending && <small>{reference?.status === 'stale' ? 'Consensus was stale when this guess was saved under the earlier five-minute rule.' : reference?.reason || 'A timestamped reference was not recorded for this guess.'}</small>}
  </div>;
}
export function CurrentConsensus({ data, game }) {
  if (!data.revealed || !submissionTimeScoring(data)) return null;
  if (game.sportsbookSources) return <SportsbookSources data={data} game={game}/>;
  return <section className="current-consensus-box" aria-label={`Current consensus ${game.awayCode} at ${game.homeCode}`}><h3>Current consensus</h3><ReferenceValue reference={game.currentConsensus} total={data.mode === 'guess_total'} current/><p>Latest saved market data. Later movement does not change your score.</p></section>;
}
export function ScoringPolicyNote({ data }) {
  if (!data.revealed || !submissionTimeScoring(data)) return null;
  return <div className="source-note"><div><strong>Scoring reference saved with each guess</strong><p>Points compare each guess with the line stored when you saved it, shown with its time and age. We try to refresh the line when you save, but you can always submit before the deadline. A guess saved before any line was stored uses the first line collected after it. Saving a changed guess before the deadline takes the line at that save; unchanged guesses keep theirs. Guesses saved before October 12, 2026 without a scored reference stay unscored. Current consensus is shown separately.</p></div></div>;
}
