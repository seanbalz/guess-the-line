import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateRequest, configuration, successfulRun, checkSource, publishedSchedule, migrationDigest, jsonRequest, livePreflight, verifyRelease, REPOSITORY, PROJECT, ACCOUNT, REQUIRED_CI, TARGETS, TARGET_DEPLOYS } from '../scripts/release-preflight.mjs';

const sha = 'a'.repeat(40);
const request = (extra = {}) => ({ RELEASE_SHA: sha, RELEASE_TARGET: 'frontend', RELEASE_MODE: 'check-only', ...extra });
const ciRun = (extra = {}) => ({ id: 1, run_attempt: 1, head_sha: sha, event: 'push', head_branch: 'main', path: '.github/workflows/test.yml', repository: { full_name: REPOSITORY }, status: 'completed', conclusion: 'success', html_url: 'https://github.com/example/run/1', ...extra });
const jobs = [{ name: 'Typecheck and test', status: 'completed', conclusion: 'success' }];
const slate = kickoffs => [{ season: 2026, week: 6, kickoffs: kickoffs.map(date => Date.parse(date) / 1000) }];

test('Pages verification uses canonical HTML routes and rejects changed bytes and redirects', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-release-pages-'));
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  fs.mkdirSync(path.join(cwd, 'scripts')); fs.mkdirSync(path.join(cwd, '.local'));
  fs.writeFileSync(path.join(cwd, 'scripts/check-cloud-boundary.mjs'), 'export async function checkCloudBoundary() { return {denied: 10, awaiting: []}; }');
  const files = ['index.html', 'privacy.html', 'terms.html', 'about/index.html', 'assets/app.js'];
  const digest = value => createHash('sha256').update(value).digest('hex');
  fs.writeFileSync(path.join(cwd, '.local/release-manifest.json'), JSON.stringify({
    gitHead: sha, dirtyWorkingTree: false, frontendSha256: 'c'.repeat(64),
    artifacts: [...files, '_headers', '_redirects'].map(file => ({ path: file, sha256: digest(file) })),
  }));
  const migrations = [{ version: '20261008164249', name: 'base' }];
  const functions = [{ slug: 'gtl-api', version: 27, status: 'ACTIVE', verify_jwt: true, bundleSha256: 'b'.repeat(64) }];
  const before = { functions, observedAt: '2026-10-20T23:00:00Z', migrationHistorySha256: migrationDigest(migrations), pendingRepoMigrations: [] };
  const env = request({ RELEASE_MODE: 'deploy' });
  const routes = new Map([['/', files[0]], ['/privacy', files[1]], ['/terms', files[2]], ['/about/', files[3]], ['/assets/app.js', files[4]]]);
  let corrupt = false, redirect = false;
  const served = [];
  const fake = async (url, options) => {
    if (url.endsWith('/functions')) return { ok: true, json: async () => functions.map(f => ({ ...f, ezbr_sha256: f.bundleSha256 })) };
    if (url.endsWith('/database/query/read-only')) return { ok: true, json: async () => [{ migrations }] };
    if (url.includes('/deployments?')) return { ok: true, json: async () => ({ success: true, result: [{
      id: 'deployment', url: 'https://abc123.guess-the-line.pages.dev', created_on: '2026-10-20T23:01:00Z',
      deployment_trigger: { metadata: { commit_hash: sha } }, latest_stage: { status: 'success' },
    }] }) };
    const parsed = new URL(url);
    assert.equal(options.redirect, 'error');
    assert.equal(parsed.searchParams.get('release'), sha);
    assert.ok(routes.has(parsed.pathname), `Unexpected route ${parsed.pathname}`);
    served.push(parsed.origin + parsed.pathname);
    if (redirect) throw new TypeError('unexpected redirect');
    return { ok: true, arrayBuffer: async () => Buffer.from(corrupt ? 'changed' : routes.get(parsed.pathname)) };
  };
  const report = await verifyRelease(cwd, env, before, fake);
  assert.equal(report.pages.checkedAssetsPerUrl, 5);
  assert.equal(served.length, 10);
  assert.equal(new Set(served).size, 10);
  corrupt = true;
  await assert.rejects(verifyRelease(cwd, env, before, fake), /differs from release manifest/);
  corrupt = false; redirect = true;
  await assert.rejects(verifyRelease(cwd, env, before, fake), /unexpected redirect/);
});

test('release dispatch rejects PRs, branches, forks, abbreviations and unreviewed deploys', () => {
  const env = request({ GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: REPOSITORY });
  validateRequest(env);
  for (const change of [{ RELEASE_SHA: 'main' }, { RELEASE_SHA: sha.slice(0, 7) }, { RELEASE_TARGET: 'all' }, { GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_REPOSITORY: 'fork/repo' }, { RELEASE_MODE: 'deploy' }]) {
    assert.throws(() => validateRequest({ ...env, ...change }));
  }
  const deploy = { ...env, RELEASE_MODE: 'deploy', RELEASE_CARD: `https://github.com/${REPOSITORY}/issues/1`, RELEASE_HISTORY_SHA256: 'b'.repeat(64), RELEASE_COMPATIBLE: 'true' };
  validateRequest(deploy);
  assert.throws(() => validateRequest({ ...deploy, RELEASE_CARD: 'https://github.com/other/repo/issues/1' }));
  assert.throws(() => validateRequest({ ...deploy, RELEASE_COMPATIBLE: 'false' }));
});

test('CI gate refuses wrong SHA, PR-only evidence, skipped jobs and a newer failed rerun', () => {
  assert.equal(successfulRun([ciRun()], jobs, sha, 'test.yml').runId, 1);
  for (const change of [{ head_sha: 'b'.repeat(40) }, { event: 'pull_request' }, { head_branch: 'feature' }, { status: 'in_progress' }, { conclusion: 'failure' }, { repository: { full_name: 'fork/repo' } }]) {
    assert.throws(() => successfulRun([ciRun(change)], jobs, sha, 'test.yml'));
  }
  assert.throws(() => successfulRun([ciRun()], [{ ...jobs[0], conclusion: 'skipped' }], sha, 'test.yml'));
  assert.throws(() => successfulRun([ciRun(), ciRun({ id: 2, conclusion: 'failure' })], jobs, sha, 'test.yml'));
});

test('source gate rejects dirty or off-main commits before any API request', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-release-'));
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(cwd, 'file'), 'base'); git('add', 'file'); git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', base);
  let calls = 0;
  const never = () => { calls++; throw new Error('Unexpected API request'); };
  fs.writeFileSync(path.join(cwd, 'file'), 'dirty');
  await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: base }), never), /clean/);
  git('add', 'file'); git('commit', '-m', 'feature');
  await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: git('rev-parse', 'HEAD') }), never), /reachable/);
  assert.equal(calls, 0);
});

test('clean exact main source must pass every required workflow and JWT config gate', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-release-ci-'));
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  fs.mkdirSync(path.join(cwd, 'supabase'));
  fs.writeFileSync(path.join(cwd, 'supabase/config.toml'), '[functions.gtl-api]\nverify_jwt = true\n');
  git('add', '.'); git('commit', '-m', 'fixture');
  const actualSha = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', actualSha);
  const workflows = Object.keys(REQUIRED_CI);
  let calls = 0;
  const fake = async url => {
    calls++;
    const name = workflows.find(workflow => url.includes(`/workflows/${workflow}/runs?`));
    if (name) return { ok: true, json: async () => ({ workflow_runs: [ciRun({ id: workflows.indexOf(name) + 1, head_sha: actualSha, path: `.github/workflows/${name}` })] }) };
    const index = Number(url.match(/\/runs\/(\d+)\//)[1]) - 1;
    return { ok: true, json: async () => ({ total_count: REQUIRED_CI[workflows[index]].length, jobs: REQUIRED_CI[workflows[index]].map(name => ({ name, status: 'completed', conclusion: 'success' })) }) };
  };
  const report = await checkSource(cwd, request({ RELEASE_SHA: actualSha }), fake);
  assert.equal(report.checks.length, 3); assert.equal(calls, 6);
  fs.writeFileSync(path.join(cwd, 'supabase/config.toml'), '[functions.gtl-api]\nverify_jwt = false\n');
  git('add', '.'); git('commit', '-m', 'unsafe fixture');
  const unsafeSha = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', unsafeSha);
  await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: unsafeSha }), fake), /JWT verification/);
  assert.equal(calls, 6);
});

test('configuration exposes only missing names and requires the intended production targets', () => {
  const absent = configuration({}, 'frontend');
  assert.equal(absent.ready, false);
  assert.ok(absent.missing.includes('SUPABASE_ACCESS_TOKEN'));
  assert.ok(absent.missing.includes('CLOUDFLARE_API_TOKEN'));
  const env = { SUPABASE_PROJECT_REF: PROJECT, VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ACCESS_TOKEN: 'never-print-this', CLOUDFLARE_ACCOUNT_ID: ACCOUNT, CLOUDFLARE_PAGES_PROJECT: 'guess-the-line', CLOUDFLARE_API_TOKEN: 'also-private' };
  assert.deepEqual(configuration(env, 'frontend'), { ready: true, missing: [] });
  assert.ok(!JSON.stringify(configuration(env, 'frontend')).includes('private'));
  assert.throws(() => configuration({ ...env, SUPABASE_PROJECT_REF: 'another-project' }, 'api'));
  assert.throws(() => configuration({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_sentinel_do_not_print' }, 'frontend'), error => {
    assert.ok(!error.message.includes('sentinel')); return true;
  });
  assert.deepEqual(configuration({ ...env, CLOUDFLARE_API_TOKEN: '' }, 'api'), { ready: true, missing: [] });
});

test('read-only service errors do not reveal response bodies or credentials', async () => {
  await assert.rejects(jsonRequest('https://example.invalid', 'secret', {}, async () => ({ ok: false, status: 403, text: async () => 'private-body' })), error => {
    assert.equal(error.message, 'Read-only service request failed (403).');
    return true;
  });
  await assert.rejects(jsonRequest('https://example.invalid', 'secret', {}, async () => ({ ok: true, json: async () => { throw new Error('private-fragment'); } })), error => {
    assert.equal(error.message, 'Read-only service response was not valid JSON.'); return true;
  });
});

test('migration digest is stable by version and changes on migration-history drift', () => {
  const rows = [{ version: '20261008164249', name: 'first' }, { version: '20261015143006', name: 'next' }];
  assert.equal(migrationDigest(rows), migrationDigest([...rows].reverse()));
  assert.notEqual(migrationDigest(rows), migrationDigest([...rows, { version: '20261016000000', name: 'later' }]));
  assert.notEqual(migrationDigest(rows), migrationDigest([{ ...rows[0], name: 'changed' }, rows[1]]));
  assert.throws(() => migrationDigest([]));
});

test('published schedule permits releases during former calendar and game freezes', () => {
  const games = slate(['2026-10-16T00:15:00Z', '2026-10-18T17:00:00Z', '2026-10-20T00:15:00Z']);
  for (const instant of ['2026-10-15T18:45:00Z', '2026-10-18T14:00:00Z', '2026-10-19T07:15:00Z', '2026-10-19T23:00:00Z']) {
    assert.equal(publishedSchedule(games, new Date(instant)).timeRestrictions, false);
  }
  assert.equal(publishedSchedule(slate(['2026-11-27T20:00:00Z']), new Date('2026-11-27T19:00:00Z')).timeRestrictions, false);
  const priorWeek = [...slate(['2026-10-23T00:15:00Z']), ...games];
  assert.equal(publishedSchedule(priorWeek, new Date('2026-10-20T01:00:00Z')).games, 4);
  assert.equal(publishedSchedule(slate(['2026-11-02T01:20:00Z']), new Date('2026-11-01T14:30:00Z')).timeRestrictions, false);
});

test('published schedule still refuses missing, stale and malformed evidence', () => {
  assert.throws(() => publishedSchedule([], new Date()), /No published/);
  assert.throws(() => publishedSchedule(slate(['2026-10-16T00:15:00Z']), new Date('2026-10-22T10:00:00Z')), /stale/);
  assert.throws(() => publishedSchedule([{ season: 2026, week: 6, kickoffs: ['invalid'] }], new Date()), /Invalid/);
  assert.throws(() => publishedSchedule(slate(['2026-11-27T20:00:00Z']), new Date('2026-10-19T23:00:00Z')), /too far ahead/);
});

test('hosted preflight uses only the read-only endpoint and stops on reviewed migration drift', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-release-live-'));
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  fs.mkdirSync(path.join(cwd, 'scripts')); fs.mkdirSync(path.join(cwd, 'tests'));
  fs.writeFileSync(path.join(cwd, 'scripts/check-cloud-boundary.mjs'), 'export async function checkCloudBoundary() { return {denied: 10, awaiting: []}; }');
  fs.writeFileSync(path.join(cwd, 'tests/migrations.mjs'), 'export const NOT_HOSTED = [20261015030000];');
  const now = '2026-10-15T15:00:00Z';
  t.mock.method(Date, 'now', () => Date.parse(now));
  const migrations = [{ version: '20261008164249', name: 'base' }];
  const functions = [{ slug: 'gtl-api', version: 24, status: 'ACTIVE', verify_jwt: true, ezbr_sha256: 'b'.repeat(64) }, { slug: 'gtl-week-open', version: 3, status: 'ACTIVE', verify_jwt: false }];
  const env = request({ RELEASE_TARGET: 'api', RELEASE_MODE: 'deploy', RELEASE_HISTORY_SHA256: migrationDigest(migrations), SUPABASE_PROJECT_REF: PROJECT, VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ACCESS_TOKEN: 'private-value' });
  const calls = [];
  const fake = async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    if (url.endsWith('/database/query/read-only')) {
      assert.equal(options.method, 'POST');
      assert.match(JSON.parse(options.body).query, /^select\s/);
      assert.ok(!JSON.parse(options.body).query.includes('gtl_weekly_ballots'));
      return { ok: true, json: async () => [{ observed_at: now, migrations, slates: slate(['2026-10-16T00:15:00Z', '2026-10-20T00:15:00Z']) }] };
    }
    assert.ok(url.endsWith('/functions'));
    return { ok: true, json: async () => functions };
  };
  const before = await livePreflight(cwd, env, fake);
  assert.equal(before.migrationHistorySha256, env.RELEASE_HISTORY_SHA256);
  assert.deepEqual(before.pendingRepoMigrations, [20261015030000]);
  assert.equal(before.deployed, false);
  assert.ok(!JSON.stringify(before).includes('private-value'));
  assert.equal(calls.length, 2);
  calls.length = 0;
  await assert.rejects(livePreflight(cwd, { ...env, RELEASE_HISTORY_SHA256: 'a'.repeat(64) }, fake), /differs/);
  assert.equal(calls.length, 1);

  functions[0] = { ...functions[0], version: 25 };
  const verified = await verifyRelease(cwd, env, before, fake);
  assert.equal(verified.api.version, 25);
  assert.equal(verified.api.bundleSha256, 'b'.repeat(64));
  assert.equal(verified.apiSourceVerified, false);
  assert.equal(verified.requestedSource, sha);
  assert.equal(verified.pages, null);
  functions[0] = { ...functions[0], version: 27 };
  await assert.rejects(verifyRelease(cwd, env, before, fake), /exactly one API version/);
  functions[0] = { ...functions[0], version: 25 };
  functions[1] = { ...functions[1], version: 4 };
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/);
  functions[1] = before.functions.find(item => item.slug === 'gtl-week-open');
  functions[0] = { ...functions[0], verify_jwt: false };
  await assert.rejects(verifyRelease(cwd, env, before, fake), /JWT verification/);
});

// Contract (October 26, 2026, Sean: "Add it to the release workflow", then the same for the Guess the Points jobs worker):
// the `push-reminders` and `points-jobs` targets each deploy only their own Edge Function, through every existing gate,
// and the frontend, api and api-and-frontend targets keep exactly their previous deploy commands, configuration and
// verification. points-jobs may create its function on the first deploy; push-reminders must update an existing one.
const releaseYaml = fs.readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const API_DEPLOY = './node_modules/.bin/supabase functions deploy gtl-api --project-ref "$SUPABASE_PROJECT_REF" --use-api';
const WORKER_DEPLOY = './node_modules/.bin/supabase functions deploy gtl-push-reminders --project-ref "$SUPABASE_PROJECT_REF" --use-api';
const POINTS_DEPLOY = './node_modules/.bin/supabase functions deploy gtl-points-jobs --project-ref "$SUPABASE_PROJECT_REF" --use-api';
// October 27, 2026 (Sean: "Add a league-features target to the release workflow"): the badges, awards and streaks worker.
const FEATURES_DEPLOY = './node_modules/.bin/supabase functions deploy gtl-league-features --project-ref "$SUPABASE_PROJECT_REF" --use-api';
// October 28, 2026: the D-59 fantasy feed upload worker, which checks its own upload secret instead of a one-run capability.
const FANTASY_DEPLOY = './node_modules/.bin/supabase functions deploy gtl-fantasy-ingest --project-ref "$SUPABASE_PROJECT_REF" --use-api';
// M-19 (D-64, proposed): the existing results refresh worker, which now also settles shared tickets.
const RESULTS_DEPLOY = './node_modules/.bin/supabase functions deploy gtl-results-refresh --project-ref "$SUPABASE_PROJECT_REF" --use-api';
// October 28, 2026: the EPL jobs worker (Pick a Team plan 1), not hosted yet, so its first deploy creates it.
const EPL_DEPLOY = './node_modules/.bin/supabase functions deploy gtl-epl-jobs --project-ref "$SUPABASE_PROJECT_REF" --use-api';
const WORKER_TARGETS = { 'push-reminders': WORKER_DEPLOY, 'points-jobs': POINTS_DEPLOY, 'league-features': FEATURES_DEPLOY, 'fantasy-ingest': FANTASY_DEPLOY, 'results-refresh': RESULTS_DEPLOY, 'epl-jobs': EPL_DEPLOY };
const PAGES_DEPLOY = './node_modules/.bin/wrangler pages deploy .local/cloud-dist --project-name "$CLOUDFLARE_PAGES_PROJECT" --branch main --commit-hash "$RELEASE_SHA" --commit-dirty=false';

/** The production job's steps as release.yml declares them: name, condition, directory, step env and one-line command. */
function productionSteps() {
  const job = releaseYaml.split(/^ {2}production:\n/m)[1];
  assert.ok(job, 'release.yml has no production job');
  return job.split(/^ {4}steps:\n/m)[1].split(/^ {6}- /m).slice(1).map(block => {
    const field = key => block.match(new RegExp(`^(?: {8})?${key}: (.+)$`, 'm'))?.[1];
    const env = block.match(/^ {8}env:\n((?: {10}.+\n?)+)/m)?.[1];
    return { name: field('name') || field('uses'), if: field('if'), workingDirectory: field('working-directory'), run: field('run'),
      env: env ? Object.fromEntries(env.trimEnd().split('\n').map(line => { const [key, ...value] = line.trim().split(': '); return [key, value.join(': ')]; })) : {} };
  });
}
/** Evaluates the small GitHub expression subset the release steps use; anything else fails the test rather than guessing. */
function stepRuns(condition, inputs) {
  if (!condition) return true;
  assert.match(condition, /^(?:\s+|inputs\.(?:mode|target)|'[a-z-]+'|==|!=|&&|\|\||[()]|always\(\))+$/, `Unsupported step condition: ${condition}`);
  return Function('inputs', `return (${condition.replace(/always\(\)/g, 'true').replace(/(==|!=)/g, '$1=')});`)(inputs);
}
const stepsRun = (mode, target) => productionSteps().filter(step => stepRuns(step.if, { mode, target }));
const deployCommands = (mode, target) => stepsRun(mode, target).map(step => step.run).filter(run => / deploy /.test(run || ''));

test('release.yml offers exactly the preflight targets, both worker targets included', () => {
  const options = releaseYaml.match(/^ {6}target:\n(?: {8}.+\n)*? {8}options: \[([^\]]+)\]/m)?.[1].split(',').map(item => item.trim());
  assert.deepEqual(options, TARGETS);
  assert.deepEqual(TARGETS, ['frontend', 'api', 'api-and-frontend', 'push-reminders', 'points-jobs', 'league-features', 'fantasy-ingest', 'results-refresh', 'epl-jobs']);
});

test('each target deploys only its own component; the worker targets never deploy gtl-api, Pages or each other', () => {
  assert.deepEqual(deployCommands('deploy', 'frontend'), [PAGES_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'api'), [API_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'api-and-frontend'), [API_DEPLOY, PAGES_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'push-reminders'), [WORKER_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'points-jobs'), [POINTS_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'league-features'), [FEATURES_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'fantasy-ingest'), [FANTASY_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'results-refresh'), [RESULTS_DEPLOY]);
  assert.deepEqual(deployCommands('deploy', 'epl-jobs'), [EPL_DEPLOY]);
  for (const target of TARGETS) for (const mode of ['check-only', 'readiness']) assert.deepEqual(deployCommands(mode, target), [], `${mode} ${target} deploys nothing`);
  // Every deploy condition names the targets it serves; none selects by exclusion, so a new target reaches no deploy by default.
  const deploySteps = productionSteps().filter(step => / deploy /.test(step.run || ''));
  assert.equal(deploySteps.length, 8);
  for (const step of deploySteps) assert.doesNotMatch(step.if, /!=/, step.name);
  assert.equal(deploySteps.find(step => step.run === POINTS_DEPLOY).if, "inputs.mode == 'deploy' && inputs.target == 'points-jobs'");
  assert.equal(deploySteps.find(step => step.run === FEATURES_DEPLOY).if, "inputs.mode == 'deploy' && inputs.target == 'league-features'");
  assert.equal(deploySteps.find(step => step.run === FANTASY_DEPLOY).if, "inputs.mode == 'deploy' && inputs.target == 'fantasy-ingest'");
  assert.equal(deploySteps.find(step => step.run === EPL_DEPLOY).if, "inputs.mode == 'deploy' && inputs.target == 'epl-jobs'");
  assert.equal(deploySteps.filter(step => /epl-jobs/.test(step.if || '')).length, 1);
  assert.equal(productionSteps().filter(step => /epl-jobs/.test(step.if || '')).length, 1, 'no other step selects epl-jobs');
  assert.equal(deploySteps.find(step => step.run === RESULTS_DEPLOY).if, "inputs.mode == 'deploy' && inputs.target == 'results-refresh'");
  assert.equal(deploySteps.find(step => step.run === WORKER_DEPLOY).if, "inputs.mode == 'deploy' && inputs.target == 'push-reminders'");
});

test('each worker deploy mirrors the API deploy step: same checkout directory, same single secret, project ref from the environment', () => {
  const steps = productionSteps();
  const api = steps.find(step => step.run === API_DEPLOY), pages = steps.find(step => step.run === PAGES_DEPLOY);
  assert.ok(api && pages);
  for (const command of Object.values(WORKER_TARGETS)) {
    const worker = steps.find(step => step.run === command);
    assert.ok(worker, command);
    assert.equal(worker.workingDirectory, 'source');
    assert.equal(worker.workingDirectory, api.workingDirectory);
    assert.deepEqual(worker.env, { SUPABASE_ACCESS_TOKEN: '${{ secrets.SUPABASE_ACCESS_TOKEN }}' });
    assert.deepEqual(worker.env, api.env);
  }
  assert.deepEqual(pages.env, { CLOUDFLARE_API_TOKEN: '${{ secrets.CLOUDFLARE_API_TOKEN }}' });
  const job = releaseYaml.split(/^ {2}production:\n/m)[1].split(/^ {4}steps:\n/m)[0];
  assert.match(job, /^ {4}needs: source$/m);
  assert.match(job, /^ {4}environment: production$/m);
  assert.match(job, /^ {6}SUPABASE_PROJECT_REF: \$\{\{ vars\.SUPABASE_PROJECT_REF \}\}$/m);
});

test('each worker target runs every API gate in the same order, with its deploy in the API deploy slot', () => {
  const apiDeploy = productionSteps().find(step => step.run === API_DEPLOY).name;
  for (const [target, command] of Object.entries(WORKER_TARGETS)) {
    const workerDeploy = productionSteps().find(step => step.run === command).name;
    for (const mode of ['readiness', 'deploy']) {
      assert.deepEqual(stepsRun(mode, target).map(step => step.name), stepsRun(mode, 'api').map(step => step.name === apiDeploy ? workerDeploy : step.name), `${mode} ${target}`);
    }
    const deploy = stepsRun('deploy', target).map(step => step.name);
    for (const gate of ['Require environment configuration (names only on failure)', 'Build, scan and fingerprint exact release source', 'Recheck exact source and CI after environment approval', 'Read-only hosted preflight and schedule evidence']) {
      assert.ok(deploy.indexOf(gate) >= 0 && deploy.indexOf(gate) < deploy.indexOf(workerDeploy), `${gate} runs before the ${target} deploy`);
    }
    assert.ok(deploy.indexOf('Verify live metadata, unchanged migration history, boundaries and frontend bytes') > deploy.indexOf(workerDeploy), target);
  }
});

test('the worker targets are accepted with the same dispatch and deploy requirements as every other target', () => {
  for (const target of Object.keys(WORKER_TARGETS)) {
    const env = request({ RELEASE_TARGET: target, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: REPOSITORY });
    validateRequest(env);
    validateRequest({ ...env, RELEASE_MODE: 'readiness' });
    const deploy = { ...env, RELEASE_MODE: 'deploy', RELEASE_CARD: `https://github.com/${REPOSITORY}/pull/1`, RELEASE_HISTORY_SHA256: 'b'.repeat(64), RELEASE_COMPATIBLE: 'true' };
    validateRequest(deploy);
    for (const change of [{ RELEASE_CARD: '' }, { RELEASE_CARD: 'https://github.com/other/repo/pull/1' }, { RELEASE_HISTORY_SHA256: 'b'.repeat(63) }, { RELEASE_COMPATIBLE: 'false' }, { GITHUB_REF: 'refs/heads/feature' }]) {
      assert.throws(() => validateRequest({ ...deploy, ...change }), `${target} ${JSON.stringify(change)}`);
    }
  }
  assert.throws(() => validateRequest(request({ RELEASE_TARGET: 'gtl-push-reminders' })));
  assert.throws(() => validateRequest(request({ RELEASE_TARGET: 'gtl-points-jobs' })));
  assert.throws(() => validateRequest(request({ RELEASE_TARGET: 'gtl-league-features' })));
  assert.throws(() => validateRequest(request({ RELEASE_TARGET: 'gtl-fantasy-ingest' })));
  assert.throws(() => validateRequest(request({ RELEASE_TARGET: 'gtl-epl-jobs' })));
});

test('configuration: the worker targets need no Cloudflare values; the other targets need exactly what they did', () => {
  const supabaseNames = ['SUPABASE_PROJECT_REF', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ACCESS_TOKEN'];
  const cloudflareNames = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_PROJECT', 'CLOUDFLARE_API_TOKEN'];
  assert.deepEqual(configuration({}, 'push-reminders').missing, supabaseNames);
  assert.deepEqual(configuration({}, 'points-jobs').missing, supabaseNames);
  assert.deepEqual(configuration({}, 'league-features').missing, supabaseNames);
  assert.deepEqual(configuration({}, 'fantasy-ingest').missing, supabaseNames);
  assert.deepEqual(configuration({}, 'epl-jobs').missing, supabaseNames);
  assert.deepEqual(configuration({}, 'api').missing, supabaseNames);
  assert.deepEqual(configuration({}, 'frontend').missing, [...supabaseNames, ...cloudflareNames]);
  assert.deepEqual(configuration({}, 'api-and-frontend').missing, [...supabaseNames, ...cloudflareNames]);
  const env = { SUPABASE_PROJECT_REF: PROJECT, VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ACCESS_TOKEN: 'private' };
  for (const target of Object.keys(WORKER_TARGETS)) {
    assert.deepEqual(configuration(env, target), { ready: true, missing: [] });
    assert.throws(() => configuration({ ...env, SUPABASE_PROJECT_REF: 'another-project' }, target));
  }
});

test('a worker target\'s source must hold its entry file and keep it on its machine credential (verify_jwt = false) before any API request', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-release-worker-src-'));
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  fs.mkdirSync(path.join(cwd, 'supabase'));
  /** One commit on main: config sections as given (null omits one) and the listed function entry files. */
  const commitWith = ({ workers, entries }) => {
    const sections = Object.entries(workers).filter(([, jwt]) => jwt !== null).map(([slug, jwt]) => `\n[functions.${slug}]\nverify_jwt = ${jwt}\n`);
    fs.writeFileSync(path.join(cwd, 'supabase/config.toml'), `[functions.gtl-api]\nverify_jwt = true\n${sections.join('')}`);
    fs.rmSync(path.join(cwd, 'supabase/functions'), { force: true, recursive: true });
    for (const slug of entries) {
      fs.mkdirSync(path.join(cwd, 'supabase/functions', slug), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'supabase/functions', slug, 'index.ts'), 'Deno.serve(() => new Response());\n');
    }
    git('add', '-A'); git('commit', '--allow-empty', '-m', JSON.stringify({ workers, entries }));
    const head = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', head);
    return head;
  };
  const commit = workerJwt => commitWith({ workers: { 'gtl-push-reminders': workerJwt }, entries: ['gtl-push-reminders'] });
  const workflows = Object.keys(REQUIRED_CI);
  let calls = 0;
  const fake = async url => {
    calls++;
    const name = workflows.find(workflow => url.includes(`/workflows/${workflow}/runs?`));
    if (name) return { ok: true, json: async () => ({ workflow_runs: [ciRun({ id: workflows.indexOf(name) + 1, head_sha: url.match(/head_sha=([a-f0-9]{40})/)[1], path: `.github/workflows/${name}` })] }) };
    const index = Number(url.match(/\/runs\/(\d+)\//)[1]) - 1;
    return { ok: true, json: async () => ({ total_count: REQUIRED_CI[workflows[index]].length, jobs: REQUIRED_CI[workflows[index]].map(job => ({ name: job, status: 'completed', conclusion: 'success' })) }) };
  };
  const safe = commit('false');
  assert.equal((await checkSource(cwd, request({ RELEASE_SHA: safe, RELEASE_TARGET: 'push-reminders' }), fake)).target, 'push-reminders');
  assert.equal(calls, 6);
  const unsafe = commit('true');
  await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: unsafe, RELEASE_TARGET: 'push-reminders' }), fake), /gtl-push-reminders/);
  assert.equal(calls, 6);
  // The rule is the worker target's alone: an API release does not deploy the worker and keeps its previous source gate.
  await checkSource(cwd, request({ RELEASE_SHA: unsafe, RELEASE_TARGET: 'api' }), fake);
  assert.equal(calls, 12);
  const noEntry = commitWith({ workers: { 'gtl-push-reminders': 'false' }, entries: [] });
  await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: noEntry, RELEASE_TARGET: 'push-reminders' }), fake), /supabase\/functions\/gtl-push-reminders\/index\.ts/);
  assert.equal(calls, 12);

  // points-jobs: its config entry with verify_jwt = false and its entry file, both in the release source itself.
  const points = { 'gtl-push-reminders': 'false', 'gtl-points-jobs': 'false' };
  const ready = commitWith({ workers: points, entries: ['gtl-push-reminders', 'gtl-points-jobs'] });
  assert.equal((await checkSource(cwd, request({ RELEASE_SHA: ready, RELEASE_TARGET: 'points-jobs' }), fake)).target, 'points-jobs');
  assert.equal(calls, 18);
  for (const [label, source] of [
    ['no config entry (a source from before the worker landed)', { workers: { ...points, 'gtl-points-jobs': null }, entries: ['gtl-push-reminders', 'gtl-points-jobs'] }],
    ['gateway JWT verification on', { workers: { ...points, 'gtl-points-jobs': 'true' }, entries: ['gtl-push-reminders', 'gtl-points-jobs'] }],
    ['no entry file', { workers: points, entries: ['gtl-push-reminders'] }],
  ]) {
    await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: commitWith(source), RELEASE_TARGET: 'points-jobs' }), fake), /gtl-points-jobs/, label);
  }
  assert.equal(calls, 18);

  // league-features: the same two requirements, for gtl-league-features.
  const features = { ...points, 'gtl-league-features': 'false' }, featureEntries = ['gtl-push-reminders', 'gtl-points-jobs', 'gtl-league-features'];
  const featuresReady = commitWith({ workers: features, entries: featureEntries });
  assert.equal((await checkSource(cwd, request({ RELEASE_SHA: featuresReady, RELEASE_TARGET: 'league-features' }), fake)).target, 'league-features');
  assert.equal(calls, 24);
  for (const [label, source] of [
    ['no config entry (a source from before the worker landed)', { workers: points, entries: featureEntries }],
    ['gateway JWT verification on', { workers: { ...features, 'gtl-league-features': 'true' }, entries: featureEntries }],
    ['no entry file', { workers: features, entries: ['gtl-push-reminders', 'gtl-points-jobs'] }],
  ]) {
    await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: commitWith(source), RELEASE_TARGET: 'league-features' }), fake), /gtl-league-features/, label);
  }
  assert.equal(calls, 24);

  // fantasy-ingest: the same two requirements, for gtl-fantasy-ingest; the refusal names its upload secret, not SQL.
  const fantasy = { ...features, 'gtl-fantasy-ingest': 'false' }, fantasyEntries = [...featureEntries, 'gtl-fantasy-ingest'];
  const fantasyReady = commitWith({ workers: fantasy, entries: fantasyEntries });
  assert.equal((await checkSource(cwd, request({ RELEASE_SHA: fantasyReady, RELEASE_TARGET: 'fantasy-ingest' }), fake)).target, 'fantasy-ingest');
  assert.equal(calls, 30);
  for (const [label, source, error] of [
    ['no config entry (a source from before the worker landed)', { workers: features, entries: fantasyEntries }, /gtl-fantasy-ingest at verify_jwt = false \(its upload secret is checked in the function\)/],
    ['gateway JWT verification on', { workers: { ...fantasy, 'gtl-fantasy-ingest': 'true' }, entries: fantasyEntries }, /gtl-fantasy-ingest at verify_jwt = false/],
    ['no entry file', { workers: fantasy, entries: featureEntries }, /supabase\/functions\/gtl-fantasy-ingest\/index\.ts/],
  ]) {
    await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: commitWith(source), RELEASE_TARGET: 'fantasy-ingest' }), fake), error, label);
  }
  assert.equal(calls, 30);

  // epl-jobs: the same two requirements, for gtl-epl-jobs (the entry file is named here, never created by this task).
  const epl = { ...fantasy, 'gtl-epl-jobs': 'false' }, eplEntries = [...fantasyEntries, 'gtl-epl-jobs'];
  const eplReady = commitWith({ workers: epl, entries: eplEntries });
  assert.equal((await checkSource(cwd, request({ RELEASE_SHA: eplReady, RELEASE_TARGET: 'epl-jobs' }), fake)).target, 'epl-jobs');
  assert.equal(calls, 36);
  for (const [label, source, error] of [
    ['no config entry (a source from before the worker landed)', { workers: fantasy, entries: eplEntries }, /gtl-epl-jobs at verify_jwt = false/],
    ['gateway JWT verification on', { workers: { ...epl, 'gtl-epl-jobs': 'true' }, entries: eplEntries }, /gtl-epl-jobs at verify_jwt = false/],
    ['no entry file', { workers: epl, entries: fantasyEntries }, /supabase\/functions\/gtl-epl-jobs\/index\.ts/],
  ]) {
    await assert.rejects(checkSource(cwd, request({ RELEASE_SHA: commitWith(source), RELEASE_TARGET: 'epl-jobs' }), fake), error, label);
  }
  assert.equal(calls, 36);
});

/** A verify/preflight fixture: a boundary checker that passes unless a test sets globalThis.gtlBoundaryFailure. */
function hostedFixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-release-worker-'));
  t.after(() => { fs.rmSync(cwd, { force: true, recursive: true }); delete globalThis.gtlBoundaryFailure; });
  fs.mkdirSync(path.join(cwd, 'scripts')); fs.mkdirSync(path.join(cwd, 'tests'));
  fs.writeFileSync(path.join(cwd, 'scripts/check-cloud-boundary.mjs'), 'export async function checkCloudBoundary() { if (globalThis.gtlBoundaryFailure) throw new Error(globalThis.gtlBoundaryFailure); return { checked: 10, denied: 10, awaiting: [] }; }');
  fs.writeFileSync(path.join(cwd, 'tests/migrations.mjs'), 'export const NOT_HOSTED = [];');
  const migrations = [{ version: '20261008164249', name: 'base' }];
  const functions = [
    { slug: 'gtl-api', version: 31, status: 'ACTIVE', verify_jwt: true, bundleSha256: 'b'.repeat(64) },
    { slug: 'gtl-push-reminders', version: 4, status: 'ACTIVE', verify_jwt: false, bundleSha256: 'c'.repeat(64) },
    { slug: 'gtl-week-open', version: 3, status: 'ACTIVE', verify_jwt: false, bundleSha256: null },
  ];
  const state = { functions, migrations, calls: [] };
  const fake = async (url, options = {}) => {
    state.calls.push(url);
    assert.ok(url.startsWith(`https://api.supabase.com/v1/projects/${PROJECT}/`), `Unexpected request ${url}`);
    if (url.endsWith('/functions')) return { ok: true, json: async () => state.functions.map(({ bundleSha256, ...item }) => ({ ...item, ezbr_sha256: bundleSha256 })) };
    assert.ok(url.endsWith('/database/query/read-only') && options.method === 'POST');
    return { ok: true, json: async () => [{ observed_at: new Date(Date.now()).toISOString(), migrations: state.migrations, slates: slate(['2026-10-30T00:15:00Z', '2026-11-03T01:15:00Z']) }] };
  };
  const before = { functions, observedAt: '2026-10-26T20:00:00Z', migrationHistorySha256: migrationDigest(migrations), pendingRepoMigrations: [] };
  const change = (slug, values) => functions.map(item => item.slug === slug ? { ...item, ...values } : item);
  return { cwd, state, fake, before, change, migrations };
}

test('hosted preflight for push-reminders reads no Pages state and requires the existing worker', async t => {
  const { cwd, state, fake, migrations } = hostedFixture(t);
  t.mock.method(Date, 'now', () => Date.parse('2026-10-26T20:00:00Z'));
  const env = request({ RELEASE_TARGET: 'push-reminders', RELEASE_MODE: 'deploy', RELEASE_HISTORY_SHA256: migrationDigest(migrations), SUPABASE_PROJECT_REF: PROJECT, VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ACCESS_TOKEN: 'private-value' });
  const before = await livePreflight(cwd, env, fake);
  assert.equal(before.target, 'push-reminders');
  assert.equal(before.previousPages, null);
  assert.equal(state.calls.length, 2);
  assert.equal(before.functions.find(item => item.slug === 'gtl-push-reminders').version, 4);
  assert.ok(!JSON.stringify(before).includes('private-value'));
  await assert.rejects(livePreflight(cwd, { ...env, RELEASE_HISTORY_SHA256: 'a'.repeat(64) }, fake), /differs/);
  state.functions = state.functions.filter(item => item.slug !== 'gtl-push-reminders');
  await assert.rejects(livePreflight(cwd, env, fake), /push reminder worker/);
});

test('push-reminders verification: only the worker changes, by exactly one version, ACTIVE with JWT verification off', async t => {
  const { cwd, state, fake, before, change, migrations } = hostedFixture(t);
  const env = request({ RELEASE_TARGET: 'push-reminders', RELEASE_MODE: 'deploy' });
  const deployed = (values = {}) => change('gtl-push-reminders', { version: 5, bundleSha256: 'e'.repeat(64), ...values });
  state.functions = deployed();
  const report = await verifyRelease(cwd, env, before, fake);
  assert.deepEqual(report.pushReminders, { slug: 'gtl-push-reminders', version: 5, status: 'ACTIVE', verify_jwt: false, bundleSha256: 'e'.repeat(64) });
  assert.equal(report.pushRemindersSourceVerified, false);
  assert.deepEqual(report.api, before.functions[0]);
  assert.equal(report.pages, null, 'the frontend is not deployed or checked');
  assert.equal(report.target, 'push-reminders');
  assert.ok(state.calls.every(url => url.startsWith('https://api.supabase.com/')), 'no Cloudflare or Pages request');

  for (const [values, error] of [
    [{ version: 4, bundleSha256: 'c'.repeat(64) }, /exactly one push reminder worker version/],
    [{ version: 6 }, /exactly one push reminder worker version/],
    [{ verify_jwt: true }, /JWT verification off/],
    [{ status: 'THROTTLED' }, /ACTIVE/],
    [{ bundleSha256: null }, /bundle digest/],
  ]) {
    state.functions = deployed(values);
    await assert.rejects(verifyRelease(cwd, env, before, fake), error, JSON.stringify(values));
  }
  state.functions = deployed().filter(item => item.slug !== 'gtl-push-reminders');
  await assert.rejects(verifyRelease(cwd, env, before, fake), /push reminder worker must be ACTIVE/);

  for (const values of [{ version: 32 }, { bundleSha256: 'f'.repeat(64) }]) {
    state.functions = deployed().map(item => item.slug === 'gtl-api' ? { ...item, ...values } : item);
    await assert.rejects(verifyRelease(cwd, env, before, fake), /API changed during push-reminders-only release/, JSON.stringify(values));
  }
  state.functions = deployed().map(item => item.slug === 'gtl-api' ? { ...item, verify_jwt: false } : item);
  await assert.rejects(verifyRelease(cwd, env, before, fake), /JWT verification/);
  state.functions = deployed().map(item => item.slug === 'gtl-week-open' ? { ...item, version: 4 } : item);
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/);
  state.functions = [...deployed(), { slug: 'gtl-zz-new', version: 1, status: 'ACTIVE', verify_jwt: false, bundleSha256: null }];
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/);

  state.functions = deployed();
  state.migrations = [...migrations, { version: '20261026000000', name: 'drift' }];
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Migration history changed/);
  state.migrations = migrations;
  globalThis.gtlBoundaryFailure = 'POST scheduled reminders without machine token: unexpected 200';
  await assert.rejects(verifyRelease(cwd, env, before, fake), /scheduled reminders/);
  delete globalThis.gtlBoundaryFailure;
  assert.equal((await verifyRelease(cwd, env, before, fake)).pushReminders.version, 5);
});

test('existing targets: any function other than gtl-api changing still fails, the reminder worker included', async t => {
  const { cwd, state, fake, before, change } = hostedFixture(t);
  for (const target of ['frontend', 'api', 'api-and-frontend']) {
    const env = request({ RELEASE_TARGET: target, RELEASE_MODE: 'deploy' });
    const api = target === 'frontend' ? {} : { version: 32 };
    state.functions = change('gtl-push-reminders', { version: 5 }).map(item => item.slug === 'gtl-api' ? { ...item, ...api } : item);
    await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/, target);
  }
  // Unchanged rules and report shape for the API-only and frontend-only targets.
  state.functions = change('gtl-api', { version: 32 });
  const report = await verifyRelease(cwd, request({ RELEASE_TARGET: 'api', RELEASE_MODE: 'deploy' }), before, fake);
  assert.deepEqual(Object.keys(report), ['requestedSource', 'target', 'checkedAt', 'api', 'pages', 'boundary', 'apiDeploymentMetadataVerified', 'apiSourceVerified', 'apiBundleMatchesCheckout', 'apiSourceLimitation', 'migrationHistorySha256', 'pendingRepoMigrations', 'limitation']);
  assert.equal(report.api.version, 32);
  await assert.rejects(verifyRelease(cwd, request({ RELEASE_TARGET: 'frontend', RELEASE_MODE: 'deploy' }), before, fake), /API changed during frontend-only release/);
  state.functions = change('gtl-api', { version: 33 });
  await assert.rejects(verifyRelease(cwd, request({ RELEASE_TARGET: 'api-and-frontend', RELEASE_MODE: 'deploy' }), before, fake), /exactly one API version/);
});

const POINTS_JOBS_FN = Object.freeze({ slug: 'gtl-points-jobs', version: 1, status: 'ACTIVE', verify_jwt: false, bundleSha256: 'a'.repeat(64) });
const bySlug = list => [...list].sort((a, b) => a.slug.localeCompare(b.slug));

test('hosted preflight for points-jobs records whether the worker exists, allows a first deploy and reads no Pages state', async t => {
  const { cwd, state, fake, migrations } = hostedFixture(t);
  t.mock.method(Date, 'now', () => Date.parse('2026-10-26T20:00:00Z'));
  const env = request({ RELEASE_TARGET: 'points-jobs', RELEASE_MODE: 'deploy', RELEASE_HISTORY_SHA256: migrationDigest(migrations), SUPABASE_PROJECT_REF: PROJECT, VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ACCESS_TOKEN: 'private-value' });
  const absent = await livePreflight(cwd, env, fake);
  assert.deepEqual(absent.pointsJobsBefore, { present: false, version: null });
  assert.equal(absent.target, 'points-jobs');
  assert.equal(absent.previousPages, null);
  assert.equal(state.calls.length, 2);
  assert.ok(!JSON.stringify(absent).includes('private-value'));
  state.functions = bySlug([...state.functions, { ...POINTS_JOBS_FN, version: 2 }]);
  assert.deepEqual((await livePreflight(cwd, env, fake)).pointsJobsBefore, { present: true, version: 2 });
  await assert.rejects(livePreflight(cwd, { ...env, RELEASE_HISTORY_SHA256: 'a'.repeat(64) }, fake), /differs/);
  // Only points-jobs records this. The other targets keep their report shape, and push-reminders its must-already-exist rule.
  for (const target of ['api', 'push-reminders']) assert.ok(!('pointsJobsBefore' in await livePreflight(cwd, { ...env, RELEASE_TARGET: target }, fake)), target);
  state.functions = state.functions.filter(item => item.slug !== 'gtl-push-reminders');
  await assert.rejects(livePreflight(cwd, { ...env, RELEASE_TARGET: 'push-reminders' }, fake), /push reminder worker is missing/);
});

test('points-jobs verification, first deploy: created ACTIVE at version 1 with JWT off and a digest, nothing else changed', async t => {
  const { cwd, state, fake, before: base, migrations } = hostedFixture(t);
  const before = { ...base, pointsJobsBefore: { present: false, version: null } };
  const env = request({ RELEASE_TARGET: 'points-jobs', RELEASE_MODE: 'deploy' });
  const created = (values = {}) => bySlug([...base.functions, { ...POINTS_JOBS_FN, ...values }]);
  state.functions = created();
  const report = await verifyRelease(cwd, env, before, fake);
  assert.deepEqual(report.pointsJobs, POINTS_JOBS_FN);
  assert.equal(report.pointsJobsCreated, true);
  assert.equal(report.pointsJobsSourceVerified, false);
  assert.equal(report.target, 'points-jobs');
  assert.deepEqual(report.api, base.functions[0]);
  assert.equal(report.pages, null, 'the frontend is not deployed or checked');
  assert.ok(!('pushReminders' in report));
  assert.ok(state.calls.every(url => url.startsWith('https://api.supabase.com/')), 'no Cloudflare or Pages request');

  for (const [values, error] of [
    [{ status: 'BOOTING' }, /points jobs worker must be ACTIVE/],
    [{ verify_jwt: true }, /JWT verification off/],
    [{ version: 2 }, /create version 1/],
    [{ bundleSha256: null }, /bundle digest/],
    [{ bundleSha256: 'A'.repeat(64) }, /bundle digest/],
  ]) {
    state.functions = created(values);
    await assert.rejects(verifyRelease(cwd, env, before, fake), error, JSON.stringify(values));
  }
  state.functions = base.functions;
  await assert.rejects(verifyRelease(cwd, env, before, fake), /points jobs worker must be ACTIVE/, 'the deploy created nothing');
  for (const [label, edit, error] of [
    ['gtl-api version', list => list.map(item => item.slug === 'gtl-api' ? { ...item, version: 32 } : item), /API changed during points-jobs-only release/],
    ['gtl-api bundle', list => list.map(item => item.slug === 'gtl-api' ? { ...item, bundleSha256: 'f'.repeat(64) } : item), /API changed during points-jobs-only release/],
    ['gtl-push-reminders version', list => list.map(item => item.slug === 'gtl-push-reminders' ? { ...item, version: 5 } : item), /Another Edge function changed/],
    ['gtl-push-reminders JWT', list => list.map(item => item.slug === 'gtl-push-reminders' ? { ...item, verify_jwt: true } : item), /Another Edge function changed/],
    ['gtl-week-open version', list => list.map(item => item.slug === 'gtl-week-open' ? { ...item, version: 4 } : item), /Another Edge function changed/],
    ['another function added', list => bySlug([...list, { slug: 'gtl-zz-new', version: 1, status: 'ACTIVE', verify_jwt: false, bundleSha256: null }]), /Another Edge function changed/],
    ['another function removed', list => list.filter(item => item.slug !== 'gtl-week-open'), /Another Edge function changed/],
  ]) {
    state.functions = edit(created());
    await assert.rejects(verifyRelease(cwd, env, before, fake), error, label);
  }

  state.functions = created();
  state.migrations = [...migrations, { version: '20261026120000', name: 'gtl_points_jobs' }];
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Migration history changed/);
  state.migrations = migrations;
  globalThis.gtlBoundaryFailure = 'anonymous gtl_claim_points_jobs RPC: unexpected 200';
  await assert.rejects(verifyRelease(cwd, env, before, fake), /gtl_claim_points_jobs/);
  delete globalThis.gtlBoundaryFailure;
  // A pre-deploy report that does not record the worker's absence (for example another target's preflight) is refused.
  await assert.rejects(verifyRelease(cwd, env, base, fake), /pre-deploy report/);
  assert.equal((await verifyRelease(cwd, env, before, fake)).pointsJobsCreated, true);
});

const LEAGUE_FEATURES_FN = Object.freeze({ slug: 'gtl-league-features', version: 1, status: 'ACTIVE', verify_jwt: false, bundleSha256: 'b'.repeat(64) });

test('league-features: the preflight records whether the worker exists, and verification takes the create or the update rule', async t => {
  const { cwd, state, fake, before: base, migrations } = hostedFixture(t);
  t.mock.method(Date, 'now', () => Date.parse('2026-10-26T20:00:00Z'));
  const env = request({ RELEASE_TARGET: 'league-features', RELEASE_MODE: 'deploy', RELEASE_HISTORY_SHA256: migrationDigest(migrations), SUPABASE_PROJECT_REF: PROJECT, VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ACCESS_TOKEN: 'private-value' });
  const absent = await livePreflight(cwd, env, fake);
  assert.deepEqual(absent.leagueFeaturesBefore, { present: false, version: null });
  assert.equal(absent.previousPages, null);
  assert.ok(!('pointsJobsBefore' in absent), 'only its own worker is recorded');
  // First deploy: created ACTIVE at version 1 with JWT off and a digest; every other function unchanged.
  const before = { ...base, leagueFeaturesBefore: { present: false, version: null } };
  const created = (values = {}) => bySlug([...base.functions, { ...LEAGUE_FEATURES_FN, ...values }]);
  state.functions = created();
  const report = await verifyRelease(cwd, env, before, fake);
  assert.deepEqual(report.leagueFeatures, LEAGUE_FEATURES_FN);
  assert.equal(report.leagueFeaturesCreated, true);
  assert.equal(report.leagueFeaturesSourceVerified, false);
  assert.equal(report.pages, null);
  for (const [values, error] of [[{ verify_jwt: true }, /JWT verification off/], [{ version: 2 }, /create version 1/], [{ status: 'BOOTING' }, /league features worker must be ACTIVE/]]) {
    state.functions = created(values);
    await assert.rejects(verifyRelease(cwd, env, before, fake), error, JSON.stringify(values));
  }
  state.functions = created().map(item => item.slug === 'gtl-push-reminders' ? { ...item, version: 5 } : item);
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/);
  state.functions = created();
  await assert.rejects(verifyRelease(cwd, env, base, fake), /pre-deploy report/, 'a report without the leagueFeaturesBefore record');
  // Update: an existing worker needs exactly one version up.
  const existing = { ...base, functions: created(), leagueFeaturesBefore: { present: true, version: 1 } };
  state.functions = created({ version: 2, bundleSha256: 'c'.repeat(64) });
  assert.equal((await verifyRelease(cwd, env, existing, fake)).leagueFeaturesCreated, false);
  state.functions = created({ version: 3 });
  await assert.rejects(verifyRelease(cwd, env, existing, fake), /exactly one league features worker version/);
});

const FANTASY_INGEST_FN = Object.freeze({ slug: 'gtl-fantasy-ingest', version: 1, status: 'ACTIVE', verify_jwt: false, bundleSha256: 'd'.repeat(64) });

// Contract (October 28, 2026): fantasy-ingest follows league-features, and its verification never calls the worker itself.
// Until GTL_FANTASY_FEED_UPLOAD_SECRET is set it answers 503, so its 401 probe joins workerChecks only after the deploy.
test('fantasy-ingest: the preflight records whether the worker exists, and verification takes the create or the update rule', async t => {
  const { cwd, state, fake, before: base, migrations } = hostedFixture(t);
  t.mock.method(Date, 'now', () => Date.parse('2026-10-28T20:00:00Z'));
  const env = request({ RELEASE_TARGET: 'fantasy-ingest', RELEASE_MODE: 'deploy', RELEASE_HISTORY_SHA256: migrationDigest(migrations), SUPABASE_PROJECT_REF: PROJECT, VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ACCESS_TOKEN: 'private-value' });
  const absent = await livePreflight(cwd, env, fake);
  assert.deepEqual(absent.fantasyIngestBefore, { present: false, version: null });
  assert.equal(absent.previousPages, null);
  assert.ok(!('leagueFeaturesBefore' in absent) && !('pointsJobsBefore' in absent), 'only its own worker is recorded');
  assert.ok(!('fantasyIngestBefore' in await livePreflight(cwd, { ...env, RELEASE_TARGET: 'league-features' }, fake)), 'league-features does not record it');
  // First deploy: created ACTIVE at version 1 with JWT off and a digest; every other function unchanged.
  const before = { ...base, fantasyIngestBefore: { present: false, version: null } };
  const created = (values = {}) => bySlug([...base.functions, { ...FANTASY_INGEST_FN, ...values }]);
  state.functions = created();
  state.calls.length = 0;
  const report = await verifyRelease(cwd, env, before, fake);
  assert.deepEqual(report.fantasyIngest, FANTASY_INGEST_FN);
  assert.equal(report.fantasyIngestCreated, true);
  assert.equal(report.fantasyIngestSourceVerified, false);
  assert.equal(report.pages, null);
  assert.ok(!('leagueFeatures' in report) && !('pushReminders' in report));
  // Management API metadata only: no request reaches the worker, so its 503 before the secret is set cannot fail this.
  assert.ok(state.calls.length > 0 && state.calls.every(url => url.startsWith(`https://api.supabase.com/v1/projects/${PROJECT}/`)), state.calls.join(' '));
  for (const [values, error] of [
    [{ verify_jwt: true }, /JWT verification off \(its upload secret is checked in the function\)/],
    [{ version: 2 }, /create version 1/],
    [{ status: 'BOOTING' }, /fantasy feed upload worker must be ACTIVE/],
    [{ bundleSha256: null }, /fantasy feed upload worker bundle digest/],
  ]) {
    state.functions = created(values);
    await assert.rejects(verifyRelease(cwd, env, before, fake), error, JSON.stringify(values));
  }
  state.functions = created().map(item => item.slug === 'gtl-push-reminders' ? { ...item, version: 5 } : item);
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/);
  state.functions = created().map(item => item.slug === 'gtl-api' ? { ...item, version: 32 } : item);
  await assert.rejects(verifyRelease(cwd, env, before, fake), /API changed during fantasy-ingest-only release/);
  state.functions = created();
  await assert.rejects(verifyRelease(cwd, env, base, fake), /pre-deploy report/, 'a report without the fantasyIngestBefore record');
  await assert.rejects(verifyRelease(cwd, env, { ...base, leagueFeaturesBefore: { present: false, version: null } }, fake), /pre-deploy report/, 'another worker\'s record');
  // Only this target may create it: the same appearance fails a league-features run.
  await assert.rejects(verifyRelease(cwd, { ...env, RELEASE_TARGET: 'league-features' }, { ...base, leagueFeaturesBefore: { present: false, version: null } }, fake), /Another Edge function changed/);
  // Update (a redeploy after setting or rotating the secret): an existing worker needs exactly one version up.
  const existing = { ...base, functions: created(), fantasyIngestBefore: { present: true, version: 1 } };
  state.functions = created({ version: 2, bundleSha256: 'e'.repeat(64) });
  assert.equal((await verifyRelease(cwd, env, existing, fake)).fantasyIngestCreated, false);
  state.functions = created({ version: 3 });
  await assert.rejects(verifyRelease(cwd, env, existing, fake), /exactly one fantasy feed upload worker version/);
});

test('points-jobs verification, update: an existing worker needs exactly one version up and the same checks', async t => {
  const { cwd, state, fake, before: base } = hostedFixture(t);
  const before = { ...base, functions: bySlug([...base.functions, { ...POINTS_JOBS_FN, version: 2 }]), pointsJobsBefore: { present: true, version: 2 } };
  const env = request({ RELEASE_TARGET: 'points-jobs', RELEASE_MODE: 'deploy' });
  const updated = (values = {}) => before.functions.map(item => item.slug === 'gtl-points-jobs' ? { ...item, version: 3, bundleSha256: 'd'.repeat(64), ...values } : item);
  state.functions = updated();
  const report = await verifyRelease(cwd, env, before, fake);
  assert.equal(report.pointsJobs.version, 3);
  assert.equal(report.pointsJobsCreated, false);
  for (const [values, error] of [
    [{ version: 2, bundleSha256: 'a'.repeat(64) }, /exactly one points jobs worker version/],
    [{ version: 4 }, /exactly one points jobs worker version/],
    [{ version: 1 }, /exactly one points jobs worker version/],
    [{ verify_jwt: true }, /JWT verification off/],
    [{ status: 'THROTTLED' }, /ACTIVE/],
    [{ bundleSha256: null }, /bundle digest/],
  ]) {
    state.functions = updated(values);
    await assert.rejects(verifyRelease(cwd, env, before, fake), error, JSON.stringify(values));
  }
  state.functions = updated().map(item => item.slug === 'gtl-push-reminders' ? { ...item, version: 5 } : item);
  await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/);
  state.functions = updated();
  await assert.rejects(verifyRelease(cwd, env, { ...before, pointsJobsBefore: { present: false, version: null } }, fake), /pre-deploy report/);
});

test('every other target fails when gtl-points-jobs appears or changes during its run', async t => {
  const { cwd, state, fake, before } = hostedFixture(t);
  const own = { frontend: {}, api: { 'gtl-api': 32 }, 'api-and-frontend': { 'gtl-api': 32 }, 'push-reminders': { 'gtl-push-reminders': 5 } };
  const deployedOwn = (list, target) => list.map(item => Object.hasOwn(own[target], item.slug) ? { ...item, version: own[target][item.slug], bundleSha256: 'e'.repeat(64) } : item);
  const withPoints = { ...before, functions: bySlug([...before.functions, POINTS_JOBS_FN]) };
  for (const target of Object.keys(own)) {
    const env = request({ RELEASE_TARGET: target, RELEASE_MODE: 'deploy' });
    state.functions = bySlug([...deployedOwn(before.functions, target), POINTS_JOBS_FN]);
    await assert.rejects(verifyRelease(cwd, env, before, fake), /Another Edge function changed/, `${target}: worker created`);
    state.functions = deployedOwn(withPoints.functions, target).map(item => item.slug === 'gtl-points-jobs' ? { ...item, version: 2 } : item);
    await assert.rejects(verifyRelease(cwd, env, withPoints, fake), /Another Edge function changed/, `${target}: worker updated`);
  }
  // Without the points worker changing, the API and worker targets still pass with it present.
  for (const target of ['api', 'push-reminders']) {
    state.functions = deployedOwn(withPoints.functions, target);
    await verifyRelease(cwd, request({ RELEASE_TARGET: target, RELEASE_MODE: 'deploy' }), withPoints, fake);
  }
});

test('supabase/config.toml registers gtl-epl-jobs with gateway JWT verification off', () => {
  const config = fs.readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config, /\[functions\.gtl-epl-jobs\]\n(?:#.*\n)*verify_jwt = false/);
  assert.deepEqual(TARGET_DEPLOYS['epl-jobs'], { edgeFunction: 'gtl-epl-jobs', pages: false, createsOnFirstDeploy: true });
});
