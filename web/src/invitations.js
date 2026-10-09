const storageKey = 'gtl.pendingInvitation';
let invitation = '';
try { invitation = sessionStorage.getItem(storageKey) || ''; } catch { /* The current tab can still hold an invitation in memory. */ }

// A fragment never enters the HTTP request or Referer. Remove it from the address
// bar before authentication, and retain only this tab's pending invitation.
const fragment = new URLSearchParams(window.location.hash.slice(1));
if (fragment.has('invite')) {
  const token = fragment.get('invite') || '';
  if (/^[A-Za-z0-9_-]{20,256}$/.test(token)) {
    invitation = token;
    try { sessionStorage.setItem(storageKey, token); } catch { /* In-memory fallback. */ }
  }
  fragment.delete('invite');
  const remainder = fragment.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${remainder ? `#${remainder}` : ''}`);
}

export function pendingInvitation() { return invitation; }
export function clearInvitation() {
  invitation = '';
  try { sessionStorage.removeItem(storageKey); } catch { /* In-memory state is already cleared. */ }
}
