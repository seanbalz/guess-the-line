#!/usr/bin/env node
// Uploads a refresh's files to the fantasy-data-<season> release (data only, prerelease): new content-addressed files
// first, index.json last, then prunes superseded copies and reads every uploaded file back through its public URL.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FANTASY_REPOSITORY, publishPlan } from '../shared/fantasy-index.mjs';

/**
 * Waits between readback attempts, shared by every file of one publish (4 minutes in all). GitHub can take about a
 * minute to serve a new asset, or the new bytes of a replaced index.json; the first publish (October 23, 2026) failed
 * a correct upload after 20 seconds.
 */
export const READBACK_WAITS_MS = Object.freeze([5_000, 5_000, 10_000, 10_000, 15_000, 15_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000]);

/** Reads each file back through its public URL until the bytes match the local copy; network errors are retried. */
export async function readBack({ base, names, readLocal, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), waits = READBACK_WAITS_MS, log = () => {} }) {
  let next = 0;
  for (const name of names) {
    const local = await readLocal(name);
    for (;;) {
      let seen;
      try {
        const response = await fetchImpl(`${base}/${name}`, { signal: AbortSignal.timeout(30_000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        if (response.ok && bytes.equals(local)) break;
        seen = response.ok ? `${bytes.length} bytes, different content` : `HTTP ${response.status}`;
      } catch (error) {
        seen = error?.name === 'TimeoutError' ? 'timeout' : 'network error';
      }
      if (next >= waits.length) throw new Error(`Readback mismatch: ${name} (last: ${seen})`);
      log(`Readback of ${name} not current yet (${seen}); retrying in ${waits[next] / 1000} s.`);
      await sleep(waits[next++]);
    }
  }
}

async function main() {
  const args = process.argv.slice(2), value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const dir = path.resolve(value('--dir') ?? '.local/fantasy-release');
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  if (!manifest.files.length) { console.log(JSON.stringify({ published: 0, reason: 'Nothing to publish.' })); return; }
  const tag = `fantasy-data-${manifest.season}`, repo = FANTASY_REPOSITORY;
  const gh = (...command) => execFileSync('gh', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let assets = [];
  try {
    assets = JSON.parse(gh('release', 'view', tag, '--repo', repo, '--json', 'assets')).assets.map(asset => ({ name: asset.name, createdAt: asset.createdAt }));
  } catch (error) {
    if (!/release not found/i.test(String(error.stderr ?? error.message))) throw error;
    gh('release', 'create', tag, '--repo', repo, '--prerelease', '--title', `Fantasy data ${manifest.season}`,
      '--notes', 'Data only, not an app release. Public nflverse-derived Fantasy snapshots and weekly reviews (nflverse, CC BY 4.0). index.json lists the current files.');
  }
  for (const step of publishPlan({ files: manifest.files, existing: assets.map(asset => asset.name), index: manifest.index, assets })) {
    if (step.action === 'upload') gh('release', 'upload', tag, path.join(dir, step.name), '--repo', repo, ...(step.clobber ? ['--clobber'] : []));
    else gh('release', 'delete-asset', tag, step.name, '--repo', repo, '--yes');
  }
  await readBack({ base: `https://github.com/${repo}/releases/download/${tag}`, names: ['index.json', ...manifest.files],
    readLocal: name => readFile(path.join(dir, name)), log: line => console.error(line) });
  console.log(JSON.stringify({ tag, published: manifest.files.length, index: 'index.json' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
