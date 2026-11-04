// D-69 step 3 (spec 5, "Lists that must stay lists ... use picture rows"): picture first (marks, a face), the name over
// at most one meta line, one number on the right over its word (the word carries the state, D-38). One button that
// opens the item's layer; with nothing to open, a plain row. Research uses it; Bets' rows will (step 4).
import { cx } from './cx.js';
import './pictureRow.css';
import './press.css';

export const PICTURE_ROW_TONES = Object.freeze(['plain', 'good', 'warn']);

/**
 * `<PictureRow id picture title meta value word tone onClick ariaLabel data-game="SEA-DEN"/>`. `picture` is hidden from
 * assistive technology: `ariaLabel`, the row's whole spoken name, says it. A stable `id` is the shell's handle for focus
 * return on Back. Other props (`data-*`) reach the row.
 */
export function PictureRow({ id, picture, title, meta, value, word, tone = 'plain', onClick, ariaLabel, className, ...rest }) {
  const t = PICTURE_ROW_TONES.includes(tone) ? tone : 'plain';
  const classes = cx('gx-prow', !picture && 'gx-prow--nopic', !onClick && 'gx-prow--static', className);
  const body = <>
    {picture ? <span className="gx-prow-pic" aria-hidden="true">{picture}</span> : null}
    <span className="gx-prow-main">
      <span className="gx-t-strong gx-prow-title">{title}</span>
      {meta ? <span className="gx-t-meta gx-prow-meta">{meta}</span> : null}
    </span>
    <span className="gx-prow-end">
      <span className="gx-n-s gx-prow-value">{value}</span>
      {word ? <span className={cx('gx-t-label', 'gx-prow-word', `gx-prow-word--${t}`)}>{word}</span> : null}
    </span>
  </>;
  if (!onClick) return <div id={id} className={classes} {...rest}>{body}</div>;
  return <button id={id} type="button" className={classes} aria-label={ariaLabel} onClick={onClick} {...rest}>{body}</button>;
}
