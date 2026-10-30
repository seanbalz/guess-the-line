import { useCallback, useEffect, useRef, useState } from 'react';
import { linesApi } from '../../api.js';

export function expireAssessments(data, elapsed) {
  if (!data) return data;
  const at = Date.parse(data.now) + Math.max(0, elapsed);
  return { ...data, assessments: data.assessments.map(a => a.quote && at >= Date.parse(a.quote.expiresAt)
    ? { ...a, color: 'gray', label: 'Insufficient evidence', quote: null, reasons: [...new Set([...a.reasons, 'current_quote_unavailable'])] } : a) };
}
export function useAssessments({ app, personal, shown, gameId, market, color }) {
  const access = useRef({ data: personal?.data, version: 0 });
  if (access.current.data !== personal?.data) access.current = { data: personal?.data, version: access.current.version + 1 };
  const body = JSON.stringify({ season: shown?.season, week: shown?.week, ...(gameId ? { gameId } : {}), ...(market ? { market } : {}), ...(color ? { color } : {}) });
  const scope = JSON.stringify([app.accountId, body, access.current.version]);
  const current = useRef(scope); current.current = scope;
  const [reply, setReply] = useState(null), [version, setVersion] = useState(0);
  const reload = useCallback(() => { setReply(null); setVersion(v => v + 1); }, []);
  useEffect(() => {
    if (!app.accountId || !shown) return;
    const controller = new AbortController(), started = performance.now(); let timer;
    linesApi('assessments', JSON.parse(body), controller.signal).then(data => {
      if (controller.signal.aborted || current.current !== scope) return;
      setReply({ scope, data, started, status: 'ready' });
      const due = Math.min(...data.assessments.flatMap(a => [Date.parse(a.kickoff), Date.parse(a.quote?.expiresAt)]).filter(at => Number.isFinite(at) && at > Date.parse(data.now)));
      if (Number.isFinite(due)) timer = setTimeout(reload, Math.min(2147483647, Math.max(0, due - Date.parse(data.now) - (performance.now() - started) + 1)));
    }).catch(error => {
      if (controller.signal.aborted || current.current !== scope) return;
      if (error.status === 401) app.requestSignIn?.();
      setReply({ scope, status: 'error', error });
    });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [scope, body, version]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload); window.addEventListener('online', reload); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('online', reload); document.removeEventListener('visibilitychange', visible); };
  }, [reload]);
  if (reply?.scope !== scope) return { status: 'loading', data: null, reload };
  return { ...reply, reload, data: expireAssessments(reply.data, performance.now() - reply.started) };
}
