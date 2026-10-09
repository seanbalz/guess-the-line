import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../server/engine.mjs';

const format = 'guess-the-line-local-backup-v1';
const maxBytes = 50 * 1024 * 1024;
const stateKeys = new Set(['version', 'league', 'games', 'ballots', 'bets', 'results', 'history', 'consensusHistory', 'audit', 'archivedCount', 'frozen']);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const requireThat = (test, message) => { if (!test) throw new Error(message); };
// Callers may lower the limit for a constrained environment or a boundary test,
// but cannot bypass the same 50 MiB cap used by the CLI.
function byteLimit(options = {}) {
  const limit = options.maxBytes ?? maxBytes;
  requireThat(Number.isSafeInteger(limit) && limit > 0 && limit <= maxBytes, 'Invalid recovery size limit.');
  return limit;
}
function serializeBounded(value, limit) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  requireThat(Buffer.byteLength(text, 'utf8') <= limit, 'Serialized recovery output exceeds the size limit; no output was written.');
  return text;
}

function rejectCredentials(value) {
  if (Array.isArray(value)) return value.forEach(rejectCredentials);
  if (record(value)) {
    for (const [key, entry] of Object.entries(value)) {
      requireThat(!/password|secret|api.?key|access.?token|refresh.?token|authorization|private.?key|service.?role/i.test(key), 'Credential-shaped field rejected; no backup was written.');
      rejectCredentials(entry);
    }
  } else if (typeof value === 'string') {
    requireThat(!/sb_secret_|-----BEGIN .*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value), 'Credential-shaped value rejected; no backup was written.');
    requireThat(!/https?:\/\/[^\s/@]+:[^\s/@]+@/.test(value), 'Credential-bearing URL rejected; no backup was written.');
  }
}

export function validateLocalState(state) {
  requireThat(record(state) && state.version === 1, 'Only local state version 1 is supported.');
  requireThat(Object.keys(state).every(key => stateKeys.has(key)), 'Unknown local state field; preserve the original before migrating.');
  requireThat(record(state.league) && Array.isArray(state.league.roster) && state.league.roster.length > 0, 'A local league roster is required.');
  requireThat(typeof state.league.id === 'string' && Number.isFinite(Date.parse(state.league.deadline)), 'Invalid local league identity or deadline.');
  requireThat(Array.isArray(state.games) && state.games.length > 0 && Array.isArray(state.history) && Array.isArray(state.audit), 'Invalid local games, history or audit.');
  requireThat(!Object.hasOwn(state, 'consensusHistory') || (Array.isArray(state.consensusHistory)
    && state.consensusHistory.every(row => record(row) && ['guess_spread', 'guess_total'].includes(row.mode) && record(row.games))), 'Invalid local consensus history.');
  for (const key of ['ballots', 'bets', 'results', 'frozen']) requireThat(record(state[key]), 'Invalid local state collection.');
  requireThat(new Set(state.league.roster.map(p => p.id)).size === state.league.roster.length && state.league.roster.every(p => typeof p.id === 'string'), 'Duplicate or invalid player IDs.');
  requireThat(new Set(state.games.map(g => g.id)).size === state.games.length && state.games.every(g => typeof g.id === 'string'), 'Duplicate or invalid game IDs.');
  rejectCredentials(state);
  // Read every permitted projection; no mutation, initialization or live service.
  const engine = createEngine(state);
  for (const player of state.league.roster) for (const mode of ['guess_spread', 'guess_total', 'betting_challenge']) engine.view(player.id, mode);
  return state;
}

function noSymlinkComponents(file) {
  let current = path.parse(path.resolve(file)).root;
  for (const segment of path.resolve(file).slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current)) requireThat(!fs.lstatSync(current).isSymbolicLink(), 'Symbolic links are not accepted in recovery paths.');
  }
}

function readJSON(file, limit = maxBytes) {
  noSymlinkComponents(file);
  const stat = fs.lstatSync(file);
  requireThat(stat.isFile() && stat.size <= limit, 'Recovery input must be a regular JSON file within the recovery size limit.');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('Recovery input is not valid JSON.'); }
}

export function backupLocalState(sourceFile, backupDirectory, clock = Date.now, options = {}) {
  const limit = byteLimit(options);
  const state = validateLocalState(readJSON(sourceFile, limit));
  const createdAt = new Date(clock()).toISOString();
  const payload = { format, createdAt, scope: 'local-owner-state-only', stateSha256: digest(state), state };
  // Check both the envelope and future restored file before creating any output.
  serializeBounded(state, limit);
  const serialized = serializeBounded(payload, limit);
  noSymlinkComponents(backupDirectory);
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  requireThat((fs.statSync(backupDirectory).mode & 0o077) === 0, 'Backup directory must be private (mode 0700).');
  const file = path.join(backupDirectory, `${createdAt.replaceAll(':', '-')}-${randomUUID()}.json`);
  fs.writeFileSync(file, serialized, { flag: 'wx', mode: 0o600 });
  verifyLocalBackup(file, options);
  return { file, createdAt, stateSha256: payload.stateSha256, scope: payload.scope };
}

export function verifyLocalBackup(file, options = {}) {
  const limit = byteLimit(options);
  const backup = readJSON(file, limit);
  requireThat(record(backup) && Object.keys(backup).length === 5 && backup.format === format && backup.scope === 'local-owner-state-only', 'Unsupported backup envelope.');
  requireThat(Number.isFinite(Date.parse(backup.createdAt)), 'Invalid backup timestamp.');
  requireThat(typeof backup.stateSha256 === 'string' && backup.stateSha256 === digest(backup.state), 'Backup integrity check failed.');
  validateLocalState(backup.state);
  serializeBounded(backup.state, limit);
  return backup;
}

export function restoreLocalDrill(backupFile, newDirectory, options = {}) {
  const limit = byteLimit(options);
  const backup = verifyLocalBackup(backupFile, options);
  const serialized = serializeBounded(backup.state, limit);
  noSymlinkComponents(newDirectory);
  requireThat(!fs.existsSync(newDirectory), 'Restore drills require a new directory; existing files are never overwritten.');
  fs.mkdirSync(newDirectory, { mode: 0o700 });
  const file = path.join(newDirectory, 'state.json');
  fs.writeFileSync(file, serialized, { flag: 'wx', mode: 0o600 });
  requireThat(digest(readJSON(file, limit)) === backup.stateSha256, 'Restored state failed readback verification.');
  return { file, stateSha256: backup.stateSha256, scope: backup.scope };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, source, destination, ...extra] = process.argv.slice(2);
    requireThat(!extra.length && source && ((command === 'verify' && !destination) || (['backup', 'restore-drill'].includes(command) && destination)), 'Usage: local-recovery.mjs backup STATE PRIVATE_DIR | verify BACKUP | restore-drill BACKUP NEW_DIR');
    const result = command === 'backup' ? backupLocalState(source, destination) : command === 'restore-drill' ? restoreLocalDrill(source, destination) : (() => { const b = verifyLocalBackup(source); return { verified: true, stateSha256: b.stateSha256, scope: b.scope }; })();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    // Never print payloads, picks, credentials or arbitrary parser excerpts.
    console.error(error instanceof Error && !error.code ? error.message : 'Recovery failed; input/output paths were not usable.');
    process.exitCode = 1;
  }
}
