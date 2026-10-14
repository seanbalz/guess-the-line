// Leak scan (stage 3 of docs/REDESIGN_BUILD_PLAN.md): a deep scan of any reply for a line value or a hidden Guess
// pick. The viewer's own entries are exempt: an object whose owner key (userId, actorId, ...) is the viewer, and
// everything under it, until a nested object names another owner. A player's own entries are never redacted.
//
// Fixtures give every line and every hidden pick an unusual half-point value that nothing else in a reply can equal
// (no count, week, season, timestamp or id is a half-point number). A spread matches with either sign, because the
// other side of the same line is the same secret; a total matches as written.
//
// READERS lists the routes the scan covers. It starts with today's readers that gate picks and lines, and every
// stage that adds or fixes a reader adds its route here (stage 20 /virtual-units, 21 /social/read, 23 /lines/*,
// 26 /community/picks, 62 /league/feed, ...), so the cut-over leak gate (section 10) runs one list.
import assert from 'node:assert/strict';

export const OWNER_KEYS = Object.freeze(['userId', 'actorId', 'ownerId', 'authorId', 'user_id', 'actor_id', 'owner_id', 'author_id']);

/**
 * The reader routes the scan covers, called as the viewer through the cloud handler: [route, method, body].
 * Keep the order stable; append a route in the stage that gates it. Not yet here: /virtual-units (stage 20, its line
 * lock), /social/read with real slips (stage 21), /lines/* (23), /community/picks (26), /league/* and /me/* (later).
 * /personal/notes (stage 27, M-09) is scanned on ALL in tests/game-notes-sql.test.mjs until M-09 is hosted: it returns
 * only the owner's notes (`ownerId`), and every reader here is checked there to carry no other account's note.
 * /community/picks (stage 26, M-08) is scanned on ALL in tests/guess-picks-sql.test.mjs until M-08 is hosted (every viewer,
 * both markets, one game and one member, before and after kickoffs); the apply record moves it here, so this list stays the
 * routes that answer on HOSTED.
 */
export const READERS = Object.freeze([
  ['/community/read', 'POST', {}],
  ['/community/history', 'POST', {}],
  ['/personal', 'GET'],
  ['/lobby', 'GET'],
  ['/state?mode=guess_spread', 'GET'],
  ['/state?mode=guess_total', 'GET'],
  ['/export', 'GET'],
]);

const NUMBER = /[+-]?(?:\d+\.\d+|\d+|\.\d+)/g;
const pathOf = (parent, key) => (typeof key === 'number' ? `${parent}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`);

/**
 * secret: { value, kind: 'line' | 'pick', market: 'spread' | 'total', label }.
 * Returns true when `found` (a number) is that secret: equal, or equal in size for a spread.
 */
function matches(secret, found) {
  if (!Number.isFinite(found)) return false;
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  return secret.market === 'total' ? close(found, secret.value) : close(Math.abs(found), Math.abs(secret.value));
}

/**
 * Deep-scans `reply` and returns every place a secret appears outside the viewer's own entries:
 * [{ path, found, secret }]. `exempt(path, node)` may exempt more (for a reply that is wholly the viewer's own).
 */
export function leakScan(reply, { viewer, secrets, ownerKeys = OWNER_KEYS, exempt = () => false }) {
  if (!Array.isArray(secrets) || secrets.some(s => !Number.isFinite(s?.value))) throw new TypeError('leakScan needs secrets with numeric values.');
  if (secrets.some(s => Number.isInteger(s.value))) throw new TypeError('Give every secret an unusual half-point value; whole numbers collide with counts and dates.');
  const findings = [], seen = new WeakSet();
  const check = (path, found, raw) => {
    for (const secret of secrets) if (matches(secret, found)) findings.push({ path, found: raw, secret });
  };
  const walk = (node, path, own) => {
    if (exempt(path, node)) return;
    if (typeof node === 'number') { if (!own) check(path, node, node); return; }
    if (typeof node === 'string') {
      if (!own) for (const token of node.match(NUMBER) || []) check(path, Number(token), node);
      return;
    }
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) {
      // The nearest owner decides: the viewer's own entry is exempt, but another member's entry nested in it is not.
      const owner = ownerKeys.find(key => Object.hasOwn(node, key) && node[key] !== null && node[key] !== undefined);
      if (owner) own = String(node[owner]) === String(viewer);
    }
    if (Array.isArray(node)) node.forEach((value, i) => walk(value, pathOf(path, i), own));
    else for (const [key, value] of Object.entries(node)) walk(value, pathOf(path, key), own);
  };
  walk(reply, '$', false);
  return findings;
}

/** Fails with every finding listed (route, path, value and which secret) when the reply leaks. */
export function assertNoLeak(reply, options, where = 'reply') {
  const findings = leakScan(reply, options);
  assert.deepEqual(findings.map(f => `${where} ${f.path} = ${JSON.stringify(f.found)} (${f.secret.label || `${f.secret.kind} ${f.secret.value}`})`), [],
    `${where} gives the viewer a line or a hidden pick`);
}

/** Secrets for a pick map { gameId: value } owned by `owner` in `market` ('spread' or 'total'). */
export const pickSecrets = (picks, { market, owner }) => Object.entries(picks).map(([gameId, value]) => ({ value, kind: 'pick', market, owner, label: `${owner} ${market} pick ${gameId}` }));
/** Secrets for line values { gameId: value } in `market`. */
export const lineSecrets = (lines, { market }) => Object.entries(lines).map(([gameId, value]) => ({ value, kind: 'line', market, label: `${market} line ${gameId}` }));
