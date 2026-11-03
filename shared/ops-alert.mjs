// Item 22: failure alerts for the scheduled GitHub data workflows. A failed run on main opens one issue per workflow,
// assigned to the repository owner (GitHub notifies the phone app and email); later failures only update its body, so
// one incident sends one notification, and the next run that publishes comments and closes it. The repository is public,
// so an alert carries only the workflow name, run link, event, failed step and times, never log text.
export const OPS_ALERT_LABEL = 'ops-alert';
export const WATCHED_WORKFLOWS = Object.freeze(['.github/workflows/fantasy-refresh.yml', '.github/workflows/research-refresh.yml']);
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const MARKER = /<!-- ops-alert (\{.*?\}) -->/;

const utc = value => `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const startedAt = run => run.run_started_at ?? run.created_at;

/** The first step that failed, or null (a startup failure or a timed-out job may record none). */
export function failedStep(jobs) {
  for (const job of jobs ?? []) for (const step of job.steps ?? []) if (FAILED.has(step.conclusion)) return step.name;
  return null;
}

/** True when a publish step ran and succeeded: a dry run, or a run whose publish was skipped, proves nothing. */
export const published = jobs => (jobs ?? []).some(job => (job.steps ?? []).some(step => /^Publish\b/.test(step.name) && step.conclusion === 'success'));

/** The alert state kept in the issue body, or null for any other issue. */
export function readAlertState(body) {
  const match = typeof body === 'string' ? body.match(MARKER) : null;
  try { return match ? JSON.parse(match[1]) : null; } catch { return null; }
}

export const alertTitle = name => `Ops alert: ${name} is failing`;

export function alertBody(state) {
  const { name, first, failures, last } = state;
  // "--" never appears inside the comment, so the marker cannot be closed early.
  const marker = JSON.stringify(state).replace(/--/g, '\\u002d\\u002d');
  return [
    `**${name}** has failed on main since ${utc(first)}.`,
    '',
    `- Latest failure: [run ${last.id}](${last.url}) (${last.event}), started ${utc(last.at)}`,
    `- Failed step: ${last.step ?? 'none recorded (startup failure or timeout)'}`,
    `- Failed runs since this opened: ${failures}`,
    '',
    'This issue closes itself when a run publishes successfully. The run log has the details; this public issue never copies log text.',
    '',
    `<!-- ops-alert ${marker} -->`,
  ].join('\n');
}

/**
 * What to do for one completed run: open an alert, update it, close it, or nothing. `issues` are the open issues
 * labelled ops-alert; each workflow has at most one alert, found by the workflow path in its state.
 */
export function alertPlan({ run, jobs, issues }) {
  // A fork's branch can also be called main; only this repository's own runs count.
  const fork = run.head_repository?.full_name !== run.repository?.full_name;
  if (run.head_branch !== 'main' || fork || !WATCHED_WORKFLOWS.includes(run.path)) return { action: 'none', reason: 'Not a watched run on main.' };
  const open = (issues ?? []).map(issue => ({ issue, state: readAlertState(issue.body) })).find(({ state }) => state?.workflow === run.path);
  const at = startedAt(run);
  const stale = open && Date.parse(at) <= Date.parse(open.state.last.at);
  if (FAILED.has(run.conclusion)) {
    const last = { id: run.id, url: run.html_url, event: run.event, at, step: failedStep(jobs) };
    if (!open) return { action: 'open', title: alertTitle(run.name), body: alertBody({ workflow: run.path, name: run.name, first: at, failures: 1, last }) };
    if (stale) return { action: 'none', reason: 'Older than the open alert.' };
    return { action: 'update', number: open.issue.number, body: alertBody({ ...open.state, failures: open.state.failures + 1, last }) };
  }
  if (run.conclusion !== 'success' || !open) return { action: 'none', reason: open ? `Run ${run.conclusion}.` : 'No open alert.' };
  if (stale) return { action: 'none', reason: 'Older than the open alert.' };
  if (!published(jobs)) return { action: 'none', reason: 'The run published nothing.' };
  return { action: 'close', number: open.issue.number,
    comment: `Recovered: [run ${run.id}](${run.html_url}) (${run.event}) published at ${utc(run.updated_at)}, after ${open.state.failures} failed run${open.state.failures === 1 ? '' : 's'}. Closing.` };
}
