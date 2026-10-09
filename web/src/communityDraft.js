// Persona audit #3: a recovery copy of unsaved Community picks, private to this browser tab. It is never a saved ballot and is
// never sent anywhere: it lives in sessionStorage under one account, season, week and market, is offered back for 24 hours, and
// is cleared on sign-out or an account change (AuthGate), after a successful save, and after a final sit-out (D-23).
export const COMMUNITY_DRAFT_PREFIX = 'gtl.community-tab-draft.v1.';
export const COMMUNITY_DRAFT_TTL = 24 * 3600_000;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const storage = () => { try { return window.sessionStorage; } catch { return null; } };
const clean = value => (value == null || value === '' ? '' : String(Number(value)));
export function communityDraftScope({ accountId, season, week, mode }) {
  if (typeof accountId !== 'string' || !accountId || !Number.isInteger(season) || !Number.isInteger(week) || !['guess_spread', 'guess_total'].includes(mode)) return null;
  return `${COMMUNITY_DRAFT_PREFIX}${encodeURIComponent(accountId)}.${season}.${week}.${mode}`;
}
export const communityPicksDiffer = (left, right) => Object.keys(right).some(id => clean(left[id]) !== clean(right[id]));
/** How many games the copy changed against the picks that were saved when it was written. */
export const communityDraftEdits = copy => Object.keys(copy.draft).filter(id => clean(copy.draft[id]) !== clean(copy.base[id])).length;
/** The "Load latest" rule of the Picks tab: an edited game keeps the tab's value, an untouched game takes the latest saved value. */
export function mergeCommunityDraft(base, draft, saved) {
  return Object.fromEntries(Object.keys(saved).map(id => [id, clean(draft[id]) !== clean(base[id]) ? (clean(draft[id]) === '' ? '' : Number(draft[id])) : saved[id]]));
}
export function readCommunityDraft(scope, games, store = storage(), now = Date.now()) {
  if (!scope) return null;
  try {
    const value = JSON.parse(store?.getItem(scope) || 'null');
    const ids = games.map(game => game.id).sort();
    const validPicks = picks => record(picks) && JSON.stringify(Object.keys(picks).sort()) === JSON.stringify(ids) && ids.every(id => typeof picks[id] === 'string' && picks[id].length <= 16 && (picks[id] === '' || Number.isFinite(Number(picks[id]))));
    if (!record(value) || value.scope !== scope || value.version !== 1 || !validPicks(value.draft) || !validPicks(value.base) || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    // 24-hour recovery, the predictionDraft rule: an older copy, or one dated in the future, is dropped rather than offered.
    if (now - Date.parse(value.updatedAt) > COMMUNITY_DRAFT_TTL || Date.parse(value.updatedAt) > now + 60_000) { removeCommunityDraft(scope, store); return null; }
    return { draft: value.draft, base: value.base, updatedAt: value.updatedAt };
  } catch { return null; }
}
export function writeCommunityDraft(scope, draft, base, store = storage()) {
  try {
    if (!scope || !store) return false;
    const picks = source => Object.fromEntries(Object.keys(base).map(id => [id, clean(source[id])]));
    store.setItem(scope, JSON.stringify({ version: 1, scope, draft: picks(draft), base: picks(base), updatedAt: new Date().toISOString() }));
    return true;
  } catch { return false; }
}
export function removeCommunityDraft(scope, store = storage()) {
  try { if (scope) store?.removeItem(scope); } catch { /* Disabled storage must not block play. */ }
}
export function clearCommunityDrafts(store = storage()) {
  try {
    for (let index = store.length - 1; index >= 0; index--) {
      const key = store.key(index);
      if (key?.startsWith(COMMUNITY_DRAFT_PREFIX)) store.removeItem(key);
    }
  } catch { /* Best effort when storage is disabled. */ }
}
