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
const fields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));
const count = n => Number.isSafeInteger(n) && n >= 0;
const finiteOrNull = n => n === null || Number.isFinite(n);
/** Optional additive chart fields. Older assets remain readable; new assets
 * cannot smuggle raw records/IDs into their bounded public chart summaries.
 */
export function validateResearchChartSample(sample) {
  if (sample.perSeason !== undefined) {
    if (!Array.isArray(sample.perSeason) || sample.perSeason.length > 100) throw new Error('Invalid research seasons.');
    let previous = -Infinity, total = 0;
    for (const s of sample.perSeason) {
      const p = s.priceCoverage;
      if (!fields(s, ['season', 'sample', 'wins', 'losses', 'pushes', 'illustrativeUnits', 'actualUnits', 'priceCoverage'])
        || !Number.isInteger(s.season) || s.season <= previous || ![s.sample, s.wins, s.losses, s.pushes].every(count)
        || s.sample === 0 || s.wins + s.losses + s.pushes !== s.sample || !Number.isFinite(s.illustrativeUnits) || !finiteOrNull(s.actualUnits)
        || !fields(p, ['priced', 'total', 'complete']) || !count(p.priced) || p.total !== s.sample || p.priced > p.total
        || p.complete !== (p.priced === p.total) || (p.complete ? !Number.isFinite(s.actualUnits) : s.actualUnits !== null)) throw new Error('Invalid research seasons.');
      previous = s.season; total += s.sample;
    }
    if (total !== sample.record.sample) throw new Error('Research seasons must match the selected sample.');
  }
  if (sample.rowSeries !== undefined) {
    const series = sample.rowSeries;
    if (!fields(series, ['points', 'binned', 'selectedSample', 'tableMatchesChart', 'label']) || !Array.isArray(series.points)
      || series.points.length > 12 || series.selectedSample !== sample.record.sample || series.tableMatchesChart !== false) throw new Error('Invalid research row curve.');
    for (const p of series.points) if (!fields(p, ['from', 'to', 'sample', 'wins', 'losses', 'pushes', 'illustrativeUnits', 'actualUnits'])
      || ![p.sample, p.wins, p.losses, p.pushes].every(count) || p.wins + p.losses + p.pushes !== p.sample
      || !Number.isFinite(p.illustrativeUnits) || !finiteOrNull(p.actualUnits)) throw new Error('Invalid research row curve.');
    for (const key of ['sample', 'wins', 'losses', 'pushes']) if (series.points.reduce((n, p) => n + p[key], 0) !== sample.record[key]) throw new Error('Research row curve must match the selected sample.');
    if (series.points.length && (series.points.at(-1).illustrativeUnits !== sample.record.illustrativeUnits || series.points.at(-1).actualUnits !== sample.record.actualUnits)) throw new Error('Research row endpoint must match the selected sample.');
  }
  return sample;
}
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
  for (const c of data.candidates) validateResearchChartSample(c.periods[period]);
  for (const t of data.targets) {
    if (t.played !== false || ['spread', 'total', 'homeScore', 'awayScore', 'oddsHome', 'oddsAway', 'oddsOver', 'oddsUnder', 'mlHome', 'mlAway', 'wind', 'temp', 'referee']
      .some(k => t[k] !== null && t[k] !== undefined)) throw new Error('Unredacted research target.');
  }
  return data;
}
