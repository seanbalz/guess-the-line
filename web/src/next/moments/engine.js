// The moments engine (D-69 section 4.2), without React: it remembers what this device showed, holds what waits (NEW),
// knows which cards are open, and plays through the callbacks it is given. MomentsProvider.jsx wraps it.
import { freshMoments, planMoments, SMALL_GAP_MS } from './detect.js';
import { readMomentSeen, writeMomentSeen } from './seen.js';

/**
 * `onBig(moments)` shows one card for every big moment playing together; `onSmall(moment)` pops one small moment.
 * `isSettled()` is the launch guard (launch.js). `storage` defaults to localStorage. `setTimer`, `clearTimer` and `now`
 * are the clock: tests pass their own.
 */
export function createMomentsEngine({
  account, storage, isSettled, onBig, onSmall,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  now = () => Date.now(),
}) {
  let seen = account ? readMomentSeen(account, storage) : null;
  const pending = new Map();
  const scopes = new Map(); // scope -> 'launch' | 'settled': what planMoments reads as open
  const holders = new Map(); // scope -> how many cards hold it open
  const timers = new Set(); // small moments still waiting to pop
  const subscribers = new Set();
  let nextSmallAt = 0; // small moments from every read share one 240 ms spacing
  const notify = () => { for (const fn of [...subscribers]) fn(); };
  const remember = ids => {
    if (!account || !ids.length) return;
    seen = new Set([...(seen ?? []), ...ids]);
    writeMomentSeen(account, [...seen], storage);
  };
  function flush() {
    const plan = planMoments({ pending: [...pending.values()], open: scopes });
    const playing = [...plan.big, ...plan.small];
    if (!playing.length) return;
    for (const m of playing) pending.delete(m.id);
    remember(playing.map(m => m.id));
    if (plan.big.length) onBig(plan.big);
    for (const m of plan.small) {
      const t = now();
      const at = Math.max(t, nextSmallAt);
      nextSmallAt = at + SMALL_GAP_MS;
      let id;
      let fired = false;
      id = setTimer(() => { fired = true; timers.delete(id); onSmall(m); }, at - t);
      if (!fired) timers.add(id);
    }
    notify();
  }
  return {
    /** Every moment a fresh server read shows (rule 1). New ones play where their card is open, or wait as NEW. */
    report(candidates) {
      if (!account) return;
      const first = seen === null;
      const { fresh, seed } = freshMoments(candidates, seen);
      if (first) {
        // The first read on this device seeds the record, even when it is empty, so a reload still knows it.
        seen = new Set(seed);
        writeMomentSeen(account, [...seen], storage);
      } else {
        remember(seed);
      }
      const late = isSettled();
      for (const m of fresh) if (!pending.has(m.id)) pending.set(m.id, { ...m, late });
      flush();
      notify();
    },
    /** A card that holds moments is showing. Returns its close, which is safe to call twice. */
    open(scope) {
      // A scope keeps the state of its first opening until every holder has closed it.
      if ((holders.get(scope) ?? 0) === 0) scopes.set(scope, isSettled() ? 'settled' : 'launch');
      holders.set(scope, (holders.get(scope) ?? 0) + 1);
      flush();
      let closed = false;
      return () => {
        if (closed) return;
        closed = true;
        const left = (holders.get(scope) ?? 1) - 1;
        if (left > 0) { holders.set(scope, left); return; }
        holders.delete(scope);
        scopes.delete(scope);
      };
    },
    /** How many moments wait (NEW) for `scope`. */
    newCount(scope) { return [...pending.values()].filter(m => m.scopes.includes(scope)).length; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    /** Cancels small moments still waiting and drops every listener. */
    dispose() {
      for (const id of timers) clearTimer(id);
      timers.clear();
      subscribers.clear();
    },
  };
}
