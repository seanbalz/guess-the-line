import { useEffect, useState } from 'react';
import { FANTASY_DEFAULT, FANTASY_WEEKS } from './fantasyWeeks.generated.js';
import { cloudEnabled } from './auth';
import { fantasyApi } from './api';
import { createFantasyLoader, fantasyWeekKey } from './fantasyLoader.js';

export { fantasyWeekKey };
export const FANTASY_AVAILABLE = Object.keys(FANTASY_WEEKS).map(key => {
  const [season, week] = key.split('-').map(Number);
  return { key, season, week };
}).sort((a, b) => b.season - a.season || b.week - a.week);
export const FANTASY_INITIAL = fantasyWeekKey(FANTASY_DEFAULT.season, FANTASY_DEFAULT.week);

const loader = createFantasyLoader({ cloud: cloudEnabled, readHosted: fantasyApi, staticWeeks: FANTASY_WEEKS, initialKey: FANTASY_INITIAL });
/** `key` is 'YYYY-WW', or null for the newest published week. Public statistics only; no account data. */
export function useFantasySnapshot(key) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key, status: 'loading' });
  useEffect(() => {
    let current = true;
    setState({ key, status: 'loading' });
    loader.load(key).then(value => {
      if (!current) return;
      setState(value ? { key, status: 'ready', ...value, selection: fantasyWeekKey(value.snapshot.season, value.snapshot.week) } : { key, status: 'missing' });
    }).catch(() => { if (current) setState({ key, status: 'error' }); });
    return () => { current = false; };
  }, [key, attempt]);
  // A selection change must never momentarily show a different week's rankings.
  return { ...(state.key === key ? state : { key, status: 'loading' }), retry: () => { loader.clear(); setAttempt(value => value + 1); } };
}
