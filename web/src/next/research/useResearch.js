import { useCallback, useEffect, useRef, useState } from 'react';
import { linesApi } from '../../api.js';

const HOUR = 3600000;
const monotonic = () => performance.now();
/** Absolute server-time expiry. Never use the device's wall clock for eligibility. */
export function researchExpiry(data) {
  const due = [];
  for (const game of data?.games ?? []) for (const market of ['spread', 'total']) {
    const cell = game[market];
    if (!cell?.visible || cell.lean?.state !== 'lean') continue;
    due.push(Date.parse(game.kickoff), Date.parse(cell.currentReference?.observedAt) + 12 * HOUR);
  }
  return Math.min(...due.filter(Number.isFinite));
}
/** Reveal transitions and stale-reference reasons need refreshes even without a current lean. */
export function researchRefreshDue(data) {
  const now = Date.parse(data?.now), due = [];
  for (const game of data?.games ?? []) {
    due.push(Date.parse(game.kickoff));
    for (const market of ['spread', 'total']) if (game[market]?.visible) due.push(Date.parse(game[market].currentReference?.observedAt) + 12 * HOUR + 1);
  }
  return Math.min(...due.filter(at => Number.isFinite(at) && at > now));
}
export function withoutExpiredLeans(data, elapsed) {
  if (!data || Date.parse(data.now) + Math.max(0, elapsed) < researchExpiry(data)) return data;
  return { ...data, games: data.games.map(game => ({ ...game, ...Object.fromEntries(['spread', 'total'].map(market => {
    const cell = game[market];
    if (!cell?.visible) return [market, { visible: false }];
    const expired = Date.parse(data.now) + elapsed >= Math.min(Date.parse(game.kickoff), Date.parse(cell.currentReference?.observedAt) + 12 * HOUR);
    return [market, expired ? { ...cell, lean: { ...cell.lean, state: 'unavailable', direction: null, label: 'Research unavailable', supporting: [], alternatives: [], reasons: ['local_eligibility_expired'] } } : cell];
  })) })) };
}

/** Each caller owns its reply; access, scope and focus changes hide it before a replacement read. */
export function useResearch({ app, personal, shown, gameId, filters = {}, enabled = true }) {
  const access = useRef({ data: personal?.data, version: 0 });
  if (access.current.data !== personal?.data) access.current = { data: personal?.data, version: access.current.version + 1 };
  const body = JSON.stringify({ season: shown?.season, week: shown?.week, ...(gameId ? { gameId } : {}), ...filters });
  const scope = JSON.stringify([app?.accountId, body, access.current.version, enabled]);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const signInRef = useRef(app?.requestSignIn); signInRef.current = app?.requestSignIn;
  const [reply, setReply] = useState(null), [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => { setReply(null); setRefresh(n => n + 1); }, []);
  useEffect(() => {
    if (!enabled || !app?.accountId || !shown) return;
    const controller = new AbortController();
    let timer;
    // Include ALL network/preparation latency: receiving a reply cannot extend a lean's life.
    const started = monotonic();
    setReply({ scope, status: 'loading' });
    linesApi('research', JSON.parse(body), controller.signal).then(data => {
      if (controller.signal.aborted || scopeRef.current !== scope) return;
      setReply({ scope, status: 'ready', data, started });
      const remaining = researchRefreshDue(data) - Date.parse(data.now) - (monotonic() - started);
      if (Number.isFinite(remaining)) timer = setTimeout(reload, Math.min(Math.max(0, remaining + 1), 2147483647));
    }).catch(error => {
      if (controller.signal.aborted || scopeRef.current !== scope) return;
      if (error.status === 401) signInRef.current?.();
      setReply({ scope, status: 'error', error });
    });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [scope, body, refresh]); // scope includes the stable access generation and all request parameters
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload); window.addEventListener('online', reload);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('online', reload); document.removeEventListener('visibilitychange', visible); };
  }, [reload]);
  // Effects run after render. Old account/week/filter/access replies must never render in that gap.
  if (!enabled || reply?.scope !== scope) return { status: 'loading', data: null, reload };
  return { ...reply, data: withoutExpiredLeans(reply.data, reply.started === undefined ? 0 : monotonic() - reply.started), reload };
}
