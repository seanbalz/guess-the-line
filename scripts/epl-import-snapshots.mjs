// D-66 / plan 2026-10-28-epl-pick-a-team.md Task 9: store the Sleeper season-total snapshots captured outside the app
// (~/gtl-epl-snapshots/<YYYY-MM-DD>-<label>.json, e.g. 2026-10-28-after-mw08.json) through gtl-api's commissioner route
// /epl/admin/snapshot, so the jobs worker can derive MW9 weekly scores and the MW10 pick order. Each file is posted as a
// trimmed payload (trimSnapshot: users, rosters, state, the league's scoring settings, and the stats and projections of
// rostered players only, stats keys only; about 110 KB for the 900 KB after-MW8 file), under its label (the file name
// without the capture date: after-mw08 is the zero-padded label cloud/epl-jobs.mjs snapshotLabels accepts), its
// capturedAt, its matchweek and the per-source sha256 values recorded in the file. Those hashes are of the original Sleeper
// responses at capture: they are recorded, not re-checked here, and a file without any is refused.
//
//   node scripts/epl-import-snapshots.mjs                         # dry run (default): lists labels and hashes, sends nothing
//   GTL_SUPABASE_URL=... GTL_SUPABASE_PUBLISHABLE_KEY=... GTL_SESSION_TOKEN=<commissioner access token> \
//     node scripts/epl-import-snapshots.mjs --apply [--dir <folder>] [--only after-mw08 ...]
//
// The snapshot folder is only read: nothing is written, moved or deleted there. A label already stored is kept as it is
// (gtl_epl_save_snapshot inserts on conflict do nothing, reported as saved:false). Needs M-30 and gtl-api with the EPL
// routes; the route accepts bodies up to EPL_SNAPSHOT_MAX_BYTES (4 MB), so the trimmed body is posted whole.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { checkTarget, postAdmin, targetFromEnv } from './epl-seed-mw09.mjs';
import { EPL_SNAPSHOT_MAX_BYTES } from '../cloud/epl.mjs';

export const FEPL_LEAGUE_ID = '1395122699423993856';
export const DEFAULT_DIR = path.join(os.homedir(), 'gtl-epl-snapshots');
const FILE = /^(?:\d{4}-\d{2}-\d{2}-)?((?:after-mw(\d{1,2}))|(?:before-mw(\d{1,2})-kickoff))\.json$/;
const SHA256 = /^[0-9a-f]{64}$/;
const STATS_KEY = /^(?:stats|projections)_mw\d{1,2}$/;
/** The largest snapshot file read at all (the trimmed body must then fit EPL_SNAPSHOT_MAX_BYTES). */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));

/**
 * What the jobs worker (users, rosters), settle (roster settings) and the Plan 2 fantasy math (starters, players, scoring
 * settings, rostered players' stats and projections) read from a snapshot; everything else is left in the source file.
 */
export function trimSnapshot(snapshot) {
  const out = { ...pick(snapshot, ['capturedAt', 'purpose', 'source', 'leagueId', 'sources']), trimmed: true };
  if (Object.hasOwn(snapshot, 'state')) out.state = snapshot.state;
  if (record(snapshot.league)) out.league = pick(snapshot.league, ['scoring_settings']);
  if (Array.isArray(snapshot.users)) out.users = snapshot.users.filter(record).map(u => pick(u, ['user_id', 'display_name']));
  if (Array.isArray(snapshot.rosters)) out.rosters = snapshot.rosters.filter(record).map(r => pick(r, ['roster_id', 'owner_id', 'starters', 'players', 'settings']));
  const rostered = new Set((out.rosters ?? []).flatMap(r => [...(Array.isArray(r.players) ? r.players : []), ...(Array.isArray(r.starters) ? r.starters : [])]).map(String));
  for (const [key, value] of Object.entries(snapshot)) {
    if (!STATS_KEY.test(key)) continue;
    if (Array.isArray(value)) out[key] = value.filter(e => record(e) && rostered.has(String(e.player_id))).map(e => ({ player_id: e.player_id, stats: e.stats ?? null }));
    else if (record(value)) out[key] = Object.fromEntries(Object.entries(value).filter(([id]) => rostered.has(id)).map(([id, v]) => [id, record(v) && record(v.stats) ? { stats: v.stats } : v]));
  }
  return out;
}

/** `{label, week}` for a snapshot file name, or null for any other file. */
export function snapshotLabel(file) {
  const match = FILE.exec(path.basename(file));
  if (!match) return null;
  const week = Number(match[2] ?? match[3]);
  return week >= 1 && week <= 38 ? { label: match[1], week } : null;
}

/** The snapshot files in a folder, oldest capture first (the date prefix sorts them). */
export function listSnapshotFiles(dir) {
  return fs.readdirSync(dir).filter(name => snapshotLabel(name)).sort().map(name => path.join(dir, name));
}

/** Reads one snapshot file (read-only) and builds the /epl/admin/snapshot body. */
export function buildSnapshotImport(file) {
  const named = snapshotLabel(file);
  if (!named) throw new Error(`${path.basename(file)} is not named <date>-after-mwNN.json or <date>-before-mwNN-kickoff.json.`);
  const bytes = fs.readFileSync(file);
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`${path.basename(file)} is too large to read.`);
  const payload = JSON.parse(bytes.toString('utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`${path.basename(file)} is not a snapshot object.`);
  if (String(payload.leagueId) !== FEPL_LEAGUE_ID) throw new Error(`${path.basename(file)} is not from the FEPL league ${FEPL_LEAGUE_ID}.`);
  const captured = Date.parse(payload.capturedAt);
  if (typeof payload.capturedAt !== 'string' || !Number.isFinite(captured)) throw new Error(`${path.basename(file)} has no valid capturedAt.`);
  const sha256 = {};
  for (const [name, source] of Object.entries(record(payload.sources) ? payload.sources : {})) {
    if (!SHA256.test(source?.sha256 ?? '')) throw new Error(`${path.basename(file)}: sources.${name}.sha256 is not a sha256 hex digest.`);
    sha256[name] = source.sha256;
  }
  // Provenance: a snapshot without the hashes of the Sleeper responses it came from is not imported.
  if (!Object.keys(sha256).length) throw new Error(`${path.basename(file)} has no source sha256 values.`);
  const body = { label: named.label, capturedAt: new Date(captured).toISOString(), week: named.week, sha256, payload: trimSnapshot(payload) };
  const size = Buffer.byteLength(JSON.stringify(body));
  if (size > EPL_SNAPSHOT_MAX_BYTES) throw new Error(`${path.basename(file)} is larger than the admin/snapshot limit even trimmed.`);
  return { file, label: named.label, week: named.week, fileSha256: createHash('sha256').update(bytes).digest('hex'), fileBytes: bytes.length, bytes: size, body };
}

/** Dry run (default) builds every body and sends nothing; --apply posts them in capture order, stopping at a refusal. */
export async function runImport({ dir = DEFAULT_DIR, only = [], url = '', apikey = '', token = '', apply = false, fetchImpl = fetch } = {}) {
  // --only narrows the files by name first, so a file it leaves out is never read or checked.
  const imports = listSnapshotFiles(dir).filter(file => !only.length || only.includes(snapshotLabel(file).label)).map(buildSnapshotImport);
  const summary = item => ({ file: path.basename(item.file), label: item.label, week: item.week, capturedAt: item.body.capturedAt,
    fileBytes: item.fileBytes, bytes: item.bytes, fileSha256: item.fileSha256, sources: Object.keys(item.body.sha256) });
  if (!apply) return { applied: false, items: imports.map(summary) };
  const target = { origin: checkTarget({ url, apikey, token }), apikey, token, fetchImpl };
  const items = [];
  for (const item of imports) {
    const reply = await postAdmin(target, 'epl/admin/snapshot', item.body);
    items.push({ ...summary(item), saved: reply?.saved === true });
  }
  return { applied: true, items };
}

export function parseImportArgs(argv) {
  const out = { apply: false, dir: DEFAULT_DIR, only: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--dir') out.dir = String(argv[++i] ?? '') || fail('--dir needs a folder.');
    else if (arg === '--only') out.only.push(String(argv[++i] ?? '') || fail('--only needs a label.'));
    else fail(`Unknown argument: ${arg}`);
  }
  return out;
}
function fail(message) { throw new Error(message); }

async function main() {
  const result = await runImport({ ...targetFromEnv(), ...parseImportArgs(process.argv.slice(2)) });
  console.log(JSON.stringify(result, null, 2));
  if (!result.applied) console.log('Dry run: nothing was sent. Add --apply to write.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
