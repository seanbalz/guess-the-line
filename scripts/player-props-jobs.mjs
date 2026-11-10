// D-82 Player Props jobs, operator/workflow only (never a page view or a public route):
//
//   node scripts/player-props-jobs.mjs offers  --season 2026 --week 10 [--write] [--record-while-dark] [--run-id UUID]
//   node scripts/player-props-jobs.mjs results --season 2026 --week 10 [--write] [--record-while-dark] [--run-id UUID]
//
// Default is a dry run: the hosted state and retained quotes are read, nothing is written. --write writes through the
// service-only gtl_props_* functions; while gtl_prop_capability.live_lock_in is false it also needs --record-while-dark.
// An unapplied schema is a no-op (status schema_unavailable, exit 0). Reuse --run-id to retry a run idempotently.
// Credentials come from the environment only (GTL_PROPS_SUPABASE_URL, GTL_PROPS_SERVICE_ROLE_KEY) and are never logged.
// No odds provider is called and no credit is reserved: offers come only from quotes research intake already retained.
// Output is one counts-only JSON line: no player name, line, price, guess, URL or credential.
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROP_JOB_RPCS, PROP_JOB_TABLES, runPropOffersJob, runPropResultsJob } from '../cloud/player-prop-jobs.mjs';
import { createPropSources } from './player-props-sources.mjs';

const MIB = 1024 * 1024;
class PropJobsError extends Error { constructor(code) { super('Player Props jobs storage request failed.'); this.code = code; } }

async function boundedJson(response, limit) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { await response.body?.cancel(); throw new PropJobsError('TOO_LARGE'); }
  const text = await response.text();
  if (Buffer.byteLength(text) > limit) throw new PropJobsError('TOO_LARGE');
  return JSON.parse(text);
}

/** The service-role adapter: allow-listed RPCs and one read-only table. A missing function is SCHEMA_MISSING. */
export function createPropJobsService({ url, serviceRoleKey, fetchImpl = fetch }) {
  const base = new URL(url ?? 'invalid:');
  if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname) || base.pathname !== '/' || base.search || base.username || base.password || !serviceRoleKey)
    throw new Error('Player Props jobs credentials are not configured.');
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
  const failure = async response => {
    let body = null;
    try { body = await response.json(); } catch { /* No raw storage error escapes. */ }
    if (response.status === 404 && ['PGRST202', 'PGRST205', '42P01'].includes(body?.code)) return new PropJobsError('SCHEMA_MISSING');
    return new PropJobsError(typeof body?.message === 'string' && /^GTL_PROPS_[A-Z_]+$/.test(body.message) ? body.message : 'UNAVAILABLE');
  };
  return {
    async rpc(name, body) {
      if (!PROP_JOB_RPCS.includes(name)) throw new Error('Invalid Player Props jobs operation.');
      const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', redirect: 'error', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw await failure(response);
      return boundedJson(response, 8 * MIB);
    },
    async rows(table, query) {
      if (!PROP_JOB_TABLES.includes(table)) throw new Error('Invalid Player Props jobs read.');
      const target = new URL(`/rest/v1/${table}`, base);
      for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
      const response = await fetchImpl(target, { method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw await failure(response);
      return boundedJson(response, 96 * MIB);
    },
  };
}

export function parseArgs(args) {
  const [job, ...rest] = args;
  if (!['offers', 'results'].includes(job)) throw new Error('Use offers or results.');
  const options = { job, write: false, recordWhileDark: false, runId: null, season: null, week: null };
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (key === '--write') options.write = true;
    else if (key === '--record-while-dark') options.recordWhileDark = true;
    else if (['--season', '--week'].includes(key) && /^\d{1,4}$/.test(rest[i + 1] ?? '')) options[key.slice(2)] = Number(rest[++i]);
    else if (key === '--run-id' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rest[i + 1] ?? '')) options.runId = rest[++i];
    else throw new Error('Use offers|results --season YYYY --week N [--write] [--record-while-dark] [--run-id UUID].');
  }
  if (options.season === null || options.week === null) throw new Error('Choose --season and --week.');
  return options;
}

export async function run(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch, clock = Date.now, out = line => process.stdout.write(line) } = {}) {
  const options = parseArgs(args);
  const service = createPropJobsService({ url: env.GTL_PROPS_SUPABASE_URL, serviceRoleKey: env.GTL_PROPS_SERVICE_ROLE_KEY, fetchImpl });
  const sources = createPropSources({ season: options.season, fetchImpl, env });
  const runner = options.job === 'offers' ? runPropOffersJob : runPropResultsJob;
  const summary = await runner({ service, sources, season: options.season, week: options.week, now: clock(), runId: options.runId ?? randomUUID(),
    write: options.write, recordWhileDark: options.recordWhileDark });
  out(JSON.stringify(summary) + '\n');
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { process.stderr.write(`Player Props job failed: ${error?.message ?? 'unexpected error'}\n`); process.exitCode = 1; });
}
