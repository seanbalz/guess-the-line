#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Only this checkout is inspected/updated. Never stage, stash, reset or push work.
export function syncCheckout({ cwd = process.cwd(), mode = 'check' } = {}) {
  const git = (...args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 60000,
        stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
    } catch {
      // Git errors may contain credential-bearing remote URLs. Don't echo them.
      throw new Error(`Git ${args[0]} failed; inspect authentication, connectivity and repository state locally.`);
    }
  };
  const optional = (...args) => { try { return git(...args); } catch { return null; } };
  if (!['check', 'pull'].includes(mode)) throw new Error('Use check or pull.');
  const root = git('rev-parse', '--show-toplevel');
  const branch = optional('symbolic-ref', '--quiet', '--short', 'HEAD');
  const report = { checkedAt: new Date().toISOString(), root, branch, mode, fetched: false,
    local: git('rev-parse', 'HEAD'), upstream: null, remoteCommit: null,
    ahead: null, behind: null, changed: [], blockers: [], synced: false, updated: false };
  const status = () => git('status', '--porcelain=v1', '--untracked-files=all').split('\n').filter(Boolean);
  report.changed = status();
  if (report.changed.length) report.blockers.push('Uncommitted or untracked files need a reviewed checkpoint.');
  const operations = () => ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'BISECT_LOG']
    .filter(marker => existsSync(resolve(cwd, git('rev-parse', '--git-path', marker))));
  for (const marker of operations()) report.blockers.push(`Finish the active Git operation (${marker}) first.`);
  if (!branch) {
    report.blockers.push('Detached HEAD has no branch to synchronize.');
    return report;
  }
  const remote = optional('config', '--get', `branch.${branch}.remote`);
  const mergeRef = optional('config', '--get', `branch.${branch}.merge`);
  if (!remote || remote === '.' || mergeRef !== `refs/heads/${branch}`) {
    report.blockers.push('Configure a remote upstream with the same branch name; a different branch is not a sync target.');
    return report;
  }
  git('fetch', '--prune', '--', remote);
  report.fetched = true;
  report.upstream = optional('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  if (!report.upstream) {
    report.blockers.push('The upstream branch is missing; review before creating or restoring it.');
    return report;
  }
  const refresh = () => {
    report.local = git('rev-parse', 'HEAD');
    report.remoteCommit = git('rev-parse', '@{upstream}');
    [report.ahead, report.behind] = git('rev-list', '--left-right', '--count', 'HEAD...@{upstream}').split(/\s+/).map(Number);
    report.changed = status();
  };
  refresh();
  if (mode === 'pull' && !report.blockers.length && report.ahead === 0 && report.behind > 0) {
    // Recheck before touching files; concurrent editing still requires separate worktrees.
    if (git('symbolic-ref', '--short', 'HEAD') !== branch || status().length) {
      report.blockers.push('Checkout changed during inspection; retry after coordinating its owner.');
    } else {
      // Fetch already completed. Unlike plain pull, refuse incoming files that
      // would overwrite ignored local files (including local state/secrets).
      git('merge', '--ff-only', '--no-overwrite-ignore', '@{upstream}');
      report.updated = true;
      refresh();
    }
  }
  const observed = git('ls-remote', '--exit-code', '--heads', '--', remote, mergeRef).split(/\s+/)[0];
  if (observed !== report.remoteCommit) report.blockers.push('Remote moved during verification; fetch and check again.');
  // The network observation can take time. Do not certify stale local state.
  const finalStatus = status();
  if (optional('symbolic-ref', '--quiet', '--short', 'HEAD') !== branch
    || git('rev-parse', 'HEAD') !== report.local
    || optional('config', '--get', `branch.${branch}.remote`) !== remote
    || optional('config', '--get', `branch.${branch}.merge`) !== mergeRef
    || optional('rev-parse', '@{upstream}') !== report.remoteCommit
    || operations().length) {
    report.blockers.push('Local branch, upstream or Git operation changed during verification; retry in an exclusively owned checkout.');
  }
  report.changed = finalStatus;
  if (report.ahead) report.blockers.push(`${report.ahead} local commit(s) need review and push or explicit reconciliation.`);
  if (report.behind) report.blockers.push(`${report.behind} remote commit(s) are not in this checkout.`);
  if (report.changed.length && !report.blockers.some(x => x.startsWith('Uncommitted'))) {
    report.blockers.push('Uncommitted or untracked files appeared during verification.');
  }
  report.synced = report.blockers.length === 0 && report.local === report.remoteCommit;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const positional = args.filter(x => x !== '--json');
  try {
    if (positional.length > 1) throw new Error('Usage: node scripts/git-sync.mjs [check|pull] [--json]');
    const report = syncCheckout({ mode: positional[0] || 'check' });
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`${report.synced ? 'SYNCED' : 'NOT SYNCED'}: ${report.branch || '(detached)'} -> ${report.upstream || '(no matching upstream)'}`);
      console.log(`Local: ${report.local}\nRemote: ${report.remoteCommit || 'unverified'}`);
      console.log(`Ahead: ${report.ahead ?? '?'}; behind: ${report.behind ?? '?'}; changed files: ${report.changed.length}`);
      for (const blocker of report.blockers) console.log(`- ${blocker}`);
      console.log('Scope: this branch and tracked/untracked files only; ignored files, other checkouts, private boards and deployments are separate.');
    }
    process.exitCode = report.synced ? 0 : 1;
  } catch (error) {
    console.error(json ? JSON.stringify({ synced: false, error: error.message }) : error.message);
    process.exitCode = 1;
  }
}
