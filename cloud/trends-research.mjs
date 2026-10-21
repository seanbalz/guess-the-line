// Authenticated projection only. Full family evaluation is an offline operation;
// requests read a compact prepared snapshot and verify its completed-source hash.
import * as T from '../shared/trends.mjs';
import { RESEARCH_VERSION, RESEARCH_PERIODS, applyAccessibleLines, applyResearchCandidate, completedSourceText, finalAvailableAt, sha256 } from '../shared/trends-research-candidates.mjs';
import { researchLean, researchShortlist } from '../shared/trends-research.mjs';
import { projectReviewedSources, validateReviewedFeed } from '../shared/trends-research-sources.mjs';
import { easternToUtc } from '../shared/nfl-schedule.mjs';

const FIVE_MINUTES = 300000, BACKOFF = 60000;
const markets = ['spread', 'total'];
const summary = r => ({ sample: r.sample, wins: r.wins, losses: r.losses, pushes: r.pushes, decisive: r.decisive, hitRate: r.hitRate, illustrativeUnits: r.illustrativeUnits,
  illustrativeLabel: r.illustrativeLabel, actualUnits: r.actualUnits, priceCoverage: r.priceCoverage, coverage: r.coverage, exclusions: r.exclusions });
const group = g => ({ id: g.id, market: g.market, memberIds: g.memberIds, direction: g.direction, mixed: g.mixed, historicalTier: g.historicalTier,
  overlaps: g.overlaps, role: g.role, roleLabel: g.roleLabel, tone: g.tone });
const compactLean = lean => ({ state: lean.state, direction: lean.direction, label: lean.label, tone: lean.tone, reasons: [...lean.reasons], counts: lean.counts,
  groups: lean.groups.map(group), supporting: lean.supporting.map(group), alternatives: lean.alternatives.map(group), context: lean.context.map(c => c.id) });

export function validateResearchRequest(body) {
  if (body.period !== undefined && !RESEARCH_PERIODS.includes(body.period)) throw new TypeError('Check the research period.');
  if (body.market !== undefined && !markets.includes(body.market)) throw new TypeError('Check the research market.');
  if (body.family !== undefined && (typeof body.family !== 'string' || !/^[a-z_]{1,40}$/.test(body.family))) throw new TypeError('Check the research family.');
  if (body.team !== undefined && (typeof body.team !== 'string' || !/^[A-Z]{2,3}$/.test(body.team))) throw new TypeError('Check the research team.');
  if (body.gameId !== undefined && (typeof body.gameId !== 'string' || !/^[A-Z]{2,3}-[A-Z]{2,3}$/.test(body.gameId))) throw new TypeError('Check the research game.');
  if (body.candidateId !== undefined && (typeof body.candidateId !== 'string' || body.candidateId.length > 240 || body.candidateId.length === 0)) throw new TypeError('Check the research candidate.');
  return { ...body, period: body.period ?? 'recent30' };
}

function matchingSchedule(target, row, game) {
  if (!row || row.game_id !== target.id || Number(row.season) !== target.season || Number(row.week) !== target.week || row.gameday !== target.date
    || row.home_team !== target.home || row.away_team !== target.away || row.weekday !== target.weekday || row.stadium_id !== target.stadiumFile || (row.location === 'Neutral') !== target.fileNeutral) return false;
  try {
    const kickoff = easternToUtc(row.gameday, row.gametime);
    return Number.isFinite(Date.parse(kickoff)) && Date.parse(kickoff) === Date.parse(game.kickoff) && kickoff === target.scheduledKickoff;
  } catch { return false; }
}

/** Cache only public source material; never cache a viewer's projection. */
export function createResearchProvider({ loadSchedule, loadSnapshot = async () => null, clock = Date.now, reviewedFeed, venues, corrections }) {
  let source = null, inFlight = null, retryAt = 0, failed = false;
  let feed = null, invalidFeed = false;
  if (reviewedFeed !== undefined && reviewedFeed !== null && reviewedFeed !== '') {
    try { feed = validateReviewedFeed(reviewedFeed); } catch { invalidFeed = true; }
  }
  // The server-only loader bounds its decoded-period cache. Do not pin every
  // period here or reuse a recent30 snapshot for a later Explore period.
  const snapshot = period => Promise.resolve().then(() => loadSnapshot(period)).catch(() => null);
  async function material() {
    const at = clock();
    if (source && at - source.fetchedAt < FIVE_MINUTES && !failed) return source;
    if (at < retryAt) return source;
    if (!inFlight) inFlight = (async () => {
      try {
        const csv = await loadSchedule();
        if (typeof csv !== 'string' || csv.length > 12000000) throw Error('Invalid history source.');
        const { rows } = T.parseCsvRows(csv);
        if (!rows.length || rows.some(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.gameday) || !Number.isInteger(Number(r.season))
          || !Number.isFinite(Date.parse(`${r.gameday}T00:00:00Z`)) || new Date(`${r.gameday}T00:00:00Z`).toISOString().slice(0, 10) !== r.gameday)) throw Error('Invalid history source.');
        source = { rows, sha256: await sha256(csv), fetchedAt: clock() }; failed = false; retryAt = 0;
      } catch { failed = true; retryAt = clock() + BACKOFF; }
      finally { inFlight = null; }
      return source;
    })();
    return inFlight;
  }
  return { async read({ board, ...request }) {
    const options = validateResearchRequest(request), now = new Date(clock()).toISOString();
    const [data, prepared] = await Promise.all([material(), snapshot(options.period)]);
    const validSnapshot = prepared?.version === RESEARCH_VERSION && Array.isArray(prepared.candidates) && Array.isArray(prepared.targets)
      && Date.parse(prepared.generatedAt) <= Date.parse(now);
    const completed = data?.rows.filter(r => T.rowPlayed(r) && Date.parse(finalAvailableAt(r.gameday)) <= Date.parse(now)) ?? [];
    const missingFinals = data?.rows.some(r => Number(r.season) === board.season && !T.rowPlayed(r) && Date.parse(finalAvailableAt(r.gameday)) <= Date.parse(now)) ?? true;
    const hasSeason = data?.rows.some(r => Number(r.season) === board.season) === true;
    const hashMatches = validSnapshot && data && await sha256(completedSourceText(completed)) === prepared.source.completedSha256;
    const fresh = !!(validSnapshot && hashMatches && !failed && hasSeason && !missingFinals && board.season === prepared.season);
    const history = { status: !data || !validSnapshot ? 'unavailable' : fresh ? 'fresh' : 'stale', source: T.TRENDS_SOURCE,
      sourceSha256: data?.sha256 ?? null, snapshotSha256: validSnapshot ? prepared.source.sha256 : null,
      fetchedAt: data ? new Date(data.fetchedAt).toISOString() : null, snapshotAsOf: validSnapshot ? prepared.generatedAt : null,
      latestCompleted: validSnapshot ? prepared.source.latestCompleted : null,
      periodAnchor: validSnapshot ? prepared.generatedAt : null,
      limitations: ['Descriptive consistency is not a probability or a proven betting advantage.', 'Rolling 12 months and season summaries are anchored to the prepared snapshot.', 'Current state-and-line predicates without sufficient context remain unavailable.', validSnapshot ? prepared.source.finalAvailability : 'Prepared historical evidence is unavailable.'],
      reasons: [...(!validSnapshot ? ['snapshot_unavailable'] : []), ...(failed ? ['source_refresh_failed'] : []), ...(!hasSeason ? ['season_missing'] : []), ...(missingFinals ? ['missing_finals'] : []), ...(validSnapshot && !hashMatches ? ['completed_source_changed'] : [])] };
    const publicSources = projectReviewedSources(feed, { board, now, invalid: invalidFeed });
    const applications = new Map(), permitted = new Map(), weekly = [];
    const sourceRows = new Map((data?.rows ?? []).map(r => [r.game_id, r]));
    const selectedGames = board.games.filter(g => !options.gameId || g.id === options.gameId);
    const games = selectedGames.map(game => {
      const target = validSnapshot ? prepared.targets.find(t => t.season === board.season && t.week === board.week && `${t.awayApp}-${t.homeApp}` === game.id) : null;
      const knownSchedule = target && matchingSchedule(target, sourceRows.get(target.id), game);
      const current = knownSchedule ? applyAccessibleLines(target, game, { venues, corrections }) : null;
      return { id: game.id, ...Object.fromEntries(markets.map(market => {
        if (game[market]?.visible !== true) return [market, { visible: false }];
        const evidence = [];
        if (current) for (const candidate of prepared.candidates) {
          if (candidate.market !== market) continue;
          const applied = applyResearchCandidate(candidate, current, corrections.rules);
          if (!applied) continue;
          const entry = { ...candidate, ...applied };
          // Never copy prepared period charts into grouping's recursive copies.
          delete entry.periods; delete entry.preset;
          evidence.push(entry); permitted.set(candidate.id, candidate);
          const list = applications.get(candidate.id) ?? [];
          list.push({ gameId: game.id, direction: applied.direction, whyApplies: candidate.conditions }); applications.set(candidate.id, list);
        }
        const reference = { ...game[market], status: Number.isFinite(game[market].value) ? 'available' : 'unavailable' };
        const lean = compactLean(researchLean({ evidence, market, visible: true, kickoff: game.kickoff, now, reference, historyFresh: fresh && !!knownSchedule }));
        if (!knownSchedule) lean.reasons.push('schedule_context_unavailable');
        const shortlist = researchShortlist(evidence).map(c => c.id); weekly.push(...evidence);
        const own = game.mine?.[market];
        return [market, { visible: true, ownGuess: own?.guess ?? null, savedReference: own?.lineAtGuess ?? null, currentReference: reference,
          guessGap: { value: Number.isFinite(own?.guess) && Number.isFinite(reference.value) ? reference.value - own.guess : null, label: 'Difference from your expected market line', explanation: 'A pricing expectation gap does not indicate a fair line or betting advantage.' },
          lean, candidateIds: evidence.map(c => c.id), shortlist }];
      })) };
    });
    if (options.candidateId && !permitted.has(options.candidateId)) throw new TypeError('Research candidate is unavailable.');
    const shortlist = researchShortlist(weekly).map(c => c.id);
    const explore = [...permitted.values()].filter(c => (!options.market || c.market === options.market) && (!options.family || c.family === options.family)
      && (!options.team || applications.get(c.id).some(a => { const game = board.games.find(g => g.id === a.gameId); return [game.awayCode, game.homeCode].includes(options.team); }))).map(c => c.id).sort();
    const candidates = [...permitted.values()].map(c => {
      const sample = c.periods[options.period];
      const detail = options.candidateId === c.id, chart = detail || shortlist.includes(c.id);
      return { id: c.id, version: c.version, title: c.title, market: c.market, direction: c.direction, family: c.family, conditions: c.conditions,
        conditionDescriptions: c.conditions.map(a => T.ATOMS[a.split(':')[1]]?.desc ?? a),
        registeredAt: c.registeredAt, historicalTier: c.historicalTier, sourceState: c.sourceState, period: options.period, record: summary(sample.record),
        qualification: detail ? c.qualification : { qualifies: c.qualification.qualifies, route: c.qualification.route, label: c.qualification.label, reasons: c.qualification.reasons }, inputCoverage: c.inputCoverage,
        applications: applications.get(c.id), ...(detail ? { recent: summary(c.recent), historical: summary(c.historical), seasonRecord: summary(c.seasonRecord), prospective: summary(c.prospective), retrospective: summary(c.retrospective), limitations: history.limitations } : {}),
        ...(chart ? { series: { ...sample.series, points: sample.series.points.map(p => ({ ...p, from: new Date(p.from).toISOString(), to: new Date(p.to).toISOString() })) } } : {}) };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return { version: RESEARCH_VERSION, season: board.season, week: board.week, now, history, ...publicSources, shortlist, candidates, games, explore,
      filters: { period: options.period, market: options.market ?? null, family: options.family ?? null, team: options.team ?? null, periods: RESEARCH_PERIODS, families: [...new Set(candidates.map(c => c.family))].sort() } };
  } };
}
