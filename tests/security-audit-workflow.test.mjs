import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/security-audit.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('security scans run on every PR, including web, shared, design and planning only changes', () => {
  assert.match(workflow, /^ {2}pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /^\s+(?:paths|paths-ignore|branches-ignore):/m);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\./);
});

test('security evidence uses the PR head, pinned engine, and retains failure artifacts', () => {
  assert.equal((workflow.match(/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/g) ?? []).length, 2);
  assert.match(workflow, /semgrep==1\.185\.0/);
  assert.match(workflow, /python scripts\/security_audit\.py/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /path: \.local\/security-audit\//);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /--autofix|--exclude|--disable-nosem|continue-on-error/);
});
