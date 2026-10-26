import { useCallback, useEffect, useRef, useState } from 'react';
import { communityApi } from '../../api.js';

/** Mounted only while the disclosure is open. No saved replies across account/game/market/access scopes. */
export function useGameGuesses({ app, personal, shown }, gameId, market) {
  const access = useRef({ data: personal.data, version: 0 });
  if (access.current.data !== personal.data) access.current = { data: personal.data, version: access.current.version + 1 };
  const body = JSON.stringify({ season: shown?.season, week: shown?.week, gameId, mode: `guess_${market}` });
  const scope = JSON.stringify([app.accountId, body, access.current.version]);
  const current = useRef(scope); current.current = scope;
  const signIn = useRef(app.requestSignIn); signIn.current = app.requestSignIn;
  const generation = useRef(0);
  const [reply, setReply] = useState(null), [revision, setRevision] = useState(0);
  const reload = useCallback(() => { generation.current += 1; setReply(null); setRevision(n => n + 1); }, []);
  useEffect(() => {
    if (!app.accountId || !shown || !gameId) return;
    const controller = new AbortController(), epoch = ++generation.current, started = performance.now();
    let timer;
    communityApi('picks', JSON.parse(body), controller.signal).then(data => {
      if (controller.signal.aborted || current.current !== scope || generation.current !== epoch) return;
      const target = JSON.parse(body);
      if (data.viewer?.toLowerCase() !== app.accountId.toLowerCase() || data.season !== target.season || data.week !== target.week || data.mode !== target.mode
        || !Array.isArray(data.games) || data.games.length !== 1 || data.games[0].gameId !== gameId || !Array.isArray(data.games[0].rows) || !Number.isFinite(Date.parse(data.now))) throw new Error('Wrong guesses reply');
      setReply({ scope, status: 'ready', data });
      const game = data.games[0], remaining = Date.parse(game.kickoff) - Date.parse(data.now) - (performance.now() - started);
      if (!game.started && remaining > 0) timer = setTimeout(reload, Math.min(remaining + 1, 2147483647));
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
  return { ...(reply?.scope === scope ? reply : { status: 'loading', data: null }), reload };
}
