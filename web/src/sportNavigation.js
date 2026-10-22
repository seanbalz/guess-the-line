import { createContext, useContext, useEffect, useRef } from 'react';
export const noteSportRoute = () => window.dispatchEvent(new Event('gtl:route-accepted'));
/** The NFL/NBA selector for the old app, provided above both apps by main.jsx's sport entry (null while NBA shows). */
export const SportSlotContext = createContext(null);
/** Old-app shells render this after their skip link and header, so the skip link stays the first Tab stop. */
export function SportSlot() { return useContext(SportSlotContext); }
/**
 * Bridge existing draft owners to the authenticated sport router without sharing private data. `dirty` is a boolean,
 * or a ref whose `current` a component sets after its early returns, so the hook itself always runs in the same order.
 */
export function useSportGuard(dirty) {
  const latest = useRef(dirty);
  latest.current = dirty;
  useEffect(() => {
    const guard = event => {
      const value = latest.current;
      const unsaved = value && typeof value === 'object' ? value.current : value;
      if (unsaved && !window.confirm('Leave without saving your changes?')) event.preventDefault();
    };
    window.addEventListener('gtl:sport-leave', guard);
    return () => window.removeEventListener('gtl:sport-leave', guard);
  }, []);
}
