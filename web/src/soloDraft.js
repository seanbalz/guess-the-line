// Recovery is private to this browser tab. It is not a cloud save or a ballot.
export const SOLO_DRAFT_PREFIX = 'gtl.solo-tab-draft.v1.';
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const storage = () => { try { return window.sessionStorage; } catch { return null; } };
const cleanValue = value => value == null || value === '' ? '' : String(Number(value));
export const soloSavedPicks = (games, ballot) => Object.fromEntries(games.map(game => [game.id, cleanValue(ballot?.picks?.[game.id])]));
export function soloDraftScope({ accountId, season, week, mode }) {
  if (typeof accountId !== 'string' || !accountId || !Number.isInteger(season) || !Number.isInteger(week) || !['guess_spread', 'guess_total'].includes(mode)) return null;
  return `${SOLO_DRAFT_PREFIX}${encodeURIComponent(accountId)}.${season}.${week}.${mode}`;
}
export const soloPicksDiffer = (left, right) => Object.keys(right).some(id => cleanValue(left[id]) !== cleanValue(right[id]));
export function mergeSoloDraft(base, draft, saved) {
  const picks = { ...saved }, conflicts = {};
  for (const id of Object.keys(saved)) {
    if (cleanValue(draft[id]) === cleanValue(base[id])) continue;
    if (cleanValue(saved[id]) !== cleanValue(base[id]) && cleanValue(saved[id]) !== cleanValue(draft[id])) {
      conflicts[id] = { recovered: draft[id], saved: saved[id] };
    } else picks[id] = draft[id];
  }
  return { picks, conflicts };
}
export function readSoloDraft(scope, games, store = storage()) {
  if (!scope) return null;
  try {
    const value = JSON.parse(store?.getItem(scope) || 'null');
    const ids = games.map(game => game.id).sort();
    const validPicks = picks => record(picks) && JSON.stringify(Object.keys(picks).sort()) === JSON.stringify(ids) && ids.every(id => typeof picks[id] === 'string' && picks[id].length <= 16 && (picks[id] === '' || Number.isFinite(Number(picks[id]))));
    if (!record(value) || value.scope !== scope || value.version !== 1 || !validPicks(value.draft) || !validPicks(value.base) || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    // No age-based deletion: an expired ballot's recovery copy is still useful
    // for reading. Only the server deadline controls edit/submission eligibility.
    return { draft: value.draft, base: value.base, updatedAt: value.updatedAt };
  } catch { return null; }
}
export function writeSoloDraft(scope, draft, base, store = storage()) {
  try {
    if (!scope || !store) return false;
    store.setItem(scope, JSON.stringify({ version: 1, scope, draft, base, updatedAt: new Date().toISOString() }));
    return true;
  } catch { return false; }
}
export function removeSoloDraft(scope, store = storage()) {
  try { if (scope) store?.removeItem(scope); } catch { /* Disabled storage must not block play. */ }
}
export function clearSoloDrafts(store = storage()) {
  try {
    for (let index = store.length - 1; index >= 0; index--) {
      const key = store.key(index);
      if (key?.startsWith(SOLO_DRAFT_PREFIX)) store.removeItem(key);
    }
  } catch { /* Best effort when storage is disabled. */ }
}
