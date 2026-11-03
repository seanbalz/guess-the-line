// The moments engine (D-69 section 4.2), without React: it remembers what this device showed, holds what waits (NEW),
// knows which cards are open, and plays through the callbacks it is given. MomentsProvider.jsx wraps it.
import { freshMoments, planMoments, SMALL_GAP_MS } from './detect.js';
import { hasNavigated as navigatedSinceLaunch } from './launch.js';
import { readMomentSeen, writeMomentSeen } from './seen.js';

/** The seen record marks each source this device has read once (`source:<source>`) beside the moment ids. */
export const SOURCE_PREFIX = 'source:';
const isMarker = id => id.startsWith(SOURCE_PREFIX);

/**
 * `onBig(moments)` shows one card for every big moment playing together; `onSmall(moment)` pops one small moment.
 * `isSettled()` (launch.js: the member's first press) decides whether a later read plays in place; `hasNavigated()`
 * (launch.js: the end of the launch screen) decides whether a card opening now is a launch card. `storage` defaults to
 * localStorage. `setTimer`, `clearTimer` and `now` are the clock: tests pass their own.
 */
export function createMomentsEngine({
  account, storage, isSettled, hasNavigated = navigatedSinceLaunch, onBig, onSmall,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  now = () => Date.now(),
}) {
  let seen = account ? readMomentSeen(account, storage) : null;
  let disposed = false;
  const pending = new Map(); // id -> the moment, its `late` and its `sources` (every source whose read has it)
  const reported = new Set(); // the sources this engine has had a read from
  const scopes = new Map(); // scope -> 'launch' | 'settled': what planMoments reads as open
  const holders = new Map(); // scope -> how many cards hold it open
  const timers = new Set(); // small moments still waiting to pop
  const subscribers = new Set();
  let nextSmallAt = 0; // small moments from every read share one 240 ms spacing
  const notify = () => { for (const fn of [...subscribers]) fn(); };
  // Markers go last, so the record's cap drops the oldest moment ids and never a marker (a lost one would seed again).
  const save = () => { const ids = [...seen]; writeMomentSeen(account, [...ids.filter(id => !isMarker(id)), ...ids.filter(isMarker)], storage); };
  const remember = ids => {
    if (!account || !ids.length) return;
    seen = new Set([...(seen ?? []), ...ids]);
    save();
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
    /**
     * Every moment a fresh server read of `source` shows (rule 1). New ones play where their card is open, or wait as
     * NEW. A source is one read, such as one league's features.
     */
    report(candidates, { source = 'default' } = {}) {
      if (!account || disposed) return;
      const marker = `${SOURCE_PREFIX}${source}`;
      const first = !reported.has(source);
      reported.add(source);
      // A waiting moment waits for every source whose read has it (a badge reaches every league). Gone from one read,
      // it leaves that source; gone from all of them (a revoked badge), it never plays.
      const ids = new Set((candidates ?? []).map(c => c?.id));
      for (const [id, m] of pending) {
        if (ids.has(id)) m.sources.add(source);
        else if (m.sources.delete(source) && m.sources.size === 0) pending.delete(id);
      }
      if (seen === null || !seen.has(marker)) {
        // This device's first read of the source seeds it, even when empty, so a reload still knows it: nothing waits,
        // and opening a league for the first time here never floods.
        seen = new Set([...(seen ?? []), ...freshMoments(candidates, null).seed, marker]);
        save();
        notify();
        return;
      }
      const { fresh, seed } = freshMoments(candidates, seen);
      remember(seed);
      // The session's first read of a source brings results from while you were away: they wait as NEW, pressed or not.
      // A later read (a refresh, the timer, focus) plays in place once the member is here.
      const late = first ? false : isSettled();
      for (const m of fresh) if (!pending.has(m.id)) pending.set(m.id, { ...m, late, sources: new Set([source]) });
      flush();
      notify();
    },
    /** A card that holds moments is showing. Returns its close, which is safe to call twice. */
    open(scope) {
      if (disposed) return () => {};
      // A scope keeps the state of its first opening until every holder has closed it. A card that opens on the launch
      // screen is a launch card, even after a scroll press.
      if ((holders.get(scope) ?? 0) === 0) scopes.set(scope, hasNavigated() ? 'settled' : 'launch');
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
    /** The moments waiting (NEW) for `scope`, in the order they arrived, as their reader reported them. */
    newMoments(scope) {
      return [...pending.values()].filter(m => m.scopes.includes(scope)).map(({ late, sources, ...moment }) => moment);
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    /** Cancels small moments still waiting and drops every listener; later reports and openings do nothing. */
    dispose() {
      disposed = true;
      for (const id of timers) clearTimer(id);
      timers.clear();
      subscribers.clear();
    },
  };
}
