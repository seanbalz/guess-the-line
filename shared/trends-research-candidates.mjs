// Versioned wrapper around the frozen study. Never selects a side from results.
import * as T from './trends.mjs';
import { evaluateResearchCandidate, researchRecord, selectResearchPeriod } from './trends-research.mjs';
import { easternToUtc } from './nfl-schedule.mjs';
export const RESEARCH_VERSION = 'research-2026-10-21-v1';
export const RESEARCH_REGISTERED_AT = '2026-10-21T00:00:00.000Z';
const markets = new Set(['home_ats', 'fav_ats', 'team_ats', 'total', 'total_rev']);
export const atomNeed = atom => {
  const [kind, value] = atom.split(':');
  return kind === 'role' && ['fav', 'dog'].includes(value) ? 'spread' : T.ATOMS[value]?.needs ?? null;
};
export function registerResearchCandidates(registry) {
  return registry.presets.filter(p => markets.has(p.market) && !p.variant && p.atoms.length <= 2).flatMap(p => (p.side ? [p.side] : ['A', 'B']).map(direction => ({
    id: `${RESEARCH_VERSION}:${p.id}:${direction}`, version: RESEARCH_VERSION, preset: p,
    direction, market: p.market.startsWith('total') ? 'total' : 'spread', title: `${p.title} · ${p.sideLabel && p.side ? p.sideLabel : T.MARKETS[p.market].sides[direction === 'A' ? 0 : 1]}`,
    family: p.seanFamily || p.family, dedupGroup: p.dedupGroup || '', conditions: [...p.atoms],
    registeredAt: p.side ? `${registry.registeredAt}T00:00:00.000Z` : RESEARCH_REGISTERED_AT,
    historicalTier: 3, sourceState: 'computed',
  })));
}

// The source gives game dates/finals, not final observation times. Noon UTC on
// the following schedule day is the conservative V1 availability boundary.
export const finalAvailableAt = date => new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString();
export function prepareResearchHistory(csv, { now, venues, corrections }) {
  if (typeof csv !== 'string' || csv.length > 12000000) throw new Error('Invalid history source.');
  const parsed = T.parseCsvRows(csv);
  const sourceRows = new Map(parsed.rows.map(r => [r.game_id, r]));
  const games = T.normalizeRows(parsed.rows, { venues, corrections });
  if (!games.length || games.some(g => !/^\d{4}-\d{2}-\d{2}$/.test(g.date) || !Number.isInteger(g.season))) throw new Error('Invalid history rows.');
  for (const g of games) {
    g.availableAt = finalAvailableAt(g.date);
    const raw = sourceRows.get(g.id);
    // Old rows without kickoff retain date-only chronology at UTC day start;
    // final availability remains a separate conservative boundary.
    g.eventAt = /^\d\d:\d\d$/.test(raw.gametime) ? easternToUtc(g.date, raw.gametime) : `${g.date}T00:00:00.000Z`;
    if (Date.parse(g.availableAt) > Date.parse(now)) { g.played = false; g.homeScore = g.awayScore = null; }
    if (!g.played) g.roof = '';
  }
  T.redactUnplayed(games);
  return { games, features: T.buildFeatures(structuredClone(games), { venues, corrections }), rowCount: games.length };
}

const summary = r => Object.fromEntries(Object.entries(r).filter(([key]) => !['chart', 'records', 'matchedGameIds'].includes(key)));
export const compactEvaluation = e => ({ ...e, record: summary(e.record), recent: summary(e.recent), historical: summary(e.historical), seasonRecord: summary(e.seasonRecord), retrospective: summary(e.retrospective), prospective: summary(e.prospective) });

/** Pure diagnostic/server entry point; returns canonical candidates + records.
 * Source is already redacted at `now`; no future finals enter state predicates.
 * The frozen-tier path deliberately retains its original both-lines population.
 */
export function buildResearchCandidates({ csv, now, registry, venues, corrections, prepared }) {
  const history = prepared ?? prepareResearchHistory(csv, { now, venues, corrections });
  const canonical = registerResearchCandidates(registry);
  const rules = corrections.rules ?? {};
  const ctx = { pop: T.evaluationGames(history.features).filter(g => g.season <= registry.throughSeason), rules, throughSeason: registry.throughSeason, currentSeason: registry.throughSeason + 1, lastFinalDate: registry.lastFinalDate };
  const resultCache = new Map();
  const result = p => { if (!resultCache.has(p.id)) resultCache.set(p.id, T.evaluatePreset(p, ctx)); return resultCache.get(p.id); };
  const unitsCache = new Map();
  const coverageCache = new Map();
  return canonical.map(c => {
    const p = c.preset;
    if (!unitsCache.has(p.id)) {
      const pop = history.features.filter(g => g.played && g.season >= T.PERIODS.firstSeason && (c.market === 'spread' ? g.spread !== null : g.total !== null));
      // Every condition must be known, including the *other* row for team ATS.
      const known = pop.filter(g => T.isRowMarket(p.market)
        ? [0, 1].every(side => p.atoms.every(a => typeof T.atomValue(a, g, side) === 'boolean'))
        : p.atoms.every(a => typeof T.atomValue(a, g) === 'boolean'));
      unitsCache.set(p.id, T.betUnits(p, known, { rules }));
      const completedGames = history.features.filter(g => g.played && g.season >= T.PERIODS.firstSeason).length;
      coverageCache.set(p.id, { completedGames, missingRequiredLine: completedGames - pop.length, unknownConditions: pop.length - known.length, knownConditions: known.length });
    }
    let historicalTier = 3;
    if (p.side && p.tierCeiling < 3) {
      const r = result(p);
      const robustness = (p.robustness ?? []).map(atoms => {
        const id = `${p.market}|${atoms.join('+')}`;
        return T.robustnessCheck(result(registry.presets.find(v => v.id === id) ?? { id, market: p.market, atoms }), p.side, registry.throughSeason);
      });
      const gate = T.gates(r, p, { q: p.q, robustness });
      const score = T.qualityScore(r, p, { q: p.q, throughSeason: registry.throughSeason, eligible: gate.eligible && p.tierCeiling < 3 });
      if (p.tierCeiling <= 1 && gate.tier1Checks && score.score >= 80) historicalTier = 1;
      else if (p.tierCeiling <= 2 && gate.tier2Checks && score.score >= 40) historicalTier = 2;
    }
    const records = unitsCache.get(p.id).map(u => ({ gameId: u.g.id, date: u.g.eventAt, availableAt: u.g.availableAt, season: u.g.season, result: c.direction === 'A' ? u.res : -u.res, odds: c.direction === 'A' ? u.oa : u.ob }));
    return { ...c, historicalTier, records, inputCoverage: coverageCache.get(p.id) };
  });
}

/** Concrete per-game mapping; unknown is never a negative predicate. */
export function applyResearchCandidate(candidate, game, rules = {}) {
  const p = candidate.preset;
  if (!game || (p.market === 'home_ats' && rules.homeMarketExcludesNeutral && game.neutral)) return null;
  if (p.atoms.some(a => ['weather'].includes(atomNeed(a)) || /^(ref|coach|qb|anycoach|anyqb):/.test(a))) return null;
  const read = side => p.atoms.map(a => T.atomValue(a, game, side));
  let rowSide = null;
  if (T.isRowMarket(p.market)) {
    const values = [read(0), read(1)];
    if (values.some(v => v.some(x => typeof x !== 'boolean'))) return null;
    const matches = values.map(v => v.every(x => x === true));
    if (matches[0] === matches[1]) return null;
    rowSide = matches[0] ? 0 : 1;
  } else if (!read(null).every(x => x === true)) return null;
  let first;
  if (p.market === 'home_ats') first = 'home';
  else if (p.market === 'fav_ats') {
    if (game.spread === null || game.spread === 0) return null;
    first = game.spread > 0 ? 'home' : 'away';
  } else if (p.market === 'team_ats') first = rowSide === 0 ? 'home' : 'away';
  else if (p.market === 'total') first = 'over';
  else { if (!Number.isFinite(game.meta.totrevX)) return null; first = game.meta.totrevX > 0 ? 'under' : 'over'; }
  const opposite = { home: 'away', away: 'home', over: 'under', under: 'over' };
  return { direction: candidate.direction === 'A' ? first : opposite[first], applicable: true, conditionsKnown: true };
}

export const RESEARCH_PERIODS = Object.freeze(['recent30', 'recent25', 'season', 'previousSeason', 'rolling12', 'all']);
export const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
export function observableRows(csv, now) {
  return T.parseCsvRows(csv).rows.filter(r => T.rowPlayed(r) && Date.parse(finalAvailableAt(r.gameday)) <= Date.parse(now));
}
export const completedSourceText = rows => JSON.stringify(rows.map(r => T.HISTORY_COLUMNS.map(k => r[k] ?? '')).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

/** Deterministic bins represent the exact selected sample. The accompanying
 * accessible table uses the same bins, counts and endpoint cumulative units.
 */
export function compactResearchSeries(record, maxPoints = 48) {
  const bins = [];
  const size = Math.max(1, Math.ceil(record.records.length / maxPoints));
  for (let i = 0; i < record.records.length; i += size) {
    const rows = record.records.slice(i, i + size), last = record.chart[i + rows.length - 1];
    bins.push({ from: rows[0].date, to: rows.at(-1).date, sample: rows.length,
      wins: rows.filter(r => r.result === 1).length, losses: rows.filter(r => r.result === -1).length, pushes: rows.filter(r => r.result === 0).length,
      illustrativeUnits: last.illustrativeUnits, actualUnits: last.actualUnits });
  }
  return { points: bins, binned: size > 1, selectedSample: record.sample, tableMatchesChart: true, label: record.illustrativeLabel };
}

/** Offline only: full family evaluation exceeds hosted Edge CPU/memory limits.
 * Do not call this builder from a request. Outputs no raw unplayed line/price.
 */
export async function createResearchSnapshot({ csv, now, season, registry, venues, corrections }) {
  const prepared = prepareResearchHistory(csv, { now, venues, corrections });
  const candidates = buildResearchCandidates({ now, registry, venues, corrections, prepared });
  const compact = candidates.map(candidate => {
    const e = compactEvaluation(evaluateResearchCandidate(candidate, { now, season }));
    if (!e.qualification.qualifies) e.matchedGameIds = [];
    const periods = Object.fromEntries(RESEARCH_PERIODS.map(period => {
      const r = researchRecord(selectResearchPeriod(candidate.records, { now, season, period }));
      return [period, { record: summary(r), series: compactResearchSeries(r) }];
    }));
    // Numeric dates avoid hundreds of thousands of repeated ISO allocations in
    // a hosted isolate. Only selected public series are formatted back to ISO.
    for (const sample of Object.values(periods)) for (const point of sample.series.points) {
      point.from = Date.parse(point.from); point.to = Date.parse(point.to);
    }
    return { ...e, inputCoverage: candidate.inputCoverage, preset: { id: candidate.preset.id, market: candidate.preset.market, atoms: candidate.preset.atoms }, periods };
  });
  // Future schedule metadata is not a quote. Redaction happened before features.
  const rawRows = new Map(T.parseCsvRows(csv).rows.map(r => [r.game_id, r]));
  const targets = prepared.features.filter(g => !g.played && g.season === season).map(g => {
    const target = structuredClone(g);
    const raw = rawRows.get(target.id);
    target.scheduledKickoff = easternToUtc(raw.gameday, raw.gametime);
    target.qb = [null, null]; target.qbName = [null, null]; target.coach = [null, null]; target.referee = null;
    return target;
  });
  return { version: RESEARCH_VERSION, generatedAt: now, season,
    source: { sha256: await sha256(csv), completedSha256: await sha256(completedSourceText(observableRows(csv, now))), rowCount: prepared.rowCount,
      latestCompleted: prepared.games.filter(g => g.played).at(-1)?.date ?? null, finalAvailability: 'Noon UTC following the schedule date; exact final observation times are unavailable.' },
    candidates: compact, targets };
}

/** Patch only accessible current line predicates into a redacted cached target.
 * Current line state predicates without sufficient context stay unknown.
 */
export function applyAccessibleLines(target, boardGame, { venues, corrections }) {
  const g = structuredClone(target);
  g.spread = boardGame.spread?.visible === true && Number.isFinite(boardGame.spread.value) ? -boardGame.spread.value : null;
  g.total = boardGame.total?.visible === true && Number.isFinite(boardGame.total.value) ? boardGame.total.value : null;
  const lineOnly = T.buildFeatures([structuredClone(g)], { venues, corrections })[0];
  for (const atom of Object.values(T.ATOMS)) {
    if (atom.kind === 'game' && ['spread', 'total', 'both'].includes(atom.needs) && !atom.state) g.gf[atom.name] = lineOnly.gf[atom.name];
    if (atom.kind === 'team' && ['spread', 'total', 'both'].includes(atom.needs)) for (const side of [0, 1]) g.tf[side][atom.name] = null;
  }
  g.gf.g_h2h_last_high = g.gf.g_h2h_last_low = null;
  const last = g.meta.lastMeetings?.at(-1);
  if (g.total !== null && last && Date.parse(g.date) - Date.parse(last.date) <= 730 * 86400000) {
    g.gf.g_h2h_last_high = last.total - g.total >= 10;
    g.gf.g_h2h_last_low = last.total - g.total <= -10;
  }
  return g;
}
