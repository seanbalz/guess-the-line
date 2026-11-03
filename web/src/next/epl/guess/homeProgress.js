import { validBoard } from './guessModel.js';

const validContext = context => typeof context.accountId === 'string' && context.accountId.length > 0
  && Number.isInteger(context.season) && Number.isInteger(context.week) && context.week >= 1 && context.week <= 38;

/** Keep only this account's own locked progress for the draft's authoritative EPL season/week. */
export function homeMoneylineProgress(data, context) {
  if (!validContext(context) || !validBoard(data) || data.season !== context.season || data.week !== context.week) throw new Error('Invalid moneyline context.');
  if (!data.available) return { status: 'unavailable', reason: data.reason === 'schema_unavailable' ? 'schema_unavailable' : 'prices_not_verified' };
  if (data.ownerId !== context.ownerId) throw new Error('Moneyline manager changed.');
  if (!data.ownerId) return { status: 'readonly' };
  const fixtures = new Set(data.fixtures.map(f => f.eventId));
  const locked = new Set(data.guesses.filter(g => g.ownerId === data.ownerId && g.status === 'locked' && fixtures.has(g.eventId)).map(g => g.eventId));
  return { status: 'ready', locked: locked.size, total: fixtures.size };
}

/** Read-only, context-scoped reader. It retains counts, never private guess rows or a cross-account cache. */
export function createHomeProgressReader(api, context) {
  let state = { status: validContext(context) ? 'loading' : 'idle' }, active = true, sequence = 0, request;
  const listeners = new Set();
  const publish = value => { state = value; listeners.forEach(listener => listener()); };
  const current = id => active && sequence === id;
  async function load() {
    if (!validContext(context)) return;
    request?.abort(); request = new AbortController();
    const id = ++sequence; publish({ status: 'loading' });
    try {
      const data = await api('guess/read', { season: context.season, week: context.week }, { signal: request.signal });
      if (current(id)) publish(homeMoneylineProgress(data, context));
    } catch { if (current(id)) publish({ status: 'unavailable', reason: 'read_failed' }); }
  }
  return { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, load,
    activate: () => { active = true; }, dispose: () => { active = false; sequence++; request?.abort(); } };
}
