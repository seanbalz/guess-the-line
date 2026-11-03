#!/usr/bin/env node
// Item 22: opens, updates or closes the ops-alert issue for one completed Fantasy or Research data refresh run
// (shared/ops-alert.mjs decides which). Run by .github/workflows/ops-alerts.yml; `--dry-run` prints the plan and writes
// nothing, for checking a past run by hand: RUN_ID=<id> GH_TOKEN=$(gh auth token) node scripts/ops-alert.mjs --dry-run
import { fileURLToPath } from 'node:url';
import { OPS_ALERT_LABEL, alertPlan } from '../shared/ops-alert.mjs';
import { FANTASY_REPOSITORY } from '../shared/fantasy-index.mjs';

export async function runOpsAlert({ env = process.env, fetchImpl = fetch, dryRun = false, log = console.log } = {}) {
  const repo = env.GITHUB_REPOSITORY || FANTASY_REPOSITORY, runId = String(env.RUN_ID ?? '');
  if (!/^\d+$/.test(runId)) throw new Error('RUN_ID must be a workflow run id.');
  const api = async (route, { method = 'GET', body, allow = [] } = {}) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}${route}`, { method, signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok && !allow.includes(response.status)) throw new Error(`GitHub ${method} ${route}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const run = await api(`/actions/runs/${runId}`);
  const { jobs } = await api(`/actions/runs/${runId}/jobs?per_page=100`);
  const issues = (await api(`/issues?labels=${OPS_ALERT_LABEL}&state=open&per_page=100`)).filter(issue => !issue.pull_request);
  const plan = alertPlan({ run, jobs, issues });
  log(JSON.stringify({ run: run.id, workflow: run.path, conclusion: run.conclusion, action: plan.action, ...(plan.number ? { issue: plan.number } : {}), ...(plan.reason ? { reason: plan.reason } : {}), dryRun }));
  if (dryRun || plan.action === 'none') return plan;
  if (plan.action === 'open') {
    // 422: the label already exists.
    await api('/labels', { method: 'POST', allow: [422], body: { name: OPS_ALERT_LABEL, color: 'B60205', description: 'A scheduled data job failed (item 22)' } });
    const assignee = env.ALERT_ASSIGNEE || repo.split('/')[0];
    const issue = await api('/issues', { method: 'POST', body: { title: plan.title, body: plan.body, labels: [OPS_ALERT_LABEL], assignees: [assignee] } });
    log(JSON.stringify({ opened: issue.number }));
  } else if (plan.action === 'update') {
    await api(`/issues/${plan.number}`, { method: 'PATCH', body: { body: plan.body } });
  } else {
    // Close first: if the comment then fails, a retry finds no open alert instead of posting the comment twice.
    await api(`/issues/${plan.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } });
    await api(`/issues/${plan.number}/comments`, { method: 'POST', body: { body: plan.comment } });
  }
  return plan;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runOpsAlert({ dryRun: process.argv.includes('--dry-run') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
