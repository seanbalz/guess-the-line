// Contract (item 22): a failed Fantasy or Research data refresh on main opens exactly one alert issue per workflow,
// assigned and labelled, carrying no log text; further failures only edit that issue (one notification per incident);
// only a later run that actually published closes it; cancelled, dry, older, fork and non-main runs change nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { alertPlan, alertBody, readAlertState, failedStep, published, OPS_ALERT_LABEL } from '../shared/ops-alert.mjs';
import { runOpsAlert } from '../scripts/ops-alert.mjs';

const FANTASY = '.github/workflows/fantasy-refresh.yml', RESEARCH = '.github/workflows/research-refresh.yml';
const run = over => ({ id: 101, name: 'Fantasy refresh', path: FANTASY, head_branch: 'main', event: 'schedule', conclusion: 'failure',
  html_url: 'https://github.com/seanbalz/guess-the-line/actions/runs/101', run_started_at: '2026-11-03T08:54:24Z', updated_at: '2026-11-03T08:55:30Z',
  repository: { full_name: 'seanbalz/guess-the-line' }, head_repository: { full_name: 'seanbalz/guess-the-line' },
  display_title: 'Fantasy refresh', head_commit: { message: 'secret-looking commit text' }, ...over });
const buildFailed = [{ steps: [{ name: 'Set up job', conclusion: 'success' }, { name: 'Build', conclusion: 'failure' }, { name: 'Publish', conclusion: 'skipped' }] }];
const publishedOk = [{ steps: [{ name: 'Build', conclusion: 'success' }, { name: 'Publish', conclusion: 'success' }] }];
const dryOk = [{ steps: [{ name: 'Build', conclusion: 'success' }, { name: 'Publish', conclusion: 'skipped' }] }];
const openAlert = (over = {}) => {
  const state = { workflow: FANTASY, name: 'Fantasy refresh', first: '2026-11-03T08:54:24Z', failures: 2,
    last: { id: 102, url: 'https://github.com/seanbalz/guess-the-line/actions/runs/102', event: 'workflow_dispatch', at: '2026-11-03T09:34:36Z', step: 'Build' }, ...over };
  return { number: 7, body: alertBody(state) };
};

test('a failed main run with no open alert opens one, naming the failed step and the run, without log or commit text', () => {
  const plan = alertPlan({ run: run(), jobs: buildFailed, issues: [] });
  assert.equal(plan.action, 'open');
  assert.equal(plan.title, 'Ops alert: Fantasy refresh is failing');
  assert.match(plan.body, /Failed step: Build/);
  assert.match(plan.body, /\[run 101\]\(https:\/\/github\.com\/seanbalz\/guess-the-line\/actions\/runs\/101\) \(schedule\), started 2026-11-03 08:54 UTC/);
  assert.doesNotMatch(plan.body, /secret-looking/);
  assert.deepEqual(readAlertState(plan.body), { workflow: FANTASY, name: 'Fantasy refresh', first: '2026-11-03T08:54:24Z', failures: 1,
    last: { id: 101, url: run().html_url, event: 'schedule', at: '2026-11-03T08:54:24Z', step: 'Build' } });
});

test('timeouts and startup failures alert too, with no step recorded', () => {
  for (const conclusion of ['timed_out', 'startup_failure']) {
    const plan = alertPlan({ run: run({ conclusion }), jobs: [], issues: [] });
    assert.equal(plan.action, 'open', conclusion);
    assert.match(plan.body, /Failed step: none recorded/);
  }
});

test('a later failure edits the open alert (no new issue or comment), counts it and keeps the first failure time', () => {
  const plan = alertPlan({ run: run({ id: 103, run_started_at: '2026-11-03T10:14:48Z' }), jobs: buildFailed, issues: [openAlert()] });
  assert.equal(plan.action, 'update');
  assert.equal(plan.number, 7);
  const state = readAlertState(plan.body);
  assert.equal(state.failures, 3);
  assert.equal(state.first, '2026-11-03T08:54:24Z');
  assert.equal(state.last.id, 103);
});

test('only a later run that published closes the alert; a dry run or a skipped publish leaves it open', () => {
  const later = { id: 104, conclusion: 'success', event: 'workflow_dispatch', run_started_at: '2026-11-03T11:02:05Z', updated_at: '2026-11-03T11:03:40Z' };
  const close = alertPlan({ run: run(later), jobs: publishedOk, issues: [openAlert()] });
  assert.equal(close.action, 'close');
  assert.equal(close.number, 7);
  assert.match(close.comment, /^Recovered: \[run 104\]\(.*\) \(workflow_dispatch\) published at 2026-11-03 11:03 UTC, after 2 failed runs\. Closing\.$/);
  assert.equal(alertPlan({ run: run(later), jobs: dryOk, issues: [openAlert()] }).action, 'none');
});

test('runs older than the open alert never update or close it (a replayed or late-reported run)', () => {
  const older = '2026-11-03T09:00:00Z';
  assert.equal(alertPlan({ run: run({ run_started_at: older }), jobs: buildFailed, issues: [openAlert()] }).action, 'none');
  assert.equal(alertPlan({ run: run({ run_started_at: older, conclusion: 'success' }), jobs: publishedOk, issues: [openAlert()] }).action, 'none');
});

test('cancelled, skipped, non-main and unwatched runs change nothing; a success with no open alert does nothing', () => {
  for (const conclusion of ['cancelled', 'skipped', 'neutral']) assert.equal(alertPlan({ run: run({ conclusion }), jobs: [], issues: [openAlert()] }).action, 'none', conclusion);
  assert.equal(alertPlan({ run: run({ head_branch: 'claude/x' }), jobs: buildFailed, issues: [] }).action, 'none');
  assert.equal(alertPlan({ run: run({ head_repository: { full_name: 'someone/fork' } }), jobs: buildFailed, issues: [] }).action, 'none', 'a fork\'s main is not main');
  assert.equal(alertPlan({ run: run({ head_repository: { full_name: 'someone/fork' }, conclusion: 'success' }), jobs: publishedOk, issues: [openAlert()] }).action, 'none');
  assert.equal(alertPlan({ run: run({ path: '.github/workflows/test.yml', name: 'Tests' }), jobs: buildFailed, issues: [] }).action, 'none');
  assert.equal(alertPlan({ run: run({ conclusion: 'success' }), jobs: publishedOk, issues: [] }).action, 'none');
});

test('each workflow has its own alert: a Research failure opens one beside an open Fantasy alert and never edits it', () => {
  const research = run({ name: 'Research data refresh', path: RESEARCH, run_started_at: '2026-11-03T12:23:00Z' });
  const plan = alertPlan({ run: research, jobs: [{ steps: [{ name: 'Publish and verify data', conclusion: 'failure' }] }], issues: [openAlert(), { number: 9, body: 'unrelated issue' }] });
  assert.equal(plan.action, 'open');
  assert.equal(readAlertState(plan.body).workflow, RESEARCH);
  assert.equal(failedStep([{ steps: [{ name: 'Publish and verify data', conclusion: 'failure' }] }]), 'Publish and verify data');
  assert.ok(published([{ steps: [{ name: 'Publish and verify data', conclusion: 'success' }] }]), 'the Research publish step counts');
});

test('the state marker survives any text: "--" cannot end the hidden comment early', () => {
  const body = alertBody({ workflow: FANTASY, name: 'A -- B', first: '2026-11-03T08:54:24Z', failures: 1, last: { id: 1, url: 'u', event: 'schedule', at: '2026-11-03T08:54:24Z', step: 'x --> y' } });
  const marker = body.slice(body.indexOf('<!-- ops-alert '));
  assert.equal(marker.indexOf('-->'), marker.length - 3);
  assert.equal(readAlertState(body).last.step, 'x --> y');
  assert.equal(readAlertState('<!-- ops-alert {not json} -->'), null);
});

const fakeGitHub = ({ runOver = {}, jobs = buildFailed, issues = [], labelStatus = 201 } = {}) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const route = url.replace('https://api.github.com/repos/seanbalz/guess-the-line', ''), method = init.method;
    calls.push({ method, route, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
    const reply = (status, json) => ({ ok: status < 300, status, json: async () => json });
    if (method === 'GET' && route === '/actions/runs/101') return reply(200, run(runOver));
    if (method === 'GET' && route.startsWith('/actions/runs/101/jobs')) return reply(200, { jobs });
    if (method === 'GET' && route.startsWith('/issues?')) return reply(200, issues);
    if (route === '/labels') return reply(labelStatus, {});
    if (method === 'POST' && route === '/issues') return reply(201, { number: 12 });
    return reply(200, {});
  };
  return { calls, fetchImpl };
};
const env = { RUN_ID: '101', GH_TOKEN: 'test-token', GITHUB_REPOSITORY: 'seanbalz/guess-the-line' };

test('opening: the label is ensured (an existing label is fine) and the issue is assigned to the repository owner', async () => {
  const github = fakeGitHub({ labelStatus: 422 });
  const plan = await runOpsAlert({ env, fetchImpl: github.fetchImpl, log: () => {} });
  assert.equal(plan.action, 'open');
  const writes = github.calls.filter(call => call.method !== 'GET');
  assert.deepEqual(writes.map(call => `${call.method} ${call.route}`), ['POST /labels', 'POST /issues']);
  assert.deepEqual(writes[1].body.labels, [OPS_ALERT_LABEL]);
  assert.deepEqual(writes[1].body.assignees, ['seanbalz']);
  assert.ok(github.calls.every(call => call.auth === 'Bearer test-token'));
  assert.match(github.calls.find(call => call.route.startsWith('/issues?')).route, /labels=ops-alert&state=open/);
});

test('updating edits only the body; closing comments, then closes; pull requests in the issue list are ignored', async () => {
  const update = fakeGitHub({ runOver: { run_started_at: '2026-11-03T10:14:48Z' }, issues: [openAlert(), { number: 3, body: openAlert().body, pull_request: {} }] });
  await runOpsAlert({ env, fetchImpl: update.fetchImpl, log: () => {} });
  assert.deepEqual(update.calls.filter(call => call.method !== 'GET').map(call => `${call.method} ${call.route}`), ['PATCH /issues/7']);
  assert.deepEqual(Object.keys(update.calls.at(-1).body), ['body']);

  const close = fakeGitHub({ runOver: { conclusion: 'success', run_started_at: '2026-11-03T11:02:05Z' }, jobs: publishedOk, issues: [openAlert()] });
  await runOpsAlert({ env, fetchImpl: close.fetchImpl, log: () => {} });
  const writes = close.calls.filter(call => call.method !== 'GET');
  assert.deepEqual(writes.map(call => `${call.method} ${call.route}`), ['POST /issues/7/comments', 'PATCH /issues/7']);
  assert.deepEqual(writes[1].body, { state: 'closed', state_reason: 'completed' });
});

test('a dry run reads but never writes, and a bad run id or a failed API call stops with an error', async () => {
  const github = fakeGitHub();
  assert.equal((await runOpsAlert({ env, fetchImpl: github.fetchImpl, dryRun: true, log: () => {} })).action, 'open');
  assert.ok(github.calls.every(call => call.method === 'GET'));
  await assert.rejects(runOpsAlert({ env: { ...env, RUN_ID: '101; rm' }, fetchImpl: github.fetchImpl, log: () => {} }), /RUN_ID/);
  const broken = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(runOpsAlert({ env, fetchImpl: broken, log: () => {} }), /HTTP 500/);
});
