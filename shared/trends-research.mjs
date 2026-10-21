// Pure, descriptive NFL research. No network, clock, player data or scoring writes.
// Conditions/directions are registered upstream; this module never selects a side.
const PERIODS = new Set(['recent30', 'recent25', 'season', 'previousSeason', 'rolling12', 'all']);
const DIRECTIONS = Object.assign(Object.create(null), { spread: ['home', 'away'], total: ['over', 'under'] });
const text = value => typeof value === 'string' && value.trim() !== '';
const round = value => Math.round((value + Number.EPSILON) * 1e4) / 1e4 || 0;
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const copy = value => Array.isArray(value) ? value.map(copy)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;

// Dates must include a timezone. Date.parse alone accepts ambiguous local dates
// and normalizes impossible calendar dates (e.g. February 30), so check both.
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (Number(value.slice(11, 13)) > 23) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}
function asOf(now) {
  const result = instant(now);
  if (result === null) throw new TypeError('A valid timezone-explicit now is required.');
  return result;
}
const validPrice = odds => typeof odds === 'number' && Number.isFinite(odds) && (odds <= -100 || odds >= 100);
const units = (result, odds) => result === -1 ? -1 : result === 0 ? 0 : odds < 0 ? 100 / -odds : odds / 100;
const chronological = (a, b) => Date.parse(a.date) - Date.parse(b.date) || compareText(a.gameId, b.gameId);

function normalize(records, cutoff = Infinity) {
  const exclusions = { invalidRecord: 0, invalidDate: 0, invalidResult: 0, future: 0, duplicate: 0, conflicting: 0 };
  const buckets = new Map();
  if (!Array.isArray(records)) { exclusions.invalidRecord++; records = []; }
  for (const row of records) {
    if (!row || !text(row.gameId) || !Number.isInteger(row.season)) { exclusions.invalidRecord++; continue; }
    const date = instant(row.date);
    if (date === null) { exclusions.invalidDate++; continue; }
    if (date > cutoff) { exclusions.future++; continue; }
    if (![1, 0, -1].includes(row.result)) { exclusions.invalidResult++; continue; }
    const normalized = { gameId: row.gameId, date: new Date(date).toISOString(), season: row.season, result: row.result, odds: validPrice(row.odds) ? row.odds : null };
    const bucket = buckets.get(row.gameId) ?? [];
    bucket.push(normalized);
    buckets.set(row.gameId, bucket);
  }
  const clean = [];
  for (const bucket of buckets.values()) {
    if (bucket.some(row => JSON.stringify(row) !== JSON.stringify(bucket[0]))) exclusions.conflicting += bucket.length;
    else { clean.push(bucket[0]); exclusions.duplicate += bucket.length - 1; }
  }
  clean.sort(chronological);
  return { records: clean, exclusions };
}

function periodRows(records, { period = 'recent30', season, now }) {
  if (!PERIODS.has(period)) throw new TypeError(`Unknown research period: ${period}`);
  const cutoff = asOf(now);
  if (period === 'recent30' || period === 'recent25') return records.slice(-(period === 'recent30' ? 30 : 25));
  if (period === 'season' || period === 'previousSeason') {
    if (!Number.isInteger(season)) throw new TypeError('An explicit NFL season is required.');
    return records.filter(row => row.season === season - (period === 'previousSeason' ? 1 : 0));
  }
  if (period === 'rolling12') {
    // Same UTC calendar day/time twelve months earlier; clamp leap day to Feb 28.
    const start = new Date(cutoff);
    const month = start.getUTCMonth();
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    if (start.getUTCMonth() !== month) start.setUTCDate(0);
    return records.filter(row => Date.parse(row.date) >= start.getTime());
  }
  return records.slice();
}

/** Periods: recent30 (default), recent25, season, previousSeason, rolling12, all.
 * Selection includes pushes, excludes future/invalid/conflicting records and
 * uses NFL season fields rather than a calendar-year guess. Returns frozen rows.
 */
export function selectResearchPeriod(records, options = {}) {
  const normalized = normalize(records, asOf(options.now));
  return freeze(periodRows(normalized.records, options));
}

function summarize(records, exclusions) {
  let wins = 0, losses = 0, pushes = 0, illustrative = 0, actual = 0;
  const priced = records.filter(row => row.odds !== null).length;
  const complete = records.length > 0 && priced === records.length;
  const chart = records.map(row => {
    if (row.result === 1) wins++;
    else if (row.result === -1) losses++;
    else pushes++;
    illustrative += units(row.result, -110);
    if (complete) actual += units(row.result, row.odds);
    return { gameId: row.gameId, date: row.date, result: row.result, illustrativeUnits: round(illustrative), actualUnits: complete ? round(actual) : null };
  });
  return {
    sample: records.length, wins, losses, pushes, decisive: wins + losses,
    hitRate: wins + losses ? wins / (wins + losses) : null,
    illustrativeUnits: round(illustrative), illustrativeLabel: 'Illustrative units at -110',
    actualUnits: complete ? round(actual) : null,
    priceCoverage: { priced, total: records.length, complete },
    coverage: { from: records[0]?.date ?? null, to: records.at(-1)?.date ?? null },
    matchedGameIds: records.map(row => row.gameId), records, chart, exclusions,
  };
}

/** One unit risked per game, valid American prices only (<= -100 or >= +100).
 * Actual-price units and every actual chart point stay null unless the entire
 * selected sample is priced, including pushes. No assumed real -110 prices.
 * Without a clock this function validates records but does not apply an as-of;
 * evaluator/period callers must supply that boundary before public projection.
 */
export function researchRecord(records) {
  const normalized = normalize(records);
  return freeze(summarize(normalized.records, normalized.exclusions));
}

// Qualification details intentionally omit raw rows/charts/matched IDs. API
// readers can send summaries and lazy detail without repeating full history.
const summary = record => Object.fromEntries(Object.entries(record).filter(([key]) => !['records', 'chart', 'matchedGameIds', 'exclusions'].includes(key)));

/** Candidate sourceState enum: 'computed' is the sole reproduced/voting state;
 * 'source-reported', 'unavailable', 'stale' and any unknown state cannot qualify.
 * Historical A/B directions are allowed for fixed-side evaluation; an adapter
 * must map them to home/away/over/under before applying a candidate to a game.
 * historicalTier is the frozen adapter's unchanged gate result, never inferred.
 * Conditions are nonempty registered atom strings (at most two). Registration
 * must be known as-of now, inclusive; game.date >= registeredAt is prospective.
 */
export function evaluateResearchCandidate(candidate = {}, { now, season, period = 'recent30' } = {}) {
  const cutoff = asOf(now);
  candidate = candidate ?? {};
  const normalized = normalize(candidate.records, cutoff);
  const all = normalized.records;
  const historical = researchRecord(all);
  const recent = researchRecord(all.slice(-30));
  const earlier = researchRecord(all.slice(0, Math.max(0, all.length - 30)));
  const blocks = [0, 10, 20].map(offset => researchRecord(recent.records.slice(offset, offset + 10)));
  const registered = instant(candidate.registeredAt);
  const tier = [1, 2, 3].includes(candidate.historicalTier) ? candidate.historicalTier : 3;
  const reasons = [];
  const validVersion = text(candidate.version) || (Number.isInteger(candidate.version) && candidate.version > 0);
  if (!text(candidate.id) || !validVersion) reasons.push('invalid_identity');
  if (!DIRECTIONS[candidate.market]) reasons.push('unsupported_market');
  if (![...(DIRECTIONS[candidate.market] ?? []), 'A', 'B'].includes(candidate.direction)) reasons.push('invalid_direction');
  if (!Array.isArray(candidate.conditions) || candidate.conditions.length > 2 || !candidate.conditions.every(text)) reasons.push('condition_limit');
  if (registered === null) reasons.push('invalid_registration');
  else if (registered > cutoff) reasons.push('registration_future');
  if (candidate.sourceState !== 'computed') reasons.push('not_reproduced');
  const valid = reasons.length === 0;
  const historicalPass = tier <= 2 && recent.decisive >= 20 && recent.illustrativeUnits > 0;
  const recentPass = recent.sample === 30 && blocks.every(block => block.decisive >= 8 && block.illustrativeUnits > 0)
    && (earlier.decisive < 30 || earlier.illustrativeUnits > 0);
  const qualifies = valid && (historicalPass || recentPass);
  const route = qualifies ? historicalPass ? 'historical' : 'recent' : null;
  if (!qualifies) {
    if (recent.sample < 30) reasons.push('recent_sample');
    if (tier <= 2 && recent.decisive < 20) reasons.push('historical_recent_decisive');
    if (tier <= 2 && recent.illustrativeUnits <= 0) reasons.push('historical_recent_not_positive');
    if (blocks.some(block => block.decisive < 8)) reasons.push('recent_block_decisive');
    if (blocks.some(block => block.illustrativeUnits <= 0)) reasons.push('recent_block_not_positive');
    if (earlier.decisive >= 30 && earlier.illustrativeUnits <= 0) reasons.push('earlier_not_positive');
  }
  const label = qualifies ? route === 'historical' ? `Tier ${tier} historical consistency` : 'Consistent, not proven'
    : candidate.sourceState === 'source-reported' ? 'Source-reported · not verified'
      : candidate.sourceState !== 'computed' ? 'Research unavailable'
      : earlier.decisive >= 30 && earlier.illustrativeUnits <= 0 ? 'Mixed history' : 'Emerging';
  return freeze({
    id: text(candidate.id) ? candidate.id : null, version: validVersion ? candidate.version : null,
    title: typeof candidate.title === 'string' ? candidate.title : '',
    family: text(candidate.family) ? candidate.family : '', dedupGroup: text(candidate.dedupGroup) ? candidate.dedupGroup : '',
    market: DIRECTIONS[candidate.market] ? candidate.market : null,
    direction: text(candidate.direction) ? candidate.direction : null, conditions: copy(candidate.conditions ?? []),
    registeredAt: registered === null ? null : new Date(registered).toISOString(),
    sourceState: text(candidate.sourceState) ? candidate.sourceState : 'unavailable', historicalTier: tier,
    applicable: candidate.applicable === true, conditionsKnown: candidate.conditionsKnown === true,
    period, record: researchRecord(periodRows(all, { period, season, now })), recent, historical,
    seasonRecord: researchRecord(Number.isInteger(season) ? all.filter(row => row.season === season) : []),
    retrospective: researchRecord(registered === null ? all : all.filter(row => Date.parse(row.date) < registered)),
    prospective: researchRecord(registered === null ? [] : all.filter(row => Date.parse(row.date) >= registered)),
    qualification: { qualifies, route, label, reasons, blocks: blocks.map(summary), earlier: summary(earlier), sparseEarlierHistory: earlier.decisive < 30 },
    matchedGameIds: historical.matchedGameIds, coverage: historical.coverage, exclusions: normalized.exclusions,
  });
}

const qualifying = item => item?.qualification?.qualifies === true && item.sourceState === 'computed'
  && text(item.id) && DIRECTIONS[item.market];
const canonicalKey = item => JSON.stringify([item.market, item.id, item.version]);

/** Connected components of QUALIFYING same-market evidence. Each output has:
 * id, market, memberIds, members, matchedGameIds, direction (null if mixed),
 * mixed, historicalTier (strongest), overlaps [{a,b,count,smaller,fraction,reasons}].
 * Identity is canonical id/version, never an applied UI key. Grouping is scoped
 * to one matchup by its caller; weekly readers dedupe applications first.
 * Components describe overlap, not statistical independence.
 */
export function groupResearchEvidence(evidence = []) {
  const unique = new Map();
  for (const item of Array.isArray(evidence) ? evidence : []) if (qualifying(item)) {
    const key = canonicalKey(item);
    // Exact reposts share an identity. Inconsistent repeated identities must not
    // gain an extra group or silently select a favorable direction.
    if (!unique.has(key)) unique.set(key, copy(item));
    else if (unique.get(key).direction !== item.direction) unique.get(key).direction = null;
  }
  const items = [...unique.values()].sort((a, b) => compareText(canonicalKey(a), canonicalKey(b)));
  const parent = items.map((_, i) => i);
  const root = i => { while (parent[i] !== i) i = parent[i]; return i; };
  const edges = [];
  const ids = items.map(item => new Set((Array.isArray(item.matchedGameIds) ? item.matchedGameIds : []).filter(text)));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.market !== b.market) continue;
    const count = [...ids[i]].filter(id => ids[j].has(id)).length;
    const smaller = Math.min(ids[i].size, ids[j].size);
    const reasons = [];
    if (text(a.dedupGroup) && a.dedupGroup === b.dedupGroup) reasons.push('dedup_group');
    if (text(a.family) && a.family === b.family) reasons.push('family');
    if (a.id === b.id) reasons.push('canonical_id');
    if (smaller > 0 && count / smaller >= 0.5) reasons.push('sample_overlap');
    if (!reasons.length) continue;
    parent[root(j)] = root(i);
    edges.push({ i, j, a: a.id, b: b.id, count, smaller, fraction: smaller ? count / smaller : null, reasons });
  }
  const components = new Map();
  items.forEach((item, i) => {
    const key = root(i), members = components.get(key) ?? [];
    members.push(item); components.set(key, members);
  });
  return freeze([...components.entries()].map(([key, members]) => {
    const directions = new Set(members.map(item => item.direction));
    const direction = directions.size === 1 ? members[0].direction : null;
    return {
      id: `${members[0].market}:${members.map(item => `${item.id}@${item.version}`).join('|')}`,
      market: members[0].market, memberIds: [...new Set(members.map(item => item.id))], members,
      matchedGameIds: [...new Set(members.flatMap(item => item.matchedGameIds ?? []))].sort(compareText),
      direction, mixed: direction === null, historicalTier: Math.min(...members.map(item => item.historicalTier ?? 3)),
      overlaps: edges.filter(edge => root(edge.i) === key).map(({ i, j, ...edge }) => edge),
    };
  }).sort((a, b) => compareText(a.id, b.id)));
}

/** Closed return is EXACTLY {state:'hidden'}; no titles/IDs/counts/reasons leak.
 * Open return: state (lean/no-clear-lean/unavailable), direction, label, tone,
 * reasons, counts by concrete direction, groups, supporting, alternatives,
 * context (nonqualifying research, never votes). Supporting/alternative groups
 * add separate role/roleLabel/tone; evidence labels stay on each member.
 * Reference contract: {status:'available',value:number,observedAt:ISO}. Freshness
 * is inclusive at 12h. Callers supply server now, current history and per-game
 * applied evidence with applicable:true and conditionsKnown:true.
 */
export function researchLean({ evidence = [], market, visible, kickoff, now, reference, historyFresh } = {}) {
  if (visible !== true) return freeze({ state: 'hidden' });
  const cutoff = instant(now), start = instant(kickoff), observed = instant(reference?.observedAt);
  const reasons = [];
  if (!DIRECTIONS[market]) reasons.push('unsupported_market');
  if (cutoff === null) reasons.push('invalid_now');
  if (start === null || cutoff === null || start <= cutoff) reasons.push('not_pregame');
  if (historyFresh !== true) reasons.push('history_not_fresh');
  if (reference?.status !== 'available' || typeof reference?.value !== 'number' || !Number.isFinite(reference.value)
    || (market === 'total' && reference.value <= 0)) reasons.push('reference_unavailable');
  if (observed === null) reasons.push('reference_time_missing');
  else if (cutoff !== null && observed > cutoff) reasons.push('reference_future');
  else if (cutoff !== null && cutoff - observed > 12 * 60 * 60 * 1000) reasons.push('reference_stale');
  const items = (Array.isArray(evidence) ? evidence : []).filter(item => item?.market === market);
  if (items.some(item => item.applicable === true && item.conditionsKnown !== true)) reasons.push('conditions_unknown');
  const permitted = items.filter(item => item.applicable === true && item.conditionsKnown === true && DIRECTIONS[market]?.includes(item.direction));
  const context = permitted.filter(item => !qualifying(item)).map(copy);
  const groups = groupResearchEvidence(permitted);
  const counts = Object.fromEntries((DIRECTIONS[market] ?? []).map(direction => [direction, groups.filter(group => group.direction === direction).length]));
  const base = { direction: null, label: 'Research unavailable', tone: 'pending', reasons, counts, groups, supporting: [], alternatives: [], context };
  if (reasons.length) return freeze({ ...base, state: 'unavailable' });
  const [a, b] = DIRECTIONS[market];
  const winner = counts[a] > counts[b] ? a : b;
  const loser = winner === a ? b : a;
  if (counts[a] === counts[b] && counts[a] >= 2) reasons.push('balanced_groups');
  else if (counts[winner] < 2) reasons.push('insufficient_groups');
  const hasTier1 = direction => groups.some(group => group.direction === direction && group.historicalTier === 1);
  if (!reasons.length && hasTier1(loser) && !hasTier1(winner)) reasons.push('stronger_historical_conflict');
  if (reasons.length) return freeze({ ...base, label: 'No clear lean', state: 'no-clear-lean',
    alternatives: groups.map(group => ({ ...group, role: 'mixed', roleLabel: 'Alternative / mixed evidence', tone: 'pending' })) });
  return freeze({ ...base, state: 'lean', direction: winner, label: `Research lean: ${winner}`, tone: 'win',
    supporting: groups.filter(group => group.direction === winner).map(group => ({ ...group, role: 'support', roleLabel: 'Supports the lean', tone: 'win' })),
    alternatives: groups.filter(group => group.direction !== winner).map(group => ({ ...group, role: group.mixed ? 'mixed' : 'alternative', roleLabel: group.mixed ? 'Alternative / mixed evidence' : 'Alternative — qualifying opposing evidence', tone: 'pending' })),
  });
}

const ranking = (a, b) => (a.historicalTier === 1 ? 0 : 1) - (b.historicalTier === 1 ? 0 : 1)
  || (instant(b.coverage?.to) ?? -Infinity) - (instant(a.coverage?.to) ?? -Infinity)
  || (b.prospective?.decisive ?? 0) - (a.prospective?.decisive ?? 0)
  || compareText(a.id, b.id) || compareText(String(a.version), String(b.version));

/** At most three, one representative per evidence component. Existing Tier2
 * and recent consistency share a priority. No ROI/hit-rate ordering. Callers
 * remove inaccessible applicability before a weekly shortlist is computed.
 */
export function researchShortlist(evidence, limit = 3) {
  const size = Number.isFinite(limit) ? Math.max(0, Math.min(3, Math.floor(limit))) : 3;
  return freeze(groupResearchEvidence(evidence).map(group => [...group.members].sort(ranking)[0]).sort(ranking).slice(0, size));
}
