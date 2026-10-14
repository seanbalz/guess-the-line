// What a member typed into the new app and has not saved yet (redesign build plan stage 11): their name on the name
// step today, later notes, comments and pick drafts. It is a recovery copy, private to this browser tab and never sent
// anywhere: it lives in sessionStorage under one account, so a reload or a fresh sign-in to the same account brings it
// back, and nobody else's account ever reads it. AuthGate clears every copy when the account changes (sign-out, or
// another account signing in), next to the old app's tab drafts, so a second account in this tab sees nothing of the
// first one's. It lives beside communityDraft.js, outside web/src/next/, because AuthGate (in the old app's bundle)
// clears it; the new app's lazy chunk imports it from here.
export const NEXT_DRAFT_PREFIX = 'gtl.next.draft.v1.';
// Long enough for a comment or a note; anything longer is not a draft worth keeping.
export const NEXT_DRAFT_MAX = 2000;
const NAME = /^[a-z][a-z0-9-]{0,40}$/;

const tabStorage = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

/** The storage key for one account's draft `name` ("name-step"), or null for anything that is not one. */
export function nextDraftKey(accountId, name) {
  if (typeof accountId !== 'string' || !accountId || typeof name !== 'string' || !NAME.test(name)) return null;
  return `${NEXT_DRAFT_PREFIX}${encodeURIComponent(accountId)}.${name}`;
}

/** The account's draft `name`, or '' when there is none (or storage is blocked). Never throws. */
export function readNextDraft(accountId, name, store = tabStorage()) {
  const key = nextDraftKey(accountId, name);
  if (!key || !store) return '';
  try {
    const value = JSON.parse(store.getItem(key) || 'null');
    return value && value.v === 1 && typeof value.text === 'string' && value.text.length <= NEXT_DRAFT_MAX ? value.text : '';
  } catch { return ''; }
}

/** Keeps `text` as the account's draft `name`; an empty text removes it. True when it was written. Never throws. */
export function writeNextDraft(accountId, name, text, store = tabStorage()) {
  const key = nextDraftKey(accountId, name);
  if (!key || !store || typeof text !== 'string') return false;
  try {
    if (!text) { store.removeItem(key); return true; }
    if (text.length > NEXT_DRAFT_MAX) return false;
    store.setItem(key, JSON.stringify({ v: 1, text }));
    return true;
  } catch { return false; }
}

export function removeNextDraft(accountId, name, store = tabStorage()) {
  const key = nextDraftKey(accountId, name);
  try { if (key) store?.removeItem(key); } catch { /* Blocked storage holds nothing to remove. */ }
}

/** Removes every account's new-app drafts from this tab (AuthGate, on any account change). Never throws. */
export function clearNextDrafts(store = tabStorage()) {
  try {
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const key = store.key(index);
      if (key?.startsWith(NEXT_DRAFT_PREFIX)) store.removeItem(key);
    }
  } catch { /* Best effort when storage is disabled. */ }
}
