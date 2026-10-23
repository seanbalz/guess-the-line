// Game context for Fantasy (D-57): the viewer's own gated /lines/read reply and the stored kickoff wind forecast. Lines are
// per viewer, so the cache clears when the signed-in account changes; nothing here is shared with other players.
import { useEffect, useState } from 'react';
import { cloudEnabled, supabase } from './auth';
import { linesApi } from './api';
import { loadWind, watchTrendAccount } from './trendsLoaders.js';

const linesCache = new Map(), LINES_MS = 60_000;
supabase?.auth.onAuthStateChange(watchTrendAccount(() => linesCache.clear()));

export function loadFantasyLines(season, week) {
  if (!cloudEnabled) return Promise.resolve({ status: 'off', games: new Map() });
  const key = `${season}-${week}`, hit = linesCache.get(key);
  if (hit && Date.now() - hit.at < LINES_MS) return hit.promise;
  const promise = linesApi('read', { season, week }).then(
    reply => ({ status: 'ready', games: new Map((reply?.games ?? []).map(game => [game.id, game])) }),
    error => ({ status: [401, 403].includes(error?.status) ? 'not-member' : 'unavailable', games: new Map() }));
  linesCache.set(key, { at: Date.now(), promise });
  return promise;
}

export function useFantasyGameContext(season, week) {
  const key = season && week ? `${season}-${week}` : null;
  const [state, setState] = useState({ key: null, lines: null, wind: null });
  useEffect(() => {
    if (!key) return undefined;
    let current = true;
    Promise.all([loadFantasyLines(season, week), loadWind(season, week)])
      .then(([lines, wind]) => { if (current) setState({ key, lines, wind: wind?.data ?? null }); });
    return () => { current = false; };
  }, [key, season, week]);
  return state.key === key ? state : { key, lines: null, wind: null };
}
