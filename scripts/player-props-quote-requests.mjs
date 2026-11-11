// D-82 Player Props pilot: builds the research-intake input for a bounded prop-quote collection (operator only):
//
//   node scripts/player-props-quote-requests.mjs --season 2026 --week 11 [--games 2 | --game AWAY-HOME ...]
//     [--stats player_pass_yds,player_rush_yds,player_reception_yds] [--max-credits 6] [--output .local/props-pilot.json]
//
// It prints the exact credit cost first and refuses, before reading anything, a scope above --max-credits (default 6:
// 2 games × 3 yardage stats × 1 region). It reads the newest core market snapshot of the week (one read-only GET on
// gtl_market_snapshots with the research intake's own GTL_RESEARCH_SUPABASE_URL / GTL_RESEARCH_SERVICE_ROLE_KEY) and the
// size- and SHA-256-verified nflverse games.csv and roster_weekly_<season>.csv (scripts/player-props-sources.mjs). It
// never calls an odds provider, reserves credits or writes hosted state. With --output it writes the input to a new
// ignored .local file (never over an existing one, whose request IDs may already be spent). Spending stays a separate
// operator step under Sean's word: node scripts/research-intake.mjs --input <file> --collect-quotes (never --publish).
// Output is one JSON line: counts, app game IDs, stat keys, credits and source digests. No player, event ID or key.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROP_PILOT_DEFAULTS, buildPropQuoteRequests, propRequestPlan } from '../cloud/player-prop-quote-requests.mjs';
import { createPropSources } from './player-props-sources.mjs';
import { ignoredLocalFile } from './local-private-file.mjs';

const MIB = 1024 * 1024;
const USAGE = 'Use --season YYYY --week N [--games N | --game AWAY-HOME ...] [--stats key,key] [--max-credits N] [--output .local/file.json].';

/** The one hosted read: the newest core market snapshot's creation time and games, GET only, nothing else. */
export function createMarketSnapshotReader({ url, serviceRoleKey, fetchImpl = fetch }) {
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || !serviceRoleKey) throw new Error('Research storage credentials are not configured.');
  const base = new URL(url);
  return {
    async latest(season, week) {
      const target = new URL('/rest/v1/gtl_market_snapshots', base);
      for (const [key, value] of Object.entries({ select: 'created_at,games:payload->games', season: `eq.${season}`, week: `eq.${week}`, order: 'created_at.desc,id.desc', limit: '1' }))
        target.searchParams.set(key, value);
      const response = await fetchImpl(target, { method: 'GET', redirect: 'error', headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000) });
      if (!response.ok) { await response.body?.cancel?.().catch(() => {}); throw new Error('The core market snapshot could not be read.'); }
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4 * MIB)) { await response.body?.cancel?.().catch(() => {}); throw new Error('The core market snapshot is too large.'); }
      const text = await response.text();
      if (Buffer.byteLength(text) > 4 * MIB) throw new Error('The core market snapshot is too large.');
      let rows;
      try { rows = JSON.parse(text); } catch { throw new Error('The core market snapshot is invalid.'); }
      if (!Array.isArray(rows) || rows.length > 1) throw new Error('The core market snapshot is invalid.');
      if (!rows.length) throw new Error('No core market snapshot exists for that week.');
      return { createdAt: rows[0].created_at, games: rows[0].games };
    },
  };
}

export function parseArgs(args) {
  const options = { season: null, week: null, games: null, only: [], stats: [...PROP_PILOT_DEFAULTS.stats], maxCredits: PROP_PILOT_DEFAULTS.maxCredits, output: null };
  for (let i = 0; i < args.length; i++) {
    const key = args[i], value = args[i + 1] ?? '';
    if (['--season', '--week', '--games', '--max-credits'].includes(key) && /^\d{1,4}$/.test(value)) options[key === '--max-credits' ? 'maxCredits' : key.slice(2)] = Number(value);
    else if (key === '--game' && /^[A-Z]{2,3}-[A-Z]{2,3}$/.test(value)) options.only.push(value);
    else if (key === '--stats' && /^[a-z0-9_]+(,[a-z0-9_]+)*$/.test(value)) options.stats = value.split(',');
    else if (key === '--output' && value && !value.startsWith('--')) options.output = value;
    else throw new Error(USAGE);
    i++;
  }
  if (options.season === null || options.week === null) throw new Error(USAGE);
  if (options.only.length && options.games !== null && options.games !== options.only.length) throw new Error('--games must equal the number of --game picks.');
  options.games = options.only.length || (options.games ?? PROP_PILOT_DEFAULTS.games);
  return options;
}

export async function run(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch, clock = Date.now, newRequestId = randomUUID, out = line => process.stdout.write(line) } = {}) {
  const options = parseArgs(args);
  // The credit cap is checked before any read: a refused scope costs nothing and touches nothing.
  const plan = propRequestPlan({ games: options.games, stats: options.stats, maxCredits: options.maxCredits });
  const target = options.output ? await ignoredLocalFile(options.output, { exists: false }) : null;
  if (target && await fs.stat(target).then(() => true, () => false)) throw new Error('The output file exists. Choose a new name: its request IDs may already be spent.');
  const reader = createMarketSnapshotReader({ url: env.GTL_RESEARCH_SUPABASE_URL, serviceRoleKey: env.GTL_RESEARCH_SERVICE_ROLE_KEY, fetchImpl });
  const snapshot = await reader.latest(options.season, options.week);
  const sources = createPropSources({ season: options.season, fetchImpl, env });
  const [schedule, rosters] = [await sources.read('schedule'), await sources.read('rosters')];
  const { input, summary } = buildPropQuoteRequests({ season: options.season, week: options.week, now: clock(), plan, only: options.only.length ? options.only : null,
    snapshot, schedule, rosters, newRequestId });
  if (target) await fs.writeFile(target, JSON.stringify(input, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const line = { ...summary, written: Boolean(target) };
  out(JSON.stringify(line) + '\n');
  return { ...line, input };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { process.stderr.write(`Player Props quote requests not built: ${error?.message ?? 'unexpected error'}\n`); process.exitCode = 1; });
}
