import { useCallback, useEffect, useRef, useState } from 'react';
import { betsApi } from '../../api.js';
import { gameBets } from './gameBets.js';

/** No polling or cross-scope cache: mounted only while the per-game sheet is open. */
export function useGameBets(app, personal, args) {
  const access = useRef({ data: personal.data, version: 0 });
  if (access.current.data !== personal.data) access.current = { data: personal.data, version: access.current.version + 1 };
  const leagueId = app.league?.community === false ? app.league.id : null;
  const pending = app.league?.pending === true || (app.league?.community === false && !leagueId);
  const body = JSON.stringify({ season: args.season, week: args.week, ...(leagueId ? { leagueId } : {}) });
  const scope = JSON.stringify([app.accountId, pending, body, args.game, access.current.version]);
  const current = useRef(scope); current.current = scope;
  const signIn = useRef(app.requestSignIn); signIn.current = app.requestSignIn;
  const generation = useRef(0);
  const [reply, setReply] = useState(null), [revision, setRevision] = useState(0);
  const reload = useCallback(() => { generation.current += 1; setReply(null); setRevision(n => n + 1); }, []);
  useEffect(() => {
    if (!app.accountId || pending || !args.game) return;
    const controller = new AbortController(), epoch = ++generation.current, started = performance.now();
    let timer;
    betsApi('read', JSON.parse(body), controller.signal).then(data => {
      if (controller.signal.aborted || current.current !== scope || generation.current !== epoch) return;
      const view = gameBets(data, { ...JSON.parse(body), gameId: args.game }, app.accountId);
      setReply({ scope, status: 'ready', view });
      const remaining = Date.parse(view.kickoff) - Date.parse(data.now) - (performance.now() - started);
      if (remaining > 0) timer = setTimeout(reload, Math.min(remaining + 1, 2147483647));
    }).catch(error => {
      if (controller.signal.aborted || current.current !== scope || generation.current !== epoch) return;
      if (error.status === 401) signIn.current?.();
      setReply({ scope, status: 'error' });
    });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [scope, body, revision]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload); window.addEventListener('online', reload); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('online', reload); document.removeEventListener('visibilitychange', visible); };
  }, [reload]);
  return { ...(reply?.scope === scope ? reply : { status: 'loading', view: null }), reload };
}
