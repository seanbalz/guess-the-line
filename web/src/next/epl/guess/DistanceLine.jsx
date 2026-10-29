import { priceText } from './guessModel.js';
import { toLine, validPrice } from '../../../../../shared/epl-moneyline.mjs';
import { fmtWhen } from '../../format.js';

export default function DistanceLine({ guess }) {
  const scored = guess.state === 'scored' && validPrice(guess.referencePrice) && Number.isFinite(guess.distance);
  const a = validPrice(guess.price) ? toLine(guess.price) : 0, b = scored ? toLine(guess.referencePrice) : a;
  return <div className="gx-epl-distance">
    <div className="gx-epl-guess-values"><span>Your guess <strong>{priceText(guess.price)}</strong></span><span>Saved real price <strong>{scored ? priceText(guess.referencePrice) : '—'}</strong></span></div>
    {scored ? <>
      <svg role="img" aria-label={`Distance ${guess.distance} points; your guess ${priceText(guess.price)}, saved real price ${priceText(guess.referencePrice)}`} viewBox="0 0 240 28" className="gx-epl-distance-chart">
        <line x1="16" y1="14" x2="224" y2="14"/>
        <circle cx={a <= b ? 16 : 224} cy="14" r="6" className="gx-epl-distance-guess"/>
        <circle cx={a === b ? 16 : a < b ? 224 : 16} cy="14" r="4" className="gx-epl-distance-real"/>
      </svg>
      <p className="gx-t-strong">{guess.distance} points off</p>
      <p className="gx-t-meta">Saved median · {guess.referenceSource === 'first-after' ? 'first qualifying price after lock' : 'at lock'} · {guess.referenceObservedAt ? fmtWhen(guess.referenceObservedAt) : 'Time unavailable'}</p>
    </> : <p className="gx-t-meta">{guess.status === 'draft' ? 'Draft · not locked or scored' : guess.state === 'unscored' ? 'No line before kickoff · unscored, excluded from average' : 'Reference pending · first qualifying price before kickoff will count'}</p>}
  </div>;
}
