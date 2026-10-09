import React from 'react';
import './chartGuide.css';

export default function ChartGuide({ mode }) {
  if (!['guess_spread', 'guess_total'].includes(mode)) return null;
  const total = mode === 'guess_total';
  return <details className="chart-guide">
    <summary>How to read this <span className="chart-guide-chevron" aria-hidden="true"/></summary>
    <dl>
      <div>
        <dt>{total ? 'Total = combined points' : 'Spread = who is favored'}</dt>
        <dd>{total
          ? 'Add both teams’ points. Here you guess the sportsbook’s total, not an Over or Under side.'
          : 'Lines use the home team’s perspective. Minus favors the home team; plus favors the away team. PK means even.'}
          <small className="chart-guide-example">Example only: {total ? '24 + 20 = 44 total points.' : 'Home −3 means the home team is favored by 3.'}</small>
        </dd>
      </div>
      <div>
        <dt>Saved reference vs current consensus</dt>
        <dd>Your saved reference is the consensus captured at submission or with a changed guess saved before the deadline. Players can have different references. Current consensus is the latest collected number; later movement does not change your saved points.</dd>
      </div>
      <div>
        <dt>Closer earns more accuracy points</dt>
        <dd>An exact guess earns 10 points. Each 0.5 point of error costs 1, down to 0. No eligible saved reference means unscored.
          <small className="chart-guide-example">Example only: {total ? 'guess 44, saved reference 45 → 8/10 points.' : 'guess −3, saved reference −3.5 → 9/10 points.'}</small>
        </dd>
      </div>
    </dl>
  </details>;
}
