import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateRequest, configuration, successfulRun, checkSource, publishedSchedule, migrationDigest, jsonRequest, livePreflight, verifyRelease, REPOSITORY, PROJECT, ACCOUNT, REQUIRED_CI } from '../scripts/release-preflight.mjs';

const sha = 'a'.repeat(40);
const request = (extra = {}) => ({ RELEASE_SHA: sha, RELEASE_TARGET: 'frontend', RELEASE_MODE: 'check-only', ...extra });
const ciRun = (extra = {}) => ({ id: 1, run_attempt: 1, head_sha: sha, event: 'push', head_branch: 'main', path: '.github/workflows/test.yml', repository: { full_name: REPOSITORY }, status: 'completed', conclusion: 'success', html_url: 'https://github.com/example/run/1', ...extra });
const jobs = [{ name: 'Typecheck and test', status: 'completed', conclusion: 'success' }];
const slate = kickoffs => [{ season: 2026, week: 6, kickoffs: kickoffs.map(date => Date.parse(date) / 1000) }];

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
