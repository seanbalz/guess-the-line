import { pickText, show } from '../../communityFormat.js';
import { InfoButton, Pill } from '../ui/index.js';
import { fmtFull, fmtNum, fmtSpreadPick } from '../format.js';
import { lateLabel, number } from './scoring.js';

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
 * Compact owner receipt, picture first (D-62 rule 4): the points large, one sentence, then your guess and the saved line
 * side by side. Times, source and provenance sit behind ⓘ. Points and eligibility come from the SQL scorer, never a
 * latest-market calculation.
 */
export function ScoreReceipt({ game, mode, row, guess, lockedAt, onScore }) {
  const reference = row?.reference;
  const points = row?.eligible === false ? null : number(row?.points);
  const value = number(reference?.value);
  const error = value !== null && number(guess) !== null ? Math.abs(guess - value) : null;
  const total = mode === 'guess_total';
  const side = v => (total ? fmtNum(v) : fmtSpreadPick(game.awayCode, game.homeCode, v));
  const sentence = row?.eligible === false ? 'Not eligible for scoring.'
    : points !== null ? (error === null ? null : error === 0 ? 'Right on the line' : `Missed by ${show(error)}`)
      : value === null ? 'Waiting for scoring line' : 'Score unavailable · refresh to check';
  return <section className="gx-lock-receipt gx-vstack gx-gap-12" aria-label={`${game.awayCode} at ${game.homeCode} ${total ? 'Total' : 'Spread'} receipt`}>
    <div className="gx-receipt-head">
      {points !== null ? <p className="gx-receipt-score"><span className="gx-n-l">{show(points)} / 10</span><span className="gx-t-body gx-c-2">points</span></p>
        : <p className="gx-receipt-score"><span className="gx-n-l gx-c-2">—</span><span className="gx-t-body gx-c-2">points</span></p>}
      {row?.late ? <Pill tone="pending">{lateLabel(row.late)}</Pill> : null}
      <InfoButton title="About this score" body={receiptDetails({ game, mode, row, guess, lockedAt })}/>
    </div>
    {sentence ? <p className="gx-t-strong">{sentence}</p> : null}
    <div className="gx-receipt-pair">
      <p className="gx-receipt-chip gx-receipt-chip--you"><span className="gx-t-meta">You</span><span className="gx-n-m">{side(guess)}</span></p>
      <p className="gx-receipt-chip"><span className="gx-t-meta">Line</span><span className="gx-n-m">{value === null ? '—' : side(value)}</span></p>
    </div>
    {onScore && <button type="button" className="gx-btn gx-btn--ghost" onClick={onScore}>View weekly score</button>}
  </section>;
}
