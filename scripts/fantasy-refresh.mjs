#!/usr/bin/env node
// Scheduled Fantasy refresh (D-57): plans, builds and writes public, content-addressed files plus index.json and a
// manifest to an output folder. scripts/fantasy-publish.mjs uploads them. Never reads GTL picks, lines or account data.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFantasySources } from './fantasy-sources.mjs';
import { buildFantasySnapshot } from '../shared/fantasy-build.mjs';
import { buildRankings } from '../shared/fantasy-rankings.mjs';
import { buildFantasyReview, validateFantasyReview } from '../shared/fantasy-review.mjs';
import { planFantasyRefresh, fantasySeason, freezeTime } from '../shared/fantasy-refresh.mjs';
import { FANTASY_REPOSITORY, MAX_FILE_BYTES, snapshotFileName, reviewFileName, updateFantasyIndex, validateFantasyIndex } from '../shared/fantasy-index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const now = value('--now') ? Date.parse(value('--now')) : Date.now();
if (!Number.isFinite(now)) throw new Error('Invalid --now.');
const season = Number(value('--season') ?? fantasySeason(now));
const out = path.resolve(root, value('--out') ?? '.local/fantasy-release');
// A failed run must never leave an earlier run's manifest or index to be published.
await Promise.all(['manifest.json', 'index.json'].map(name => rm(path.join(out, name), { force: true })));
const base = `https://github.com/${FANTASY_REPOSITORY}/releases/download/fantasy-data-${season}`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function download(name, { optional = false, expectSha } = {}) {
  const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(30_000) });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`Release file unavailable (${response.status}): ${name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error(`Release file too large: ${name}`);
  if (expectSha && sha(bytes) !== expectSha) throw new Error(`Release file checksum mismatch: ${name}`);
  return bytes;
}

const indexBytes = await download('index.json', { optional: true });
const index = indexBytes ? JSON.parse(indexBytes.toString('utf8')) : null;
if (index && !validateFantasyIndex(index).valid) throw new Error('The published index is invalid.');
const { rows, sources } = await readFantasySources({ season, inputDir: value('--input-dir') ?? null, root });
// Stamp after the sources are read: a snapshot may not predate its own source retrieval.
const generatedAt = new Date(Math.max(now, ...sources.map(source => Date.parse(source.retrievedAt)))).toISOString();
const builtAt = Date.parse(generatedAt);
const committed = (await readdir(path.join(root, 'shared/fantasy')))
  .map(name => name.match(new RegExp(`^${season}-week-(\\d{2})\\.json$`))).filter(Boolean).map(match => Number(match[1]));
const plan = planFantasyRefresh({ season, schedule: rows.schedule, stats: rows.stats, index, committedWeeks: committed, now });
await mkdir(out, { recursive: true });
const files = [];
let snapshotEntry = null;

if (plan.snapshot?.build) {
  const snapshot = buildFantasySnapshot({ season, week: plan.snapshot.week, ...rows, sources, generatedAt });
  const rankings = buildRankings(snapshot, {}, { now: builtAt });
  if (rankings.error || !rankings.rows.length) throw new Error('No verified rankings could be generated.');
  const bytes = Buffer.from(`${JSON.stringify(snapshot)}\n`), hash = sha(bytes), file = snapshotFileName(season, snapshot.week, hash);
  await writeFile(path.join(out, file), bytes); files.push(file);
  snapshotEntry = { week: snapshot.week, file, sha256: hash, bytes: bytes.byteLength, generatedAt, statsThroughWeek: snapshot.statsThroughWeek,
    publishedAfterFreeze: plan.snapshot.late, rosterFallbackTeams: snapshot.rosterFallbackTeams.length };
}
const reviewEntries = [];
async function buildReviewEntry({ week, final }) {
  const entry = index?.snapshots.find(item => item.week === week);
  const committedName = `${season}-week-${String(week).padStart(2, '0')}.json`;
  const bytes = entry ? await download(entry.file, { expectSha: entry.sha256 }) : await readFile(path.join(root, 'shared/fantasy', committedName));
  const review = buildFantasyReview({
    published: JSON.parse(bytes.toString('utf8')), file: { name: entry?.file ?? committedName, sha256: entry?.sha256 ?? sha(bytes) },
    schedule: rows.schedule, stats: rows.stats, statsSource: sources.find(source => source.name.includes('stats_player')),
    generatedAt, freezeAt: freezeTime(rows.schedule, season, week), final,
  });
  if (!validateFantasyReview(review).valid) throw new Error('The review failed validation.');
  const reviewBytes = Buffer.from(`${JSON.stringify(review)}
`), hash = sha(reviewBytes), file = reviewFileName(season, week, hash);
  await writeFile(path.join(out, file), reviewBytes); files.push(file);
  reviewEntries.push({ week, file, sha256: hash, bytes: reviewBytes.byteLength, generatedAt, status: review.status });
}
if (plan.review?.build) await buildReviewEntry({ week: plan.review.week, final: plan.review.final });
// Overdue PROVISIONAL reviews of earlier weeks become FINAL, from the published snapshot the players saw.
for (const item of plan.finalize) await buildReviewEntry({ week: item.week, final: true });
let next = updateFantasyIndex(index, { season, snapshot: snapshotEntry, review: null, updatedAt: generatedAt });
for (const review of reviewEntries) next = updateFantasyIndex(next, { season, snapshot: null, review, updatedAt: generatedAt });
if (!validateFantasyIndex(next).valid) throw new Error('The new index failed validation.');
if (files.length) await writeFile(path.join(out, 'index.json'), `${JSON.stringify(next)}\n`);
await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify({ season, plan, files, index: next }, null, 2)}\n`);
console.log(JSON.stringify({ season, completed: plan.completed, snapshot: plan.snapshot, review: plan.review, finalize: plan.finalize, files }));
