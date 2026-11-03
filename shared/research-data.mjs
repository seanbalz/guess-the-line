// Public, completed-game research only. No account data or current sportsbook offers.
import { RESEARCH_PERIODS, RESEARCH_VERSION } from './trends-research-candidates.mjs';

export const RESEARCH_REPOSITORY = 'seanbalz/guess-the-line';
export const researchDataBase = season => `https://github.com/${RESEARCH_REPOSITORY}/releases/download/research-data-${season}`;
export const MAX_RESEARCH_FILE_BYTES = 3_500_000;
export const MAX_RESEARCH_DECODED_BYTES = 24_000_000;
// Keep two days of immutable versions for cached readers without filling a release forever.
export function researchRetentionPlan(assets, index, now) {
  const current = new Set(index.files.map(f => f.file));
  const file = /^(recent30|recent25|season|previousSeason|rolling12|all)-[a-f0-9]{64}\.json\.gz$/;
  return assets.filter(a => file.test(a.name) && !current.has(a.name) && Number.isFinite(Date.parse(a.createdAt))
    && Date.parse(a.createdAt) < now - 48 * 60 * 60_000).map(a => a.name);
}
const hash = value => /^[a-f0-9]{64}$/.test(value ?? '');
export function validateResearchIndex(index, season, now) {
  if (index?.version !== 1 || index.season !== season || !Number.isFinite(Date.parse(index.generatedAt)) || Date.parse(index.generatedAt) > now
    || !Array.isArray(index.files) || index.files.length !== RESEARCH_PERIODS.length) throw new Error('Invalid research index.');
  for (const period of RESEARCH_PERIODS) {
    const entries = index.files.filter(f => f.period === period);
    const f = entries[0];
    if (entries.length !== 1 || !hash(f.sha256) || f.file !== `${period}-${f.sha256}.json.gz`
      || !Number.isSafeInteger(f.bytes) || f.bytes < 1 || f.bytes > MAX_RESEARCH_FILE_BYTES) throw new Error('Invalid research file.');
  }
  return index;
}
export function validatePublicResearchSnapshot(data, { season, period, now }) {
  if (data?.version !== RESEARCH_VERSION || data.season !== season || !Number.isFinite(Date.parse(data.generatedAt)) || Date.parse(data.generatedAt) > now
    || !hash(data.source?.sha256) || !hash(data.source?.completedSha256) || !hash(data.source?.scheduleSha256)
    || !Array.isArray(data.candidates) || data.candidates.length > 1000 || !Array.isArray(data.targets) || data.targets.length > 400
    || data.candidates.some(c => !c.periods?.[period]?.record || !Array.isArray(c.periods[period].series?.points))
    || !Array.isArray(data.playStatistics) || data.playStatistics.length > 400) throw new Error('Invalid research data.');
  for (const t of data.targets) {
    if (t.played !== false || ['spread', 'total', 'homeScore', 'awayScore', 'oddsHome', 'oddsAway', 'oddsOver', 'oddsUnder', 'mlHome', 'mlAway', 'wind', 'temp', 'referee']
      .some(k => t[k] !== null && t[k] !== undefined)) throw new Error('Unredacted research target.');
  }
  return data;
}
