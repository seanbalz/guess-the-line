import { useEffect } from 'react';
export const noteSportRoute = () => window.dispatchEvent(new Event('gtl:route-accepted'));
/** Bridge existing draft owners to the authenticated sport router without sharing private data. */
export function useSportGuard(dirty) {
  useEffect(() => {
    const guard = event => { if (dirty && !window.confirm('Leave without saving your changes?')) event.preventDefault(); };
    window.addEventListener('gtl:sport-leave', guard);
    return () => window.removeEventListener('gtl:sport-leave', guard);
  }, [dirty]);
}
