// A list of rows with 1px hairlines between them (no zebra stripes). It is a real list, so a screen reader says how
// many rows there are; each child becomes one list item. Put it in a flush card: <Card variant="flush"><List>...</List></Card>.
import { Children } from 'react';
import { cx } from './cx.js';

export function List({ ordered = false, label, className, children, ...rest }) {
  const Tag = ordered ? 'ol' : 'ul';
  // role="list" keeps the list semantics that Safari drops from a list styled with list-style: none.
  return (
    <Tag className={cx('gx-list', className)} role="list" aria-label={label} {...rest}>
      {Children.toArray(children).map(child => <li key={child.key}>{child}</li>)}
    </Tag>
  );
}
