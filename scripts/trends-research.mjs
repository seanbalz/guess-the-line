#!/usr/bin/env node
// Validate reviewed feed files privately. No output post text, selection or URL.
import { readFile, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReviewedFeed } from '../shared/trends-research-sources.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== 'validate' || args[1] !== '--file') throw Error();
  const file = await realpath(resolve(args[2]));
  const path = relative(root, file);
  if (path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path)) {
    let tracked = false, ignored = false;
    try { execFileSync('git', ['ls-files', '--error-unmatch', '--', path], { cwd: root, stdio: 'ignore' }); tracked = true; } catch { /* untracked */ }
    try { execFileSync('git', ['check-ignore', '--quiet', '--', path], { cwd: root, stdio: 'ignore' }); ignored = true; } catch { /* public path */ }
    if (tracked || !ignored || !/^\.local[\\/]/.test(path)) throw Error();
  }
  const feed = validateReviewedFeed(await readFile(file, 'utf8'));
  process.stdout.write(`${JSON.stringify({ valid: true, version: feed.version, entries: feed.entries.length, sources: Object.keys(feed.availability).length })}\n`);
} catch {
  process.stderr.write('Reviewed feed validation failed. Use validate --file with an ignored .local file or an explicit private file outside this repository.\n');
  process.exitCode = 1;
}
