// D-69 moments in React: one engine per signed-in account (Shell.jsx keys this by account). Big moments play through
// the existing celebration overlay (`ov.flash`, one card however many arrived) with a win buzz; small ones mark an
// element to pop in place (`data-moment="pop"`, moments.css). Without a provider, or before its engine exists, every
// hook is a no-op.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createMomentsEngine } from './engine.js';
import { isSettled } from './launch.js';
import { playBig } from './play.js';
import { motionReduced } from '../ui/motion.js';
import './moments.css';

const MomentsContext = createContext(null);
const none = () => () => {};

export { flashItem } from './play.js';

export function MomentsProvider({ account, showOverlay, children }) {
  const overlay = useRef(showOverlay);
  overlay.current = showOverlay;
  const [popped, setPopped] = useState(() => new Set());
  const id = typeof account === 'string' && account ? account : null;
  // The engine is made in an effect, one per account, and disposed by its cleanup: an account switch or unmount never
  // lets an old engine pop a moment, and StrictMode's simulated unmount (development) disposes the first engine while
  // its remount makes a new one, so a disposed engine is never reused. The first render has none: the hooks below wait,
  // and re-run when it arrives (useMomentScope on the engine, a reader's report effect on `report`).
  const [engine, setEngine] = useState(null);
  useEffect(() => {
    const made = createMomentsEngine({
      account: id,
      isSettled,
      onBig: moments => playBig(moments, { showOverlay: overlay.current, reduced: motionReduced() }),
      onSmall: m => setPopped(prev => new Set(prev).add(m.id)),
    });
    setEngine(made);
    return () => made.dispose();
  }, [id]);
  // One `report` per engine, so a caller's effect that depends on it runs only when its read changes or the engine arrives.
  const report = useCallback((candidates, options) => { engine?.report(candidates, options); }, [engine]);
  const api = useMemo(() => ({ report }), [report]);
  const value = useMemo(() => ({ engine, popped, report, api }), [engine, popped, report, api]);
  return <MomentsContext.Provider value={value}>{children}</MomentsContext.Provider>;
}

/** `{ report(candidates, { source }) }`, or null outside the app (tests, the old app). */
export function useMoments() {
  const ctx = useContext(MomentsContext);
  return ctx ? ctx.api : null;
}

/** Marks `scope` as showing while the calling card is mounted (a card that holds moments). */
export function useMomentScope(scope) {
  const ctx = useContext(MomentsContext);
  useEffect(() => (ctx?.engine ? ctx.engine.open(scope) : undefined), [ctx?.engine, scope]);
}

/** How many moments wait (NEW) for `scope`. */
export function useNewCount(scope) {
  const ctx = useContext(MomentsContext);
  const engine = ctx?.engine ?? null;
  return useSyncExternalStore(engine ? engine.subscribe : none, () => (engine ? engine.newCount(scope) : 0), () => 0);
}

/** True once the small moment `id` has played: render `data-moment="pop"` on its element. */
export function usePopped(id) {
  const ctx = useContext(MomentsContext);
  return Boolean(ctx?.popped.has(id));
}
