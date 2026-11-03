// The moments engine (D-69 section 4.2), without React: it remembers what this device showed, holds what waits (NEW),
// knows which cards are open, and plays through the callbacks it is given. MomentsProvider.jsx wraps it.
import { freshMoments, planMoments, SMALL_GAP_MS } from './detect.js';
import { readMomentSeen, writeMomentSeen } from './seen.js';

/**
 * `onBig(moments)` shows one card for every big moment playing together; `onSmall(moment)` pops one small moment.
 * `isSettled()` is the launch guard (launch.js). `storage` defaults to localStorage.
 */
export function createMomentsEngine({ account, storage, isSettled, onBig, onSmall, setTimer = (fn, ms) => setTimeout(fn, ms) }) {
  let seen = account ? readMomentSeen(account, storage) : null;
  const pending = new Map();
  const open = new Map();
  const subscribers = new Set();
  const notify = () => { for (const fn of [...subscribers]) fn(); };
  const remember = ids => {
    if (!account || !ids.length) return;
    seen = new Set([...(seen ?? []), ...ids]);
    writeMomentSeen(account, [...seen], storage);
  };
  function flush() {
    const plan = planMoments({ pending: [...pending.values()], open });
    const now = [...plan.big, ...plan.small];
    if (!now.length) return;
    for (const m of now) pending.delete(m.id);
    remember(now.map(m => m.id));
    if (plan.big.length) onBig(plan.big);
    plan.small.forEach((m, i) => setTimer(() => onSmall(m), i * SMALL_GAP_MS));
    notify();
  }
  return {
    /** Every moment a fresh server read shows (rule 1). New ones play where their card is open, or wait as NEW. */
    report(candidates) {
      if (!account) return;
      const { fresh, seed } = freshMoments(candidates, seen);
      if (seen === null) seen = new Set();
      remember(seed);
      const late = isSettled();
      for (const m of fresh) if (!pending.has(m.id)) pending.set(m.id, { ...m, late });
      flush();
      notify();
    },
    /** A card that holds moments is showing. Returns its close. */
    open(scope) {
      // A scope keeps the state of its first opening until every holder has closed it.
      if (!open.has(scope)) open.set(scope, isSettled() ? 'settled' : 'launch');
      const count = (open.get(`#${scope}`) ?? 0) + 1;
      open.set(`#${scope}`, count);
      flush();
      return () => {
        const left = (open.get(`#${scope}`) ?? 1) - 1;
        if (left > 0) { open.set(`#${scope}`, left); return; }
        open.delete(`#${scope}`);
        open.delete(scope);
      };
    },
    /** How many moments wait (NEW) for `scope`. */
    newCount(scope) { return [...pending.values()].filter(m => m.scopes.includes(scope)).length; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
  };
}
