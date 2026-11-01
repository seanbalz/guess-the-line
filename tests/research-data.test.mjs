import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createResearchDataLoader } from '../cloud/research-data.mjs';
import { validateResearchIndex, validatePublicResearchSnapshot } from '../shared/research-data.mjs';
import { RESEARCH_PERIODS, RESEARCH_VERSION } from '../shared/trends-research-candidates.mjs';
import { buildPlayResearch, buildResearchRelease } from '../scripts/research-refresh.mjs';
import { observedPlayStatistics } from '../shared/research-play-statistics.mjs';
import { createResearchProvider } from '../cloud/trends-research.mjs';
import { row, registry, venues, corrections, T } from './trends-fixture.mjs';

const AT = '2026-10-28T19:00:00.000Z', NOW = Date.parse(AT), hash = 'a'.repeat(64);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function publication() {
  const files = new Map(), index = { version: 1, season: 2026, generatedAt: AT, files: [] };
  for (const period of RESEARCH_PERIODS) {
    const data = { version: RESEARCH_VERSION, season: 2026, generatedAt: AT, source: { sha256: digest(period), completedSha256: hash, scheduleSha256: hash }, candidates: [], targets: [], playStatistics: [] };
    const bytes = gzipSync(JSON.stringify(data)), sha256 = digest(bytes), file = `${period}-${sha256}.json.gz`;
    index.files.push({ period, file, bytes: bytes.length, sha256 }); files.set(file, bytes);
  }
  files.set('index.json', Buffer.from(JSON.stringify(index)));
  return { index, files };
}
test('published research checks checksums, coalesces reads, retries failure and does not evaluate code', async () => {
  const { index, files } = publication(); let calls = [], time = NOW, broken = false, fallbacks = 0;
  const loader = createResearchDataLoader({ clock: () => time, fallback: async () => { fallbacks++; return null; }, fetchImpl: async url => {
    const file = url.slice(url.lastIndexOf('/') + 1); calls.push(file);
    return new Response(broken && file !== 'index.json' ? 'export default malicious()' : files.get(file), { status: files.has(file) ? 200 : 404 });
  } });
  const first = await Promise.all([loader('recent30', 2026), loader('recent30', 2026)]);
  assert.equal(first[0], first[1]); assert.equal(first[0].generatedAt, AT); assert.equal(calls.length, 2);
  await loader('recent25', 2026); await loader('all', 2026);
  assert.equal(calls.filter(c => c === 'index.json').length, 1);
  broken = true;
  assert.equal(await loader('season', 2026), null); assert.equal(fallbacks, 1);
  broken = false;
  assert.equal((await loader('season', 2026)).generatedAt, AT, 'failed files are not cached');
  time += 300001;
  await loader('season', 2026); assert.equal(calls.filter(c => c === 'index.json').length, 2);
  const bad = structuredClone(index); bad.files[0].file = '../private';
  assert.throws(() => validateResearchIndex(bad, 2026, NOW));
  assert.throws(() => validateResearchIndex(index, 2025, NOW));
  assert.throws(() => validateResearchIndex(index, 2026, NOW - 1));
});
test('unpublished or failing data uses fallback with backoff and refuses cross-origin redirects', async () => {
  let count = 0, time = NOW;
  const loader = createResearchDataLoader({ clock: () => time, fallback: async (period, season) => ({ period, season }), fetchImpl: async () => { count++; return new Response(null, { status: 302, headers: { location: 'https://unapproved.example/private' } }); } });
  assert.deepEqual(await loader('all', 2026), { period: 'all', season: 2026 });
  await loader('all', 2026); assert.equal(count, 1);
  time += 60001; await loader('all', 2026); assert.equal(count, 2);
  await assert.rejects(loader('private', 2026));
});
const final = row({ season: 2026, week: 1, gameday: '2026-10-20', home_team: 'LA', away_team: 'SEA', home_score: 24, away_score: 0, spread_line: 3, total_line: 40 });
const upcoming = row({ season: 2026, week: 2, gameday: '2026-11-01', home_team: 'LA', away_team: 'SEA', spread_line: 9876, total_line: 9876 });
const play = { game_id: final.game_id, posteam: 'LA', play_type: 'pass', qb_dropback: 1, rush_attempt: 0, pass_attempt: 1, sack: 0, qb_spike: 0, qb_kneel: 0, qb_scramble: 0, down: 1, ydstogo: 10, yards_gained: 8, passing_yards: 8, complete_pass: 1 };
test('real nflverse field conventions include incompletions, omit no-plays and preserve pregame cutoffs and aliases', () => {
  const plays = [play, { ...play, yards_gained: 0, passing_yards: '', complete_pass: 0 }, { ...play, play_type: 'no_play', yards_gained: 90, passing_yards: 90 }, { ...play, no_play: 1, yards_gained: 90, passing_yards: 90 }];
  const csv = T.writeCompactCsv([final, upcoming]);
  const research = buildPlayResearch({ csv, plays, season: 2026, now: AT, sourceHash: hash });
  const first = research.find(s => s.week === 1).teams.find(t => t.team === 'LAR');
  assert.equal(first.sampleGames, 0); assert.equal(first.metrics[2].value, null, 'never include the target game itself');
  const next = research.find(s => s.week === 2).teams.find(t => t.team === 'LAR');
  assert.equal(next.sampleGames, 1); assert.equal(next.metrics[2].value, 4); assert.equal(next.metrics[2].sample, 2);
  assert.equal(next.metrics[0].value, 0.5); assert.equal(next.from, '2026-10-20');
  assert.equal(observedPlayStatistics({ plays: [{ ...play, play_type: '' }], completedGames: [{ id: final.game_id, date: final.gameday, availableAt: AT }], team: 'LA', asOf: AT, sourceHash: hash }).sampleGames, 0, 'unknown play status is not an observed play');
});
test('offline build produces populated reproducible artifacts, redacts future quotes and projects only unlocked plays', async () => {
  const csv = T.writeCompactCsv([final, upcoming]);
  const args = { csv, plays: [play], pbpHash: hash, season: 2026, now: AT, registry, venues, corrections };
  const result = await buildResearchRelease(args);
  assert.equal(result.receipt.completedGames, 1); assert.equal(result.receipt.statisticMatchups, 2);
  assert.ok(result.receipt.candidates > 0); assert.equal(result.index.files.length, 6);
  const loader = createResearchDataLoader({ clock: () => NOW, fetchImpl: async url => new Response(result.files.get(url.slice(url.lastIndexOf('/') + 1))) });
  const snapshot = await loader('recent30', 2026);
  assert.equal(snapshot.targets[0].total, null); assert.ok(!JSON.stringify(snapshot).includes('9876'));
  validatePublicResearchSnapshot(snapshot, { season: 2026, period: 'recent30', now: NOW });
  const board = { season: 2026, week: 2, games: [{ id: 'SEA-LAR', awayCode: 'SEA', homeCode: 'LAR', kickoff: '2026-11-01T18:00:00.000Z', spread: { visible: false }, total: { visible: false } }] };
  const provider = createResearchProvider({ loadSchedule: async () => csv, loadSnapshot: loader, venues, corrections, clock: () => NOW });
  const closed = await provider.read({ board });
  assert.equal(closed.history.status, 'fresh'); assert.equal(closed.statistics[0].teams[1].pointsPerGame, 24); assert.deepEqual(closed.playStatistics, []);
  board.games[0].spread.visible = true; board.games[0].total.visible = true;
  const open = await provider.read({ board });
  assert.equal(open.playStatistics.length, 1); assert.equal(open.playStatistics[0].teams[1].metrics[2].value, 8);
  assert.equal(open.playStatistics[0].teams[1].sampleGames, 1);
  await assert.rejects(buildResearchRelease({ ...args, plays: [] }), /missing completed games/);
});
