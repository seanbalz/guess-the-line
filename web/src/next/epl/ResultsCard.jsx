// Pick a Team results (EPL delivery stage 4, docs/EPL_FEATURES_2026_11_09.md item 6) on EPL Home and Play › Pick a Team:
// the latest matchweek past its draft, from `results` on the epl/draft/read reply (cloud/epl.mjs, shared/epl-results.mjs).
// FINAL names each winning manager with their club, the score line, the margin and the earned bonus (margin × 5; every
// manager in a full shared tie earns it), or says no drafted club won. Until every match is verified final or explicitly
// postponed it stays PENDING with the count still waiting: nothing is inferred from the clock or a missing feed row. The
// words carry the state; the pill and the win color only repeat it. Independent of Sleeper totals and the next draft.
import { useId } from 'react';
import { Card, Pill } from '../ui/index.js';
import { Crest } from './DraftBoard.jsx';
export { resultsModel } from './resultsModel.js';

export const RESULTS_COPY = Object.freeze({
  title: week => `MW${week} Pick a Team results`,
  final: 'Final',
  pending: 'Pending',
  winner: 'Winner',
  winners: n => `${n} winners · shared tie`,
  shared: 'A full tie on margin, goals scored and goals conceded: each tied manager earns the full bonus.',
  noWinner: 'No drafted club won this matchweek, so no bonus is earned.',
  bonus: points => `+${points} bonus`,
  line: w => `${w.goalsFor}-${w.goalsAgainst} ${w.home ? 'vs' : 'at'} ${w.opponentName ?? w.opponent} · won by ${w.margin}`,
  waiting: (final, total) => `Waiting for verified final scores · ${final} of ${total} matches final`,
  waitingBody: 'The result shows once every match is final or postponed. Nothing is assumed from the clock.',
  review: 'The commissioner is checking this matchweek’s results.',
  postponed: n => (n === 1 ? '1 match postponed' : `${n} matches postponed`),
  sleeper: 'The commissioner adds the bonus in Sleeper.',
});

export function ResultsCard({ results, clubName = code => code }) {
  const headingId = useId();
  if (!results) return null;
  const final = results.status === 'final';
  const { winners, matches } = results;
  return <Card as="section" className="gx-epl-bonus gx-epl-results" aria-labelledby={headingId} data-epl-results={results.status}>
    <div className="gx-epl-results-head">
      <h2 className="gx-t-micro gx-c-2" id={headingId}>{RESULTS_COPY.title(results.week)}</h2>
      <Pill tone={final ? 'win' : 'pending'}>{final ? RESULTS_COPY.final : RESULTS_COPY.pending}</Pill>
    </div>
    {final && winners.length ? <>
      <p className="gx-t-meta gx-c-2">{winners.length > 1 ? RESULTS_COPY.winners(winners.length) : RESULTS_COPY.winner}</p>
      <ul className="gx-epl-margins">
        {winners.map(w => <li key={w.ownerId} className="gx-epl-margin">
          <Crest code={w.club} size="sm"/>
          <span className="gx-epl-margin-main">
            <span className="gx-epl-margin-head">
              <span className="gx-epl-margin-name">{w.name}<span className="gx-c-2"> · {w.clubName ?? clubName(w.club)}</span></span>
              <span className="gx-epl-margin-pts">{RESULTS_COPY.bonus(w.bonus)}</span>
            </span>
            <span className="gx-t-meta gx-c-2">{RESULTS_COPY.line(w)}</span>
          </span>
        </li>)}
      </ul>
      {winners.length > 1 ? <p className="gx-t-body gx-c-2">{RESULTS_COPY.shared}</p> : null}
    </> : null}
    {final && !winners.length ? <p className="gx-t-body">{RESULTS_COPY.noWinner}</p> : null}
    {!final ? <div className="gx-epl-margin-empty" role="status">
      <p className="gx-t-body">{RESULTS_COPY.waiting(matches.final, matches.total - matches.postponed)}</p>
      <p className="gx-t-body gx-c-2">{results.review ? RESULTS_COPY.review : RESULTS_COPY.waitingBody}</p>
    </div> : null}
    {matches.postponed ? <p className="gx-t-meta gx-c-2">{RESULTS_COPY.postponed(matches.postponed)}</p> : null}
    {final ? <p className="gx-t-meta gx-c-2">{RESULTS_COPY.sleeper}</p> : null}
  </Card>;
}
