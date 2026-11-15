// Retained, licensed bookmaker captures only. Page reads never spend provider credits.
import { usableResearchQuote, selectionKey } from '../shared/research-assessments.mjs';
import { propStat } from '../shared/player-props.mjs';

export async function readRetainedPropOffers(service, board, now, gameId) {
  const games = board.games.filter(g => (!gameId || g.id === gameId) && g.spread?.visible === true && g.total?.visible === true
    && !g.started && now < Date.parse(g.kickoff));
  if (!games.length) return { status: 'locked', quotes: [] };
  if (typeof service.retainedResearchQuotes !== 'function') return { status: 'unavailable', quotes: [] };
  try {
    const rows = await service.retainedResearchQuotes({ select: 'game_id,markets,status,error,started_at,request_id,quote_payload',
      season: `eq.${board.season}`, week: `eq.${board.week}`, game_id: `in.(${games.map(g => g.id).join(',')})`,
      status: 'eq.finished', error: 'is.null', started_at: `gte.${new Date(now - 3600000).toISOString()}`,
      order: 'started_at.desc,request_id.desc', limit: '501' });
    if (!Array.isArray(rows) || rows.length > 500) return { status: 'coverage-limit', quotes: [] };
    const seen = new Set(), quotes = [];
    for (const row of rows) {
      const game = games.find(g => g.id === row.game_id);
      if (!game || row.status !== 'finished' || row.error != null || !Array.isArray(row.markets) || !Array.isArray(row.quote_payload)) continue;
      for (const market of row.markets) {
        const key = `${game.id}:${market}`;
        if (seen.has(key)) continue;
        seen.add(key); // A newer successful empty capture withdraws old offers.
        for (const q of row.quote_payload) {
          if (q?.selection?.market !== 'prop' || q.selection.key !== market || !propStat(market)) continue;
          if (usableResearchQuote(q, { gameId: game.id, kickoff: game.kickoff, selection: q.selection }, now)) quotes.push(q);
        }
      }
    }
    return { status: quotes.length ? 'available' : 'no-current-offers', quotes: quotes.slice(0, 5000) };
  } catch { return { status: 'unavailable', quotes: [] }; }
}

export function propOfferCandidates(quotes, research, now) {
  const candidates = [], seen = new Set();
  for (const q of quotes) {
    const key = `${q.gameId}:${selectionKey(q.selection)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const game = research?.games?.find(g => g.gameId === q.gameId);
    const player = game?.players.find(p => p.playerId === q.selection.playerId);
    const market = player?.markets.find(m => m.key === q.selection.key && m.unit === q.selection.unit);
    const b = market?.baseline;
    const evidence = [];
    if (b?.status === 'available' && b.trainingPeriod && research?.source?.stats) {
      const delta = b.projection - q.selection.line;
      const aligned = q.selection.side === 'over' ? delta > 0 : delta < 0;
      const source = research.source.stats;
      evidence.push({ id: 'appearance-mean', origin: 'computed', family: 'historical',
        statement: `${player.playerName} averaged ${b.projection.toFixed(1)} ${market.unit} across ${b.sample} recorded appearances; this book's ${q.selection.side} line is ${q.selection.line}.`,
        stance: delta === 0 ? 'context' : aligned ? 'support' : 'oppose', datasetId: 'nflverse-player-stats', groupKey: 'appearance-mean',
        sourceUrl: source.url, publishedAt: research.generatedAt, observedAt: new Date(now).toISOString(), asOf: research.generatedAt,
        period: b.trainingPeriod, sample: { count: b.sample, unit: 'recorded player appearances' },
        metric: { name: 'Appearance mean', value: b.projection, unit: market.unit, denominator: 'recorded player appearances' },
        conditionsKnown: true, rights: 'permitted', reproduced: true, inputHash: source.sha256,
        assumptions: ['Descriptive historical mean, not a calibrated forecast or betting edge.', 'Injury, current role, pace and opponent adjustments are not included.',
          b.holdout.mae === null ? 'Historical holdout error unavailable.' : `Historical holdout MAE ${b.holdout.mae.toFixed(1)} ${market.unit} across ${b.holdout.count} holdouts.`] });
    }
    candidates.push({ id: `offer-${q.gameId}-${q.selection.playerId}-${q.selection.key}-${q.selection.side}-${String(q.selection.line).replace('.', '_')}`,
      gameId: q.gameId, kickoff: q.kickoff, title: `${q.selection.playerName} · ${q.selection.side} ${q.selection.line} ${propStat(q.selection.key).label}`,
      selection: q.selection, dependenciesComplete: true, dependencies: [{ gameId: q.gameId, market: 'both' }], evidence });
  }
  // Give each revealed game a turn before filling the next page of candidates.
  // Within each game research-supported sides lead, but this is not a value rank.
  const groups = new Map();
  for (const c of candidates) { if (!groups.has(c.gameId)) groups.set(c.gameId, []); groups.get(c.gameId).push(c); }
  for (const rows of groups.values()) rows.sort((a, b) => Number(b.evidence.some(e => e.stance === 'support')) - Number(a.evidence.some(e => e.stance === 'support')) || a.id.localeCompare(b.id));
  const ordered = [];
  for (let i = 0; ordered.length < candidates.length; i++) for (const rows of groups.values()) if (rows[i]) ordered.push(rows[i]);
  return ordered;
}
