import { useEffect, useRef, useState } from 'react';
import { connectRefresh } from '../data/store.js';
import { Button, Card } from '../ui/index.js';

/** A private group or history season has its own abortable read. Old scopes never flash on a new one. */
export function useLeagueRead(key, read, onRefused) {
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
    Promise.resolve().then(() => readRef.current(controller.signal)).then(data => {
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

export function LeagueFailure({ error, onRetry }) {
  return <Card className="gx-vstack gx-gap-12" role="alert"><p className="gx-t-body">{error?.status ? error.message : 'No connection. Reconnect and try again.'}</p><Button onClick={onRetry}>Try again</Button></Card>;
}
