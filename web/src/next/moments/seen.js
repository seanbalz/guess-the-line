// The moments this device has already shown, per account (D-69 section 4.2, rule 2): ids only, never another player's
// pick or anything the server has not opened. Cleared on sign-out. A device that blocks storage keeps no record, so it
// seeds on every read and never replays.
export const MOMENTS_PREFIX = 'gtl.next.moments.v1.';
export const SEEN_CAP = 1000;

const deviceStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The storage key for one account, or null without one. */
export const momentsKey = account => (typeof account === 'string' && account ? `${MOMENTS_PREFIX}${encodeURIComponent(account)}` : null);

/** The ids this device showed for `account`, or null when it has no record (a first read then seeds it). */
export function readMomentSeen(account, storage = deviceStorage()) {
  const key = momentsKey(account);
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? new Set(ids) : null;
  } catch { return null; }
}

/** Remembers `ids` (the whole record, oldest first), keeping the newest SEEN_CAP. */
export function writeMomentSeen(account, ids, storage = deviceStorage()) {
  const key = momentsKey(account);
  if (!key || !storage) return;
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id))];
  try { storage.setItem(key, JSON.stringify(unique.slice(-SEEN_CAP))); } catch { /* No record: nothing replays, nothing new plays. */ }
}

/** Forgets every account's record (sign-out). Other gtl. keys stay. */
export function clearMomentSeen(storage = deviceStorage()) {
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) { const key = storage.key(i); if (key?.startsWith(MOMENTS_PREFIX)) keys.push(key); }
    for (const key of keys) storage.removeItem(key);
  } catch { /* Storage blocked: there is nothing to clear. */ }
}
