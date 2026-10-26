// Leak scan (stage 3 of docs/REDESIGN_BUILD_PLAN.md): a deep scan of any reply, values and object keys, for a line
// value or a hidden Guess pick. The viewer's own entries are exempt: an object whose owner key (userId, actorId, ...)
// is the viewer, and everything under it, until a nested object names another owner. A player's own entries are never
// redacted.
//
// `playerId` and `player` are not owner keys: /state and /export put the viewer's own playerId at the top of a reply
// that also carries every other member's picks, so treating it as an owner would exempt the whole reply. A suite that
// gives the viewer entries in such a reply exempts those paths with `exempt` instead.
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
 * Keep the order stable; append a route in the stage that gates it. Stage 20 added /virtual-units (its line lock; the
 * world needs `virtualUnits: true`); stage 23 added /lines/*; stage 21 added /social/read (real slips, gated from M-04;
 * tests/social-line-lock.test.mjs scans it with slips posted at the stored lines); stage 72 added /me/changes and /me/records
 * (M-27: the owner's own changes, and the older records with every player's Betting Challenge selections after kickoff;
 * tests/me-history-sql.test.mjs scans both on ALL until M-27 is hosted). Not yet here: /league/* (later).
 * /personal/notes (stage 27, M-09) is scanned on ALL in tests/game-notes-sql.test.mjs until M-09 is hosted: it returns
 * only the owner's notes (`ownerId`), and every reader here is checked there to carry no other account's note.
 * /lines/game names the fixture world's first game (server/store.mjs seeds TB-DAL first; tests/lines-sql.test.mjs scans
 * every game).
 * /community/picks (stage 26, M-08) is scanned on ALL in tests/guess-picks-sql.test.mjs until M-08 is hosted (every viewer,
 * both markets, one game and one member, before and after kickoffs); it joined this list on October 19, so this list stays the
 * routes that answer on HOSTED.
 * /community/read's `forfeit` field and /community/history's sat-out entries with locked-in guesses (stage 19, M-03, D-41) are
 * scanned on ALL in tests/guess-forfeit-sql.test.mjs until M-03 is hosted (every viewer, before and after each kickoff, after a
 * skip, a "See picks now" and the old sit-out); both routes are already in this list, so the apply record adds nothing here.
 */
export const READERS = Object.freeze([
  ['/community/read', 'POST', {}],
  ['/community/history', 'POST', {}],
  ['/personal', 'GET'],
  // Stage 27 (M-09): the owner's private game notes, here since M-09 was hosted (October 14, 2026). It returns only the
  // signed-in owner's notes (`ownerId`); tests/game-notes-sql.test.mjs scans every reader here for another account's note.
  ['/personal/notes', 'POST', {}],
  ['/lobby', 'GET'],
  ['/state?mode=guess_spread', 'GET'],
  ['/state?mode=guess_total', 'GET'],
  ['/export', 'GET'],
  ['/virtual-units', 'GET'],
  // Stage 23 (M-06): the gated lines readers.
  ['/lines/read', 'POST', {}],
  ['/lines/game', 'POST', { gameId: 'TB-DAL' }],
  // Stage 21 (M-04): the shared real slips of the current published week, another player's spread and total legs gated.
  ['/social/read', 'POST', {}],
  // D-48: own current-week guesses/card and M-01-gated lines; no new read migration.
  ['/bets/recommendations', 'POST', {}],
  ['/bets/read', 'POST', {}],
  ['/community/picks', 'POST', { mode: 'guess_spread' }],
  // Stage 72 (M-27): Me › History, the owner's own changes and the older records.
  ['/me/changes', 'POST', {}],
  ['/me/records', 'POST', {}],
  // Stage 75 (M-28): Export my data, the owner's own rows only.
  ['/me/export', 'POST', {}],
]);

/**
 * Readers whose RPCs are in a migration the hosted project does not have yet: route → migration file. A suite built on
 * HOSTED skips them and a suite on ALL runs them (readersOn); the apply record removes the entry with the file's
 * NOT_HOSTED line (tests/lines-sql.test.mjs fails while an entry names a hosted file).
 */
export const READER_MIGRATIONS = Object.freeze({
  '/me/changes': '20261026230000_gtl_me_history.sql',
  '/me/records': '20261026230000_gtl_me_history.sql',
  '/me/export': '20261026231000_gtl_me_export.sql',
});
/** The READERS a world built from `migrations` (a list from tests/migrations.mjs) serves. */
export const readersOn = migrations => READERS.filter(([route]) => !Object.hasOwn(READER_MIGRATIONS, route) || migrations.includes(READER_MIGRATIONS[route]));

/**
 * A reader's reply as the scan should read it. A reply is addressed to its viewer, so an owner key at its root names the
 * viewer, not the owner of everything in it: /social/* replies carry `actorId` beside every player's slips and the
 * counts and selection rows built from them, which the scan would otherwise read as the viewer's own. The root's owner
 * keys come off; every entry inside still names its own owner. (Of today's READERS only /social/read has one.)
 */
export const readerReply = reply => (reply !== null && typeof reply === 'object' && !Array.isArray(reply)
  ? Object.fromEntries(Object.entries(reply).filter(([key]) => !OWNER_KEYS.includes(key))) : reply);

const NUMBER = /[+-]?(?:\d+\.\d+|\d+|\.\d+)/g;
// ISO times (observedAt, kickoff, ...) are not lines, but their seconds can read as one: "...:31.500Z" is 31.5.
const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
/** A reply's text with its ISO times blanked, for substring checks that look for a secret number: "…:41.512Z" contains "41.5". */
export const withoutTimes = text => String(text).replace(ISO_TIME, ' ');
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
      if (!own) for (const token of node.replace(ISO_TIME, ' ').match(NUMBER) || []) check(path, Number(token), node);
      return;
    }
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node)) {
      // The nearest owner decides: the viewer's own entry is exempt, but another member's entry nested in it is not.
      const owner = ownerKeys.find(key => Object.hasOwn(node, key) && node[key] !== null && node[key] !== undefined);
      if (owner) own = String(node[owner]) === String(viewer);
    }
    if (Array.isArray(node)) { node.forEach((value, i) => walk(value, pathOf(path, i), own)); return; }
    for (const [key, value] of Object.entries(node)) {
      const at = pathOf(path, key);
      // Keys too: a secret used as a key (a count of picks keyed by "-6.5") leaks as much as one used as a value.
      if (!own && !exempt(at, value)) for (const token of key.replace(ISO_TIME, ' ').match(NUMBER) || []) check(`${at} (key)`, Number(token), key);
      walk(value, at, own);
    }
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
