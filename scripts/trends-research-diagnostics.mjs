// Offline fixed-membership null diagnostic, never a probability model.
// Usage: node scripts/trends-research-diagnostics.mjs --file .local/source.csv
//   --now 2026-10-21T19:38:17.207Z --season 2026 --permutations 20
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { buildResearchCandidates, RESEARCH_VERSION, sha256 } from '../shared/trends-research-candidates.mjs';
import { evaluateResearchCandidate } from '../shared/trends-research.mjs';

/** One seeded sign flip per physical game preserves opposing sides and overlap.
 * Membership/features stay fixed. Frozen tier labels are excluded from this
 * diagnostic: it evaluates the NEW recent-consistency rule only. */
export function shuffledResearchCandidates(candidates, seed) {
  let state = (seed >>> 0) || 1;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  const ids = [...new Set(candidates.flatMap(c => c.records.map(r => r.gameId)))].sort();
  const flips = new Map(ids.map(id => [id, next() < 0x80000000 ? -1 : 1]));
  return candidates.map(c => ({ ...c, historicalTier: 3,
    records: c.records.map(r => ({ ...r, result: r.result === 0 ? 0 : r.result * flips.get(r.gameId) })) }));
}
const counts = (candidates, now, season) => candidates.reduce((n, c) =>
  n + Number(evaluateResearchCandidate({ ...c, historicalTier: 3 }, { now, season }).qualification.qualifies), 0);

async function main() {
  const { values } = parseArgs({ options: {
    file: { type: 'string' }, now: { type: 'string' }, season: { type: 'string' },
    permutations: { type: 'string', default: '20' }, seed: { type: 'string', default: '20261021' },
  } });
  const season = Number(values.season), permutations = Number(values.permutations), seed = Number(values.seed);
  if (!values.file || !Number.isFinite(Date.parse(values.now)) || !Number.isSafeInteger(season)
    || !Number.isSafeInteger(seed) || !Number.isInteger(permutations) || permutations < 20 || permutations > 1000) {
    throw new Error('Pass --file, ISO --now, --season and 20–1000 permutations.');
  }
  const now = new Date(values.now).toISOString(), csv = readFileSync(values.file, 'utf8');
  const json = name => JSON.parse(readFileSync(new URL('../shared/' + name, import.meta.url), 'utf8'));
  const inputs = { csv, now, registry: json('trends-registry.json'), venues: json('nfl-venues.json'), corrections: json('trends-corrections.json') };
  const candidates = buildResearchCandidates(inputs);
  const observed = counts(candidates, now, season), nullCounts = [];
  for (let i = 0; i < permutations; i++) {
    nullCounts.push(counts(shuffledResearchCandidates(candidates, seed + i), now, season));
    console.log('Null run ' + (i + 1) + '/' + permutations + ': ' + nullCounts.at(-1) + ' qualified');
  }
  // Rebuild history at earlier cutoffs, preserving registration dates. No
  // candidate discovered later can be treated as an available historical signal.
  const replay = [];
  for (const cutoff of ['2026-10-11T12:00:00.000Z', '2026-10-15T12:00:00.000Z', '2026-10-20T12:00:00.000Z']) {
    if (Date.parse(cutoff) >= Date.parse(now)) continue;
    const historical = buildResearchCandidates({ ...inputs, now: cutoff });
    const evaluated = historical.map(c => evaluateResearchCandidate(c, { now: cutoff, season }));
    const eligible = evaluated.filter(e => e.qualification.qualifies);
    if (eligible.some(e => Date.parse(e.registeredAt) > Date.parse(cutoff))) throw new Error('Replay used a future registration.');
    if (evaluated.some(e => Date.parse(e.coverage.to) > Date.parse(cutoff))) throw new Error('Replay used a future result.');
    replay.push({ asOf: cutoff, registered: historical.filter(c => Date.parse(c.registeredAt) <= Date.parse(cutoff)).length,
      qualifying: eligible.length, noFutureRegistrationsOrResults: true });
  }
  const output = { version: RESEARCH_VERSION, sourceSha256: await sha256(csv), asOf: now, season,
    candidateCount: candidates.length, seed, permutations, observedRecentRuleCount: observed, nullCounts,
    nullMean: nullCounts.reduce((a, b) => a + b, 0) / permutations,
    nullMin: Math.min(...nullCounts), nullMax: Math.max(...nullCounts),
    replay, limits: [
      'Fixed candidate membership and pregame features; game-result signs shuffled together across overlapping candidates.',
      'Descriptive selection diagnostic only. Not an out-of-sample forecast backtest or a predictive probability.',
      'Frozen study tiers are not recalibrated or promoted. The shuffled comparison tests the recent-consistency rule only.',
      'The small permutation sample is a warning check, not proof of predictive performance.',
    ] };
  mkdirSync('.local/trends-research', { recursive: true });
  writeFileSync('.local/trends-research/diagnostics.json', JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
