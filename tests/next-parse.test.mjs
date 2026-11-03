// Contract: no new-app source file can contain a syntax error, whether or not anything imports it yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const files = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.jsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));

test('parse: every .js and .jsx file under web/src/next parses', () => {
  const failures = [];
  for (const file of files('web/src/next')) {
    try {
      transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic', format: 'esm' });
    } catch (error) {
      failures.push(`${file}: ${String(error.message).split('\n')[1] ?? error.message}`);
    }
  }
  assert.deepEqual(failures, []);
});
