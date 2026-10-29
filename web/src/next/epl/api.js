import { useCallback, useSyncExternalStore } from 'react';
import { cloudApi } from '../../api.js';
import { knownEplAccess, subscribeEplAccess } from './route.js';

export const EPL_ACTIONS = Object.freeze(['draft/read', 'draft/pick', 'queue/save', 'admin/link', 'admin/week', 'admin/snapshot', 'admin/fixture', 'admin/corrections/read', 'fantasy/read', 'claim', 'guess/read', 'guess/save', 'guess/leaderboard']);
const EPL_READS = Object.freeze(['draft/read', 'fantasy/read', 'admin/corrections/read', 'guess/read', 'guess/leaderboard']);
/** gtl-api's EPL routes: explicit reads use read retries; writes never replay automatically. */
export function eplApi(action, body = {}, options = {}) {
  if (!EPL_ACTIONS.includes(action)) throw new TypeError('Unknown EPL action.');
  return cloudApi(`epl/${action}`, body, { ...options, save: !EPL_READS.includes(action) });
}

/**
 * This account's EPL access from the lobby reply (route.js): null until a lobby reply says, then true or false. No request
 * of its own; the NFL app's lobby read (or SportEntry's one read for a cold #epl link) supplies it.
 */
export function useEplAccess(userId) {
  const get = useCallback(() => knownEplAccess(userId), [userId]);
  return useSyncExternalStore(subscribeEplAccess, get, get);
}
