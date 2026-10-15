import { nextDraftKey } from '../../nextDrafts.js';

// Keep the original revision and an uncertain request with the text, including an intentionally empty clear.
// This prefix is covered by AuthGate's clearNextDrafts on sign-out/account change; no localStorage or shared cache.
const storage = () => { try { return globalThis.sessionStorage; } catch { return null; } };
export const NOTE_WRITE_MAX = 2000;
export const noteFitsWriteLimit = value => typeof value === 'string' && value.length <= NOTE_WRITE_MAX;
// SQL counts Unicode characters; its existing notes can exceed the API's UTF-16 write limit.
// Read and retain those notes whole. A local shortening draft may still exceed the write limit.
const storedText = value => typeof value === 'string' && value.length <= NOTE_WRITE_MAX * 2 && [...value].length <= NOTE_WRITE_MAX;
// Recovery stays large enough after conflict review adopts a shorter saved base.
const draftText = value => typeof value === 'string' && value.length <= NOTE_WRITE_MAX * 2;
const revision = value => Number.isSafeInteger(value) && value >= 0;
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);
export function gameNoteDraftKey(scope) {
  const root = nextDraftKey(scope.accountId, 'game-note');
  return root && Number.isInteger(scope.season) && Number.isInteger(scope.week) && typeof scope.gameId === 'string' && scope.gameId
    ? `${root}.${scope.season}.${scope.week}.${encodeURIComponent(scope.gameId)}` : null;
}
export function validNoteDraft(value, scope) {
  if (!value || !storedText(value.base?.note) || !draftText(value.text) || !revision(value.base?.revision)) return false;
  const p = value.pending;
  return p == null || uuid(p.requestId) && p.season === scope.season && p.week === scope.week && p.gameId === scope.gameId
    && p.note === value.text && noteFitsWriteLimit(p.note) && p.revision === value.base.revision;
}
export function readGameNoteDraft(scope, store = storage()) {
  const key = gameNoteDraftKey(scope);
  if (!key) return null;
  try { const value = JSON.parse(store?.getItem(key) || 'null'); return value?.v === 1 && validNoteDraft(value, scope) ? value : null; }
  catch { return null; }
}
export function writeGameNoteDraft(scope, value, store = storage()) {
  const key = gameNoteDraftKey(scope);
  if (!key || !store) return false;
  try {
    if (!value || !value.pending && value.text === value.base?.note) { store.removeItem(key); return true; }
    if (!validNoteDraft(value, scope)) return false;
    store.setItem(key, JSON.stringify({ ...value, v: 1 })); return true;
  } catch { return false; }
}
export function gameNoteFromRead(data, scope) {
  if (data?.scope !== 'account_private' || data.ownerId !== scope.accountId || data.season !== scope.season || data.week !== scope.week || !Array.isArray(data.notes)) throw new Error('The saved note could not be verified. Refresh to try again.');
  const row = data.notes.find(note => note.gameId === scope.gameId);
  if (!row) return { note: '', revision: 0 };
  if (!storedText(row.note) || !revision(row.revision)) throw new Error('The saved note could not be verified. Refresh to try again.');
  return { note: row.note, revision: row.revision };
}
export function validNoteReply(data, scope, request) {
  return data?.ownerId === scope.accountId && data.season === scope.season && data.week === scope.week && data.gameId === scope.gameId
    && data.note === request.note && revision(data.revision);
}
