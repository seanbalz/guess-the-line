import { useEffect, useRef, useState } from 'react';
import { connectRefresh } from '../data/store.js';
import { Button, Card } from '../ui/index.js';
import { sharedRead } from '../../sharedReads.js';

/**
 * A private group or history season has its own abortable read. Old scopes never flash on a new one. With
 * `shared: true` (account-scoped keys only) screens share one request and its fresh answer; a refresh or retry reads again.
 */
export function useLeagueRead(key, read, onRefused, { shared = false } = {}) {
  const [snapshot, setSnapshot] = useState(null), [revision, setRevision] = useState(0);
  const readRef = useRef(read), refusedRef = useRef(onRefused), lastGood = useRef(null), running = useRef(false);
  readRef.current = read; refusedRef.current = onRefused;
  useEffect(() => {
    lastGood.current = null;
    return connectRefresh(window, { refresh({ olderThan } = {}) {
      if (!running.current && (olderThan === undefined || lastGood.current === null || Date.now() - lastGood.current >= olderThan)) setRevision(n => n + 1);
    } });
  }, [key]);
  useEffect(() => {
    const controller = new AbortController();
    running.current = true;
    setSnapshot({ key, loading: true, data: null, error: null });
    Promise.resolve().then(() => (shared ? sharedRead(key, readRef.current, controller.signal, { reuse: revision === 0 }) : readRef.current(controller.signal))).then(data => {
      if (!controller.signal.aborted) { lastGood.current = Date.now(); setSnapshot({ key, loading: false, data, error: null }); }
    }).catch(error => {
      if (controller.signal.aborted) return;
      setSnapshot({ key, loading: false, data: null, error });
      if ([401, 403, 404].includes(error?.status)) refusedRef.current?.(error);
    }).finally(() => { if (!controller.signal.aborted) running.current = false; });
    return () => { controller.abort(); running.current = false; };
  }, [key, revision]);
  return { ...(snapshot?.key === key ? snapshot : { loading: true, data: null, error: null }), retry: () => setRevision(n => n + 1) };
}

// League's three read states share one card (design lane, League pass): the same place, padding and words on every
// board, the feed and history, so a slow or failed read never moves the screen around. Loading is a status line,
// empty is one sentence and one action (rule of restraint 5), and a failure says why with "Try again".

/** A read that failed: the server's words (or the offline line) and "Try again". */
export function LeagueFailure({ error, onRetry }) {
  return <Card className="gx-vstack gx-gap-12 gx-l-state" role="alert" data-league-state="error"><p className="gx-t-body">{error?.status ? error.message : 'No connection. Reconnect and try again.'}</p><Button onClick={onRetry}>Try again</Button></Card>;
}

/** A read on its way: "Loading this league…" in a status region, in the card a result will fill. */
export function LeagueLoading({ label }) {
  return <Card className="gx-vstack gx-gap-12 gx-l-state" data-league-state="loading"><p className="gx-t-body gx-c-2" role="status">{label}</p></Card>;
}

/** Nothing to show yet: one sentence and, when there is one, one action ("Invite friends", "Refresh"). */
export function LeagueEmpty({ text, actionLabel, onAction }) {
  return <Card className="gx-vstack gx-gap-12 gx-l-state" data-league-state="empty"><p className="gx-t-body">{text}</p>{actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}</Card>;
}
