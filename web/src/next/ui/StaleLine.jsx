// The line under a landing's card when a refresh failed and the last good copy is still showing (data/store.js keeps
// it with its error noted): one sentence and a ghost button that asks again. The words live here once.
import { Button } from './Button.jsx';
import { cx } from './cx.js';
import './nextMoveCard.css';

export const STALE_COPY = Object.freeze({ refreshFailed: 'This week could not refresh. Showing the last loaded update.', refresh: 'Refresh week' });

/** `<StaleLine onRefresh={() => app.refresh({ only: ['community'] })}/>`; `className` adds the screen's own class. */
export function StaleLine({ onRefresh, className }) {
  return <p className={cx('gx-stale-line', 'gx-t-body', className)} role="status">{STALE_COPY.refreshFailed} <Button variant="ghost" onClick={onRefresh}>{STALE_COPY.refresh}</Button></p>;
}
