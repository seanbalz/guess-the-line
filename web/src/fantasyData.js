import { useEffect, useState } from 'react';
import { validateFantasySnapshot } from '../../shared/fantasy-rankings.mjs';
import { FANTASY_DEFAULT, FANTASY_WEEKS } from './fantasyWeeks.generated.js';

export const fantasyWeekKey = (season, week) => `${season}-${String(week).padStart(2, '0')}`;
export const FANTASY_AVAILABLE = Object.keys(FANTASY_WEEKS).map(key => {
  const [season, week] = key.split('-').map(Number);
  return { key, season, week };
}).sort((a, b) => b.season - a.season || b.week - a.week);
export const FANTASY_INITIAL = fantasyWeekKey(FANTASY_DEFAULT.season, FANTASY_DEFAULT.week);

const cache = new Map();
/** Only explicitly registered, same-origin public statistics snapshots are loaded. No account data or provider calls. */
export function useFantasySnapshot(key) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => cache.has(key)
    ? { key, status: 'ready', snapshot: cache.get(key) }
    : { key, status: FANTASY_WEEKS[key] ? 'loading' : 'missing' });
  useEffect(() => {
    let current = true;
    const loader = FANTASY_WEEKS[key];
    if (!loader) { setState({ key, status: 'missing' }); return; }
    if (cache.has(key)) { setState({ key, status: 'ready', snapshot: cache.get(key) }); return; }
    setState({ key, status: 'loading' });
    Promise.resolve().then(loader).then(module => {
      const snapshot = module.default ?? module;
      if (!validateFantasySnapshot(snapshot).valid || fantasyWeekKey(snapshot.season, snapshot.week) !== key) throw new Error('Invalid fantasy snapshot');
      cache.set(key, snapshot);
      if (current) setState({ key, status: 'ready', snapshot });
    }).catch(() => { if (current) setState({ key, status: 'error' }); });
    return () => { current = false; };
  }, [key, attempt]);
  // A selection change must never momentarily show a different week's rankings.
  return { ...(state.key === key ? state : { key, status: FANTASY_WEEKS[key] ? 'loading' : 'missing' }), retry: () => setAttempt(value => value + 1) };
}
