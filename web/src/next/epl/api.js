import { useEffect, useState } from 'react';
import { cloudApi } from '../../api.js';
import { cachedEplAccess, knownEplAccess } from './route.js';

export const EPL_ACTIONS = Object.freeze(['draft/read', 'draft/pick', 'queue/save', 'admin/link', 'admin/week', 'admin/snapshot', 'admin/fixture']);
/** gtl-api's EPL routes (cloud/epl.mjs); everything but the read is a save. */
export function eplApi(action, body = {}, options = {}) {
  if (!EPL_ACTIONS.includes(action)) throw new TypeError('Unknown EPL action.');
  return cloudApi(`epl/${action}`, body, { ...options, save: action !== 'draft/read' });
}

/**
 * This account's EPL access (readEplAccess): null while the one `epl/draft/read` per signed-in account is out, then true or
 * false. The answer is cached for the page's life (cachedEplAccess) and read again when the account changes.
 */
export function useEplAccess(userId, api = eplApi) {
  const [state, setState] = useState(() => ({ userId, value: knownEplAccess(userId) }));
  useEffect(() => {
    let live = true;
    cachedEplAccess(userId, api).then(value => { if (live) setState({ userId, value }); });
    return () => { live = false; };
  }, [userId, api]);
  return state.userId === userId ? state.value : knownEplAccess(userId);
}
