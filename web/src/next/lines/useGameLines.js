import { useCallback, useEffect, useRef, useState } from 'react';
import { linesApi } from '../../api.js';
import { SIX_HOURS } from './marketDetails.js';

/** No cross-account/week/game cache. Access changes hide old data during render, before effects. */
function useMarketLines({ app, personal, shown }, gameId, enabled = true) {
  const route = gameId ? 'game' : 'read';
  const access = useRef({ data: personal.data, version: 0 });
  if (access.current.data !== personal.data) access.current = { data: personal.data, version: access.current.version + 1 };
  const body = JSON.stringify({ season: shown?.season, week: shown?.week, gameId });
  const scope = JSON.stringify([app.accountId, body, access.current.version, enabled]);
  const current = useRef(scope); current.current = scope;
  const signIn = useRef(app.requestSignIn); signIn.current = app.requestSignIn;
  const generation = useRef(0);
  const [reply, setReply] = useState(null), [refresh, setRefresh] = useState(0), [, tick] = useState(0);
  const reload = useCallback(() => { generation.current += 1; setReply(null); setRefresh(n => n + 1); }, []);
  useEffect(() => {
    if (!app.accountId || !shown || !enabled) return;
    const controller = new AbortController(), started = performance.now(), epoch = ++generation.current;
    let kickoffTimer;
    const ageTimers = [];
    linesApi(route, JSON.parse(body), controller.signal).then(data => {
      if (controller.signal.aborted || current.current !== scope || generation.current !== epoch) return;
      const target = JSON.parse(body);
      if ((gameId ? data.game?.id !== gameId : !Array.isArray(data.games)) || data.season !== target.season || data.week !== target.week || !Number.isFinite(Date.parse(data.now))) throw new Error('Wrong market reply');
      setReply({ scope, status: 'ready', data, started });
      const games = gameId ? [{ ...data.game, spread: data.spread, total: data.total }] : data.games;
      let nextKickoff = Infinity;
      for (const game of games) {
        for (const market of ['spread', 'total']) {
          const cell = game[market], line = gameId ? cell?.line : cell;
          const due = Date.parse(line?.observedAt) + SIX_HOURS - Date.parse(data.now) - (performance.now() - started);
          if (cell?.visible === true && due >= 0) ageTimers.push(setTimeout(() => tick(n => n + 1), Math.min(due + 1, 2147483647)));
        }
        const remaining = Date.parse(game.kickoff) - Date.parse(data.now) - (performance.now() - started);
        if (!game.started && remaining > 0) nextKickoff = Math.min(nextKickoff, remaining);
      }
      if (Number.isFinite(nextKickoff)) kickoffTimer = setTimeout(reload, Math.min(nextKickoff + 1, 2147483647));
    }).catch(error => {
      if (controller.signal.aborted || current.current !== scope || generation.current !== epoch) return;
      if (error.status === 401) signIn.current?.();
      setReply({ scope, status: 'error' });
    });
    return () => { controller.abort(); clearTimeout(kickoffTimer); ageTimers.forEach(clearTimeout); };
  }, [scope, body, refresh]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', reload); window.addEventListener('online', reload);
    document.addEventListener('visibilitychange', visible);
    // Update age labels only; this does not poll or collect odds.
    const timer = setInterval(() => tick(n => n + 1), 60000);
    return () => { clearInterval(timer); window.removeEventListener('focus', reload); window.removeEventListener('online', reload); document.removeEventListener('visibilitychange', visible); };
  }, [reload]);
  if (!enabled || !app.accountId || !shown || reply?.scope !== scope) return { status: 'loading', data: null, reload };
  return { ...reply, reload, now: Date.parse(reply.data?.now) + Math.max(0, performance.now() - (reply.started ?? performance.now())) };
}

export const useGameLines = (lines, gameId) => useMarketLines(lines, gameId, Boolean(gameId));
export const useBoardLines = (lines, enabled = true) => useMarketLines(lines, undefined, enabled);
