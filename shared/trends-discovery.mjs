// Offline discovery, separate from the frozen registry, published shortlist and research leans.
// Every side/window is fixed before evaluation. Losing/empty queries remain in the report.
import * as T from './trends.mjs';
import { prepareResearchHistory } from './trends-research-candidates.mjs';
import { researchRecord, selectResearchPeriod } from './trends-research.mjs';

export const DISCOVERY_VERSION = 'discovery-2026-10-29-v1';
export const DISCOVERY_LABEL = 'Found by search — not tested';
export const DISCOVERY_WINDOWS = Object.freeze(['recent10', 'recent12', 'recent20', 'recent30', 'season', 'previousSeason', 'all']);
export const DISCOVERY_SITUATIONS = Object.freeze([
  ['off-loss', 'form', 'after a team loss', 't:t_off_loss'],
  ['off-win', 'form', 'after a team win', 't:t_off_win'],
  ['off-blowout-loss', 'form', 'after a team loss by 14+', 't:t_off_blowout_loss'],
  ['off-close-loss', 'form', 'after a team loss by 1–3', 't:t_off_close_loss'],
  ['bye', 'rest', 'off a bye', 't:t_off_bye'],
  ['short-rest', 'rest', 'on a short week', 't:t_short_week'],
  ['rest-advantage', 'rest', 'with 3+ more rest days', 't:t_rest_adv3'],
  ['home', 'venue', 'at home', 'venue:home'],
  ['road', 'venue', 'on the road', 'venue:road'],
  ['favorite', 'line-role', 'as favorite', 'role:fav'],
  ['underdog', 'line-role', 'as underdog', 'role:dog'],
  ['division', 'schedule', 'in divisional games', 'g:g_div'],
  ['primetime', 'schedule', 'in primetime games', 'g:g_prime'],
].map(([id, family, label, atom]) => Object.freeze({ id, family, label, atom })));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const entityKey = e => `${e.kind}:${e.value}`;
const sign = n => Number(n > 0) - Number(n < 0);
function clock(now) {
  // Reuse the historical reader's strict timezone/calendar validation.
  selectResearchPeriod([], { period: 'all', now });
  return Date.parse(now);
}
const summarize = records => {
  const { chart, records: raw, exclusions, ...result } = researchRecord(records);
  return { ...result, wilson95: result.decisive ? T.wilson(result.wins, result.decisive) : null };
};

/** Windows include pushes. Earlier/recent are disjoint; recent windows overlap each other.
 * Registration starts a new prospective clock, never a retroactive holdout.
 */
export function discoveryWindows(records, { now, season, registeredAt = now } = {}) {
  clock(now); clock(registeredAt);
  if (!Number.isInteger(season) || Date.parse(registeredAt) > Date.parse(now)) throw new TypeError('Invalid discovery date or season.');
  const all = selectResearchPeriod(records, { now, season, period: 'all' });
  const windows = {};
  for (const period of DISCOVERY_WINDOWS) {
    const requested = period.startsWith('recent') ? Number(period.slice(6)) : null;
    const selected = requested ? all.slice(-requested) : selectResearchPeriod(all, { now, season, period });
    const ids = new Set(selected.map(r => r.gameId));
    // For a season window the earlier sample is strictly before its first game;
    // later seasons must not enter the comparison called "earlier".
    const first = selected[0];
    const earlier = first ? all.filter(r => !ids.has(r.gameId) && (r.date < first.date || r.date === first.date && compare(r.gameId, first.gameId) < 0)) : [];
    windows[period] = { ...summarize(selected), requested, completeWindow: requested === null ? null : selected.length === requested, earlier: summarize(earlier) };
  }
  return { windows, retrospective: summarize(all.filter(r => Date.parse(r.date) < Date.parse(registeredAt))),
    prospective: summarize(all.filter(r => Date.parse(r.date) >= Date.parse(registeredAt))) };
}

/** Active means seen in completed games in this or the prior season, not a verified
 * upcoming starter/coach assignment. Team filtering uses those historical associations.
 */
function entitiesFor(features, season, teams, scoped) {
  const entities = new Map();
  const add = (kind, value, name, team) => {
    if (!value || scoped && !teams.has(team)) return;
    const key = `${kind}:${value}`;
    const entity = entities.get(key) ?? { kind, value, name: name || value, teams: [] };
    if (!entity.teams.includes(team)) entity.teams.push(team);
    entities.set(key, entity);
  };
  for (const g of features) if (g.played && g.season >= season - 1 && g.season <= season) for (const side of [0, 1]) {
    const team = side === 0 ? g.homeFr : g.awayFr;
    add('team', team, team, team); add('qb', g.qb[side], g.qbName[side], team); add('coach', g.coach[side], g.coach[side], team);
  }
  return [...entities.values()].map(e => ({ ...e, teams: e.teams.sort(compare) })).sort((a, b) => compare(entityKey(a), entityKey(b)));
}

/** Bounded descriptive scan. No future identity, odds or conditions enter output.
 * Scope is explicit; an empty/losing query is a result, never silently discarded.
 */
export function discoverTrends({ csv, now, season, venues, corrections, teams = [], week = null }) {
  clock(now);
  if (!Number.isInteger(season) || season < 2002 || season > 2100 || !Array.isArray(teams) || teams.some(t => typeof t !== 'string' || !/^[A-Z]{2,3}$/.test(t))) throw new TypeError('Invalid discovery scope.');
  if (week !== null && (!Number.isInteger(week) || week < 1 || week > 25)) throw new TypeError('Invalid NFL week.');
  const scope = new Set(teams.map(T.franchise));
  const prepared = prepareResearchHistory(csv, { now, venues, corrections });
  if (new Set(prepared.games.map(g => g.id)).size !== prepared.games.length) throw new TypeError('Duplicate source game ID.');
  const pop = prepared.features.filter(g => g.played && g.season >= T.PERIODS.firstSeason && g.season <= season);
  const upcoming = week === null ? [] : prepared.features.filter(g => g.season === season && g.week === week && !g.played && Date.parse(g.eventAt) > Date.parse(now));
  if (week !== null) {
    const playing = new Set(upcoming.flatMap(g => [g.homeFr, g.awayFr]));
    if (scope.size) { for (const team of scope) if (!playing.has(team)) scope.delete(team); }
    else for (const team of playing) scope.add(team);
  }
  const entities = entitiesFor(pop, season, scope, teams.length > 0 || week !== null);
  const byKey = new Map(entities.map(e => [entityKey(e), e]));
  if (entities.length * DISCOVERY_SITUATIONS.length * 3 > 20_000) throw new Error('Discovery exceeds the bounded catalogue budget.');
  const rows = new Map(), unknown = new Map();
  // Only six entity memberships per physical game; avoid a full history rescan per query.
  for (const g of pop) for (const side of [0, 1]) {
    const values = [['team', side === 0 ? g.homeFr : g.awayFr], ['qb', g.qb[side]], ['coach', g.coach[side]]];
    for (const [kind, value] of values) {
      const key = `${kind}:${value}`;
      if (!byKey.has(key)) continue;
      if (kind === 'qb' && g.qb[1 - side] === value || kind === 'coach' && g.coach[1 - side] === value) continue;
      for (const situation of DISCOVERY_SITUATIONS) {
        const k = `${key}|${situation.id}`, value = T.atomValue(situation.atom, g, side);
        if (typeof value !== 'boolean') unknown.set(k, (unknown.get(k) ?? 0) + 1);
        if (value === true) { const list = rows.get(k) ?? []; list.push({ g, side }); rows.set(k, list); }
      }
    }
  }
  const candidates = [];
  for (const entity of entities) for (const situation of DISCOVERY_SITUATIONS) for (const market of ['spread', 'over', 'under']) {
    const matched = rows.get(`${entityKey(entity)}|${situation.id}`) ?? [];
    const known = matched.filter(({ g }) => Number.isFinite(market === 'spread' ? g.spread : g.total));
    const records = known.map(({ g, side }) => ({ gameId: g.id, date: g.eventAt, availableAt: g.availableAt, season: g.season,
      result: market === 'spread' ? sign((g.homeScore - g.awayScore - g.spread) * (side === 0 ? 1 : -1)) : sign(g.homeScore + g.awayScore - g.total) * (market === 'over' ? 1 : -1),
      // A fixed -110 illustration is kept separate from missing actual prices.
      odds: null }));
    const id = `${DISCOVERY_VERSION}|${entityKey(entity)}|${situation.id}|${market}`;
    candidates.push({ id, entity, situation, market: market === 'spread' ? 'spread' : 'total', side: market === 'spread' ? 'back-entity' : market,
      title: `${entity.name} ${situation.label} · ${market === 'spread' ? 'ATS' : market}`,
      label: DISCOVERY_LABEL, discoveredAt: now, contributesToLean: false,
      conditions: [`${entity.kind}:${entity.value}`, situation.atom],
      coverage: { matchingGames: matched.length, missingRequiredLine: matched.length - known.length, unknownCondition: unknown.get(`${entityKey(entity)}|${situation.id}`) ?? 0 },
      ...discoveryWindows(records, { now, season }) });
  }
  return { version: DISCOVERY_VERSION, discoveredAt: now, season, label: DISCOVERY_LABEL,
    scope: { teams: [...scope].sort(compare), week, upcomingGameIds: upcoming.filter(g => scope.has(g.homeFr) || scope.has(g.awayFr)).map(g => g.id), currentApplicability: 'Not verified; historical associations do not establish starters, coaches or a current condition match.', entityRule: 'Seen in completed games this or previous season; historical association only.', situations: DISCOVERY_SITUATIONS.map(s => s.id), windows: DISCOVERY_WINDOWS, markets: ['spread:back-entity', 'total:over', 'total:under'] },
    source: { rows: prepared.rowCount, latestCompleted: pop.at(-1)?.date ?? null, credit: T.TRENDS_SOURCE.credit, url: T.TRENDS_SOURCE.url, license: T.TRENDS_SOURCE.license, licenseUrl: T.TRENDS_SOURCE.licenseUrl, lineSource: T.LINE_SOURCE },
    searched: { entities: entities.length, candidates: candidates.length, windows: candidates.length * DISCOVERY_WINDOWS.length, empty: candidates.filter(c => c.windows.all.sample === 0).length }, candidates };
}

/** One connected overlap group per market, using actual selected physical games.
 * Groups are overlap disclosures, not statistically independent evidence.
 * Selection balances kind/family and never reads win rate, units or streak.
 */
export function variedDiscoveries(candidates, { window = 'recent12', limit = 8, minimumGames = 10, maxPerEntity = 1, maxPerFamily = 2 } = {}) {
  if (!DISCOVERY_WINDOWS.includes(window) || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(minimumGames) || minimumGames < 1 || !Number.isInteger(maxPerEntity) || maxPerEntity < 1 || !Number.isInteger(maxPerFamily) || maxPerFamily < 1) throw new TypeError('Invalid discovery selection.');
  const ids = new Set();
  for (const c of candidates) { if (ids.has(c.id)) throw new TypeError('Duplicate candidate ID.'); ids.add(c.id); }
  const eligible = candidates.filter(c => c.windows[window].sample >= minimumGames).sort((a, b) => compare(a.id, b.id));
  const parent = eligible.map((_, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const samples = eligible.map(c => new Set(c.windows[window].matchedGameIds));
  const index = new Map();
  for (let i = 0; i < eligible.length; i++) {
    const shared = new Map();
    for (const game of samples[i]) {
      const key = `${eligible[i].market}|${game}`;
      for (const j of index.get(key) ?? []) shared.set(j, (shared.get(j) ?? 0) + 1);
      const list = index.get(key) ?? []; list.push(i); index.set(key, list);
    }
    for (const [j, count] of shared) if (count / Math.min(samples[i].size, samples[j].size) >= 0.5) parent[root(i)] = root(j);
  }
  const clusters = new Map();
  eligible.forEach((c, i) => { const key = root(i), group = clusters.get(key) ?? []; group.push(c); clusters.set(key, group); });
  const groups = [...clusters.values()].map(members => ({ id: members[0].id, memberIds: members.map(c => c.id), market: members[0].market }));
  const groupOf = new Map(groups.flatMap(g => g.memberIds.map(id => [id, g.id])));
  const byRecent = (a, b) => compare(b.windows[window].coverage.to ?? '', a.windows[window].coverage.to ?? '') || compare(a.id, b.id);
  const sampleOf = new Map(eligible.map((c, i) => [c.id, samples[i]]));
  const distinctFrom = (a, b) => [...a].filter(id => b.has(id)).length / Math.min(a.size, b.size) < 0.5;
  const usedGroups = new Set(), entityCounts = new Map(), familyCounts = new Map(), kindCounts = new Map(), marketCounts = new Map(), sideCounts = new Map(), selected = [];
  while (selected.length < limit) {
    const next = eligible.filter(c => !usedGroups.has(groupOf.get(c.id))
      && (entityCounts.get(entityKey(c.entity)) ?? 0) < maxPerEntity
      && (familyCounts.get(c.situation.family) ?? 0) < maxPerFamily
      && selected.every(s => distinctFrom(sampleOf.get(c.id), sampleOf.get(s.id))))
      .sort((a, b) => (kindCounts.get(a.entity.kind) ?? 0) - (kindCounts.get(b.entity.kind) ?? 0)
        || (marketCounts.get(a.market) ?? 0) - (marketCounts.get(b.market) ?? 0)
        || (sideCounts.get(a.side) ?? 0) - (sideCounts.get(b.side) ?? 0)
        || (familyCounts.get(a.situation.family) ?? 0) - (familyCounts.get(b.situation.family) ?? 0) || byRecent(a, b))[0];
    if (!next) break;
    const e = entityKey(next.entity), f = next.situation.family, group = groupOf.get(next.id);
    selected.push({ id: next.id, groupId: group }); usedGroups.add(group);
    entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1); familyCounts.set(f, (familyCounts.get(f) ?? 0) + 1);
    kindCounts.set(next.entity.kind, (kindCounts.get(next.entity.kind) ?? 0) + 1);
    marketCounts.set(next.market, (marketCounts.get(next.market) ?? 0) + 1); sideCounts.set(next.side, (sideCounts.get(next.side) ?? 0) + 1);
  }
  return { window, minimumGames, limit, maxPerEntity, maxPerFamily, eligible: eligible.length,
    groups, selected, note: 'At most one result per connected same-market group sharing half the smaller selected sample. Selection also excludes pairs sharing half the smaller sample across markets. Groups are not claims of independence. Order ignores results.' };
}
