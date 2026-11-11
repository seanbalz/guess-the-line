// D-82 Player Props pilot collection, run by .github/workflows/player-props-collect.yml (never a page view or a public route):
//
//   node scripts/player-props-collect.mjs build     # check the dispatch inputs, build the request file, print the credit cost
//   node scripts/player-props-collect.mjs collect   # re-check the built file, then research intake --collect-quotes (never --publish)
//
// The dispatch inputs arrive as environment variables only: SEASON, WEEK, GAMES, STATS, MAX_CREDITS, ALLOW_ABOVE_SIX and
// DRY_RUN. MAX_CREDITS above 6 is refused unless ALLOW_ABOVE_SIX is 'true'; the builder still caps it at 32. `build` runs
// scripts/player-props-quote-requests.mjs with the research intake's GTL_RESEARCH_SUPABASE_URL / _SERVICE_ROLE_KEY (its one
// read-only GET) and sees only whether the odds key is configured (GTL_PROPS_ODDS_API_KEY_SET). `collect` runs only when
// DRY_RUN is 'false', checks that the request file still matches the inputs and the built credit plan, then calls
// scripts/research-intake.mjs --collect-quotes with GTL_RESEARCH_ODDS_API_KEY added. A real run always spends again: the
// builder mints new request IDs, so a second run is a second reservation.
// The request file (.local/props-pilot-request.json: provider event IDs and roster receipts) never leaves the runner. Each
// step rewrites the summary (.local/player-props-collect.json), the only file the workflow uploads: counts, credits, stat
// keys and reason names. No key, URL, quote, player, provider event ID or game ID is written or printed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROP_CREDIT_REGIONS, PROP_INTAKE_LIMITS, PROP_MAX_CREDITS_CAP, PROP_PILOT_GAME_REASONS, PROP_PILOT_PLAYER_REASONS, PropPilotRefusal,
  propRequestPlan } from '../cloud/player-prop-quote-requests.mjs';
import { validSeason, validWeek } from '../shared/player-props.mjs';
import { run as buildQuoteRequests } from './player-props-quote-requests.mjs';
import { run as researchIntake } from './research-intake.mjs';
import { ignoredLocalFile } from './local-private-file.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const COLLECT_FILES = Object.freeze({ request: '.local/props-pilot-request.json', summary: '.local/player-props-collect.json' });
/** The pilot's credit ceiling unless the dispatch ticks allow_above_six (D-82: about 6 credits a week). */
export const COLLECT_CREDIT_LIMIT = 6;
export const COLLECT_REASONS = Object.freeze(['usage', 'inputs_invalid', 'above_six_not_allowed', 'above_max_credits', 'above_request_limit', 'scope_invalid',
  'credentials_missing', 'odds_key_missing', 'build_refused', 'build_failed', 'dry_run', 'build_missing', 'request_file_mismatch', 'collect_failed',
  'published_unexpectedly', 'unexpected']);
/** Research intake's own storage URL form (no trailing slash), so the builder and the intake accept the same secret. */
const STORAGE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

/** A refusal or failure with a reason name from COLLECT_REASONS. Its message goes to the log, never to the summary. */
export class CollectStop extends Error {
  constructor(reason, message, { failed = false } = {}) { super(message); this.name = 'CollectStop'; this.reason = reason; this.failed = failed; }
}

const nonNegative = n => Number.isSafeInteger(n) && n >= 0;
/** A thrown message is logged only when it cannot carry a URL, JSON fragment or token: a short plain sentence. */
const safeMessage = error => {
  const text = typeof error?.message === 'string' ? error.message : '';
  return /^[A-Z][A-Za-z0-9 ,.:()×'_-]{0,200}$/.test(text) && !/https?|supabase\.co|apikey|bearer/i.test(text) ? text : null;
};

/** The dispatch inputs, checked before anything is read. Throws CollectStop. */
export function collectInputs(env) {
  const number = (value, pattern) => typeof value === 'string' && pattern.test(value.trim()) ? Number(value.trim()) : null;
  const flag = value => value === 'true' ? true : value === 'false' ? false : null;
  const season = number(env.SEASON, /^\d{4}$/), week = number(env.WEEK, /^\d{1,2}$/), games = number(env.GAMES, /^\d{1,2}$/);
  const maxCredits = number(env.MAX_CREDITS, /^\d{1,3}$/), allowAboveSix = flag(env.ALLOW_ABOVE_SIX), dryRun = flag(env.DRY_RUN);
  const stats = typeof env.STATS === 'string' ? env.STATS.split(',').map(key => key.trim()) : [];
  if ([season, week, games, maxCredits, allowAboveSix, dryRun].includes(null) || !validSeason(season) || !validWeek(week)
    || !stats.length || stats.length > 16 || stats.some(key => !/^[a-z0-9_]{1,80}$/.test(key)))
    throw new CollectStop('inputs_invalid', 'Refused: use a four-digit season, a regular-season week, whole numbers for games and max_credits, and comma-separated stat keys.');
  if (maxCredits > COLLECT_CREDIT_LIMIT && !allowAboveSix)
    throw new CollectStop('above_six_not_allowed', `Refused: max_credits ${maxCredits} is above ${COLLECT_CREDIT_LIMIT}. Tick allow_above_six to allow it; the builder still caps it at ${PROP_MAX_CREDITS_CAP}.`);
  let plan;
  try { plan = propRequestPlan({ games, stats, maxCredits }); } catch (error) {
    if (!(error instanceof PropPilotRefusal)) throw new CollectStop('scope_invalid', `Refused: ${error.message}`);
    const requests = games * Math.ceil(stats.length / PROP_INTAKE_LIMITS.marketsPerRequest);
    throw new CollectStop(requests > PROP_INTAKE_LIMITS.requests ? 'above_request_limit' : 'above_max_credits', error.message);
  }
  return { season, week, games, stats: [...plan.stats], maxCredits, allowAboveSix, dryRun, plan };
}

const storageConfigured = env => typeof env.GTL_RESEARCH_SUPABASE_URL === 'string' && STORAGE_URL.test(env.GTL_RESEARCH_SUPABASE_URL)
  && typeof env.GTL_RESEARCH_SERVICE_ROLE_KEY === 'string' && env.GTL_RESEARCH_SERVICE_ROLE_KEY.length > 0;
const STORAGE_MISSING = 'Refused: the repository secrets GTL_PROPS_SUPABASE_URL (the project URL, no path or trailing slash) and GTL_PROPS_SERVICE_ROLE_KEY are required.';
const reasonCounts = (raw, allowed) => Object.fromEntries(allowed.filter(reason => nonNegative(raw?.[reason]) && raw[reason] > 0).map(reason => [reason, raw[reason]]));

/** The builder's summary line, reduced to counts, credits and reason names (it also names games and source digests). */
export function projectBuild(line, inputs) {
  const credits = line?.credits;
  if (line?.job !== 'prop_quote_requests' || line.season !== inputs.season || line.week !== inputs.week || !['ok', 'short'].includes(line.status)
    || !Array.isArray(line.games) || !nonNegative(line.requests) || !nonNegative(line.rosterPlayers) || !nonNegative(credits?.total) || credits.max !== inputs.maxCredits
    || !Array.isArray(credits.perRequest) || credits.perRequest.length !== line.requests || !credits.perRequest.every(nonNegative)
    || credits.perRequest.reduce((sum, n) => sum + n, 0) !== credits.total || credits.total > inputs.maxCredits)
    throw new CollectStop('build_failed', 'The request builder returned an unexpected summary.', { failed: true });
  return {
    build: { status: line.status, games: line.games.length, requests: line.requests, rosterPlayers: line.rosterPlayers,
      excluded: { games: reasonCounts(line.excluded?.games, PROP_PILOT_GAME_REASONS), players: reasonCounts(line.excluded?.players, PROP_PILOT_PLAYER_REASONS) } },
    credits: { planned: credits.total, max: inputs.maxCredits, perRequest: [...credits.perRequest], regions: PROP_CREDIT_REGIONS, reserved: 0 },
  };
}

/**
 * The last check before credits are spent: the built file must be the pilot file for exactly these inputs, and its market
 * count (one credit per market per region, reserved before each request) must equal the plan the build step recorded.
 */
export function verifyRequestFile(input, inputs, planned) {
  const pilot = input?.propPilot, requests = input?.quoteRequests;
  const markets = Array.isArray(requests) ? requests.map(request => request?.markets) : [];
  const credits = markets.every(Array.isArray) ? markets.reduce((sum, list) => sum + list.length, 0) * PROP_CREDIT_REGIONS : NaN;
  const ok = pilot?.season === inputs.season && pilot.week === inputs.week && input.snapshot?.season === inputs.season && input.snapshot?.week === inputs.week
    && pilot.maxCredits === inputs.maxCredits && JSON.stringify(pilot.stats) === JSON.stringify(inputs.stats) && !Object.hasOwn(input, 'publicationId')
    && Array.isArray(requests) && requests.length >= 1 && requests.length <= PROP_INTAKE_LIMITS.requests
    && markets.every(list => Array.isArray(list) && list.length >= 1 && list.length <= PROP_INTAKE_LIMITS.marketsPerRequest && new Set(list).size === list.length && list.every(key => inputs.stats.includes(key)))
    && credits === pilot.credits && credits === planned && credits <= inputs.maxCredits && (inputs.allowAboveSix || credits <= COLLECT_CREDIT_LIMIT);
  if (!ok) throw new CollectStop('request_file_mismatch', 'Refused: the request file does not match the dispatch inputs and the built credit plan. Nothing was collected.');
  return credits;
}

/** Research intake's receipt, reduced to the collection counts. A published receipt is a failure: the pilot never publishes. */
export function projectReceipt(line) {
  let receipt;
  try { receipt = JSON.parse(line); } catch { receipt = null; }
  const c = receipt?.collection;
  if (receipt?.published !== false) throw new CollectStop(receipt?.published === true ? 'published_unexpectedly' : 'collect_failed', 'Research intake returned an unexpected receipt.', { failed: true });
  const keys = ['requests', 'collected', 'unavailable', 'alreadyAttempted', 'reservedCredits', 'quotes'];
  if (!keys.every(key => nonNegative(c?.[key])) || c.collected + c.unavailable + c.alreadyAttempted !== c.requests)
    throw new CollectStop('collect_failed', 'Research intake returned no collection counts.', { failed: true });
  return Object.fromEntries(keys.map(key => [key, c[key]]));
}

function summaryOf({ step, inputs = null, status, reason = null, oddsKeyConfigured = null, build = null, credits = null, collection = null }) {
  return { job: 'prop_collect', version: 1, step, mode: inputs ? (inputs.dryRun ? 'dry_run' : 'collect') : null, status, reason,
    season: inputs?.season ?? null, week: inputs?.week ?? null,
    requested: inputs ? { games: inputs.games, stats: [...inputs.stats], maxCredits: inputs.maxCredits, allowAboveSix: inputs.allowAboveSix } : null,
    oddsKeyConfigured, build, credits, collection };
}

function stepLine(summary) {
  const c = summary.credits;
  if (summary.status === 'built' && summary.mode === 'dry_run')
    return `Dry run: ${summary.build.requests} requests for ${summary.build.games} games would reserve ${c.planned} credits (max ${c.max}). Nothing was collected.`;
  if (summary.status === 'built') return `Built: ${summary.build.requests} requests, ${c.planned} credits planned (max ${c.max}). Collecting next.`;
  if (summary.status === 'collected') {
    const k = summary.collection;
    return `Collected: ${k.requests} requests, ${c.reserved} credits reserved, ${k.collected} collected, ${k.unavailable} unavailable, ${k.alreadyAttempted} already attempted, ${k.quotes} quotes retained.`;
  }
  const spent = c?.reserved === null ? ` At most ${c.reservedAtMost} credits were reserved.` : '';
  return `Stopped (${summary.status}): ${summary.reason}.${spent}`;
}

async function readJson(name, { exists = true } = {}) {
  const target = await ignoredLocalFile(name, { exists });
  return JSON.parse(await fs.readFile(target, 'utf8'));
}

async function buildStep({ env, inputs, files, fetchImpl, clock, newRequestId, build }) {
  // A dry run reports whether the real run would have its odds key, without ever receiving the key.
  const oddsKeyConfigured = env.GTL_PROPS_ODDS_API_KEY_SET === 'true', carried = { oddsKeyConfigured };
  const stop = (reason, message, extra = {}) => Object.assign(new CollectStop(reason, message, extra), { carried });
  if (!storageConfigured(env)) throw stop('credentials_missing', STORAGE_MISSING);
  if (!inputs.dryRun && !oddsKeyConfigured) throw stop('odds_key_missing', 'Refused: the repository secret GTL_PROPS_ODDS_API_KEY is required to collect. Nothing was read.');
  let line = '';
  try {
    await build(['--season', String(inputs.season), '--week', String(inputs.week), '--games', String(inputs.games), '--stats', inputs.stats.join(','),
      '--max-credits', String(inputs.maxCredits), '--output', files.request], { env, fetchImpl, clock, newRequestId, out: text => { line += text; } });
  } catch (error) {
    if (error instanceof PropPilotRefusal) throw stop('build_refused', error.message);
    throw stop('build_failed', safeMessage(error) ?? 'The request file could not be built.', { failed: true });
  }
  let parsed;
  try { parsed = JSON.parse(line); } catch { parsed = null; }
  let projected;
  try { projected = projectBuild(parsed, inputs); } catch (error) { throw Object.assign(error, { carried }); }
  return summaryOf({ step: 'build', inputs, status: 'built', oddsKeyConfigured, ...projected });
}

async function collectStep({ env, inputs, files, fetchImpl, clock, intake }) {
  if (inputs.dryRun) throw new CollectStop('dry_run', 'Refused: dry_run is on, so nothing is collected.');
  let built;
  try { built = await readJson(files.summary); } catch { built = null; }
  if (built?.job !== 'prop_collect' || built.step !== 'build' || built.status !== 'built' || built.mode !== 'collect' || built.season !== inputs.season
    || built.week !== inputs.week || !nonNegative(built.credits?.planned) || built.credits.max !== inputs.maxCredits)
    throw new CollectStop('build_missing', 'Refused: no request file was built for these inputs. Nothing was collected.');
  const carried = { build: built.build, credits: built.credits, oddsKeyConfigured: Boolean(env.GTL_RESEARCH_ODDS_API_KEY) };
  const stop = (reason, message, extra = {}) => Object.assign(new CollectStop(reason, message, extra), { carried });
  if (!storageConfigured(env)) throw stop('credentials_missing', STORAGE_MISSING);
  if (!env.GTL_RESEARCH_ODDS_API_KEY) throw stop('odds_key_missing', 'Refused: the repository secret GTL_PROPS_ODDS_API_KEY is required to collect. Nothing was collected.');
  let request;
  try { request = await readJson(files.request); } catch { request = null; }
  try { verifyRequestFile(request, inputs, built.credits.planned); } catch (error) { throw Object.assign(error, { carried }); }
  // From here a reservation may have been made: a failure reports at most the planned credits as spent.
  const spent = { ...built.credits, reserved: null, reservedAtMost: built.credits.planned };
  let line = '';
  try {
    await intake(['--input', files.request, '--collect-quotes'], { env, fetchImpl, clock, out: text => { line += text; } });
  } catch (error) {
    throw Object.assign(new CollectStop('collect_failed', safeMessage(error) ?? 'Research intake failed. Check source access and configuration.', { failed: true }),
      { carried: { ...carried, credits: spent } });
  }
  let collection;
  try { collection = projectReceipt(line); } catch (error) { throw Object.assign(error, { carried: { ...carried, credits: spent } }); }
  return summaryOf({ step: 'collect', inputs, status: 'collected', ...carried, credits: { ...built.credits, reserved: collection.reservedCredits }, collection });
}

/**
 * One workflow step. Always writes the summary file and returns it; never throws for a refusal or a failure (status
 * 'refused' or 'failed' with a reason name). The CLI exits 1 for either.
 */
export async function run(args = process.argv.slice(2), { env = process.env, fetchImpl = fetch, clock = Date.now, newRequestId = randomUUID, files = COLLECT_FILES,
  build = buildQuoteRequests, intake = researchIntake, out = line => process.stdout.write(line), log = line => process.stderr.write(line) } = {}) {
  const step = args.length === 1 && ['build', 'collect'].includes(args[0]) ? args[0] : null;
  let summary, inputs = null;
  await fs.mkdir(path.join(ROOT, '.local'), { recursive: true });
  try {
    if (!step) throw new CollectStop('usage', 'Use: node scripts/player-props-collect.mjs build|collect');
    inputs = collectInputs(env);
    summary =step === 'build' ? await buildStep({ env, inputs, files, fetchImpl, clock, newRequestId, build }) : await collectStep({ env, inputs, files, fetchImpl, clock, intake });
  } catch (error) {
    const stop = error instanceof CollectStop ? error : new CollectStop('unexpected', 'The collection step failed unexpectedly.', { failed: true });
    const carried = error?.carried ?? {};
    summary = summaryOf({ step: step ?? 'usage', inputs, status: stop.failed ? 'failed' : 'refused', reason: stop.reason, oddsKeyConfigured: carried.oddsKeyConfigured ?? null,
      build: carried.build ?? null, credits: carried.credits ?? null });
    log(`Player Props collection ${summary.status} (${stop.reason}): ${stop.message}\n`);
  }
  await fs.writeFile(await ignoredLocalFile(files.summary, { exists: false }), JSON.stringify(summary, null, 2) + '\n');
  out(JSON.stringify(summary) + '\n');
  if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, `${stepLine(summary)}\n`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(summary => { if (!['built', 'collected'].includes(summary.status)) process.exitCode = 1; },
    () => { process.stderr.write('Player Props collection could not write its summary.\n'); process.exitCode = 1; });
}
