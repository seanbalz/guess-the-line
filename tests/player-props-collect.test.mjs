// D-82 Player Props pilot collection from GitHub Actions (.github/workflows/player-props-collect.yml,
// scripts/player-props-collect.mjs, research intake's collection counts). Contracts:
//   - the workflow is manual, main-only and variable-gated, dry by default, least-privilege, and maps exactly the three
//     GTL_PROPS_* repository secrets onto research intake's GTL_RESEARCH_* names, the odds key into the collect step only;
//   - max_credits is 6 unless allow_above_six is ticked, and the builder's own cap of 32 still holds;
//   - a dry run builds the private request file and reports the credit cost without collecting;
//   - a real run spends exactly the planned credits through research intake's own collector, never publishes, and stops
//     before spending when the request file no longer matches the inputs;
//   - the uploaded summary holds counts, credits, stat keys and reason names only: no key, URL, quote, player, provider
//     event ID or game ID.
// Synthetic fixtures only (tests/helpers/player-prop-quote-fixtures.mjs). Every fetch is a fake: no provider, hosted read
// or credit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { COLLECT_CREDIT_LIMIT, COLLECT_REASONS, CollectStop, collectInputs, run, verifyRequestFile } from '../scripts/player-props-collect.mjs';
import { run as researchIntake } from '../scripts/research-intake.mjs';
import { PROP_MAX_CREDITS_CAP, PROP_PILOT_DEFAULTS, PROP_PILOT_GAME_REASONS } from '../cloud/player-prop-quote-requests.mjs';
import { PROP_STAT_KEYS } from '../shared/player-props.mjs';
import { ENV, NOW, SNAPSHOT_GAMES, fakeNetwork, iso, providerEvent } from './helpers/player-prop-quote-fixtures.mjs';

const INPUTS = Object.freeze({ SEASON: '2026', WEEK: '2', GAMES: '2', STATS: PROP_PILOT_DEFAULTS.stats.join(','), MAX_CREDITS: '6', ALLOW_ABOVE_SIX: 'false', DRY_RUN: 'true' });
const ODDS_KEY = 'odds-key-fixture';
const SECRETS = ['service-key-fixture', ODDS_KEY, 'supabase.co', 'the-odds-api', 'http', 'evt-', 'Fixture', '00-00', 'DAL-PHI', 'LAR-SF', 'lease-'];
let ids = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
const localDir = t => {
  const dir = path.resolve('.local', `props-collect-test-${randomUUID()}`); fs.mkdirSync(dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { request: path.relative(process.cwd(), path.join(dir, 'request.json')), summary: path.relative(process.cwd(), path.join(dir, 'summary.json')) };
};
const reasonOf = env => { try { collectInputs(env); return null; } catch (error) { assert.ok(error instanceof CollectStop, String(error)); return error.reason; } };
const noIntake = () => assert.fail('research intake must not run');
const assertClean = (text, label) => { for (const secret of SECRETS) assert.ok(!text.includes(secret), `${label} leaks ${secret}`); };

/** Research storage RPCs and the odds provider, faked: records reservations, finished fetches and every call. */
function collectNetwork(requestFile, { replay = false } = {}) {
  const input = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
  const byEvent = new Map(input.quoteRequests.map(request => [request.eventId, request]));
  const calls = [], reserved = [], finished = [];
  const fetchImpl = async (target, options = {}) => {
    const url = new URL(String(target));
    calls.push({ host: url.hostname, path: url.pathname, headers: { ...(options.headers ?? {}) }, apiKey: url.searchParams.get('apiKey') });
    if (url.hostname === 'abc.supabase.co' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (url.pathname === '/rest/v1/rpc/gtl_begin_research_quotes') {
        reserved.push(body.p_markets.length);
        return new Response(JSON.stringify(replay ? { replay: true, status: 'finished' } : { replay: false, lease: `lease-${reserved.length}`, expiresAt: iso(NOW + 90_000) }));
      }
      if (url.pathname === '/rest/v1/rpc/gtl_finish_research_quotes') {
        assert.equal(body.p_error, null); finished.push(body.p_quotes.length);
        return new Response(JSON.stringify({ status: 'finished' }));
      }
    }
    if (url.hostname === 'api.the-odds-api.com') {
      const request = byEvent.get(url.pathname.split('/')[5]);
      assert.ok(request, 'only a built event is requested'); assert.equal(url.searchParams.get('markets'), request.markets.join(','));
      return new Response(JSON.stringify(providerEvent(request)), { headers: { 'x-requests-last': String(request.markets.length), 'x-requests-remaining': '400', 'x-requests-used': '100' } });
    }
    assert.fail(`unexpected request ${url.host}${url.pathname}`);
  };
  return { fetchImpl, calls, reserved, finished };
}

async function step(name, { files, env, fetchImpl = fakeNetwork().fetchImpl, intake = noIntake }) {
  const out = [], log = [], stepSummary = path.join(path.dirname(files.summary), `step-${randomUUID()}.md`);
  const summary = await run([name], { env: { ...env, GITHUB_STEP_SUMMARY: stepSummary }, fetchImpl, clock: () => NOW, newRequestId: nextId, files, intake,
    out: line => out.push(line), log: line => log.push(line) });
  assert.equal(out.length, 1, 'one summary line');
  assert.deepEqual(JSON.parse(out[0]), summary, 'the printed line is the summary');
  assert.deepEqual(JSON.parse(fs.readFileSync(files.summary, 'utf8')), summary, 'the summary file is the summary');
  const page = fs.readFileSync(stepSummary, 'utf8');
  assert.equal(page.split('\n').filter(Boolean).length, 1, 'one line on the run page');
  assertClean(out[0] + log.join('') + page, `${name} output`);
  return { summary, log: log.join(''), page };
}

test('inputs: max_credits is 6 unless allow_above_six is ticked, the builder still caps it at 32, and every refusal is named', () => {
  assert.equal(COLLECT_CREDIT_LIMIT, 6); assert.equal(PROP_PILOT_DEFAULTS.maxCredits, COLLECT_CREDIT_LIMIT);
  const inputs = collectInputs(INPUTS);
  assert.deepEqual({ ...inputs, plan: inputs.plan.credits }, { season: 2026, week: 2, games: 2, stats: PROP_PILOT_DEFAULTS.stats, maxCredits: 6, allowAboveSix: false, dryRun: true, plan: 6 });
  assert.equal(collectInputs({ ...INPUTS, DRY_RUN: 'false', STATS: ' player_pass_yds , player_rush_yds,player_reception_yds' }).dryRun, false);
  assert.equal(reasonOf({ ...INPUTS, MAX_CREDITS: '7' }), 'above_six_not_allowed');
  assert.equal(reasonOf({ ...INPUTS, MAX_CREDITS: '22', STATS: PROP_STAT_KEYS.join(',') }), 'above_six_not_allowed', 'a larger scope needs the explicit input first');
  assert.equal(collectInputs({ ...INPUTS, MAX_CREDITS: '22', ALLOW_ABOVE_SIX: 'true', STATS: PROP_STAT_KEYS.join(',') }).plan.credits, 22);
  assert.equal(reasonOf({ ...INPUTS, MAX_CREDITS: String(PROP_MAX_CREDITS_CAP + 1), ALLOW_ABOVE_SIX: 'true' }), 'scope_invalid', 'the builder\'s own cap');
  assert.equal(reasonOf({ ...INPUTS, GAMES: '3' }), 'above_max_credits');
  assert.equal(reasonOf({ ...INPUTS, GAMES: '3', MAX_CREDITS: '32', ALLOW_ABOVE_SIX: 'true', STATS: PROP_STAT_KEYS.join(',') }), 'above_request_limit');
  for (const bad of [{ GAMES: '5' }, { GAMES: '0' }, { STATS: 'player_anytime_td' }, { STATS: 'spreads' }, { STATS: 'player_pass_yds,player_pass_yds' }])
    assert.equal(reasonOf({ ...INPUTS, ...bad }), 'scope_invalid', JSON.stringify(bad));
  for (const bad of [{ SEASON: '26' }, { SEASON: '1999' }, { WEEK: '0' }, { WEEK: '23' }, { GAMES: 'two' }, { MAX_CREDITS: '-1' }, { MAX_CREDITS: '6.5' }, { STATS: '' },
    { STATS: 'player_pass_yds;rm' }, { DRY_RUN: 'yes' }, { DRY_RUN: undefined }, { ALLOW_ABOVE_SIX: '' }, { SEASON: undefined }])
    assert.equal(reasonOf({ ...INPUTS, ...bad }), 'inputs_invalid', JSON.stringify(bad));
});

test('dry run: the real builder writes the private request file, the summary reports the credit cost, nothing is collected', async t => {
  const files = localDir(t), network = fakeNetwork();
  const { summary, page } = await step('build', { files, env: { ...ENV, ...INPUTS, GTL_PROPS_ODDS_API_KEY_SET: 'false' }, fetchImpl: network.fetchImpl });
  assert.equal(page, 'Dry run: 2 requests for 2 games would reserve 6 credits (max 6). Nothing was collected.\n', 'the credit cost is on the run page');
  assert.deepEqual(Object.keys(summary), ['job', 'version', 'step', 'mode', 'status', 'reason', 'season', 'week', 'requested', 'oddsKeyConfigured', 'build', 'credits', 'collection']);
  assert.deepEqual({ ...summary, build: null }, { job: 'prop_collect', version: 1, step: 'build', mode: 'dry_run', status: 'built', reason: null, season: 2026, week: 2,
    requested: { games: 2, stats: PROP_PILOT_DEFAULTS.stats, maxCredits: 6, allowAboveSix: false }, oddsKeyConfigured: false, build: null,
    credits: { planned: 6, max: 6, perRequest: [3, 3], regions: 1, reserved: 0 }, collection: null });
  assert.deepEqual(summary.build, { status: 'ok', games: 2, requests: 2, rosterPlayers: 8,
    excluded: { games: { team_names_mismatch: 1, event_unmatched: 1, kickoff_too_close: 1, kickoff_mismatch: 1, schedule_unmapped: 1 },
      players: { player_id_invalid: 1, roster_conflict: 1, roster_inactive: 1, position_unsupported: 2, name_ambiguous: 1 } } });
  assert.ok(Object.keys(summary.build.excluded.games).every(reason => PROP_PILOT_GAME_REASONS.includes(reason)), 'reason names only');
  assert.ok(network.calls.every(call => call.method === 'GET'), 'the build only reads');
  // The request file holds the provider event IDs and roster receipts; it stays on the runner and is never uploaded.
  const request = JSON.parse(fs.readFileSync(files.request, 'utf8'));
  assert.equal(request.quoteRequests.length, 2); assert.equal(request.propPilot.credits, 6); assert.match(request.quoteRequests[0].eventId, /^evt-/);
  // collect refuses a dry run outright, before reading anything.
  const refused = await step('collect', { files, env: { ...ENV, ...INPUTS, GTL_RESEARCH_ODDS_API_KEY: ODDS_KEY } });
  assert.equal(refused.summary.status, 'refused'); assert.equal(refused.summary.reason, 'dry_run'); assert.equal(refused.summary.collection, null);
});

test('build refuses before any read: missing or malformed storage secrets, a real run without the odds key, and scopes over the cap', async t => {
  const cases = [
    [{ ...INPUTS }, 'credentials_missing'],
    [{ ...ENV, ...INPUTS, GTL_RESEARCH_SUPABASE_URL: 'https://abc.supabase.co/' }, 'credentials_missing'],
    [{ ...ENV, ...INPUTS, GTL_RESEARCH_SERVICE_ROLE_KEY: '' }, 'credentials_missing'],
    [{ ...ENV, ...INPUTS, DRY_RUN: 'false', GTL_PROPS_ODDS_API_KEY_SET: 'false' }, 'odds_key_missing'],
    [{ ...ENV, ...INPUTS, MAX_CREDITS: '7' }, 'above_six_not_allowed'],
    [{ ...ENV, ...INPUTS, GAMES: '3' }, 'above_max_credits'],
  ];
  for (const [env, reason] of cases) {
    const files = localDir(t), network = fakeNetwork();
    const { summary, log } = await step('build', { files, env, fetchImpl: network.fetchImpl });
    assert.equal(summary.status, 'refused'); assert.equal(summary.reason, reason); assert.ok(COLLECT_REASONS.includes(reason));
    assert.equal(network.calls.length, 0, `${reason}: nothing was read`);
    assert.equal(fs.existsSync(files.request), false, `${reason}: no request file`);
    assert.match(log, new RegExp(`refused \\(${reason}\\)`));
    // Inputs are refused before the build step looks at any secret; after that the odds key presence is reported.
    assert.equal(summary.oddsKeyConfigured, reason.startsWith('above_') ? null : false);
  }
  // After the reads: the builder's own refusal and a missing snapshot are named, and still nothing is spent or written.
  for (const [rows, status, reason, message] of [
    [[{ created_at: iso(NOW - 30 * 60_000), games: [SNAPSHOT_GAMES[0]] }], 'refused', 'build_refused', /no game in the core market snapshot can be requested/],
    [[], 'failed', 'build_failed', /No core market snapshot exists for that week/],
  ]) {
    const files = localDir(t), network = fakeNetwork({ snapshotRows: rows });
    const { summary, log } = await step('build', { files, env: { ...ENV, ...INPUTS, GTL_PROPS_ODDS_API_KEY_SET: 'true' }, fetchImpl: network.fetchImpl });
    assert.equal(summary.status, status); assert.equal(summary.reason, reason); assert.equal(summary.oddsKeyConfigured, true); assert.equal(summary.credits, null);
    assert.match(log, message); assert.ok(network.calls.every(call => call.method === 'GET'));
    assert.equal(fs.existsSync(files.request), false, `${reason}: no request file`);
  }
  const files = localDir(t);
  const usage = await run(['spend'], { env: { ...ENV, ...INPUTS }, files, out: () => {}, log: () => {}, fetchImpl: () => assert.fail('no read') });
  assert.equal(usage.reason, 'usage'); assert.equal(usage.status, 'refused');
});

test('collect: the built file runs through research intake\'s own collector, reserving exactly the planned credits, and never publishes', async t => {
  const files = localDir(t), env = { ...ENV, ...INPUTS, DRY_RUN: 'false' };
  const built = await step('build', { files, env: { ...env, GTL_PROPS_ODDS_API_KEY_SET: 'true' } });
  assert.equal(built.summary.mode, 'collect'); assert.equal(built.summary.status, 'built'); assert.equal(built.summary.oddsKeyConfigured, true);
  const network = collectNetwork(files.request);
  const { summary, page } = await step('collect', { files, env: { ...env, GTL_RESEARCH_ODDS_API_KEY: ODDS_KEY }, fetchImpl: network.fetchImpl, intake: researchIntake });
  assert.match(page, /^Collected: 2 requests, 6 credits reserved, 2 collected, 0 unavailable, 0 already attempted, \d+ quotes retained\.\n$/);
  assert.equal(summary.status, 'collected'); assert.equal(summary.step, 'collect'); assert.equal(summary.reason, null);
  assert.deepEqual(network.reserved, [3, 3], 'one reservation per request, one credit per market');
  assert.deepEqual(summary.credits, { planned: 6, max: 6, perRequest: [3, 3], regions: 1, reserved: 6 });
  const quotes = network.finished.reduce((sum, n) => sum + n, 0);
  assert.ok(quotes > 0, 'quotes were retained');
  assert.deepEqual(summary.collection, { requests: 2, collected: 2, unavailable: 0, alreadyAttempted: 0, reservedCredits: 6, quotes });
  assert.deepEqual(summary.build, built.summary.build, 'the build counts carry over');
  assert.deepEqual(network.calls.map(call => call.path.split('/').pop()), ['gtl_begin_research_quotes', 'odds', 'gtl_finish_research_quotes', 'gtl_begin_research_quotes', 'odds', 'gtl_finish_research_quotes'],
    'reserve, fetch, finish per request; no publication');
  for (const call of network.calls) {
    if (call.host === 'api.the-odds-api.com') { assert.equal(call.apiKey, ODDS_KEY); assert.equal(call.headers.apikey, undefined, 'the service key never reaches the provider'); }
    else { assert.equal(call.host, 'abc.supabase.co'); assert.equal(call.headers.apikey, 'service-key-fixture'); assert.equal(call.apiKey, null, 'the odds key never reaches storage'); }
  }
});

test('collect stops before spending when the odds key is missing, the build is missing, or the request file changed; an intake failure reports at most the plan', async t => {
  const files = localDir(t), env = { ...ENV, ...INPUTS, DRY_RUN: 'false' }, collectEnv = { ...env, GTL_RESEARCH_ODDS_API_KEY: ODDS_KEY };
  await step('build', { files, env: { ...env, GTL_PROPS_ODDS_API_KEY_SET: 'true' } });
  const built = fs.readFileSync(files.summary, 'utf8'), original = fs.readFileSync(files.request, 'utf8');
  const restore = () => { fs.writeFileSync(files.summary, built); fs.writeFileSync(files.request, original); };
  const refusedWith = async (reason, stepEnv, intake = noIntake) => {
    const { summary } = await step('collect', { files, env: stepEnv, intake });
    assert.equal(summary.reason, reason); restore();
    return summary;
  };
  const noKey = await refusedWith('odds_key_missing', env);
  assert.equal(noKey.status, 'refused'); assert.equal(noKey.credits.reserved, 0, 'nothing was reserved');
  await refusedWith('build_missing', { ...collectEnv, WEEK: '3' });
  await refusedWith('credentials_missing', { ...collectEnv, GTL_RESEARCH_SUPABASE_URL: '' });
  const tamper = change => { const input = JSON.parse(original); change(input); fs.writeFileSync(files.request, JSON.stringify(input)); };
  for (const change of [
    input => input.quoteRequests[0].markets.push('player_receptions'),
    input => input.quoteRequests[0].markets.push('player_pass_yds'),
    input => { input.propPilot.credits = 5; input.quoteRequests[1].markets.pop(); },
    input => input.quoteRequests.push({ ...input.quoteRequests[0] }),
    input => { input.propPilot.week = 3; input.snapshot.week = 3; },
    input => { input.publicationId = randomUUID(); },
    input => { input.quoteRequests[1].markets = null; },
  ]) {
    tamper(change);
    const summary = await refusedWith('request_file_mismatch', collectEnv);
    assert.equal(summary.credits.reserved, 0, 'nothing was reserved');
  }
  fs.writeFileSync(files.request, '{"quoteRequests":');
  await refusedWith('request_file_mismatch', collectEnv);
  const failed = await refusedWith('collect_failed', collectEnv, async () => { throw new Error('Research storage operation failed.'); });
  assert.equal(failed.status, 'failed'); assert.equal(failed.credits.reserved, null); assert.equal(failed.credits.reservedAtMost, 6);
  const published = await refusedWith('published_unexpectedly', collectEnv, async (args, { out }) => out(JSON.stringify({ published: true }) + '\n'));
  assert.equal(published.status, 'failed');
  // verifyRequestFile alone: the plan recorded by the build step must equal the file's market count.
  assert.throws(() => verifyRequestFile(JSON.parse(original), collectInputs(collectEnv), 5), error => error.reason === 'request_file_mismatch');
  assert.equal(verifyRequestFile(JSON.parse(original), collectInputs(collectEnv), 6), 6);
});

test('research intake: the receipt gains collection counts only with --collect-quotes, and a replay reserves nothing new', async t => {
  const files = localDir(t), env = { ...ENV, ...INPUTS, DRY_RUN: 'false' };
  await step('build', { files, env: { ...env, GTL_PROPS_ODDS_API_KEY_SET: 'true' } });
  const receipt = async (args, network) => {
    let line = '';
    await researchIntake(['--input', files.request, ...args], { env: { ...ENV, GTL_RESEARCH_ODDS_API_KEY: ODDS_KEY }, fetchImpl: network.fetchImpl, clock: () => NOW, out: text => { line += text; } });
    assertClean(line, 'receipt');
    return JSON.parse(line);
  };
  const validation = await receipt([], { fetchImpl: () => assert.fail('validation makes no request') });
  assert.equal(Object.hasOwn(validation, 'collection'), false); assert.equal(validation.published, false);
  const replay = collectNetwork(files.request, { replay: true });
  const replayed = await receipt(['--collect-quotes'], replay);
  assert.deepEqual(replayed.collection, { requests: 2, collected: 0, unavailable: 0, alreadyAttempted: 2, reservedCredits: 0, quotes: 0 });
  assert.ok(replay.calls.every(call => call.host === 'abc.supabase.co'), 'a replay never reaches the provider');
});

test('workflow: manual, main-only, variable-gated and dry by default, with step-scoped secrets and a counts-only artifact', () => {
  const read = name => fs.readFileSync(name, 'utf8'), uncommented = text => text.replace(/^s*#.*$/gm, '');
  const yaml = read('.github/workflows/player-props-collect.yml'), jobs = read('.github/workflows/player-props-jobs.yml');
  assert.doesNotMatch(yaml, /\r/, 'LF only');
  const on = yaml.slice(yaml.indexOf('\non:\n') + 5, yaml.indexOf('\npermissions:'));
  assert.deepEqual(on.match(/^ {2}[a-z_]+:/gm), ['  workflow_dispatch:'], 'no schedule, push or other trigger');
  assert.doesNotMatch(yaml, /^\s+schedule:|cron:/m);
  assert.match(yaml, /^ {4}if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main' && vars\.GTL_PLAYER_PROPS_JOBS == 'on'$/m);
  assert.match(yaml, /^permissions:\n {2}contents: read\n(?! {2}\S)/m, 'read-only token');
  assert.doesNotMatch(yaml, /^ {4,}permissions:/m);
  assert.match(yaml, /persist-credentials: false/);
  // One group with the offers and results jobs: a collection never overlaps them.
  for (const file of [yaml, jobs]) assert.match(file, /^concurrency:\n {2}group: player-props-jobs\n {2}cancel-in-progress: false$/m);
  const input = name => yaml.match(new RegExp(`^ {6}${name}:\\n((?: {8}.+\\n)+)`, 'm'))?.[1] ?? '';
  assert.match(input('games'), /^ {8}default: '2'$/m);
  assert.match(input('stats'), new RegExp(`^ {8}default: ${PROP_PILOT_DEFAULTS.stats.join(',')}$`, 'm'));
  assert.match(input('max_credits'), new RegExp(`^ {8}default: '${COLLECT_CREDIT_LIMIT}'$`, 'm'));
  assert.match(input('allow_above_six'), /^ {8}type: boolean\n {8}default: false$/m);
  assert.match(input('dry_run'), /^ {8}type: boolean\n {8}default: true$/m);
  for (const name of ['season', 'week']) assert.match(input(name), /^ {8}required: true$/m, name);
  // Inputs reach the script through the job's env only, never interpolated into a shell line; the job env holds no secret.
  const jobEnv = yaml.slice(yaml.indexOf('\n    env:\n'), yaml.indexOf('\n    steps:\n'));
  assert.deepEqual([...jobEnv.matchAll(/^ {6}([A-Z_]+): \$\{\{ inputs\.([a-z_]+) \}\}$/gm)].map(m => [m[1], m[2]]),
    [['SEASON', 'season'], ['WEEK', 'week'], ['GAMES', 'games'], ['STATS', 'stats'], ['MAX_CREDITS', 'max_credits'], ['ALLOW_ABOVE_SIX', 'allow_above_six'], ['DRY_RUN', 'dry_run']]);
  assert.doesNotMatch(jobEnv, /secrets\./);
  const script = read('scripts/player-props-collect.mjs');
  for (const name of ['SEASON', 'WEEK', 'GAMES', 'STATS', 'MAX_CREDITS', 'ALLOW_ABOVE_SIX', 'DRY_RUN']) assert.match(script, new RegExp(`env\\.${name}\\b`), name);
  assert.deepEqual(yaml.match(/^ +run: .+$/gm), ['        run: node scripts/player-props-collect.mjs build', '        run: node scripts/player-props-collect.mjs collect']);
  assert.doesNotMatch(yaml, /run: [|>]/, 'no multi-line shell');
  // Exactly these three repository secrets, onto research intake's names; the odds key reaches the collect step only.
  assert.deepEqual([...new Set(yaml.match(/secrets\.[A-Z_]+/g))].sort(), ['secrets.GTL_PROPS_ODDS_API_KEY', 'secrets.GTL_PROPS_SERVICE_ROLE_KEY', 'secrets.GTL_PROPS_SUPABASE_URL']);
  assert.match(yaml, /- name: Build the request file and print the credit cost\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {10}GTL_RESEARCH_SUPABASE_URL: \$\{\{ secrets\.GTL_PROPS_SUPABASE_URL \}\}\n {10}GTL_RESEARCH_SERVICE_ROLE_KEY: \$\{\{ secrets\.GTL_PROPS_SERVICE_ROLE_KEY \}\}\n {10}GTL_PROPS_ODDS_API_KEY_SET: \$\{\{ secrets\.GTL_PROPS_ODDS_API_KEY != '' \}\}\n {8}run: node scripts\/player-props-collect\.mjs build\n/);
  assert.match(yaml, /- name: Collect quotes through research intake\n {8}if: inputs\.dry_run == false\n {8}env:\n {10}GTL_RESEARCH_SUPABASE_URL: \$\{\{ secrets\.GTL_PROPS_SUPABASE_URL \}\}\n {10}GTL_RESEARCH_SERVICE_ROLE_KEY: \$\{\{ secrets\.GTL_PROPS_SERVICE_ROLE_KEY \}\}\n {10}GTL_RESEARCH_ODDS_API_KEY: \$\{\{ secrets\.GTL_PROPS_ODDS_API_KEY \}\}\n {8}run: node scripts\/player-props-collect\.mjs collect\n/);
  assert.equal(yaml.match(/GTL_RESEARCH_ODDS_API_KEY/g).length, 1, 'one step holds the odds key');
  assert.equal(yaml.match(/\$\{\{ secrets\.GTL_PROPS_ODDS_API_KEY \}\}/g).length, 1);
  // The env names are the ones research intake and the builder read.
  const intake = read('scripts/research-intake.mjs'), builder = read('scripts/player-props-quote-requests.mjs');
  for (const name of ['GTL_RESEARCH_SUPABASE_URL', 'GTL_RESEARCH_SERVICE_ROLE_KEY', 'GTL_RESEARCH_ODDS_API_KEY']) assert.match(intake, new RegExp(`env\\.${name}\\b`), name);
  for (const name of ['GTL_RESEARCH_SUPABASE_URL', 'GTL_RESEARCH_SERVICE_ROLE_KEY']) assert.match(builder, new RegExp(`env\\.${name}\\b`), name);
  assert.match(script, /env\.GTL_PROPS_ODDS_API_KEY_SET === 'true'/);
  // The only uploaded file is the counts-only summary; the request file and the intake receipt stay on the runner.
  assert.equal(yaml.match(/uses: actions\/upload-artifact@/g).length, 1);
  assert.deepEqual(yaml.match(/^ +path: .+$/gm), ['          path: .local/player-props-collect.json']);
  assert.match(script, /summary: '\.local\/player-props-collect\.json'/); assert.match(script, /request: '\.local\/props-pilot-request\.json'/);
  // Never publish, never echo; the offers/results workflow and jobs script stay free of the odds key and the collector.
  const code = script.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /--publish|gtl_publish_research_snapshot|console\.log/);
  assert.doesNotMatch(uncommented(yaml), /--publish|echo |set -x/);
  assert.doesNotMatch(uncommented(jobs), /ODDS|research-intake|player-props-collect|GTL_RESEARCH_/);
});
