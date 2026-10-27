// Play's three quiet states (design upgrade, item 5), one look on every Play screen: one clear line each, and a
// "Try again" wherever a read failed. Loading is a status, a failure is an alert, empty is plain text with at most
// one action (rule of restraint 5). `error` is an ApiError-like value: the server's own message when it sent one,
// the no-connection line when the request never got an answer.
import { Button, Card } from '../ui/index.js';
import './moments.css';

export const PLAY_OFFLINE = 'No connection. Reconnect and try again.';

/** The one line a failed read shows: what failed, then why when that is known. */
export function failureLine(what, error) {
  const base = `${what} could not be loaded.`;
  if (!error) return base;
  if (!error.status) return `${base} ${PLAY_OFFLINE}`;
  return typeof error.message === 'string' && error.message.trim() && error.message !== base ? `${base} ${error.message}` : base;
}

export function PlayLoading({ children }) {
  return <Card variant="s2" className="gx-play-state-card" role="status" data-play-state="loading"><p className="gx-t-body gx-c-2">{children}</p></Card>;
}

export function PlayFailure({ what, error, onRetry, retryLabel = 'Try again' }) {
  return <Card variant="s2" className="gx-play-state-card" role="alert" data-play-state="error">
    <p className="gx-t-body">{failureLine(what, error)}</p>
    {onRetry ? <Button onClick={onRetry}>{retryLabel}</Button> : null}
  </Card>;
}

/** `role="alert"` when the empty state is a problem the player should hear at once (the rules changed). */
export function PlayEmpty({ children, action, onAction, role }) {
  return <Card variant="s2" className="gx-play-state-card" role={role} data-play-state="empty">
    <p className="gx-t-body">{children}</p>
    {action && onAction ? <Button onClick={onAction}>{action}</Button> : null}
  </Card>;
}
