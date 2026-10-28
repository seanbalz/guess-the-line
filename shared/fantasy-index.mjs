// The Fantasy release index (D-57): public nflverse-derived files on the fantasy-data-<season> release of this repository.
// Data files are content-addressed and never replaced; index.json is the only replaced asset and is uploaded last.
export const FANTASY_REPOSITORY = 'seanbalz/guess-the-line';
export const MAX_FILE_BYTES = 3_000_000;
const SNAPSHOT_FILE = /^(\d{4})-week-(\d{2})\.[0-9a-f]{8}\.json$/;
const REVIEW_FILE = /^(\d{4})-review-week-(\d{2})\.[0-9a-f]{8}\.json$/;
const pad = week => String(week).padStart(2, '0');
export const snapshotFileName = (season, week, sha256) => `${season}-week-${pad(week)}.${sha256.slice(0, 8)}.json`;
export const reviewFileName = (season, week, sha256) => `${season}-review-week-${pad(week)}.${sha256.slice(0, 8)}.json`;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);

export function updateFantasyIndex(index, { season, snapshot, review, updatedAt }) {
  const base = index ?? { schemaVersion: 1, season, updatedAt, snapshots: [], reviews: [] };
  if (base.season !== season) throw new Error('Index season mismatch.');
  const put = (list, entry) => entry ? [...list.filter(item => item.week !== entry.week), entry].sort((a, b) => a.week - b.week) : list;
  return { schemaVersion: 1, season, updatedAt, snapshots: put(base.snapshots, snapshot), reviews: put(base.reviews, review) };
}

export function validateFantasyIndex(index) {
  const errors = [], fail = message => errors.push(message);
  if (!isRecord(index) || index.schemaVersion !== 1) return { valid: false, errors: ['Unsupported index.'] };
  if (!Number.isInteger(index.season) || index.season < 2020 || index.season > 2100 || !iso(index.updatedAt)) fail('Index header is invalid.');
  const entries = (list, pattern, name, extra) => {
    if (!Array.isArray(list)) { fail(`Index ${name} are missing.`); return; }
    const weeks = new Set();
    for (const entry of list) {
      const match = isRecord(entry) && typeof entry.file === 'string' ? entry.file.match(pattern) : null;
      if (!match || Number(match[1]) !== index.season || Number(match[2]) !== entry.week || !Number.isInteger(entry.week) || entry.week < 1 || entry.week > 18
        || weeks.has(entry.week) || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || !entry.file.includes(`.${entry.sha256.slice(0, 8)}.`)
        || !Number.isInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > MAX_FILE_BYTES || !iso(entry.generatedAt) || !extra(entry)) { fail(`Index ${name} entry is invalid.`); continue; }
      weeks.add(entry.week);
    }
  };
  entries(index.snapshots, SNAPSHOT_FILE, 'snapshots', entry => Number.isInteger(entry.statsThroughWeek) && entry.statsThroughWeek === entry.week - 1
    && typeof entry.publishedAfterFreeze === 'boolean' && Number.isInteger(entry.rosterFallbackTeams) && entry.rosterFallbackTeams >= 0);
  entries(index.reviews, REVIEW_FILE, 'reviews', entry => ['PROVISIONAL', 'FINAL'].includes(entry.status));
  return { valid: errors.length === 0, errors };
}

export function assetsToPrune(assets, index, keep = 3) {
  const named = new Set([...index.snapshots, ...index.reviews].map(entry => entry.file)), groups = new Map();
  for (const asset of assets) {
    if (named.has(asset.name) || !(SNAPSHOT_FILE.test(asset.name) || REVIEW_FILE.test(asset.name))) continue;
    const key = asset.name.replace(/\.[0-9a-f]{8}\.json$/, '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(asset);
  }
  return [...groups.values()].flatMap(list => list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(keep).map(asset => asset.name)).sort();
}

export function publishPlan({ files, existing, index, assets }) {
  if (!validateFantasyIndex(index).valid) throw new Error('Refusing to publish an invalid index.');
  const available = new Set([...files, ...existing]);
  const missing = [...index.snapshots, ...index.reviews].map(entry => entry.file).filter(name => !available.has(name));
  if (missing.length) throw new Error(`Refusing to publish an index that names missing files: ${missing.join(', ')}`);
  const indexed = { snapshot: new Set(index.snapshots.map(entry => entry.week)), review: new Set(index.reviews.map(entry => entry.week)) };
  const dropped = [];
  for (const name of existing) {
    for (const [kind, pattern] of [['snapshot', SNAPSHOT_FILE], ['review', REVIEW_FILE]]) {
      const match = name.match(pattern);
      if (match && Number(match[1]) === index.season && !indexed[kind].has(Number(match[2]))) dropped.push(`${kind} week ${Number(match[2])}`);
    }
  }
  if (dropped.length) throw new Error(`Refusing to publish an index that drops published weeks: ${[...new Set(dropped)].join(', ')}`);
  return [
    ...files.filter(name => !existing.includes(name)).map(name => ({ action: 'upload', name, clobber: false })),
    { action: 'upload', name: 'index.json', clobber: true },
    ...assetsToPrune(assets, index).map(name => ({ action: 'delete', name })),
  ];
}
