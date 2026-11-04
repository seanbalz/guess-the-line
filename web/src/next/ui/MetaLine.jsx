// A meta line of parts joined by " · " ("Week 6 · Due Wed 11:59 PM PT · Quotes 6:26 PM PT"), quick win A20. Each part is
// one unit that moves to the next line whole, with its " ·" riding at its end, so a narrow screen wraps only between
// parts: never between a date and its time, and no line starts with an orphan "·". A part wider than the whole line
// still wraps inside itself rather than leave the screen. The text reads exactly as the parts joined by " · ".
import { Fragment } from 'react';
import { SEP } from '../format.js';
import { cx } from './cx.js';
import './metaLine.css';

/**
 * `<MetaLine parts={['Week 6', 'Due Wed 11:59 PM PT']}/>`. Empty parts (null, undefined, false, '') are left out, and
 * with none left it draws nothing. `className` replaces the meta type (`gx-t-meta`) for a line inside a label that
 * brings its own type; `as` is the element (a `p` by default, a `span` inside phrasing content).
 */
export function MetaLine({ parts, as: Tag = 'p', className = 'gx-t-meta', ...rest }) {
  const shown = (parts ?? []).filter(part => part !== null && part !== undefined && part !== false && part !== '');
  if (!shown.length) return null;
  const mark = SEP.trimEnd();
  return (
    <Tag className={cx('gx-meta-line', className)} {...rest}>
      {shown.map((part, i) => (
        <Fragment key={i}>
          {i ? ' ' : null}
          <span className="gx-meta-part">{part}{i < shown.length - 1 ? mark : null}</span>
        </Fragment>
      ))}
    </Tag>
  );
}
