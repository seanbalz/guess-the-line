// D-82 Player Props saved receipt: the approved Spread/Total receipt pattern (play/ScoreReceipt.jsx with
// ui/PickScorecard.jsx), carrying the prop's athlete, stat, unit, event and saved source times instead of a team pick.
// The spec (docs/superpowers/specs/2026-11-09-player-props-design.md) reuses the existing approved receipt layout; this is
// not a new composition. Accuracy is the absolute miss from the immutable reference saved at lock-in, in the stat's own
// unit: there are no points, no ring out of 10 and no combined score. A later or closing line never appears here.
import { InfoButton, TeamMark, teamName } from '../ui/index.js';
import { fmtFull } from '../format.js';
import { pickComparison } from '../ui/pickScorecard.js';
import { propMiss, propStat } from '../../../../shared/player-props.mjs';
import '../ui/pickScorecard.css';
import '../play/scores.css';
import './props.css';

const BOOKS = Object.freeze({ draftkings: 'DraftKings', fanduel: 'FanDuel', betmgm: 'BetMGM' });
/** A prop number for display: whole or one decimal, with a true minus sign for a yardage loss. */
export const propNumber = value => (Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(1)).replace('-', '−') : '—');
const opponentOf = athlete => (athlete.team && athlete.team === athlete.away ? athlete.home : athlete.team && athlete.team === athlete.home ? athlete.away : null);

/** "Receiving yards · DAL at PHI · 2026 Week 10": the selection's own identity, even in an all-time list. */
export function propSelectionWords(athlete, guess) {
  const s = propStat(guess.stat);
  const week = Number.isInteger(guess.season) && Number.isInteger(guess.week) ? `${guess.season} Week ${guess.week}` : null;
  return [athlete.playerName, s?.label, athlete.away && athlete.home ? `${athlete.away} at ${athlete.home}` : null, week].filter(Boolean).join(' · ');
}

/** What "About this reference" says: lock-in time, the saved three-book median, each book with its source time. */
export function propReceiptDetails({ athlete, guess }) {
  const s = propStat(guess.stat), r = guess.reference;
  if (!s) return [];
  return [
    `Locked in ${fmtFull(guess.lockedAt)} · ${propNumber(guess.guess)} ${s.unit}.`,
    r ? `Saved reference · three-book median ${propNumber(r.line)} ${s.unit}.` : 'No saved reference is recorded for this guess.',
    ...(r?.books ?? []).map(b => `${BOOKS[b.book] ?? b.book} ${propNumber(b.line)} · observed ${fmtFull(b.observedAt)}.`),
    r?.recordedAt ? `Reference recorded ${fmtFull(r.recordedAt)} from retained quotes; it is not a fresh collection.` : null,
    `${propSelectionWords(athlete, guess)}.`,
    'Accuracy uses this saved reference only. Later line moves and closing lines do not replace it.',
  ].filter(Boolean);
}

/** The pick-focused scorecard for one locked prop: athlete, saved guess, saved reference, miss and the comparison axis. */
export function PropScorecard({ athlete, guess, status = 'Locked in', own = true }) {
  const s = propStat(guess.stat);
  if (!s) return null;
  const g = Number.isFinite(guess.guess) ? guess.guess : null, l = Number.isFinite(guess.reference?.line) ? guess.reference.line : null;
  const miss = g !== null && l !== null ? propMiss(s.key, g, l) : null, chart = pickComparison(g, l);
  const opponent = opponentOf(athlete);
  return <article className="gx-pick-scorecard gx-prop-scorecard" aria-label={`${s.label} scorecard`} data-prop-scorecard="">
    <div className="gx-pc-top">
      <div className="gx-vstack gx-gap-8">
        <h3 className="gx-t-strong">{s.label}</h3>
        <span className="gx-pc-status">{status}</span>
      </div>
    </div>
    {opponent ? <div className="gx-pc-opponent">
      <TeamMark code={opponent} size={32} decorative/>
      <div><span className="gx-t-meta gx-c-2">Opponent</span><strong>{teamName(opponent)}</strong></div>
    </div> : null}
    <div className="gx-pc-pick">
      <div className="gx-pc-team">
        {athlete.team ? <TeamMark code={athlete.team} size={48} decorative/> : null}
        <strong>{athlete.playerName}</strong>
        <span className="gx-t-meta gx-c-2">{[athlete.team ? teamName(athlete.team) : null, athlete.position].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="gx-pc-value">
        <span className="gx-t-meta gx-c-2">{own ? 'Your saved guess' : 'Saved guess'}</span>
        <strong>{propNumber(g)}</strong>
        <span className="gx-t-meta gx-c-2">{s.unit}</span>
      </div>
    </div>
    <div className="gx-pc-stats">
      <div>
        <span className="gx-t-meta gx-c-2">Saved reference</span>
        <strong>{propNumber(l)}</strong>
        <span className="gx-t-meta gx-c-2">Three-book median</span>
      </div>
      <div>
        <span className="gx-t-meta gx-c-2">Miss</span>
        <strong>{miss === null ? '—' : propNumber(miss)}</strong>
        <span className="gx-t-meta gx-c-2">{miss === null ? 'Comparison unavailable' : `${s.unit} from saved reference`}</span>
      </div>
    </div>
    {chart ? <figure className="gx-pc-chart" aria-label="Saved guess comparison">
      <figcaption className="gx-t-meta gx-c-2">{s.label} · {propNumber(chart.from)} to {propNumber(chart.to)}</figcaption>
      <div className="gx-pc-axis" role="img" aria-label={`Saved reference ${propNumber(l)}, saved guess ${propNumber(g)}, miss ${propNumber(chart.difference)} ${s.unit} on a scale from ${propNumber(chart.from)} to ${propNumber(chart.to)}`}>
        <span className="gx-pc-axis-track"/>
        <span className="gx-pc-axis-gap" style={{ left: `${Math.min(chart.guessAt, chart.lineAt)}%`, width: `${Math.abs(chart.guessAt - chart.lineAt)}%` }}/>
        <span className="gx-pc-axis-reference" style={{ left: `${chart.lineAt}%` }}/>
        <span className="gx-pc-axis-guess" style={{ left: `${chart.guessAt}%` }}/>
      </div>
      <div className="gx-pc-chart-key gx-t-meta"><span>● Saved reference {propNumber(l)}</span><span>◆ Guess {propNumber(g)}</span></div>
    </figure> : null}
  </article>;
}

/**
 * The saved receipt (ScoreReceipt pattern): the scorecard, ⓘ with the books and source times, one sentence and the
 * reference's source age in words, so a retained older quote is never read as freshly collected.
 */
export function PropReceipt({ athlete, guess }) {
  const s = propStat(guess.stat);
  if (!s) return null;
  const r = guess.reference;
  const miss = r ? propMiss(s.key, guess.guess, r.line) : null;
  const sentence = !r ? 'No saved reference · not scored' : miss === 0 ? 'Right on the line' : miss === null ? 'Comparison unavailable' : `Missed by ${propNumber(miss)} ${s.short}`;
  return <section className="gx-lock-receipt gx-vstack gx-gap-12" aria-label={`${athlete.playerName} ${s.label} receipt`} data-prop-receipt="">
    <PropScorecard athlete={athlete} guess={guess}/>
    <div className="gx-receipt-head">
      <p className="gx-t-meta gx-c-2 gx-grow">{r ? `Saved line observed ${fmtFull(r.observedTo)} · ${r.books?.length ?? 0} books` : 'Source time not recorded'}</p>
      <InfoButton title="About this reference" body={propReceiptDetails({ athlete, guess })}/>
    </div>
    <p className="gx-t-strong">{sentence}</p>
  </section>;
}
