// A recovery copy is confined to this tab. It is never treated as a saved ballot.
export const DRAFT_PREFIX = 'gtl.tab-draft.v1.';
const record = value => value && typeof value === 'object' && !Array.isArray(value);
export const draftFromGames = games => Object.fromEntries(games.map(game => [game.id, game.prediction == null ? '' : String(game.prediction)]));
export const draftScope = data => `${DRAFT_PREFIX}${encodeURIComponent(data.playerId)}.${data.league.season}.${data.league.week}.${data.mode}`;
const storage = () => { try { return window.sessionStorage; } catch { return null; } };
export function mergeDraft(base, local, saved) {
  const draft = {}, conflicts = {};
  for (const [id, value] of Object.entries(saved)) {
    const edited = Object.hasOwn(local, id) && local[id] !== base[id];
    draft[id] = edited ? local[id] : value;
    if (edited && value !== base[id] && value !== local[id]) conflicts[id] = { local: local[id], saved: value };
  }
  return { draft, conflicts };
}
export function readDraft(scope, games, store = storage()) {
  try {
    const value = JSON.parse(store?.getItem(scope) || 'null');
    if (!record(value) || !record(value.draft) || !record(value.base) || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    if (Date.now() - Date.parse(value.updatedAt) > 24 * 3600_000) { store?.removeItem(scope); return null; }
    const ids = games.map(game => game.id);
    if (ids.some(id => typeof value.draft[id] !== 'string' || typeof value.base[id] !== 'string' || value.draft[id].length > 12)) return null;
    return { updatedAt: value.updatedAt, draft: Object.fromEntries(ids.map(id => [id, value.draft[id]])), base: Object.fromEntries(ids.map(id => [id, value.base[id]])) };
  } catch { return null; }
}
export function writeDraft(scope, draft, base, store = storage()) {
  try { if (!store) return false; store.setItem(scope, JSON.stringify({ draft, base, updatedAt: new Date().toISOString() })); return true; } catch { return false; }
}
export function removeDraft(scope, store = storage()) { try { store?.removeItem(scope); } catch { /* Storage denial does not block play. */ } }
export function clearTabDrafts(store = storage()) {
  try { for (let index = store.length - 1; index >= 0; index--) { const key = store.key(index); if (key?.startsWith(DRAFT_PREFIX)) store.removeItem(key); } } catch { /* Best effort when storage is disabled. */ }
}
