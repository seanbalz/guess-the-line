// D-65 / plan 2026-10-28-epl-pick-a-team.md Task 9: store the Sleeper season-total snapshots captured outside the app
// (~/gtl-epl-snapshots/<YYYY-MM-DD>-<label>.json, e.g. 2026-10-28-after-mw08.json) through gtl-api's commissioner route
// /epl/admin/snapshot, so the jobs worker can derive MW9 weekly scores and the MW10 pick order. Each file is posted
// unchanged as the payload, under its label (the file name without the capture date: after-mw08 is the zero-padded label
// cloud/epl-jobs.mjs snapshotLabels accepts), its capturedAt, its matchweek and the per-source sha256 values recorded in
// the file. Those hashes are of the original Sleeper responses at capture: they are recorded, not re-checked here.
//
//   node scripts/epl-import-snapshots.mjs                         # dry run (default): lists labels and hashes, sends nothing
//   GTL_SUPABASE_URL=... GTL_SUPABASE_PUBLISHABLE_KEY=... GTL_SESSION_TOKEN=<commissioner access token> \
//     node scripts/epl-import-snapshots.mjs --apply [--dir <folder>] [--only after-mw08 ...]
//
// The snapshot folder is only read: nothing is written, moved or deleted there. A label already stored is kept as it is
// (gtl_epl_save_snapshot inserts on conflict do nothing, reported as saved:false). Needs M-30 and gtl-api with the EPL
// routes; the route accepts bodies up to EPL_SNAPSHOT_MAX_BYTES (4 MB).
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
  if (bytes.length > EPL_SNAPSHOT_MAX_BYTES) throw new Error(`${path.basename(file)} is larger than the admin/snapshot limit.`);
  const payload = JSON.parse(bytes.toString('utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`${path.basename(file)} is not a snapshot object.`);
  if (String(payload.leagueId) !== FEPL_LEAGUE_ID) throw new Error(`${path.basename(file)} is not from the FEPL league ${FEPL_LEAGUE_ID}.`);
  const captured = Date.parse(payload.capturedAt);
  if (typeof payload.capturedAt !== 'string' || !Number.isFinite(captured)) throw new Error(`${path.basename(file)} has no valid capturedAt.`);
  const sha256 = {};
  for (const [name, source] of Object.entries(payload.sources ?? {})) {
    if (!SHA256.test(source?.sha256 ?? '')) throw new Error(`${path.basename(file)}: sources.${name}.sha256 is not a sha256 hex digest.`);
    sha256[name] = source.sha256;
  }
  return {
    file, label: named.label, week: named.week, fileSha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    body: { label: named.label, capturedAt: new Date(captured).toISOString(), week: named.week, sha256, payload },
  };
}

/** Dry run (default) builds every body and sends nothing; --apply posts them in capture order, stopping at a refusal. */
export async function runImport({ dir = DEFAULT_DIR, only = [], url = '', apikey = '', token = '', apply = false, fetchImpl = fetch } = {}) {
  const imports = listSnapshotFiles(dir).map(buildSnapshotImport).filter(item => !only.length || only.includes(item.label));
  const summary = item => ({ file: path.basename(item.file), label: item.label, week: item.week, capturedAt: item.body.capturedAt,
    bytes: item.bytes, fileSha256: item.fileSha256, sources: Object.keys(item.body.sha256) });
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
