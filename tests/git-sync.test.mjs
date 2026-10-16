import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncCheckout } from '../scripts/git-sync.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gtl-git-sync-'));
  // Git/Windows can briefly retain handles after a child exits; still fail if
  // the fixture cannot be removed after bounded retries. Async rm also avoids
  // the rmSync EPERM retry bug in older Node 24 releases (nodejs/node#64016).
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const remote = join(root, 'remote.git'), local = join(root, 'local'), other = join(root, 'other');
  const globalConfig = join(root, 'empty-git-config'); writeFileSync(globalConfig, '');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig } }).trim();
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  mkdirSync(local);
  git(local, 'init', '--initial-branch=main');
  for (const dir of [local]) {
    git(dir, 'config', 'user.name', 'Sync Fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid');
  }
  const commit = (dir, file, content = file) => {
    writeFileSync(join(dir, file), content); git(dir, 'add', '--', file); git(dir, 'commit', '-m', `Add ${file}`);
    return git(dir, 'rev-parse', 'HEAD');
  };
  commit(local, 'base.txt');
  git(local, 'remote', 'add', 'origin', remote); git(local, 'push', '-u', 'origin', 'main');
  git(root, 'clone', remote, other);
  git(other, 'config', 'user.name', 'Sync Fixture'); git(other, 'config', 'user.email', 'fixture@example.invalid');
  return { root, local, other, remote, git, commit, check: mode => syncCheckout({ cwd: local, mode }) };
}

test('clean identical branch verifies against actual remote', t => {
  const f = fixture(t), r = f.check('check');
  assert.equal(r.synced, true); assert.equal(r.local, r.remoteCommit); assert.equal(r.ahead, 0); assert.equal(r.behind, 0);
});
test('behind check reports drift; explicit pull fast-forwards a clean checkout', t => {
  const f = fixture(t), next = f.commit(f.other, 'online.txt'); f.git(f.other, 'push');
  const before = f.check('check'); assert.equal(before.synced, false); assert.equal(before.behind, 1);
  assert.notEqual(f.git(f.local, 'rev-parse', 'HEAD'), next);
  const after = f.check('pull'); assert.equal(after.synced, true); assert.equal(after.updated, true); assert.equal(after.local, next);
});
test('dirty tracked and untracked files survive a refused pull', t => {
  const f = fixture(t); f.commit(f.other, 'online.txt'); f.git(f.other, 'push');
  writeFileSync(join(f.local, 'base.txt'), 'unfinished'); writeFileSync(join(f.local, 'new.txt'), 'private draft');
  const head = f.git(f.local, 'rev-parse', 'HEAD'), r = f.check('pull');
  assert.equal(r.synced, false); assert.equal(r.updated, false); assert.equal(r.changed.length, 2);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(f.local, 'base.txt'), 'utf8'), 'unfinished');
  assert.equal(readFileSync(join(f.local, 'new.txt'), 'utf8'), 'private draft');
});
test('ahead commits are never automatically pushed', t => {
  const f = fixture(t); f.commit(f.local, 'local.txt'); const r = f.check('pull');
  assert.equal(r.ahead, 1); assert.equal(r.synced, false); assert.equal(r.updated, false);
  assert.notEqual(r.local, f.git(f.other, 'rev-parse', 'HEAD'));
});
test('divergence is preserved without merge, rebase or reset', t => {
  const f = fixture(t); const head = f.commit(f.local, 'local.txt'); f.commit(f.other, 'online.txt'); f.git(f.other, 'push');
  const r = f.check('pull'); assert.equal(r.ahead, 1); assert.equal(r.behind, 1); assert.equal(r.updated, false);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head);
});
test('different-name upstream cannot accidentally synchronize a feature branch to main', t => {
  const f = fixture(t); f.git(f.local, 'switch', '-c', 'topic', '--track', 'origin/main');
  const r = f.check('pull'); assert.equal(r.synced, false); assert.equal(r.fetched, false);
  assert.match(r.blockers.join(' '), /same branch name/);
});
test('detached HEAD and missing upstream remain explicit blockers', t => {
  const f = fixture(t); f.git(f.local, 'switch', '--detach');
  assert.match(f.check('pull').blockers.join(' '), /Detached/);
  f.git(f.local, 'switch', '-c', 'unpublished');
  assert.match(f.check('check').blockers.join(' '), /upstream/);
});
test('deleted upstream is not recreated', t => {
  const f = fixture(t); f.git(f.local, 'switch', '-c', 'topic'); f.git(f.local, 'push', '-u', 'origin', 'topic');
  f.git(f.other, 'push', 'origin', '--delete', 'topic');
  const r = f.check('pull'); assert.equal(r.synced, false); assert.equal(r.updated, false);
  assert.match(r.blockers.join(' '), /missing/);
});
test('unreachable remote never reports stale tracking refs as synchronized or prints credentials', t => {
  const f = fixture(t); f.git(f.local, 'remote', 'set-url', 'origin', join(f.root, 'does-not-exist-secret'));
  assert.throws(() => f.check('check'), error => !error.message.includes('secret') && /failed/.test(error.message));
});
test('incoming tracked file cannot overwrite ignored local state', t => {
  const f = fixture(t), head = f.git(f.local, 'rev-parse', 'HEAD');
  writeFileSync(join(f.local, '.git/info/exclude'), 'local-state.txt\n');
  writeFileSync(join(f.local, 'local-state.txt'), 'private local state');
  f.commit(f.other, 'local-state.txt', 'incoming content'); f.git(f.other, 'push');
  assert.throws(() => f.check('pull'), /merge failed/);
  assert.equal(f.git(f.local, 'rev-parse', 'HEAD'), head);
  assert.equal(readFileSync(join(f.local, 'local-state.txt'), 'utf8'), 'private local state');
});
test('local edits during remote verification prevent a false synced report', t => {
  const f = fixture(t), run = execFileSync;
  // Keep every real Git operation; introduce the edit at its network boundary
  // without a Unix PATH shim, executable shebang or platform command lookup.
  const hook = t.mock.method(childProcess, 'execFileSync', (file, args, options) => {
    const result = run(file, args, options);
    if (file === 'git' && args[0] === 'ls-remote' && options.cwd === f.local) {
      writeFileSync(join(f.local, 'base.txt'), 'concurrent edit');
    }
    return result;
  });
  syncBuiltinESMExports();
  try {
    const r = f.check('check'); assert.equal(r.synced, false); assert.equal(r.changed.length, 1);
    assert.match(r.blockers.join(' '), /appeared/);
  } finally { hook.mock.restore(); syncBuiltinESMExports(); }
});
