import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Button } from '../../ui/index.js';
import { createHomeProgressReader } from './homeProgress.js';

export function useHomeMoneylineProgress({ api, accountId, season, week, ownerId }) {
  const reader = useMemo(() => createHomeProgressReader(api, { accountId, season, week, ownerId }), [api, accountId, season, week, ownerId]);
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useEffect(() => { reader.activate(); reader.load(); return reader.dispose; }, [reader]);
  return state;
}

export function HomeMoneylineProgress({ state, onOpenGuess }) {
  if (!state || state.status === 'idle') return null;
  if (state.status === 'loading') return <Button variant="secondary" block disabled>Loading moneyline progress…</Button>;
  if (state.status === 'ready') return <Button variant="secondary" block onClick={onOpenGuess}>Guess this weekend’s moneylines · {state.locked} of {state.total}</Button>;
  if (state.status === 'readonly') return <>
    <Button variant="secondary" block onClick={onOpenGuess}>View this weekend’s moneylines</Button>
    <p className="gx-t-meta gx-c-2">Read-only · link an FEPL manager in Pick a Team to enter guesses.</p>
  </>;
  return <>
    <Button variant="secondary" block onClick={onOpenGuess}>Open moneyline guesses</Button>
    <p className="gx-t-meta gx-c-2">{state.reason === 'prices_not_verified' ? 'Moneyline guessing isn’t available this week.' : 'Moneyline progress is unavailable. Pick a Team is still available above.'}</p>
  </>;
}
