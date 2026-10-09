import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { scanFrontend } from './check-cloud-boundary.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
function files(directory, prefix = '', ignoreGenerated = false) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (ignoreGenerated && (entry.name === '__pycache__' || entry.name === '.DS_Store' || entry.name.endsWith('.pyc'))) return [];
    if (entry.isSymbolicLink()) throw new Error('Release inputs must not contain symbolic links.');
    const relative = path.posix.join(prefix, entry.name), file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file, relative, ignoreGenerated) : [{ path: relative, bytes: fs.statSync(file).size, sha256: sha(fs.readFileSync(file)) }];
  });
}
const buildDirectory = path.join(root, '.local/cloud-dist');
scanFrontend(buildDirectory);
const artifacts = files(buildDirectory);
const sourceRoots = ['cloud', 'server', 'shared', 'config', 'design', 'web/src', 'web/public', 'supabase/functions', 'supabase/migrations', 'scripts'];
const source = sourceRoots.flatMap(directory => files(path.join(root, directory), directory, true));
for (const filename of ['package.json', 'package-lock.json', 'vite.config.js', 'web/index.html', 'supabase/config.toml', 'wrangler.jsonc']) source.push({ path: filename, sha256: sha(fs.readFileSync(path.join(root, filename))) });
source.sort((a, b) => a.path.localeCompare(b.path));
const git = (...args) => { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); return result.status === 0 ? result.stdout.trim() : null; };
const manifest = {
  format: 'guess-the-line-release-manifest-v1', createdAt: new Date().toISOString(),
  deployed: false, verification: 'Built artifact scanned for private data; this manifest is not proof of tests, deployment or live operation.',
  node: process.version, gitHead: git('rev-parse', 'HEAD'), dirtyWorkingTree: !!git('status', '--porcelain'),
  packageLockSha256: sha(fs.readFileSync(path.join(root, 'package-lock.json'))),
  sourceSha256: sha(JSON.stringify(source)), frontendSha256: sha(JSON.stringify(artifacts)),
  migrationFiles: source.filter(file => file.path.startsWith('supabase/migrations/')),
  artifacts,
};
fs.mkdirSync(path.join(root, '.local'), { recursive: true, mode: 0o700 });
const destination = path.join(root, '.local/release-manifest.json');
fs.writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ manifest: destination, deployed: false, sourceSha256: manifest.sourceSha256, frontendSha256: manifest.frontendSha256, artifactCount: artifacts.length, bytes: artifacts.reduce((n, file) => n + file.bytes, 0) }, null, 2));
