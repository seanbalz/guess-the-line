// A recovery copy is confined to this tab. It is never treated as a saved ballot.
export const DRAFT_PREFIX = 'gtl.tab-draft.v1.';
const record = value => value && typeof value === 'object' && !Array.isArray(value);
export const draftFromGames = games => Object.fromEntries(games.map(game => [game.id, game.prediction == null ? '' : String(game.prediction)]));
export const draftScope = (data, accountId) => `${DRAFT_PREFIX}${encodeURIComponent(accountId || data.playerId)}.${data.league.season}.${data.league.week}.${data.mode}`;
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
    if (Date.now() - Date.parse(value.updatedAt) > 24 * 3600_000 || Date.parse(value.updatedAt) > Date.now() + 60000) { store?.removeItem(scope); return null; }
    const ids = games.map(game => game.id);
    if (ids.some(id => typeof value.draft[id] !== 'string' || typeof value.base[id] !== 'string' || value.draft[id].length > 12)) return null;
    if (value.pendingSave != null && !validSaveAttempt(value.pendingSave, ids)) return null;
    return { updatedAt: value.updatedAt, draft: Object.fromEntries(ids.map(id => [id, value.draft[id]])), base: Object.fromEntries(ids.map(id => [id, value.base[id]])), pendingSave: value.pendingSave || null };
  } catch { return null; }
}
export function writeDraft(scope, draft, base, store = storage(), pendingSave = null) {
  return writeRecoveryCopy(scope, { draft, base, pendingSave, updatedAt: new Date().toISOString() }, store);
}
export function writeRecoveryCopy(scope, copy, store = storage()) { try { if (!store) return false; store.setItem(scope, JSON.stringify(copy)); return true; } catch { return false; } }
export const draftHasChanges = copy => !!copy && Object.keys(copy.draft).some(id => copy.draft[id] !== copy.base[id]);
function validSaveAttempt(value, ids) {
  return record(value) && typeof value.submit === 'boolean' && Number.isSafeInteger(value.revision) && value.revision >= 0
    && Number.isFinite(Date.parse(value.serverNow)) && record(value.picks) && Array.isArray(value.changed)
    && Object.entries(value.picks).every(([id, pick]) => ids.includes(id) && typeof pick === 'number' && Number.isFinite(pick))
    && value.changed.every(id => ids.includes(id));
}
// Matching numbers alone are not a save receipt. Require a newer saved revision,
// the requested submission state, and timestamped references for changed guesses.
export function savedAttemptMatches(data, attempt) {
  const revision = data.weeklyRevision ?? data.predictionRevision ?? data.revision;
  if (!validSaveAttempt(attempt, data.games.map(game => game.id)) || !Number.isSafeInteger(revision) || revision <= attempt.revision) return false;
  if (attempt.submit && !data.submittedAt) return false;
  if (!data.games.every(game => (game.prediction ?? null) === (attempt.picks[game.id] ?? null))) return false;
  return !attempt.submit || attempt.changed.every(id => {
    const reference = data.games.find(game => game.id === id)?.scoringReference;
    return ['available', 'captured'].includes(reference?.status) && Number.isFinite(reference.value)
      && Number.isFinite(Date.parse(reference.savedAt)) && Date.parse(reference.savedAt) >= Date.parse(attempt.serverNow)
      && Date.parse(reference.savedAt) <= Date.parse(data.now);
  });
}
export function removeDraft(scope, store = storage()) { try { store?.removeItem(scope); } catch { /* Storage denial does not block play. */ } }
export function clearTabDrafts(store = storage()) {
  try { for (let index = store.length - 1; index >= 0; index--) { const key = store.key(index); if (key?.startsWith(DRAFT_PREFIX)) store.removeItem(key); } } catch { /* Best effort when storage is disabled. */ }
}
