// D-69 moments in React: one engine per signed-in account (Shell.jsx keys this by account). Big moments play through
// the existing celebration overlay (`ov.flash`, one card however many arrived) with a win buzz; small ones mark an
// element to pop in place (`data-moment="pop"`, moments.css). Without a provider every hook is a no-op.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createMomentsEngine } from './engine.js';
import { isSettled } from './launch.js';
import { winHaptic } from '../ui/haptics.js';
import { motionReduced } from '../ui/motion.js';
import './moments.css';

const MomentsContext = createContext(null);
const none = () => () => {};

/** The overlay's item from a moment (FlashOverlay reads key, title, meta, parts, icon and rarity). */
export const flashItem = m => ({ key: m.id, title: m.title, meta: m.meta, parts: m.parts, icon: m.icon, rarity: m.rarity });

export function MomentsProvider({ account, showOverlay, children }) {
  const overlay = useRef(showOverlay);
  overlay.current = showOverlay;
  const [popped, setPopped] = useState(() => new Set());
  const engine = useMemo(() => createMomentsEngine({
    account: typeof account === 'string' && account ? account : null,
    isSettled,
    onBig: moments => { winHaptic(undefined, motionReduced()); overlay.current?.('ov.flash', { items: moments.map(flashItem) }); },
    onSmall: m => setPopped(prev => new Set(prev).add(m.id)),
  }), [account]);
  // An account switch or unmount never lets an old engine pop a moment.
  useEffect(() => () => engine.dispose(), [engine]);
  // One `report` per engine, so a caller's effect that depends on it runs only when its read changes.
  const report = useMemo(() => candidates => engine.report(candidates), [engine]);
  const value = useMemo(() => ({ engine, popped, report }), [engine, popped, report]);
  return <MomentsContext.Provider value={value}>{children}</MomentsContext.Provider>;
}

/** `{ report(candidates) }`, or null outside the app (tests, the old app). */
export function useMoments() {
  const ctx = useContext(MomentsContext);
  return ctx ? { report: ctx.report } : null;
}

/** Marks `scope` as showing while the calling card is mounted (a card that holds moments). */
export function useMomentScope(scope) {
  const ctx = useContext(MomentsContext);
  useEffect(() => (ctx ? ctx.engine.open(scope) : undefined), [ctx?.engine, scope]);
}

/** How many moments wait (NEW) for `scope`. */
export function useNewCount(scope) {
  const ctx = useContext(MomentsContext);
  return useSyncExternalStore(ctx ? ctx.engine.subscribe : none, () => (ctx ? ctx.engine.newCount(scope) : 0), () => 0);
}

/** True once the small moment `id` has played: render `data-moment="pop"` on its element. */
export function usePopped(id) {
  const ctx = useContext(MomentsContext);
  return Boolean(ctx?.popped.has(id));
}
