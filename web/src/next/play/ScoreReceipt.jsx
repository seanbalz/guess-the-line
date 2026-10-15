import { pickText, show } from '../../communityFormat.js';
import { fmtFull } from '../format.js';
import { lateLabel, number } from './scoring.js';

/** Compact owner receipt. Points and eligibility come from the SQL scorer, never a latest-market calculation. */
export function ScoreReceipt({ game, mode, row, guess, lockedAt, onScore }) {
  const reference = row?.reference;
  const points = row?.eligible === false ? null : number(row?.points);
  const value = number(reference?.value);
  const error = value !== null && number(guess) !== null ? Math.abs(guess - value) : null;
  return <section className="gx-lock-receipt gx-vstack gx-gap-8" aria-label={`${game.awayCode} at ${game.homeCode} ${mode === 'guess_total' ? 'Total' : 'Spread'} receipt`}>
    <p className="gx-t-strong">Locked in · {pickText(mode, game.awayCode, game.homeCode, guess)}</p>
    <p className="gx-t-meta gx-c-2">{fmtFull(lockedAt)}{row?.late ? ` · ${lateLabel(row.late)}` : ''}</p>
    {row?.eligible === false ? <p className="gx-t-body">Not eligible for scoring.</p>
      : points !== null ? <p className="gx-t-body"><strong className="gx-n-m">{show(points)} / 10</strong> points{error !== null ? ` · Missed by ${show(error)}` : ''}</p>
      : <p className="gx-t-body">{value === null ? 'Waiting for scoring line' : 'Score unavailable · refresh to check'}</p>}
    {value !== null && <p className="gx-t-body">Saved line · {pickText(mode, game.awayCode, game.homeCode, value)}</p>}
    <p className="gx-t-meta gx-c-2">{reference?.source || 'Source not available'}{reference?.observedAt ? ` · Observed ${fmtFull(reference.observedAt)}` : ''}</p>
    {reference?.reason && <p className="gx-t-meta gx-c-2">{reference.reason}</p>}
    {reference?.rule === 'first_line_after_submission' && <p className="gx-t-meta gx-c-2">First qualifying line after lock-in. Later movement does not replace it.</p>}
    {onScore && <button type="button" className="gx-btn gx-btn--ghost" onClick={onScore}>View weekly score</button>}
  </section>;
}
