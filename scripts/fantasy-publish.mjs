#!/usr/bin/env node
// Uploads a refresh's files to the fantasy-data-<season> release (data only, prerelease): new content-addressed files
// first, index.json last, then prunes superseded copies and reads every uploaded file back through its public URL.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { FANTASY_REPOSITORY, publishPlan } from '../shared/fantasy-index.mjs';

const args = process.argv.slice(2), value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dir = path.resolve(value('--dir') ?? '.local/fantasy-release');
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
if (!manifest.files.length) { console.log(JSON.stringify({ published: 0, reason: 'Nothing to publish.' })); process.exit(0); }
const tag = `fantasy-data-${manifest.season}`, repo = FANTASY_REPOSITORY;
const gh = (...command) => execFileSync('gh', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
let assets = [];
try {
  assets = JSON.parse(gh('release', 'view', tag, '--repo', repo, '--json', 'assets')).assets.map(asset => ({ name: asset.name, createdAt: asset.createdAt }));
} catch {
  gh('release', 'create', tag, '--repo', repo, '--prerelease', '--title', `Fantasy data ${manifest.season}`,
    '--notes', 'Data only, not an app release. Public nflverse-derived Fantasy snapshots and weekly reviews (nflverse, CC BY 4.0). index.json lists the current files.');
}
for (const step of publishPlan({ files: manifest.files, existing: assets.map(asset => asset.name), index: manifest.index, assets })) {
  if (step.action === 'upload') gh('release', 'upload', tag, path.join(dir, step.name), '--repo', repo, ...(step.clobber ? ['--clobber'] : []));
  else gh('release', 'delete-asset', tag, step.name, '--repo', repo, '--yes');
}
const base = `https://github.com/${repo}/releases/download/${tag}`;
for (const name of ['index.json', ...manifest.files]) {
  const local = await readFile(path.join(dir, name));
  let matched = false;
  for (let attempt = 0; attempt < 4 && !matched; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 5000));
    const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(30_000) });
    matched = response.ok && Buffer.from(await response.arrayBuffer()).equals(local);
  }
  if (!matched) throw new Error(`Readback mismatch: ${name}`);
}
console.log(JSON.stringify({ tag, published: manifest.files.length, index: 'index.json' }));
