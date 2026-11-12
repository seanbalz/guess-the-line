import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../.github', import.meta.url));
function yamlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? yamlFiles(file) : /\.ya?ml$/.test(file) ? [file] : [];
  });
}

test('every external action in workflows and composite actions has an immutable pin', () => {
  let checked = 0;
  for (const file of yamlFiles(root)) {
    for (const [, action] of readFileSync(file, 'utf8').matchAll(/^\s*(?:-\s*)?uses:\s*["']?([^\s"']+)/gm)) {
      if (action.startsWith('./')) continue;
      assert.match(action, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/, `${path.relative(root, file)}: ${action}`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'external actions were inspected');
});
