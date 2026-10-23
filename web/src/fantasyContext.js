// Game context for Fantasy (D-57): the viewer's own gated /lines/read reply and the stored kickoff wind forecast. Lines are
// per viewer, so the cache clears when the signed-in account changes; nothing here is shared with other players.
import { useEffect, useState } from 'react';
import { cloudEnabled, supabase } from './auth';
import { linesApi } from './api';
import { loadWind, watchTrendAccount } from './trendsLoaders.js';

const linesCache = new Map(), LINES_MS = 60_000;
// Lines are per viewer: an account change empties the cache and tells every mounted hook to drop what it holds.
let accountGeneration = 0;
const accountListeners = new Set();
supabase?.auth.onAuthStateChange(watchTrendAccount(() => {
  linesCache.clear();
  accountGeneration += 1;
  for (const listener of accountListeners) listener(accountGeneration);
}));

export function loadFantasyLines(season, week) {
  if (!cloudEnabled) return Promise.resolve({ status: 'off', games: new Map() });
  const key = `${season}-${week}`, hit = linesCache.get(key);
  if (hit && Date.now() - hit.at < LINES_MS) return hit.promise;
  const entry = { at: Date.now(), promise: null };
  entry.promise = linesApi('read', { season, week }).then(
    reply => ({ status: 'ready', games: new Map((reply?.games ?? []).map(game => [game.id, game])) }),
    error => {
      const notMember = [401, 403].includes(error?.status);
      // A blip is retried on the next open; a 401/403 is kept like a result. Never evict a newer entry.
      if (!notMember && linesCache.get(key) === entry) linesCache.delete(key);
      return { status: notMember ? 'not-member' : 'unavailable', games: new Map() };
    });
  linesCache.set(key, entry);
  return entry.promise;
}

export function useFantasyGameContext(season, week) {
  const key = season && week ? `${season}-${week}` : null;
  const [state, setState] = useState({ key: null, generation: accountGeneration, lines: null, wind: null });
  const [generation, setGeneration] = useState(accountGeneration);
  useEffect(() => {
    const listener = next => { setGeneration(next); setState({ key: null, generation: next, lines: null, wind: null }); };
    accountListeners.add(listener);
    // The account may have changed between the first render and this subscription.
    if (accountGeneration !== generation) listener(accountGeneration);
    return () => { accountListeners.delete(listener); };
    // Intentionally empty: subscribe once per mount; the generation is read (not tracked) to catch a change before this ran.
  }, []);
  useEffect(() => {
    if (!key) return undefined;
    let current = true;
    const startedGeneration = accountGeneration;
    Promise.all([loadFantasyLines(season, week), loadWind(season, week)])
      .then(([lines, wind]) => {
        // The cleanup may run after the account-change reset, so a reply that began under another account is dropped here.
        if (current && startedGeneration === accountGeneration) setState({ key, generation: startedGeneration, lines, wind: wind?.data ?? null });
      });
    return () => { current = false; };
  }, [key, season, week, generation]);
  return state.key === key && state.generation === accountGeneration ? state : { key, lines: null, wind: null };
}
