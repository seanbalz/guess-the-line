import { pickText, show } from '../../communityFormat.js';
import { InfoButton, Pill, teamName } from '../ui/index.js';
import { fmtFull } from '../format.js';
import { lateLabel, number } from './scoring.js';
import { PickScorecard } from '../ui/PickScorecard.jsx';

/**
 * What "About this score" says (D-62 rule 4; D-23: moved one tap away, never removed): the lock-in time, the saved
 * line in words, its source and when it was observed, and any reason or rule note the scorer sent.
 */
export function receiptDetails({ game, mode, row, guess, lockedAt }) {
  const reference = row?.reference, value = number(reference?.value);
  return [
    `Locked in ${fmtFull(lockedAt)} · ${pickText(mode, game.awayCode, game.homeCode, guess)}.`,
    value !== null ? `Saved line · ${pickText(mode, game.awayCode, game.homeCode, value)}.` : null,
    `${reference?.source || 'Source not available'}${reference?.observedAt ? ` · Observed ${fmtFull(reference.observedAt)}` : ''}.`,
    reference?.reason || null,
    reference?.rule === 'first_line_after_submission' ? 'First qualifying line after lock-in. Later movement does not replace it.' : null,
  ].filter(Boolean);
}

/**
 * Approved pick-focused owner receipt: team context, saved guess, authoritative points and shared comparison scale.
 * Times, source and provenance sit behind ⓘ. Points and eligibility come from the SQL scorer, never a
 * latest-market calculation.
 */
export function ScoreReceipt({ game, mode, row, guess, lockedAt, onScore }) {
  const reference = row?.reference;
  const points = row?.eligible === false ? null : number(row?.points);
  const value = number(reference?.value);
  const error = value !== null && number(guess) !== null ? Math.abs(guess - value) : null;
  const total = mode === 'guess_total';
  const sentence = row?.eligible === false ? 'Not eligible for scoring.'
    : points !== null ? (error === null ? null : error === 0 ? 'Right on the line' : `Missed by ${show(error)}`)
      : value === null ? 'Waiting for scoring line' : 'Score unavailable · refresh to check';
  return <section className="gx-lock-receipt gx-vstack gx-gap-12" aria-label={`${teamName(game.awayCode)} at ${teamName(game.homeCode)} ${total ? 'Total' : 'Spread'} receipt`}>
    <PickScorecard game={game} mode={mode} guess={guess} line={value} points={points} status={row?.eligible === false ? 'Not eligible' : points !== null ? 'Locked in' : value === null ? 'Waiting for scoring line' : 'Score unavailable'}/>
    <div className="gx-receipt-head">
      {row?.late ? <Pill tone="pending">{lateLabel(row.late)}</Pill> : null}
      <InfoButton title="About this score" body={receiptDetails({ game, mode, row, guess, lockedAt })}/>
    </div>
    {sentence ? <p className="gx-t-strong">{sentence}</p> : null}
    {onScore && <button type="button" className="gx-btn gx-btn--ghost" onClick={onScore}>View weekly score</button>}
  </section>;
}
