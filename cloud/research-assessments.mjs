import { ASSESSMENT_SOURCES, buildResearchAssessments, validateAssessmentSnapshot, accessibleResearchCandidate } from '../shared/research-assessments.mjs';
import { projectPlayStatistics } from '../shared/research-play-statistics.mjs';
import { finalAvailableAt, sha256 } from '../shared/trends-research-candidates.mjs';

/** Named-book quotes and gated trend applications already in GTL remain usable
 * without adding a provider request. A missing new snapshot is partial coverage. */
export async function readAssessments({ service, board, userId, now, gameId, market, color, clock = () => now }) {
  const at = new Date(now).toISOString();
  const target = { p_season: board.season, p_week: board.week };
  let snapshot = null, snapshotStatus = 'available';
  try { snapshot = await service.rpc('gtl_read_research_snapshot', target); }
  catch (error) { if (error.status !== 503) throw error; snapshotStatus = 'not-configured'; }
  let data;
  try { data = snapshot ? validateAssessmentSnapshot(snapshot) : { version: 1, season: board.season, week: board.week, generatedAt: at, sources: [], candidates: [], quotes: [] }; }
  catch { return buildResearchAssessments({ board, snapshot, now, gameId, market, color }); }
  if (data.season !== board.season || data.week !== board.week || Date.parse(data.generatedAt) > now) return buildResearchAssessments({ board, snapshot, now, gameId, market, color });
  // Source-reported prices in an imported post are research context, never a
  // verified executable offer. Read only retained provider captures instead.
  try {
    const selections = data.candidates.filter(c => accessibleResearchCandidate(board, c, gameId)).map(c => ({ gameId: c.gameId, selection: c.selection }));
    const quotes = selections.length ? await service.rpc('gtl_read_research_quotes', { ...target, p_selections: selections }) : [];
    data.quotes = Array.isArray(quotes) && quotes.length <= 5000 ? quotes : [];
  } catch (error) { if (error.status !== 503) throw error; data.quotes = []; }
  // The shared validator rejects bad snapshots; never merge a forged payload.
  let existing = null;
  try { existing = await service.research?.read({ board, ...(gameId ? { gameId } : {}) }); } catch { /* Independent source failure; do not promote stale research. */ }
  const eligibleGames = board.games.filter(g => (!gameId || g.id === gameId) && !g.started && Date.parse(g.kickoff) > now && (g.spread.visible || g.total.visible));
  // Bounded concurrency: read stored quotes only, never spend provider credits on a page read.
  for (let i = 0; i < eligibleGames.length; i += 4) await Promise.all(eligibleGames.slice(i, i + 4).map(async g => {
    let lines;
    try { lines = await service.rpc('gtl_read_game_lines', { p_user: userId, ...target, p_game: g.id, p_now: at }); } catch { return; }
    if (lines?.game?.id !== g.id || Date.parse(lines.game.kickoff) !== Date.parse(g.kickoff)) return;
    for (const m of ['spread', 'total']) {
      if (g[m]?.visible !== true || lines[m]?.visible !== true) continue;
      for (const book of (lines[m].books ?? []).slice(0, 3)) for (const side of m === 'spread' ? ['home', 'away'] : ['over', 'under']) {
        if (!Number.isFinite(book.line)) continue;
        const selection = { market: m, key: m === 'spread' ? 'spreads' : 'totals', side, line: m === 'spread' && side === 'away' ? -book.line : book.line, unit: 'points' };
        data.quotes.push({ gameId: g.id, kickoff: g.kickoff, selection, provider: 'the-odds-api', book: book.book, source: book.source ?? book.book,
          odds: book.prices?.[side], observedAt: book.observedAt, capturedAt: lines[m].line?.capturedAt ?? null });
        const cell = existing?.games?.find(x => x.id === g.id)?.[m];
        const evidence = (existing?.history?.status === 'fresh' && cell?.visible ? cell.candidateIds ?? [] : []).flatMap(id => {
          const c = existing.candidates?.find(c => c.id === id);
          const applied = c?.applications?.find(a => a.gameId === g.id);
          if (!c?.qualification?.qualifies || !applied || !['home', 'away', 'over', 'under'].includes(applied.direction) || !c.record?.decisive
            || book.line !== cell.currentReference?.value || !/^\d{4}-\d\d-\d\d$/.test(c.record.coverage?.from ?? '') || !/^\d{4}-\d\d-\d\d$/.test(c.record.coverage?.to ?? '')) return [];
          // These are historical consistency records, never model probabilities.
          return [{ id: `registry-${id.replace(/[^a-zA-Z0-9_.:-]/g, '_')}`.slice(0, 100), origin: 'computed', family: 'historical',
            statement: c.title, stance: applied.direction === side ? 'support' : 'oppose', datasetId: 'nflverse-schedules', groupKey: `historical-${m}`,
            sourceUrl: existing.history.source?.url, publishedAt: existing.history.snapshotAsOf, observedAt: at, asOf: existing.history.snapshotAsOf,
            period: { from: `${c.record.coverage.from}T00:00:00Z`, to: finalAvailableAt(c.record.coverage.to) }, sample: { count: c.record.decisive, unit: 'decided qualifying games' },
            metric: { name: 'Historical hit rate', value: c.record.hitRate, unit: 'share', denominator: 'decided qualifying games; pushes excluded' },
            conditionsKnown: true, rights: 'permitted', reproduced: true, inputHash: existing.history.snapshotSha256,
            assumptions: ['Historical consistency is descriptive; it is not a calculated betting edge.', ...(c.conditionDescriptions ?? []).slice(0, 10).filter(s => typeof s === 'string').map(s => s.slice(0, 240))] }];
        }).slice(0, 20);
        const id = `stored-${g.id}-${m}-${side}-${String(selection.line).replace('.', '_')}`;
        if (data.candidates.length < 500 && !data.candidates.some(c => c.id === id)) data.candidates.push({ id, gameId: g.id, kickoff: g.kickoff, title: `${g.id.replace('-', ' at ')} · ${side} ${selection.line}`,
          selection, dependenciesComplete: true, dependencies: [{ gameId: g.id, market: m }], evidence });
      }
    }
  }));
  // History contains opaque navigation IDs, never a player name, claim or line.
  const routes = new Map(await Promise.all(data.candidates.filter(c => accessibleResearchCandidate(board, c, gameId))
    .map(async c => [c.id, `r-${(await sha256(JSON.stringify([board.season, board.week, c.id]))).slice(0, 24)}`])));
  const reply = buildResearchAssessments({ board, snapshot: data, now: clock(), gameId, market, color });
  return { ...reply, assessments: reply.assessments.map(a => ({ ...a, routeId: routes.get(a.id) })), statistics: existing?.statistics ?? [], playStatistics: projectPlayStatistics(data.playStatistics, board, clock()), sourceCoverage: snapshotStatus,
    sources: reply.sources ?? ASSESSMENT_SOURCES.map(s => ({ ...s, status: 'unavailable', checkedAt: null })) };
}
