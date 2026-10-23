import { formatFantasyNumber } from '../../shared/fantasy-rankings.mjs';
import { summarizeReview } from '../../shared/fantasy-review.mjs';
import { Card, Pill } from './next/ui/index.js';

const number = formatFantasyNumber;
const percent = value => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** A report card for GTL's pace estimates (D-57): graded against actuals with a season-average baseline. */
export function FantasyAccuracy({ theme = 'classic', review, filters, scoringLabel, headingLevel = 3 }) {
  const c = name => `${theme === 'next' ? 'gx-' : ''}fantasy-${name}`;
  const Heading = `h${headingLevel}`, Sub = `h${Math.min(headingLevel + 1, 6)}`;
  const s = summarizeReview(review, filters);
  const body = <>
    <div className={c('accuracy-head')}>
      <Heading className={theme === 'next' ? 'gx-t-section' : undefined}>Week {review.week} estimates</Heading>
      {theme === 'next' ? <Pill tone={review.status === 'FINAL' ? 'neutral' : 'pending'}>{review.status}</Pill> : <span className={c('status-word')}>{review.status}</span>}
    </div>
    {s.graded ? <>
      <p className={c('accuracy-headline')}>Off by <strong>{number(s.mae)}</strong> points per player · {scoringLabel}</p>
      <p className={c('meta')}>Season average: {number(s.baselineMae)}{s.withoutBaseline > 0 && ` (GTL on the same players: ${number(s.pairedMae)}; ${s.withoutBaseline} without a season average)`}</p>
      <dl className={c('accuracy-tiles')}>
        <div><dt>Within 5 points</dt><dd>{percent(s.within5)}</dd></div>
        <div><dt>Players graded</dt><dd>{s.graded}</dd></div>
        <div><dt>Beat the baseline</dt><dd>{s.beatBaseline.length ? s.beatBaseline.join(', ') : 'None'}</dd></div>
      </dl>
      <details className={c('accuracy-detail')}>
        <summary>By position and biggest misses</summary>
        <table className={c('accuracy-table')}>
          <thead><tr><th scope="col">Position</th><th scope="col">GTL miss (same players)</th><th scope="col">Season average miss</th><th scope="col">Graded</th></tr></thead>
          <tbody>{s.byPosition.map(row => <tr key={row.position}><th scope="row">{row.position}</th><td>{number(row.pairedMae)}</td><td>{number(row.baselineMae)}</td><td>{row.graded}</td></tr>)}</tbody>
        </table>
        <Sub>Estimated too high</Sub>
        {s.overs.length ? <ol>{s.overs.map(row => <li key={row.id}>{row.name} ({row.team} {row.position}): est. {number(row.estimate)}, actual {number(row.actual)}</li>)}</ol> : <p>None.</p>}
        <Sub>Estimated too low</Sub>
        {s.unders.length ? <ol>{s.unders.map(row => <li key={row.id}>{row.name} ({row.team} {row.position}): est. {number(row.estimate)}, actual {number(row.actual)}</li>)}</ol> : <p>None.</p>}
        <p className={c('meta')}>Listed available, no stats row: {s.noStatsRow} · Played without an estimate: {s.playedWithoutEstimate}. Neither is scored as zero.</p>
        <p className={c('meta')}>A report card for GTL's statistical pace estimates, not a forecast or betting claim.</p>
      </details>
    </> : <p>No graded players for Week {review.week} under these settings.</p>}
  </>;
  return theme === 'next'
    ? <Card as="section" variant="hero" className={c('accuracy')} aria-label={`Week ${review.week} accuracy`}>{body}</Card>
    : <section className={`panel ${c('accuracy')}`} aria-label={`Week ${review.week} accuracy`}>{body}</section>;
}
