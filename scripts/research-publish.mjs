#!/usr/bin/env node
// Immutable data files first, current index last. No application deployment.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { RESEARCH_REPOSITORY, researchDataBase, validateResearchIndex } from '../shared/research-data.mjs';
import { readBack } from './fantasy-publish.mjs';

async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: '.local/research-release' } } });
  const dir = path.resolve(values.dir), index = JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8'));
  validateResearchIndex(index, index.season, Date.now());
  // Validate all bytes before changing the published pointer.
  for (const f of index.files) {
    const bytes = await readFile(path.join(dir, f.file));
    if (bytes.length !== f.bytes || createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw new Error('Research publication checksum mismatch.');
  }
  const tag = `research-data-${index.season}`, gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  let assets;
  try { assets = JSON.parse(gh('release', 'view', tag, '--repo', RESEARCH_REPOSITORY, '--json', 'assets')).assets; }
  catch (error) {
    if (!/release not found/i.test(String(error.stderr ?? error.message))) throw error;
    gh('release', 'create', tag, '--repo', RESEARCH_REPOSITORY, '--prerelease', '--title', `Research data ${index.season}`, '--notes', 'Public completed-game research from nflverse (CC BY 4.0). No player guesses, current sportsbook offers or app deployment. index.json identifies verified data files.');
    assets = [];
  }
  // Previous immutable files stay available to readers holding an older index.
  for (const f of index.files) if (!assets.some(a => a.name === f.file)) gh('release', 'upload', tag, path.join(dir, f.file), '--repo', RESEARCH_REPOSITORY);
  await readBack({ base: researchDataBase(index.season), names: index.files.map(f => f.file), readLocal: file => readFile(path.join(dir, file)) });
  gh('release', 'upload', tag, path.join(dir, 'index.json'), '--repo', RESEARCH_REPOSITORY, '--clobber');
  await readBack({ base: researchDataBase(index.season), names: ['index.json'], readLocal: file => readFile(path.join(dir, file)) });
  console.log(JSON.stringify({ season: index.season, generatedAt: index.generatedAt, published: index.files.length, readback: true }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Research publication failed; inspect the workflow receipt.'); process.exitCode = 1; });
