// A personal points ratio, never a win probability. Null has no filled arc.
import { cx } from '../ui/index.js';
export function AccuracyRing({ share, label, children, className }) {
  const ratio = typeof share === 'number' && Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : null;
  return <span className={cx('gx-accuracy-ring', className)} role="img" aria-label={label}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="gx-accuracy-track" cx="50" cy="50" r="44"/>
      {ratio !== null && <circle className="gx-accuracy-fill" cx="50" cy="50" r="44" pathLength="100" strokeDasharray={`${ratio * 100} 100`}/>}</svg>
    <span className="gx-accuracy-value" aria-hidden="true">{children}</span>
  </span>;
}
