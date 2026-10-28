import { useEffect, useState } from 'react';
import { cloudApi } from '../../api.js';
import { readEplAccess } from './route.js';

export const EPL_ACTIONS = Object.freeze(['draft/read', 'draft/pick', 'queue/save', 'admin/link', 'admin/week', 'admin/snapshot']);
/** gtl-api's EPL routes (cloud/epl.mjs); everything but the read is a save. */
export function eplApi(action, body = {}, options = {}) {
  if (!EPL_ACTIONS.includes(action)) throw new TypeError('Unknown EPL action.');
  return cloudApi(`epl/${action}`, body, { ...options, save: action !== 'draft/read' });
}

/** True once one `epl/draft/read` shows this account may use EPL (readEplAccess); false until then. */
export function useEplAccess(api = eplApi) {
  const [access, setAccess] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    readEplAccess(api, { signal: controller.signal }).then(value => { if (live) setAccess(value); });
    return () => { live = false; controller.abort(); };
  }, [api]);
  return access;
}
