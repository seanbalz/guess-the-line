import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPOSITORY = 'seanbalz/guess-the-lines-repo';
export const PROJECT = 'onmrgvcehkflfaizvedl';
export const ACCOUNT = '83bd659d712e968e7a61efa14107465a';
export const PUSH_REMINDERS = 'gtl-push-reminders';
export const POINTS_JOBS = 'gtl-points-jobs';
export const LEAGUE_FEATURES = 'gtl-league-features';
export const FANTASY_INGEST = 'gtl-fantasy-ingest';
export const RESULTS_REFRESH = 'gtl-results-refresh';
export const EPL_JOBS = 'gtl-epl-jobs';
/**
 * What each target deploys: at most one Edge Function (with its supabase/config.toml settings) and whether Pages is
 * uploaded. createsOnFirstDeploy lets a target's first deploy create its function; every other target updates one.
 */
export const TARGET_DEPLOYS = Object.freeze({
  frontend: Object.freeze({ edgeFunction: null, pages: true }),
  api: Object.freeze({ edgeFunction: 'gtl-api', pages: false }),
  'api-and-frontend': Object.freeze({ edgeFunction: 'gtl-api', pages: true }),
  // Sean, October 26, 2026: "Add it to the release workflow". Only the D-28 reminder worker; never gtl-api or Pages.
  'push-reminders': Object.freeze({ edgeFunction: PUSH_REMINDERS, pages: false }),
  // Sean, October 26, 2026: the Guess the Points jobs worker (D-56 P-03), not hosted yet, so its first deploy creates it.
  'points-jobs': Object.freeze({ edgeFunction: POINTS_JOBS, pages: false, createsOnFirstDeploy: true }),
  // Sean, October 27, 2026: "Add a league-features target to the release workflow". The redesign stage 70 (M-26) badges,
  // awards and streaks worker, not hosted yet, so its first deploy creates it.
  'league-features': Object.freeze({ edgeFunction: LEAGUE_FEATURES, pages: false, createsOnFirstDeploy: true }),
  // October 28, 2026: the D-59 fantasy feed upload worker (docs/FANTASY_FEED_RELEASE.md step 4), not hosted yet, so its
  // first deploy creates it.
  'fantasy-ingest': Object.freeze({ edgeFunction: FANTASY_INGEST, pages: false, createsOnFirstDeploy: true }),
  // M-19 (D-64, proposed): the D-26 finals worker, hosted since October 20, 2026, now also settles shared tickets. It
  // already exists, so a deploy must update it.
  'results-refresh': Object.freeze({ edgeFunction: RESULTS_REFRESH, pages: false }),
  // October 28, 2026: the EPL jobs worker (Pick a Team plan 1, Task 10), not hosted yet, so its first deploy creates it.
  'epl-jobs': Object.freeze({ edgeFunction: EPL_JOBS, pages: false, createsOnFirstDeploy: true }),
});
export const TARGETS = Object.keys(TARGET_DEPLOYS);
const deploys = target => { assert.ok(Object.hasOwn(TARGET_DEPLOYS, target), 'Unknown release target.'); return TARGET_DEPLOYS[target]; };
/** Machine workers deployed with gateway JWT verification off: report key, name and the credential checked instead. */
const ONE_RUN = 'its one-run capability is checked in SQL';
const WORKERS = Object.freeze({
  [PUSH_REMINDERS]: Object.freeze({ key: 'pushReminders', name: 'push reminder worker', auth: ONE_RUN }),
  [POINTS_JOBS]: Object.freeze({ key: 'pointsJobs', name: 'points jobs worker', auth: ONE_RUN }),
  [LEAGUE_FEATURES]: Object.freeze({ key: 'leagueFeatures', name: 'league features worker', auth: ONE_RUN }),
  // D-59: the exporter presents GTL_FANTASY_FEED_UPLOAD_SECRET; until that secret is set the function answers 503.
  [FANTASY_INGEST]: Object.freeze({ key: 'fantasyIngest', name: 'fantasy feed upload worker', auth: 'its upload secret is checked in the function' }),
  [RESULTS_REFRESH]: Object.freeze({ key: 'resultsRefresh', name: 'results refresh worker', auth: ONE_RUN }),
  [EPL_JOBS]: Object.freeze({ key: 'eplJobs', name: 'EPL jobs worker', auth: ONE_RUN }),
});
/** The worker a target deploys, or null for gtl-api and frontend targets. */
const workerFor = scope => {
  if (!scope.edgeFunction || scope.edgeFunction === 'gtl-api') return null;
  assert.ok(Object.hasOwn(WORKERS, scope.edgeFunction), 'Unknown release worker.');
  return { slug: scope.edgeFunction, ...WORKERS[scope.edgeFunction] };
};
export const REQUIRED_CI = {
  'test.yml': ['Typecheck and test'],
  'dashboard-checks.yml': ['dashboard', 'Persona suite'],
  'brand-qa.yml': ['Brand QA'],
};
/** The cloud browser suite's shard jobs. Before they existed, the dashboard job ran that suite itself. */
export const CLOUD_SHARDS = Object.freeze([1, 2, 3, 4].map(shard => `Cloud browser suite (${shard}/4)`));
const SHARD_JOB = 'name: Cloud browser suite (${{ matrix.shard }}/4)';
/** The jobs a release needs from one workflow: every suite job that the release commit's own workflow defines. */
export function requiredJobs(cwd, workflow) {
  const file = path.join(cwd, '.github/workflows', workflow);
  const shards = workflow === 'dashboard-checks.yml' && fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(SHARD_JOB);
  return shards ? [...REQUIRED_CI[workflow], ...CLOUD_SHARDS] : REQUIRED_CI[workflow];
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = message => { throw new Error(message); };

export function validateRequest(env) {
  assert.match(env.RELEASE_SHA || '', /^[a-f0-9]{40}$/, 'Use a full lowercase 40-character source SHA.');
  assert.ok(TARGETS.includes(env.RELEASE_TARGET), 'Choose frontend, api, api-and-frontend, push-reminders, points-jobs, league-features, fantasy-ingest, results-refresh, or epl-jobs.');
  assert.ok(['check-only', 'readiness', 'deploy'].includes(env.RELEASE_MODE), 'Unknown release mode.');
  if (env.GITHUB_ACTIONS === 'true') {
    assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'Releases are manual only.');
    assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Dispatch the workflow from main.');
    assert.equal(env.GITHUB_REPOSITORY, REPOSITORY, 'Unexpected repository.');
  }
  if (env.RELEASE_MODE === 'deploy') {
    const card = new URL(env.RELEASE_CARD || 'https://invalid.invalid');
    assert.equal(card.origin, 'https://github.com', 'A release card in this GitHub repository is required.');
    assert.ok(card.pathname.startsWith(`/${REPOSITORY}/`) && /\/(?:pull|issues|discussions|blob)\//.test(card.pathname), 'Use a release card URL in this repository.');
    assert.match(env.RELEASE_HISTORY_SHA256 || '', /^[a-f0-9]{64}$/, 'Provide the migration-history digest reviewed for this release.');
    assert.equal(env.RELEASE_COMPATIBLE, 'true', 'Confirm compatible API/frontend order and separately approved migration boundaries in the release card.');
  }
}

export function configuration(env, target) {
  const { pages } = deploys(target);
  const needed = ['SUPABASE_PROJECT_REF', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ACCESS_TOKEN'];
  if (pages) needed.push('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_PROJECT', 'CLOUDFLARE_API_TOKEN');
  const missing = needed.filter(name => !env[name]);
  if (missing.length) return { ready: false, missing };
  assert.equal(env.SUPABASE_PROJECT_REF, PROJECT, 'Unexpected Supabase project.');
  assert.equal(env.VITE_SUPABASE_URL, `https://${PROJECT}.supabase.co`, 'Unexpected Supabase URL.');
  assert.ok(/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY), 'Use the public publishable key, never a service key.');
  if (pages) {
    assert.equal(env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, 'Unexpected Cloudflare account.');
    assert.equal(env.CLOUDFLARE_PAGES_PROJECT, 'guess-the-line', 'Unexpected Pages project.');
  }
  return { ready: true, missing: [] };
}

export async function jsonRequest(url, token, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, { ...options, headers: { Accept: 'application/json', ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  // Do not include response bodies or request credentials in logs, including error responses.
  if (!response.ok) fail(`Read-only service request failed (${response.status}).`);
  try { return await response.json(); }
  catch { fail('Read-only service response was not valid JSON.'); }
}

export function successfulRun(runs, jobs, sha, workflow, required = REQUIRED_CI[workflow]) {
  const exact = runs.filter(run => run.head_sha === sha && run.event === 'push' && run.head_branch === 'main'
    && run.path === `.github/workflows/${workflow}` && run.repository?.full_name === REPOSITORY)
    .sort((a, b) => b.id - a.id);
  const latest = exact[0];
  assert.ok(latest && latest.status === 'completed' && latest.conclusion === 'success', `${workflow}: the latest main push run for the exact source SHA must succeed.`);
  for (const name of required) {
    assert.ok(jobs.some(job => job.name === name && job.status === 'completed' && job.conclusion === 'success'), `${workflow}: required job ${name} did not pass.`);
  }
  return { workflow, runId: latest.id, attempt: latest.run_attempt, url: latest.html_url, jobs: required };
}

export async function checkSource(cwd, env, fetchImpl = fetch) {
  validateRequest(env);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), env.RELEASE_SHA, 'Checkout does not match the requested SHA.');
  assert.equal(git(cwd, 'status', '--porcelain'), '', 'Release source must be clean, including untracked files.');
  try { git(cwd, 'merge-base', '--is-ancestor', env.RELEASE_SHA, 'refs/remotes/origin/main'); }
  catch { fail('The source SHA must be reachable from fetched origin/main.'); }
  const config = fs.readFileSync(path.join(cwd, 'supabase/config.toml'), 'utf8');
  const functionConfig = slug => config.split(`[functions.${slug}]`)[1]?.split(/^\[/m)[0] || '';
  assert.match(functionConfig('gtl-api'), /^verify_jwt\s*=\s*true\s*$/m, 'Release source must retain gtl-api JWT verification.');
  // The deploy applies config.toml; a worker's caller presents a machine credential (WORKERS[].auth), not a user JWT.
  const worker = workerFor(deploys(env.RELEASE_TARGET));
  if (worker) {
    assert.match(functionConfig(worker.slug), /^verify_jwt\s*=\s*false\s*$/m, `Release source must keep ${worker.slug} at verify_jwt = false (${worker.auth}).`);
    assert.ok(fs.existsSync(path.join(cwd, 'supabase/functions', worker.slug, 'index.ts')), `Release source has no supabase/functions/${worker.slug}/index.ts.`);
  }
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const checks = [];
  for (const workflow of Object.keys(REQUIRED_CI)) {
    const data = await jsonRequest(`${base}/actions/workflows/${workflow}/runs?head_sha=${env.RELEASE_SHA}&event=push&branch=main&per_page=100`, env.GITHUB_TOKEN, {}, fetchImpl);
    const runs = data.workflow_runs || [];
    const latest = runs.filter(run => run.head_sha === env.RELEASE_SHA && run.event === 'push' && run.head_branch === 'main').sort((a, b) => b.id - a.id)[0];
    assert.ok(latest, `${workflow}: no main push run exists for the exact source SHA.`);
    const jobs = await jsonRequest(`${base}/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs?per_page=100`, env.GITHUB_TOKEN, {}, fetchImpl);
    assert.ok(jobs.total_count <= 100, 'Too many CI jobs to verify in one page; update the verifier.');
    checks.push(successfulRun(runs, jobs.jobs || [], env.RELEASE_SHA, workflow, requiredJobs(cwd, workflow)));
  }
  return { source: env.RELEASE_SHA, workflowSource: env.GITHUB_SHA || null, fetchedMain: git(cwd, 'rev-parse', 'refs/remotes/origin/main'), target: env.RELEASE_TARGET, checks, deployed: false };
}

// SELECT-only, schema-qualified, and no player data. This uses the dedicated read-only endpoint.
export const LIVE_QUERY = `select
  pg_catalog.clock_timestamp() as observed_at,
  (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('version', m.version, 'name', m.name) order by m.version)
    from supabase_migrations.schema_migrations m) as migrations,
  (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('season', s.season, 'week', s.week,
    'deadline', s.signature->'deadline', 'kickoffs',
    (select pg_catalog.jsonb_agg(g.value->'kickoff') from pg_catalog.jsonb_array_elements(s.signature->'games') g)) order by s.season desc,s.week desc)
    from public.gtl_weekly_slates s where (s.season,s.week) in
      (select z.season,z.week from public.gtl_weekly_slates z order by z.season desc,z.week desc limit 2)) as slates`;

export function publishedSchedule(slates, now = new Date()) {
  assert.ok(Array.isArray(slates) && slates.length > 0, 'No published slate available; stop for schedule review.');
  const all = slates.flatMap(slate => {
    assert.ok(Array.isArray(slate.kickoffs) && slate.kickoffs.length > 0, 'Published slate has no kickoff times.');
    const times = slate.kickoffs.map(value => Number(value) * 1000);
    assert.ok(times.every(t => Number.isFinite(t) && t > 0), 'Invalid published kickoff.');
    return times;
  });
  const current = slates[0];
  const latestKickoff = Math.max(...current.kickoffs.map(Number)) * 1000;
  assert.ok(now.getTime() <= latestKickoff + 24 * 3600000, 'Published slate is stale; stop for schedule review.');
  assert.ok(Math.min(...current.kickoffs.map(Number)) * 1000 <= now.getTime() + 8 * 86400000, 'Published slate is too far ahead; stop for schedule review.');
  // Sean permanently removed calendar/game-window release gates on October 19, 2026.
  // Keep published schedule validation as evidence, without blocking active games.
  return { checkedAt: now.toISOString(), timeRestrictions: false, publishedWeek: { season: current.season, week: current.week }, games: all.length };
}

export function migrationDigest(migrations) {
  assert.ok(Array.isArray(migrations) && migrations.length > 0, 'Migration history is unavailable.');
  const rows = migrations.map(({ version, name }) => {
    assert.match(String(version), /^\d{14}$/, 'Unexpected migration history version.');
    assert.equal(typeof name, 'string', 'Unexpected migration history name.');
    return { version: String(version), name };
  }).sort((a, b) => a.version.localeCompare(b.version) || a.name.localeCompare(b.name));
  return hash(JSON.stringify(rows));
}

const supabase = (suffix, env, options, fetchImpl) => jsonRequest(`https://api.supabase.com/v1/projects/${PROJECT}/${suffix}`, env.SUPABASE_ACCESS_TOKEN, options, fetchImpl);
function functionSummary(list) {
  assert.ok(Array.isArray(list), 'Invalid function metadata.');
  return list.map(({ slug, version, status, verify_jwt, ezbr_sha256 }) => ({ slug, version, status, verify_jwt, bundleSha256: ezbr_sha256 || null })).sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

export async function livePreflight(cwd, env, fetchImpl = fetch) {
  const scope = deploys(env.RELEASE_TARGET);
  const config = configuration(env, env.RELEASE_TARGET);
  assert.ok(config.ready, `Missing configuration: ${config.missing.join(', ')}`);
  const rows = await supabase('database/query/read-only', env, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: LIVE_QUERY }) }, fetchImpl);
  assert.ok(Array.isArray(rows) && rows.length === 1, 'Unexpected read-only preflight response.');
  const row = rows[0], observed = new Date(row.observed_at);
  assert.ok(Number.isFinite(observed.getTime()) && Math.abs(Date.now() - observed.getTime()) < 120000, 'Read-only preflight time is stale.');
  const digest = migrationDigest(row.migrations);
  if (env.RELEASE_MODE === 'deploy') assert.equal(digest, env.RELEASE_HISTORY_SHA256, 'Hosted migration history differs from the reviewed release card. Stop and reconcile; never db push.');
  const schedule = publishedSchedule(row.slates, observed);
  const functions = functionSummary(await supabase('functions', env, {}, fetchImpl));
  const api = functions.find(item => item.slug === 'gtl-api');
  assert.ok(api?.status === 'ACTIVE' && api.verify_jwt === true, 'Hosted API must be ACTIVE with JWT verification.');
  const worker = workerFor(scope);
  let workerBefore = null;
  if (worker) {
    const existing = functions.find(item => item.slug === worker.slug);
    if (existing || !scope.createsOnFirstDeploy) {
      // Verification expects exactly one version increment from here. Without createsOnFirstDeploy the worker must exist.
      assert.ok(Number.isInteger(existing?.version), `Hosted ${worker.name} is missing; this workflow updates the existing worker and never creates it.`);
    }
    // Verification checks this record: absent means the deploy must create version 1, present means exactly one version up.
    if (scope.createsOnFirstDeploy) workerBefore = { [`${worker.key}Before`]: { present: Boolean(existing), version: existing?.version ?? null } };
  }
  let previousPages = null;
  if (scope.pages) {
    const result = await jsonRequest(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/guess-the-line`, env.CLOUDFLARE_API_TOKEN, {}, fetchImpl);
    assert.ok(result.success && result.result?.production_branch === 'main', 'Pages production branch must be main.');
    const prior = result.result.canonical_deployment;
    previousPages = prior ? { id: prior.id, source: prior.deployment_trigger?.metadata?.commit_hash || null } : null;
  }
  const { checkCloudBoundary } = await import(pathToFileURL(path.join(cwd, 'scripts/check-cloud-boundary.mjs')));
  const boundary = await checkCloudBoundary({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, fetchImpl, log: () => {} });
  const { NOT_HOSTED } = await import(pathToFileURL(path.join(cwd, 'tests/migrations.mjs')));
  return { source: env.RELEASE_SHA, target: env.RELEASE_TARGET, deployed: false, observedAt: observed.toISOString(), migrationHistorySha256: digest, migrationCount: row.migrations.length, pendingRepoMigrations: NOT_HOSTED, schedule, functions, ...workerBefore, previousPages, boundary };
}

export async function verifyRelease(cwd, env, before, fetchImpl = fetch) {
  const scope = deploys(env.RELEASE_TARGET);
  const after = functionSummary(await supabase('functions', env, {}, fetchImpl));
  const prior = slug => before.functions.find(item => item.slug === slug);
  const api = after.find(item => item.slug === 'gtl-api');
  assert.ok(api?.status === 'ACTIVE' && api.verify_jwt === true, 'Deployed API must be ACTIVE with JWT verification.');
  // gtl-api and the target's own function are checked below; every other function must keep version, status, JWT setting and bundle digest.
  const others = list => list.filter(item => item.slug !== 'gtl-api' && item.slug !== scope.edgeFunction);
  assert.deepEqual(others(after), others(before.functions), 'Another Edge function changed during release; review before continuing.');
  if (scope.edgeFunction === 'gtl-api') {
    assert.equal(api.version, prior('gtl-api').version + 1, 'Expected exactly one API version increment; investigate missing or concurrent deployments.');
    assert.ok(/^[a-f0-9]{64}$/.test(api.bundleSha256 || ''), 'Hosted API bundle digest is missing or malformed.');
  }
  else assert.deepEqual(api, prior('gtl-api'), `API changed during ${env.RELEASE_TARGET}-only release.`);
  const worker = workerFor(scope);
  let workerReport = {};
  if (worker) {
    const deployed = after.find(item => item.slug === worker.slug) || null, previous = prior(worker.slug);
    assert.ok(deployed?.status === 'ACTIVE' && deployed.verify_jwt === false, `Deployed ${worker.name} must be ACTIVE with gateway JWT verification off (${worker.auth}).`);
    let created = false;
    if (scope.createsOnFirstDeploy) {
      // The preflight recorded whether the worker existed; a report from another target or an edited one does not match.
      assert.equal(before[`${worker.key}Before`]?.present, Boolean(previous), `The pre-deploy report does not record whether ${worker.slug} existed; rerun the hosted preflight for this target.`);
      created = !previous;
    }
    if (created) assert.equal(deployed.version, 1, `Expected the first ${worker.name} deploy to create version 1; investigate missing or concurrent deployments.`);
    else {
      assert.ok(Number.isInteger(previous?.version), `The pre-deploy report has no ${worker.name} version.`);
      assert.equal(deployed.version, previous.version + 1, `Expected exactly one ${worker.name} version increment; investigate missing or concurrent deployments.`);
    }
    assert.ok(/^[a-f0-9]{64}$/.test(deployed.bundleSha256 || ''), `Hosted ${worker.name} bundle digest is missing or malformed.`);
    workerReport = { [worker.key]: deployed, ...(scope.createsOnFirstDeploy ? { [`${worker.key}Created`]: created } : {}), [`${worker.key}SourceVerified`]: false,
      [`${worker.key}SourceLimitation`]: 'The worker was deployed from the clean requested checkout and its remote bundle digest is recorded, but remote worker bytes have not been independently matched to that checkout. The frontend was neither deployed nor checked.' };
  }
  const rows = await supabase('database/query/read-only', env, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: LIVE_QUERY }) }, fetchImpl);
  assert.equal(migrationDigest(rows[0]?.migrations), before.migrationHistorySha256, 'Migration history changed during release.');
  const { checkCloudBoundary } = await import(pathToFileURL(path.join(cwd, 'scripts/check-cloud-boundary.mjs')));
  const boundary = await checkCloudBoundary({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, fetchImpl, log: () => {} });
  let pages = null;
  if (scope.pages) {
    const result = await jsonRequest(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/guess-the-line/deployments?env=production`, env.CLOUDFLARE_API_TOKEN, {}, fetchImpl);
    assert.ok(result.success, 'Could not inspect Pages deployment.');
    const deployment = result.result.find(item => item.deployment_trigger?.metadata?.commit_hash === env.RELEASE_SHA
      && Date.parse(item.created_on) >= Date.parse(before.observedAt) && item.latest_stage?.status === 'success');
    assert.ok(deployment, 'No successful Pages deployment matches this source and release window.');
    assert.match(deployment.url, /^https:\/\/[a-f0-9]+\.guess-the-line\.pages\.dev$/, 'Unexpected immutable Pages URL.');
    const manifest = JSON.parse(fs.readFileSync(path.join(cwd, '.local/release-manifest.json'), 'utf8'));
    assert.equal(manifest.gitHead, env.RELEASE_SHA, 'Manifest source mismatch.');
    assert.equal(manifest.dirtyWorkingTree, false, 'Manifest source was dirty.');
    const served = manifest.artifacts.filter(file => !['_headers', '_redirects'].includes(file.path));
    for (const base of [deployment.url, 'https://guess-the-line.pages.dev']) {
      for (const file of served) {
        // Pages canonicalizes HTML routes; request the canonical path while rejecting redirects.
        const servedPath = file.path.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
        const response = await fetchImpl(`${base}/${servedPath}?release=${env.RELEASE_SHA}`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
        assert.ok(response.ok, 'Served asset request failed.');
        assert.equal(hash(Buffer.from(await response.arrayBuffer())), file.sha256, 'Served frontend differs from release manifest.');
      }
    }
    pages = { id: deployment.id, url: deployment.url, productionUrl: 'https://guess-the-line.pages.dev', checkedAssetsPerUrl: served.length, frontendSha256: manifest.frontendSha256 };
  }
  return { requestedSource: env.RELEASE_SHA, target: env.RELEASE_TARGET, checkedAt: new Date().toISOString(), api, pages, boundary,
    ...workerReport,
    apiDeploymentMetadataVerified: true, apiSourceVerified: false, apiBundleMatchesCheckout: 'not-independently-verified',
    apiSourceLimitation: 'The deploy command uses the clean requested checkout. The remote bundle digest is recorded, but remote API bytes have not been independently matched to that checkout. API source acceptance remains a manual release-record gate.',
    migrationHistorySha256: before.migrationHistorySha256, pendingRepoMigrations: before.pendingRepoMigrations,
    limitation: 'Signed-out boundaries and deployment metadata/assets only; real-phone and signed-in acceptance remain separate. No migrations applied.' };
}

export async function main(args, env = process.env) {
  const [command, ...rest] = args;
  if (!command || command === '--help') {
    console.log('Usage: node scripts/release-preflight.mjs <source|configuration|live|verify> [--source DIR] [--out FILE] [--before FILE]\nInputs: RELEASE_SHA (full SHA), RELEASE_TARGET (frontend|api|api-and-frontend|push-reminders|points-jobs|league-features|fantasy-ingest|results-refresh|epl-jobs), RELEASE_MODE (check-only|readiness|deploy). Deploy also requires RELEASE_CARD, RELEASE_HISTORY_SHA256, RELEASE_COMPATIBLE=true.\nsource reads Git and GitHub CI; configuration reports missing names only; live uses protected credentials for read-only schedule/history and boundary checks; verify checks deployed metadata/assets. This helper never deploys or applies SQL.');
    return;
  }
  assert.ok(['source', 'configuration', 'live', 'verify'].includes(command), 'Unknown preflight command.');
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    assert.ok(['--source', '--out', '--before'].includes(rest[i]) && rest[i + 1], 'Unknown or incomplete preflight option.');
    options[rest[i].slice(2)] = rest[i + 1];
  }
  validateRequest(env);
  const cwd = path.resolve(options.source || '.');
  let report;
  if (command === 'source') report = await checkSource(cwd, env);
  if (command === 'configuration') report = configuration(env, env.RELEASE_TARGET);
  if (command === 'live') report = await livePreflight(cwd, env);
  if (command === 'verify') {
    assert.ok(options.before, 'Verification needs the pre-deploy report.');
    report = await verifyRelease(cwd, env, JSON.parse(fs.readFileSync(options.before, 'utf8')));
  }
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(JSON.stringify(report, null, 2));
  if (command === 'configuration' && !report.ready) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
