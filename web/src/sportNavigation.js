import { useEffect, useRef } from 'react';
export const noteSportRoute = () => window.dispatchEvent(new Event('gtl:route-accepted'));
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
